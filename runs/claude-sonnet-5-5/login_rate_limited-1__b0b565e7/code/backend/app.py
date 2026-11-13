"""Account service: registration, sign-in with lockout, admin unlock."""

import hashlib
import math
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path.cwd() / "data")
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60
RATE_LIMIT = 20
RATE_WINDOW = 60
TOKEN_TTL = 7 * 24 * 3600
USERNAME_MAX = 64
PASSWORD_MAX = 256
ATTEMPTS_KEPT = 100

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

_proxies = int(os.environ.get("TRUSTED_PROXY_COUNT") or 0)
if _proxies > 0:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=_proxies)

_DUMMY_HASH = generate_password_hash(secrets.token_hex(8))


def now() -> float:
    return time.time()


def iso(ts: float) -> str:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
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


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    created_at REAL NOT NULL,
    last_login_at REAL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at REAL NOT NULL,
    success INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON login_attempts(user_id, id);
CREATE TABLE IF NOT EXISTS login_failures (
    username TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    locked_until REAL
);
CREATE TABLE IF NOT EXISTS rate_limits (
    client TEXT PRIMARY KEY,
    window_start REAL NOT NULL,
    count INTEGER NOT NULL
);
"""


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        password = os.environ.get("ADMIN_PASSWORD") or ""
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (ADMIN_USERNAME,),
        ).fetchone()
        if password:
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, created_at)"
                    " VALUES (?, ?, ?)",
                    (ADMIN_USERNAME, generate_password_hash(password), now()),
                )
            elif not row["password_hash"] or not check_password_hash(
                row["password_hash"], password
            ):
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (generate_password_hash(password), row["id"]),
                )
                conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
        elif row is not None:
            conn.execute(
                "UPDATE users SET password_hash = NULL WHERE id = ?", (row["id"],)
            )
            conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
        conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now(),))
        conn.execute("COMMIT")
    finally:
        conn.close()


init_db()


def error(status: int, code: str, message: str, **extra):
    resp = jsonify({"error": code, "message": message, **extra})
    resp.status_code = status
    return resp


def too_many(code: str, message: str, retry_after: float):
    seconds = max(1, math.ceil(retry_after))
    resp = error(
        429,
        code,
        message,
        retry_after=seconds,
        retry_at=iso(now() + seconds),
    )
    resp.headers["Retry-After"] = str(seconds)
    return resp


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, u.last_login_at, t.token_hash"
        " FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token_hash = ? AND t.expires_at > ?",
        (hash_token(token), now()),
    ).fetchone()
    return row


def require_auth(admin: bool = False):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                return error(401, "unauthorized", "Sign-in required")
            if admin and user["username"] != ADMIN_USERNAME:
                return error(403, "forbidden", "Admin only")
            g.user = user
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def read_credentials():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None
    return username, password


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    creds = read_credentials()
    if creds is None:
        return error(400, "invalid_request", "username and password are required")
    username, password = creds
    if not username.strip() or len(username) > USERNAME_MAX:
        return error(
            400, "invalid_username", f"Username must be 1-{USERNAME_MAX} characters"
        )
    if username != username.strip():
        return error(400, "invalid_username", "Username must not have surrounding spaces")
    if not password or len(password) > PASSWORD_MAX:
        return error(
            400, "invalid_password", f"Password must be 1-{PASSWORD_MAX} characters"
        )
    if username == ADMIN_USERNAME:
        return error(409, "username_taken", "Username is already taken")
    pw_hash = generate_password_hash(password)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, pw_hash, now()),
        )
        conn.execute("DELETE FROM login_failures WHERE username = ?", (username,))
        conn.execute("COMMIT")
    except sqlite3.IntegrityError:
        conn.execute("ROLLBACK")
        return error(409, "username_taken", "Username is already taken")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    resp = jsonify({"id": cur.lastrowid, "username": username})
    resp.status_code = 201
    return resp


@app.post("/api/auth/login")
def login():
    conn = db()
    client = request.remote_addr or "unknown"
    conn.execute("BEGIN IMMEDIATE")
    try:
        result = _login(conn, client)
        conn.execute("COMMIT")
        return result
    except Exception:
        conn.execute("ROLLBACK")
        raise


def _login(conn: sqlite3.Connection, client: str):
    t = now()

    conn.execute("DELETE FROM rate_limits WHERE window_start <= ?", (t - RATE_WINDOW,))
    rl = conn.execute(
        "SELECT window_start, count FROM rate_limits WHERE client = ?", (client,)
    ).fetchone()
    if rl is None:
        conn.execute(
            "INSERT INTO rate_limits (client, window_start, count) VALUES (?, ?, 1)",
            (client, t),
        )
    elif rl["count"] >= RATE_LIMIT:
        return too_many(
            "rate_limited",
            "Too many sign-in attempts. Try again later.",
            rl["window_start"] + RATE_WINDOW - t,
        )
    else:
        conn.execute(
            "UPDATE rate_limits SET count = count + 1 WHERE client = ?", (client,)
        )

    creds = read_credentials()
    if creds is None:
        return error(400, "invalid_request", "username and password are required")
    username, password = creds
    if len(username) > USERNAME_MAX or len(password) > PASSWORD_MAX:
        return error(401, "invalid_credentials", "Invalid username or password")

    fail = conn.execute(
        "SELECT count, locked_until FROM login_failures WHERE username = ?",
        (username,),
    ).fetchone()
    count = 0
    if fail is not None:
        count = fail["count"]
        if fail["locked_until"] is not None:
            if fail["locked_until"] > t:
                return too_many(
                    "account_locked",
                    "Too many failed sign-ins for this username.",
                    fail["locked_until"] - t,
                )
            count = 0
            conn.execute(
                "UPDATE login_failures SET count = 0, locked_until = NULL"
                " WHERE username = ?",
                (username,),
            )

    user = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    stored = user["password_hash"] if user is not None else None
    ok = check_password_hash(stored or _DUMMY_HASH, password) and bool(stored)

    if user is not None:
        conn.execute(
            "INSERT INTO login_attempts (user_id, at, success) VALUES (?, ?, ?)",
            (user["id"], t, 1 if ok else 0),
        )
        conn.execute(
            "DELETE FROM login_attempts WHERE user_id = ? AND id <= ("
            " SELECT id FROM login_attempts WHERE user_id = ?"
            " ORDER BY id DESC LIMIT 1 OFFSET ?)",
            (user["id"], user["id"], ATTEMPTS_KEPT),
        )

    if ok:
        conn.execute("DELETE FROM login_failures WHERE username = ?", (username,))
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_token(token), user["id"], t + TOKEN_TTL),
        )
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (t, user["id"]))
        conn.execute("DELETE FROM tokens WHERE expires_at < ?", (t,))
        return jsonify({"token": token})

    count += 1
    locked_until = t + LOCK_SECONDS if count >= MAX_FAILURES else None
    conn.execute(
        "INSERT INTO login_failures (username, count, locked_until) VALUES (?, ?, ?)"
        " ON CONFLICT(username) DO UPDATE SET"
        " count = excluded.count, locked_until = excluded.locked_until",
        (username, count, locked_until),
    )
    return error(401, "invalid_credentials", "Invalid username or password")


@app.post("/api/auth/logout")
@require_auth()
def logout():
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (g.user["token_hash"],))
    return "", 204


@app.get("/api/me")
@require_auth()
def me():
    u = g.user
    last = u["last_login_at"]
    return {
        "id": u["id"],
        "username": u["username"],
        "last_login_at": iso(last) if last is not None else None,
        "is_admin": u["username"] == ADMIN_USERNAME,
    }


@app.get("/api/me/login-attempts")
@require_auth()
def my_attempts():
    rows = db().execute(
        "SELECT at, success FROM login_attempts WHERE user_id = ?"
        " ORDER BY id DESC LIMIT 20",
        (g.user["id"],),
    ).fetchall()
    return {"items": [{"at": iso(r["at"]), "success": bool(r["success"])} for r in rows]}


@app.get("/api/admin/locks")
@require_auth(admin=True)
def list_locks():
    rows = db().execute(
        "SELECT username, locked_until FROM login_failures"
        " WHERE locked_until IS NOT NULL AND locked_until > ?"
        " ORDER BY locked_until, username",
        (now(),),
    ).fetchall()
    return {
        "items": [
            {"username": r["username"], "locked_until": iso(r["locked_until"])}
            for r in rows
        ]
    }


@app.post("/api/admin/locks/<path:username>/unlock")
@require_auth(admin=True)
def unlock(username: str):
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM login_failures WHERE username = ?", (username,))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return {"username": username, "unlocked": True}


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return error(404, "not_found", "Not found")
    return _e


@app.errorhandler(405)
def method_not_allowed(e):
    if request.path.startswith("/api/"):
        return error(405, "method_not_allowed", "Method not allowed")
    return e


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "not_found", "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
