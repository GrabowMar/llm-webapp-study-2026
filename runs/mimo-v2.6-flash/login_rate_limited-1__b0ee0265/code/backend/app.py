"""Account API with sign-in lockout and per-client rate limiting."""

from __future__ import annotations

import hashlib
import math
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import Response
from flask import send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

LOCKOUT_THRESHOLD = 5
LOCKOUT_SECONDS = 15 * 60
RATE_LIMIT_ATTEMPTS = 20
RATE_LIMIT_WINDOW = 60
PBKDF2_ITERATIONS = 120_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS locks (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    at TEXT NOT NULL,
    success INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_account
    ON login_attempts(account_id, id DESC);
"""

app = Flask(__name__, static_folder=None)

_rate_buckets: dict[str, list[float]] = {}
_rate_lock = threading.Lock()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS, salt.hex(), digest.hex()
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return secrets.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def error(message: str, status: int, *, code: str | None = None,
          retry_after: int | None = None):
    body: dict = {"error": message}
    if code is not None:
        body["code"] = code
    if retry_after is not None:
        body["retry_after"] = retry_after
    response = jsonify(body)
    response.status_code = status
    if retry_after is not None:
        response.headers["Retry-After"] = str(retry_after)
    return response


def get_conn() -> sqlite3.Connection:
    if "db_conn" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db_conn = conn
    return g.db_conn


@app.teardown_appcontext
def close_conn(_exception):
    conn = g.pop("db_conn", None)
    if conn is not None:
        conn.close()


@app.after_request
def add_cors_headers(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers",
                                "Content-Type, Authorization")
    response.headers.setdefault("Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS, DELETE")
    return response


def client_key() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit_check(client: str) -> int | None:
    moment = time.time()
    with _rate_lock:
        stamps = _rate_buckets.setdefault(client, [])
        stamps[:] = [stamp for stamp in stamps
                     if moment - stamp < RATE_LIMIT_WINDOW]
        if len(stamps) >= RATE_LIMIT_ATTEMPTS:
            retry = math.ceil(min(stamps) + RATE_LIMIT_WINDOW - moment)
            return max(1, retry)
        stamps.append(moment)
        if len(_rate_buckets) > 4096:
            for key in [key for key, value in _rate_buckets.items() if not value]:
                del _rate_buckets[key]
        return None


def locked_for(conn: sqlite3.Connection, username: str) -> int | None:
    row = conn.execute(
        "SELECT locked_until FROM locks WHERE username = ?", (username,)
    ).fetchone()
    if row is None or row["locked_until"] is None:
        return None
    remaining = (from_iso(row["locked_until"]) - utcnow()).total_seconds()
    if remaining <= 0:
        conn.execute(
            "UPDATE locks SET failed_count = 0, locked_until = NULL "
            "WHERE username = ?",
            (username,),
        )
        conn.commit()
        return None
    return max(1, math.ceil(remaining))


def note_failure(conn: sqlite3.Connection, username: str) -> None:
    row = conn.execute(
        "SELECT failed_count FROM locks WHERE username = ?", (username,)
    ).fetchone()
    count = (row["failed_count"] if row is not None else 0) + 1
    locked_until = None
    if count >= LOCKOUT_THRESHOLD:
        locked_until = to_iso(utcnow() + timedelta(seconds=LOCKOUT_SECONDS))
    conn.execute(
        "INSERT INTO locks (username, failed_count, locked_until) "
        "VALUES (?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET "
        "failed_count = excluded.failed_count, "
        "locked_until = excluded.locked_until",
        (username, count, locked_until),
    )


def record_attempt(conn: sqlite3.Connection, account: sqlite3.Row | None,
                   success: bool) -> None:
    if account is None:
        return
    conn.execute(
        "INSERT INTO login_attempts (account_id, at, success) VALUES (?, ?, ?)",
        (account["id"], to_iso(utcnow()), 1 if success else 0),
    )


def bearer_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return get_conn().execute(
        "SELECT a.* FROM tokens t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()


def require_account() -> sqlite3.Row | Response:
    account = bearer_account()
    if account is None:
        return error("authentication required", 401)
    return account


def require_admin() -> sqlite3.Row | Response:
    account = require_account()
    if isinstance(account, Response):
        return account
    if not (account["is_admin"] or account["username"] == ADMIN_USERNAME):
        return error("admin access required", 403)
    return account


def validate_credentials(payload) -> tuple[str, str, str | None]:
    if not isinstance(payload, dict):
        return "", "", "username and password are required"
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return "", "", "username and password are required"
    username = username.strip()
    if not username or not password:
        return "", "", "username and password are required"
    if len(username) > 64 or len(password) > 1024:
        return "", "", "username or password is too long"
    return username, password, None


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        if ADMIN_PASSWORD:
            conn.execute(
                "INSERT INTO accounts (username, password_hash, is_admin) "
                "VALUES (?, ?, 1) ON CONFLICT(username) DO UPDATE SET "
                "password_hash = excluded.password_hash, is_admin = 1",
                (ADMIN_USERNAME, hash_password(ADMIN_PASSWORD)),
            )
        else:
            admin = conn.execute(
                "SELECT id FROM accounts WHERE username = ?",
                (ADMIN_USERNAME,),
            ).fetchone()
            if admin is not None:
                conn.execute(
                    "DELETE FROM login_attempts WHERE account_id = ?",
                    (admin["id"],),
                )
                conn.execute(
                    "DELETE FROM tokens WHERE account_id = ?", (admin["id"],)
                )
                conn.execute(
                    "DELETE FROM accounts WHERE id = ?", (admin["id"],)
                )
        conn.commit()
    finally:
        conn.close()


init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password, failure = validate_credentials(
        request.get_json(silent=True)
    )
    if failure is not None:
        return error(failure, 400)
    if username == ADMIN_USERNAME:
        return error("username is not available", 409)
    conn = get_conn()
    try:
        cursor = conn.execute(
            "INSERT INTO accounts (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error("username already exists", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, failure = validate_credentials(
        request.get_json(silent=True)
    )
    if failure is not None:
        return error(failure, 400)

    retry_after = rate_limit_check(client_key())
    if retry_after is not None:
        return error(
            "Too many sign-in attempts from this client, try again later.",
            429,
            code="rate_limited",
            retry_after=retry_after,
        )

    conn = get_conn()
    locked_retry = locked_for(conn, username)
    if locked_retry is not None:
        return error(
            "This username is locked after repeated failed sign-ins.",
            429,
            code="locked",
            retry_after=locked_retry,
        )

    account = conn.execute(
        "SELECT * FROM accounts WHERE username = ?", (username,)
    ).fetchone()

    if username == ADMIN_USERNAME and not ADMIN_PASSWORD:
        note_failure(conn, username)
        record_attempt(conn, account, success=False)
        conn.commit()
        return error("Admin sign-in is disabled.", 401, code="admin_disabled")

    if account is None or not verify_password(password, account["password_hash"]):
        note_failure(conn, username)
        record_attempt(conn, account, success=False)
        conn.commit()
        return error("Invalid username or password.", 401,
                     code="invalid_credentials")

    token = secrets.token_urlsafe(32)
    moment = to_iso(utcnow())
    conn.execute("DELETE FROM locks WHERE username = ?", (username,))
    conn.execute(
        "UPDATE accounts SET last_login_at = ? WHERE id = ?",
        (moment, account["id"]),
    )
    conn.execute(
        "INSERT INTO tokens (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account["id"], moment),
    )
    record_attempt(conn, account, success=True)
    conn.commit()
    return jsonify({"token": token}), 200


@app.get("/api/me")
def me():
    account = require_account()
    if isinstance(account, Response):
        return account
    return jsonify({
        "id": account["id"],
        "username": account["username"],
        "last_login_at": account["last_login_at"],
    })


@app.get("/api/me/login-attempts")
def login_attempts():
    account = require_account()
    if isinstance(account, Response):
        return account
    rows = get_conn().execute(
        "SELECT at, success FROM login_attempts WHERE account_id = ? "
        "ORDER BY id DESC LIMIT 20",
        (account["id"],),
    ).fetchall()
    return jsonify({
        "items": [
            {"at": row["at"], "success": bool(row["success"])}
            for row in rows
        ]
    })


@app.get("/api/admin/locks")
def admin_locks():
    account = require_admin()
    if isinstance(account, Response):
        return account
    conn = get_conn()
    now = utcnow()
    items = []
    for row in conn.execute(
        "SELECT username, locked_until FROM locks "
        "WHERE locked_until IS NOT NULL"
    ).fetchall():
        until = from_iso(row["locked_until"])
        if until <= now:
            conn.execute(
                "UPDATE locks SET failed_count = 0, locked_until = NULL "
                "WHERE username = ?",
                (row["username"],),
            )
            continue
        items.append({
            "username": row["username"],
            "locked_until": row["locked_until"],
        })
    conn.commit()
    items.sort(key=lambda item: item["locked_until"])
    return jsonify({"items": items})


@app.post("/api/admin/locks/<username>/unlock")
def admin_unlock(username: str):
    account = require_admin()
    if isinstance(account, Response):
        return account
    conn = get_conn()
    conn.execute("DELETE FROM locks WHERE username = ?", (username,))
    conn.commit()
    return jsonify({"username": username, "unlocked": True}), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return error("frontend not built", 404)
