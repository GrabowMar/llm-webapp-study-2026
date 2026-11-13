"""Flask entry point."""

import hashlib
import hmac
import math
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
MAX_CONSECUTIVE_FAILURES = 5
LOCK_SECONDS = 15 * 60
CLIENT_WINDOW_SECONDS = 60
CLIENT_MAX_ATTEMPTS = 20
SESSION_SECONDS = 7 * 24 * 3600
RECENT_ATTEMPTS = 20
KEPT_ATTEMPTS_PER_USER = 200

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@+-]{3,64}$")
PASSWORD_MIN = 8
PASSWORD_MAX = 256

DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(16))

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

if os.environ.get("TRUST_PROXY", "").strip() in ("1", "true", "yes"):
    from werkzeug.middleware.proxy_fix import ProxyFix

    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    last_login_at REAL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at REAL NOT NULL,
    success INTEGER NOT NULL,
    reason TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_attempts_user ON login_attempts(user_id, id);
CREATE TABLE IF NOT EXISTS username_state (
    username_key TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until REAL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS username_state_locked ON username_state(locked_until);
CREATE TABLE IF NOT EXISTS client_windows (
    client TEXT PRIMARY KEY,
    window_start REAL NOT NULL,
    count INTEGER NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection):
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        with transaction(conn):
            row = conn.execute(
                "SELECT id, password_hash FROM users WHERE username = ?",
                (ADMIN_USERNAME,),
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at)"
                    " VALUES (?, ?, 1, ?)",
                    (
                        ADMIN_USERNAME,
                        generate_password_hash(admin_password) if admin_password else None,
                        time.time(),
                    ),
                )
            else:
                current = row["password_hash"]
                unchanged = (
                    bool(admin_password)
                    and current is not None
                    and check_password_hash(current, admin_password)
                )
                if not unchanged:
                    new_hash = generate_password_hash(admin_password) if admin_password else None
                    conn.execute(
                        "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                        (new_hash, row["id"]),
                    )
                    conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
                else:
                    conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
            conn.execute("UPDATE users SET is_admin = 0 WHERE username != ?", (ADMIN_USERNAME,))
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (time.time(),))
    finally:
        conn.close()


def iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    return (
        datetime.fromtimestamp(ts, tz=timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def error(status: int, message: str, **extra):
    body = {"error": message}
    body.update(extra)
    return jsonify(body), status


def too_many(code: str, message: str, until: float, now: float):
    retry_after = max(1, math.ceil(until - now))
    resp = jsonify(
        {
            "error": message,
            "code": code,
            "retry_after": retry_after,
            "retry_at": iso(now + retry_after),
        }
    )
    resp.status_code = 429
    resp.headers["Retry-After"] = str(retry_after)
    return resp


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 200:
        return None
    row = db().execute(
        "SELECT u.id, u.username, u.is_admin, u.last_login_at, u.password_hash, s.expires_at"
        " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= time.time() or row["password_hash"] is None:
        return None
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "Authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "Authentication required")
        if not user["is_admin"] or user["username"] != ADMIN_USERNAME:
            return error(403, "Admin access required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    else:
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; object-src 'none'; "
            "base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        )
    return resp


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def unhandled(exc: Exception):
    if isinstance(exc, HTTPException):
        return http_error(exc)
    app.logger.exception("Unhandled error")
    return error(500, "Internal server error")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "Expected a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        return error(
            400,
            "Username must be 3-64 characters: letters, digits, '_', '.', '@', '+' or '-'",
        )
    if not isinstance(password, str) or not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        return error(400, f"Password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters")
    password_hash = generate_password_hash(password)
    conn = db()
    try:
        with transaction(conn):
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at)"
                " VALUES (?, ?, 0, ?)",
                (username, password_hash, time.time()),
            )
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


def client_id() -> str:
    return request.remote_addr or "unknown"


def record_attempt(conn, user_id: int, now: float, success: bool, reason: str) -> None:
    conn.execute(
        "INSERT INTO login_attempts (user_id, at, success, reason) VALUES (?, ?, ?, ?)",
        (user_id, now, 1 if success else 0, reason),
    )
    conn.execute(
        "DELETE FROM login_attempts WHERE user_id = ? AND id NOT IN"
        " (SELECT id FROM login_attempts WHERE user_id = ? ORDER BY id DESC LIMIT ?)",
        (user_id, user_id, KEPT_ATTEMPTS_PER_USER),
    )


@app.post("/api/auth/login")
def login():
    conn = db()
    with transaction(conn):
        now = time.time()
        client = client_id()
        conn.execute(
            "DELETE FROM client_windows WHERE window_start <= ?",
            (now - CLIENT_WINDOW_SECONDS,),
        )
        conn.execute(
            "DELETE FROM username_state WHERE failed_count = 0 AND locked_until <= ?", (now,)
        )
        window = conn.execute(
            "SELECT window_start, count FROM client_windows WHERE client = ?", (client,)
        ).fetchone()
        if window is None:
            conn.execute(
                "INSERT INTO client_windows (client, window_start, count) VALUES (?, ?, 1)",
                (client, now),
            )
        elif window["count"] >= CLIENT_MAX_ATTEMPTS:
            return too_many(
                "rate_limited",
                "Too many sign-in attempts from this client. Try again later.",
                window["window_start"] + CLIENT_WINDOW_SECONDS,
                now,
            )
        else:
            conn.execute(
                "UPDATE client_windows SET count = count + 1 WHERE client = ?", (client,)
            )

        data = json_body()
        if data is None:
            return error(400, "Expected a JSON object")
        username = data.get("username")
        password = data.get("password")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or not username
            or not password
            or len(username) > 64
            or len(password) > PASSWORD_MAX
        ):
            return error(400, "Username and password are required")

        key = username.lower()
        user = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        display = user["username"] if user is not None else username

        state = conn.execute(
            "SELECT failed_count, locked_until FROM username_state WHERE username_key = ?",
            (key,),
        ).fetchone()
        if state is not None and state["locked_until"] is not None:
            if state["locked_until"] > now:
                if user is not None:
                    record_attempt(conn, user["id"], now, False, "locked")
                return too_many(
                    "account_locked",
                    "This account is temporarily locked after too many failed sign-ins.",
                    state["locked_until"],
                    now,
                )
            conn.execute(
                "UPDATE username_state SET locked_until = NULL, failed_count = 0,"
                " updated_at = ? WHERE username_key = ?",
                (now, key),
            )

        stored_hash = user["password_hash"] if user is not None else None
        valid = check_password_hash(stored_hash or DUMMY_HASH, password) and stored_hash is not None

        if valid:
            conn.execute("DELETE FROM username_state WHERE username_key = ?", (key,))
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user["id"]))
            record_attempt(conn, user["id"], now, True, "ok")
            token = secrets.token_urlsafe(32)
            conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at)"
                " VALUES (?, ?, ?, ?)",
                (hash_token(token), user["id"], now, now + SESSION_SECONDS),
            )
            conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            return jsonify({"token": token}), 200

        conn.execute(
            "INSERT INTO username_state (username_key, username, failed_count, locked_until,"
            " updated_at) VALUES (?, ?, 1, NULL, ?)"
            " ON CONFLICT(username_key) DO UPDATE SET failed_count = failed_count + 1,"
            " username = excluded.username, updated_at = excluded.updated_at",
            (key, display, now),
        )
        conn.execute(
            "UPDATE username_state SET locked_until = ?, failed_count = 0"
            " WHERE username_key = ? AND failed_count >= ?",
            (now + LOCK_SECONDS, key, MAX_CONSECUTIVE_FAILURES),
        )
        if user is not None:
            record_attempt(conn, user["id"], now, False, "invalid_credentials")
        return error(401, "Invalid username or password")


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        conn = db()
        with transaction(conn):
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    return "", 204


@app.get("/api/me")
@login_required
def me():
    user = g.user
    return {
        "id": user["id"],
        "username": user["username"],
        "last_login_at": iso(user["last_login_at"]),
        "is_admin": bool(user["is_admin"]),
    }


@app.get("/api/me/login-attempts")
@login_required
def my_login_attempts():
    rows = db().execute(
        "SELECT at, success, reason FROM login_attempts WHERE user_id = ?"
        " ORDER BY id DESC LIMIT ?",
        (g.user["id"], RECENT_ATTEMPTS),
    ).fetchall()
    return {
        "items": [
            {"at": iso(r["at"]), "success": bool(r["success"]), "reason": r["reason"]}
            for r in rows
        ]
    }


@app.get("/api/admin/locks")
@admin_required
def admin_locks():
    now = time.time()
    rows = db().execute(
        "SELECT username, locked_until FROM username_state WHERE locked_until > ?"
        " ORDER BY locked_until DESC",
        (now,),
    ).fetchall()
    return {
        "items": [
            {"username": r["username"], "locked_until": iso(r["locked_until"])} for r in rows
        ]
    }


@app.post("/api/admin/locks/<path:username>/unlock")
@admin_required
def admin_unlock(username: str):
    key = username.lower()
    conn = db()
    with transaction(conn):
        user = conn.execute(
            "SELECT username FROM users WHERE username = ?", (username,)
        ).fetchone()
        state = conn.execute(
            "SELECT username, locked_until FROM username_state WHERE username_key = ?", (key,)
        ).fetchone()
        if user is None and state is None:
            return error(404, "Unknown username")
        was_locked = state is not None and (state["locked_until"] or 0) > time.time()
        conn.execute("DELETE FROM username_state WHERE username_key = ?", (key,))
    name = user["username"] if user is not None else state["username"]
    return {"username": name, "unlocked": True, "was_locked": was_locked}


@app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
