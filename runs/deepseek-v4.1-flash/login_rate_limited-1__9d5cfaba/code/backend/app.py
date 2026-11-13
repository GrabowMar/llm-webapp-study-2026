"""Flask application: account service with sign-in lockout and rate limiting."""

import math
import os
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", PROJECT_ROOT / "data"))
DB_PATH = DATA_DIR / "app.db"
DIST = PROJECT_ROOT / "frontend" / "dist"

LOCK_THRESHOLD = 5
LOCK_DURATION = timedelta(minutes=15)
ATTEMPT_LIMIT = 20
ATTEMPT_WINDOW_SECONDS = 60
MAX_ATTEMPTS_RETURNED = 20

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    last_login_at TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    at TEXT NOT NULL,
    success INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_account
    ON login_attempts (account_id, id DESC);

CREATE TABLE IF NOT EXISTS login_states (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
);

CREATE TABLE IF NOT EXISTS rate_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT NOT NULL,
    at REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_events_client
    ON rate_events (client, at);
"""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        admin = conn.execute(
            "SELECT id FROM accounts WHERE username = 'admin'"
        ).fetchone()
        if admin_password:
            password_hash = generate_password_hash(
                admin_password, method="pbkdf2:sha256"
            )
            if admin is None:
                conn.execute(
                    "INSERT INTO accounts (username, password_hash, created_at) "
                    "VALUES ('admin', ?, ?)",
                    (password_hash, iso(now_utc())),
                )
            else:
                conn.execute(
                    "UPDATE accounts SET password_hash = ? WHERE id = ?",
                    (password_hash, admin["id"]),
                )
        elif admin is not None:
            # Admin sign-in is disabled when no password is configured.
            conn.execute("DELETE FROM tokens WHERE account_id = ?", (admin["id"],))
            conn.execute(
                "DELETE FROM login_attempts WHERE account_id = ?", (admin["id"],)
            )
            conn.execute("DELETE FROM accounts WHERE id = ?", (admin["id"],))
        conn.commit()
    finally:
        conn.close()


init_db()


def client_identifier() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def error(message: str, status: int, *, code: str | None = None, headers=None):
    payload = {"error": message}
    if code:
        payload["code"] = code
    response = jsonify(payload)
    response.status_code = status
    if headers:
        for key, value in headers.items():
            response.headers[key] = value
    return response


def retry_after_seconds(until: datetime) -> int:
    remaining = (until - now_utc()).total_seconds()
    return max(1, math.ceil(remaining))


def rate_limit_headers(retry_after: int) -> dict[str, str]:
    return {"Retry-After": str(retry_after)}


def too_many(retry_after: int, message: str, code: str):
    return error(
        message,
        429,
        code=code,
        headers=rate_limit_headers(retry_after),
    )


def current_account():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT a.* FROM tokens t JOIN accounts a ON a.id = t.account_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        account = current_account()
        if account is None:
            return error("authentication required", 401, code="unauthorized")
        g.account = account
        return view(*args, **kwargs)

    return wrapper


def require_admin(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        account = current_account()
        if account is None:
            return error("authentication required", 401, code="unauthorized")
        if account["username"] != "admin":
            return error("admin access required", 403, code="forbidden")
        g.account = account
        return view(*args, **kwargs)

    return wrapper


def read_credentials():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None, None
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None
    username = username.strip()
    if not username or not password:
        return None, None
    if len(username) > 150 or len(password) > 1024:
        return None, None
    return username, password


def get_login_state(conn: sqlite3.Connection, username: str):
    return conn.execute(
        "SELECT username, failed_count, locked_until FROM login_states "
        "WHERE username = ?",
        (username,),
    ).fetchone()


def lock_expiry(conn: sqlite3.Connection, username: str):
    state = get_login_state(conn, username)
    if state is None or state["locked_until"] is None:
        return None
    until = parse_iso(state["locked_until"])
    if until > now_utc():
        return until
    # The lock has elapsed; give the account a fresh set of attempts.
    record_state(conn, username, 0, None)
    return None


def record_state(
    conn: sqlite3.Connection,
    username: str,
    failed_count: int,
    locked_until: datetime | None,
) -> None:
    conn.execute(
        "INSERT INTO login_states (username, failed_count, locked_until) "
        "VALUES (?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET "
        "failed_count = excluded.failed_count, "
        "locked_until = excluded.locked_until",
        (
            username,
            failed_count,
            iso(locked_until) if locked_until else None,
        ),
    )


def register_failure(conn: sqlite3.Connection, username: str) -> None:
    state = get_login_state(conn, username)
    previous = state["failed_count"] if state is not None else 0
    failures = previous + 1
    locked_until = None
    if failures >= LOCK_THRESHOLD:
        locked_until = now_utc() + LOCK_DURATION
    record_state(conn, username, failures, locked_until)


def reset_state(conn: sqlite3.Connection, username: str) -> None:
    record_state(conn, username, 0, None)


def record_attempt(
    conn: sqlite3.Connection, account_id: int, at: datetime, success: bool
) -> None:
    conn.execute(
        "INSERT INTO login_attempts (account_id, at, success) VALUES (?, ?, ?)",
        (account_id, iso(at), 1 if success else 0),
    )


def enforce_rate_limit(conn: sqlite3.Connection, client: str):
    now = time.time()
    cutoff = now - ATTEMPT_WINDOW_SECONDS
    events = conn.execute(
        "SELECT at FROM rate_events WHERE client = ? AND at > ? ORDER BY at",
        (client, cutoff),
    ).fetchall()
    if len(events) >= ATTEMPT_LIMIT:
        oldest = events[0]["at"]
        retry_after = max(1, math.ceil(oldest + ATTEMPT_WINDOW_SECONDS - now))
        return too_many(
            retry_after,
            "too many sign-in attempts, try again later",
            "rate_limited",
        )
    conn.execute(
        "INSERT INTO rate_events (client, at) VALUES (?, ?)", (client, now)
    )
    conn.execute("DELETE FROM rate_events WHERE at <= ?", (cutoff,))
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password = read_credentials()
    if username is None:
        return error("username and password are required", 400, code="invalid_request")
    if username.lower() == "admin":
        return error("username is reserved", 409, code="username_taken")
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM accounts WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username is already taken", 409, code="username_taken")
    password_hash = generate_password_hash(password, method="pbkdf2:sha256")
    cursor = conn.execute(
        "INSERT INTO accounts (username, password_hash, created_at) "
        "VALUES (?, ?, ?)",
        (username, password_hash, iso(now_utc())),
    )
    conn.commit()
    return (
        jsonify({"id": cursor.lastrowid, "username": username}),
        201,
    )


@app.post("/api/auth/login")
def login():
    username, password = read_credentials()
    if username is None:
        return error("username and password are required", 400, code="invalid_request")

    conn = get_db()
    limited = enforce_rate_limit(conn, client_identifier())
    if limited is not None:
        conn.commit()
        return limited

    account = conn.execute(
        "SELECT * FROM accounts WHERE username = ?", (username,)
    ).fetchone()

    until = lock_expiry(conn, username)
    if until is not None:
        if account is not None:
            record_attempt(conn, account["id"], now_utc(), False)
        conn.commit()
        return too_many(
            retry_after_seconds(until),
            "account is locked, try again later",
            "account_locked",
        )

    if account is None:
        register_failure(conn, username)
        conn.commit()
        return error("invalid username or password", 401, code="invalid_credentials")

    if not check_password_hash(account["password_hash"], password):
        register_failure(conn, username)
        record_attempt(conn, account["id"], now_utc(), False)
        conn.commit()
        return error("invalid username or password", 401, code="invalid_credentials")

    reset_state(conn, username)
    logged_in_at = now_utc()
    conn.execute(
        "UPDATE accounts SET last_login_at = ? WHERE id = ?",
        (iso(logged_in_at), account["id"]),
    )
    record_attempt(conn, account["id"], logged_in_at, True)
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account["id"], iso(logged_in_at)),
    )
    conn.commit()
    return jsonify({"token": token})


@app.get("/api/me")
@require_auth
def me():
    account = g.account
    return jsonify(
        {
            "id": account["id"],
            "username": account["username"],
            "last_login_at": account["last_login_at"],
        }
    )


@app.get("/api/me/login-attempts")
@require_auth
def my_login_attempts():
    rows = get_db().execute(
        "SELECT at, success FROM login_attempts WHERE account_id = ? "
        "ORDER BY id DESC LIMIT ?",
        (g.account["id"], MAX_ATTEMPTS_RETURNED),
    ).fetchall()
    return jsonify(
        {
            "items": [
                {"at": row["at"], "success": bool(row["success"])} for row in rows
            ]
        }
    )


@app.get("/api/admin/locks")
@require_admin
def admin_locks():
    now = now_utc()
    rows = get_db().execute(
        "SELECT username, locked_until FROM login_states "
        "WHERE locked_until IS NOT NULL"
    ).fetchall()
    items = []
    for row in rows:
        until = parse_iso(row["locked_until"])
        if until > now:
            items.append(
                {
                    "username": row["username"],
                    "locked_until": row["locked_until"],
                }
            )
    items.sort(key=lambda item: item["username"])
    return jsonify({"items": items})


@app.post("/api/admin/locks/<username>/unlock")
@require_admin
def admin_unlock(username: str):
    conn = get_db()
    record_state(conn, username, 0, None)
    conn.commit()
    return jsonify({"status": "unlocked", "username": username})


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error("not found", 404, code="not_found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404, code="not_found")
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
