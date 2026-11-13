"""Account service with sign-in lockout.

The API lives under ``/api`` and the built frontend is served from ``/``.
State is kept in SQLite below ``./data``.
"""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
LOCK_THRESHOLD = 5
LOCK_SECONDS = 15 * 60
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW = 60
MAX_ATTEMPTS_KEPT = 200

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    login_enabled INTEGER NOT NULL DEFAULT 1,
    failed_count  INTEGER NOT NULL DEFAULT 0,
    locked_until  REAL,
    last_login_at REAL,
    created_at    REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    at         REAL NOT NULL,
    success    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_account ON login_attempts (account_id, at DESC, id DESC);

CREATE TABLE IF NOT EXISTS client_attempts (
    client  TEXT NOT NULL,
    at      REAL NOT NULL,
    outcome INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_attempts ON client_attempts (client, at);
"""


# --------------------------------------------------------------------------- #
# database helpers
# --------------------------------------------------------------------------- #
def get_db() -> sqlite3.Connection:
    conn = g.get("db")
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return conn


@app.teardown_appcontext
def close_db(_exc: object) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def sync_admin_account() -> None:
    """Make sure the ``admin`` account matches the environment.

    The password is read from ``ADMIN_PASSWORD`` every time the app starts.
    When the variable is missing or empty, admin sign-in is disabled.
    """
    db = get_db()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    row = db.execute(
        "SELECT id FROM accounts WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    now = time.time()
    if password:
        password_hash = generate_password_hash(password)
        if row is None:
            db.execute(
                "INSERT INTO accounts (username, password_hash, is_admin, login_enabled,"
                " failed_count, locked_until, created_at) VALUES (?, ?, 1, 1, 0, NULL, ?)",
                (ADMIN_USERNAME, password_hash, now),
            )
        else:
            db.execute(
                "UPDATE accounts SET password_hash = ?, is_admin = 1, login_enabled = 1,"
                " failed_count = 0, locked_until = NULL WHERE id = ?",
                (password_hash, row["id"]),
            )
    else:
        password_hash = generate_password_hash(secrets.token_urlsafe(32))
        if row is None:
            db.execute(
                "INSERT INTO accounts (username, password_hash, is_admin, login_enabled,"
                " failed_count, locked_until, created_at) VALUES (?, ?, 1, 0, 0, NULL, ?)",
                (ADMIN_USERNAME, password_hash, now),
            )
        else:
            db.execute(
                "UPDATE accounts SET is_admin = 1, login_enabled = 0, failed_count = 0,"
                " locked_until = NULL WHERE id = ?",
                (row["id"],),
            )
    db.commit()


def ensure_admin_account() -> None:
    """Recreate the admin account if it went missing (e.g. a wiped database)."""
    db = get_db()
    row = db.execute(
        "SELECT id FROM accounts WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if row is not None:
        return
    password = os.environ.get("ADMIN_PASSWORD") or ""
    password_hash = (
        generate_password_hash(password)
        if password
        else generate_password_hash(secrets.token_urlsafe(32))
    )
    db.execute(
        "INSERT INTO accounts (username, password_hash, is_admin, login_enabled,"
        " failed_count, locked_until, created_at) VALUES (?, ?, 1, ?, 0, NULL, ?)",
        (ADMIN_USERNAME, password_hash, 1 if password else 0, time.time()),
    )
    db.commit()


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #
def iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    moment = datetime.fromtimestamp(ts, timezone.utc).isoformat(timespec="milliseconds")
    return moment.replace("+00:00", "Z")


def error(status: int, code: str, message: str, **extra: object):
    payload: dict[str, object] = {"error": code, "message": message}
    payload.update(extra)
    return jsonify(payload), status


def too_many(retry_after: int, code: str, message: str, **extra: object):
    seconds = max(1, int(retry_after))
    payload: dict[str, object] = {
        "error": code,
        "message": message,
        "retry_after": seconds,
    }
    payload.update(extra)
    response = jsonify(payload)
    response.status_code = 429
    response.headers["Retry-After"] = str(seconds)
    return response


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def client_identifier() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        first = forwarded.split(",")[0].strip()
        if first:
            return first
    return request.remote_addr or "unknown"


def current_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id"
        " WHERE s.token = ?",
        (token,),
    ).fetchone()


def require_account() -> sqlite3.Row:
    account = current_account()
    if account is None:
        raise ApiError(401, "unauthorized", "A valid access token is required.")
    return account


def require_admin() -> sqlite3.Row:
    account = require_account()
    if not account["is_admin"] or not account["login_enabled"]:
        raise ApiError(403, "forbidden", "This action is restricted to the admin.")
    return account


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.extra = extra

    def to_response(self):
        return error(self.status, self.code, self.message, **self.extra)


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return exc.to_response()


def record_attempt(account_id: int, at: float, success: bool) -> None:
    db = get_db()
    db.execute(
        "INSERT INTO login_attempts (account_id, at, success) VALUES (?, ?, ?)",
        (account_id, at, 1 if success else 0),
    )
    db.execute(
        "DELETE FROM login_attempts WHERE account_id = ? AND id NOT IN"
        " (SELECT id FROM login_attempts WHERE account_id = ?"
        "  ORDER BY at DESC, id DESC LIMIT ?)",
        (account_id, account_id, MAX_ATTEMPTS_KEPT),
    )


def record_client_attempt(client: str, at: float, outcome: int) -> None:
    """Remember a sign-in attempt for the per client attempt limit."""
    get_db().execute(
        "INSERT INTO client_attempts (client, at, outcome) VALUES (?, ?, ?)",
        (client, at, outcome),
    )


def rate_limit_retry_after(client: str, now: float) -> int | None:
    """Return the seconds to wait when the client is over the attempt limit.

    At most ``RATE_LIMIT_MAX`` attempts are accepted per ``RATE_LIMIT_WINDOW``
    seconds.  Attempts that are refused are not counted, so the block ends as
    soon as the window slides past the oldest accepted attempt.
    """
    db = get_db()
    db.execute("DELETE FROM client_attempts WHERE at <= ?", (now - RATE_LIMIT_WINDOW,))
    rows = db.execute(
        "SELECT at FROM client_attempts WHERE client = ? ORDER BY at ASC", (client,)
    ).fetchall()
    if len(rows) >= RATE_LIMIT_MAX:
        oldest = rows[0]["at"]
        return max(1, math.ceil(oldest + RATE_LIMIT_WINDOW - now))
    return None


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "invalid_request", "A JSON body is required.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "invalid_request", "username and password are required.")
    username = username.strip()
    if not username or len(username) > 64:
        return error(400, "invalid_request", "username must be 1-64 characters.")
    if not password or len(password) > 256:
        return error(400, "invalid_request", "password must be 1-256 characters.")
    if username.casefold() == ADMIN_USERNAME:
        return error(409, "username_taken", "That username is reserved.")

    db = get_db()
    if db.execute("SELECT id FROM accounts WHERE username = ?", (username,)).fetchone():
        return error(409, "username_taken", "That username is already taken.")
    now = time.time()
    cursor = db.execute(
        "INSERT INTO accounts (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now),
    )
    db.commit()
    return (
        jsonify({"id": cursor.lastrowid, "username": username}),
        201,
    )


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error(400, "invalid_request", "A JSON body is required.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "invalid_request", "username and password are required.")
    username = username.strip()
    if not username:
        return error(400, "invalid_request", "username and password are required.")

    now = time.time()
    db = get_db()
    client = client_identifier()

    account = db.execute("SELECT * FROM accounts WHERE username = ?", (username,)).fetchone()
    if account is None and username.casefold() == ADMIN_USERNAME:
        ensure_admin_account()
        account = db.execute(
            "SELECT * FROM accounts WHERE username = ?", (username,)
        ).fetchone()

    # A locked username is refused before anything else: even the right
    # password cannot get in until the lock expires.
    if account is not None and account["login_enabled"]:
        locked_until = account["locked_until"]
        if locked_until is not None and locked_until > now:
            seconds = max(1, math.ceil(locked_until - now))
            return too_many(
                seconds,
                "locked",
                f"This username is locked. Try again in {seconds} seconds.",
                locked_until=iso(locked_until),
            )
        if locked_until is not None:
            db.execute(
                "UPDATE accounts SET locked_until = NULL, failed_count = 0 WHERE id = ?",
                (account["id"],),
            )
            db.commit()
            account = db.execute(
                "SELECT * FROM accounts WHERE id = ?", (account["id"],)
            ).fetchone()

    retry_after = rate_limit_retry_after(client, now)
    if retry_after is not None:
        return too_many(
            retry_after,
            "rate_limited",
            f"Too many sign-in attempts. Try again in {retry_after} seconds.",
        )

    if account is None or not account["login_enabled"]:
        record_client_attempt(client, now, 0)
        db.commit()
        return error(401, "invalid_credentials", "Invalid username or password.")

    if not check_password_hash(account["password_hash"], password):
        failed_count = int(account["failed_count"]) + 1
        if failed_count >= LOCK_THRESHOLD:
            db.execute(
                "UPDATE accounts SET failed_count = ?, locked_until = ? WHERE id = ?",
                (failed_count, now + LOCK_SECONDS, account["id"]),
            )
        else:
            db.execute(
                "UPDATE accounts SET failed_count = ? WHERE id = ?",
                (failed_count, account["id"]),
            )
        record_attempt(account["id"], now, False)
        record_client_attempt(client, now, 0)
        db.commit()
        return error(401, "invalid_credentials", "Invalid username or password.")

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account["id"], now),
    )
    db.execute(
        "UPDATE accounts SET failed_count = 0, locked_until = NULL, last_login_at = ?"
        " WHERE id = ?",
        (now, account["id"]),
    )
    record_attempt(account["id"], now, True)
    record_client_attempt(client, now, 1)
    db.commit()
    return jsonify({"token": token})


@app.get("/api/me")
def me():
    account = require_account()
    return jsonify(
        {
            "id": account["id"],
            "username": account["username"],
            "last_login_at": iso(account["last_login_at"]),
        }
    )


@app.get("/api/me/login-attempts")
def my_login_attempts():
    account = require_account()
    rows = get_db().execute(
        "SELECT at, success FROM login_attempts WHERE account_id = ?"
        " ORDER BY at DESC, id DESC LIMIT 20",
        (account["id"],),
    ).fetchall()
    items = [{"at": iso(row["at"]), "success": bool(row["success"])} for row in rows]
    return jsonify({"items": items})


@app.get("/api/admin/locks")
def admin_locks():
    require_admin()
    now = time.time()
    rows = get_db().execute(
        "SELECT username, locked_until FROM accounts"
        " WHERE locked_until IS NOT NULL AND locked_until > ?"
        " ORDER BY locked_until ASC, username ASC",
        (now,),
    ).fetchall()
    items = [
        {"username": row["username"], "locked_until": iso(row["locked_until"])}
        for row in rows
    ]
    return jsonify({"items": items})


@app.post("/api/admin/locks/<username>/unlock")
def admin_unlock(username: str):
    require_admin()
    username = (username or "").strip()
    db = get_db()
    account = db.execute(
        "SELECT * FROM accounts WHERE username = ?", (username,)
    ).fetchone()
    if account is None:
        return error(404, "not_found", "No account with that username.")
    was_locked = account["locked_until"] is not None and account["locked_until"] > time.time()
    db.execute(
        "UPDATE accounts SET locked_until = NULL, failed_count = 0 WHERE id = ?",
        (account["id"],),
    )
    db.commit()
    return jsonify({"username": account["username"], "unlocked": True, "was_locked": was_locked})


# --------------------------------------------------------------------------- #
# frontend
# --------------------------------------------------------------------------- #
@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "not_found", "Unknown API endpoint.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def handle_404(_exc: object):
    if request.path.startswith("/api/"):
        return error(404, "not_found", "Unknown API endpoint.")
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_exc: object):
    if request.path.startswith("/api/"):
        return error(405, "method_not_allowed", "That method is not allowed here.")
    return error(405, "method_not_allowed", "That method is not allowed here.")


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    if isinstance(exc, ApiError):  # pragma: no cover - handled by its own handler
        return exc.to_response()
    app.logger.exception("unhandled error")
    return error(500, "internal_error", "Something went wrong.")


@app.after_request
def add_cors_headers(response):
    if request.path.startswith("/api/"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Authorization, Content-Type"
        )
        response.headers.setdefault(
            "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"
        )
    return response


init_db()
with app.app_context():
    sync_admin_account()
