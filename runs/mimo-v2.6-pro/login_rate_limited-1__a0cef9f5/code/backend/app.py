"""Flask entry point: account service with sign-in lockout and rate limiting."""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

MAX_FAILED_ATTEMPTS = 5
LOCK_DURATION = timedelta(minutes=15)
RATE_LIMIT_ATTEMPTS = 20
RATE_WINDOW = timedelta(seconds=60)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    username TEXT NOT NULL,
    at TEXT NOT NULL,
    success INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lockouts (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT
);
CREATE TABLE IF NOT EXISTS login_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client TEXT NOT NULL,
    at REAL NOT NULL
);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(_exc: BaseException | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def set_lockout(db: sqlite3.Connection, username: str, failed_count: int,
                locked_until: str | None) -> None:
    db.execute(
        """
        INSERT INTO lockouts (username, failed_count, locked_until)
        VALUES (?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
            failed_count = excluded.failed_count,
            locked_until = excluded.locked_until
        """,
        (username, failed_count, locked_until),
    )


# --------------------------------------------------------------------------
# Admin bootstrap: password comes from ADMIN_PASSWORD at start-up only.
# --------------------------------------------------------------------------

def ensure_admin() -> None:
    if not ADMIN_ENABLED:
        return
    password_hash = generate_password_hash(ADMIN_PASSWORD)
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (password_hash, row[0]),
            )
        else:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (ADMIN_USERNAME, password_hash),
            )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------------

def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            """
            SELECT u.id, u.username, u.last_login_at
            FROM tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
            """,
            (token,),
        )
        .fetchone()
    )


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return jsonify(error="Authentication required"), 401
        return view(user, *args, **kwargs)

    return wrapped


def admin_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return jsonify(error="Authentication required"), 401
        if user["username"] != ADMIN_USERNAME:
            return jsonify(error="Admin access required"), 403
        return view(user, *args, **kwargs)

    return wrapped


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def too_many(message: str, retry_after: int):
    response = jsonify(error=message)
    response.status_code = 429
    response.headers["Retry-After"] = str(max(1, retry_after))
    return response


def client_key() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def check_rate_limit(db: sqlite3.Connection, now: datetime) -> int | None:
    """Return seconds to wait when the client exceeded the limit, else None."""
    key = client_key()
    now_ts = now.timestamp()
    window_start = (now - RATE_WINDOW).timestamp()
    db.execute("DELETE FROM login_events WHERE at < ?", (window_start - 60,))
    rows = db.execute(
        "SELECT at FROM login_events WHERE client = ? AND at > ? ORDER BY at",
        (key, window_start),
    ).fetchall()
    if len(rows) >= RATE_LIMIT_ATTEMPTS:
        db.commit()
        return max(1, math.ceil(rows[0]["at"] + RATE_WINDOW.total_seconds() - now_ts))
    db.execute("INSERT INTO login_events (client, at) VALUES (?, ?)", (key, now_ts))
    db.commit()
    return None


def credentials_valid(username: str, password: str) -> bool:
    if username == ADMIN_USERNAME and not ADMIN_ENABLED:
        return False
    row = (
        get_db()
        .execute("SELECT password_hash FROM users WHERE username = ?", (username,))
        .fetchone()
    )
    if row is None:
        return False
    return check_password_hash(row["password_hash"], password)


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)

init_db()
ensure_admin()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="JSON body required"), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify(error="username and password are required"), 400
    username = username.strip()
    if (
        not username
        or len(username) > 64
        or "/" in username
        or any(ch.isspace() for ch in username)
    ):
        return jsonify(error="invalid username"), 400
    if not password:
        return jsonify(error="password must not be empty"), 400
    if username == ADMIN_USERNAME:
        return jsonify(error="username is reserved"), 400

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify(error="username already taken"), 409
    return jsonify(id=cursor.lastrowid, username=username), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="JSON body required"), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify(error="username and password are required"), 400

    now = utcnow()
    db = get_db()

    retry_after = check_rate_limit(db, now)
    if retry_after is not None:
        return too_many("Too many sign-in attempts from this client", retry_after)

    lock = db.execute(
        "SELECT failed_count, locked_until FROM lockouts WHERE username = ?",
        (username,),
    ).fetchone()
    failed_count = 0
    if lock is not None:
        if lock["locked_until"]:
            locked_until = parse_iso(lock["locked_until"])
            if locked_until > now:
                return too_many(
                    "Too many failed sign-in attempts for this username",
                    math.ceil((locked_until - now).total_seconds()),
                )
        else:
            failed_count = lock["failed_count"]

    user = db.execute(
        "SELECT id, username FROM users WHERE username = ?", (username,)
    ).fetchone()
    at = to_iso(now)

    if user is not None and credentials_valid(username, password):
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], at),
        )
        db.execute(
            "UPDATE users SET last_login_at = ? WHERE id = ?", (at, user["id"])
        )
        db.execute(
            "INSERT INTO login_attempts (user_id, username, at, success)"
            " VALUES (?, ?, ?, 1)",
            (user["id"], username, at),
        )
        set_lockout(db, username, 0, None)
        db.commit()
        return jsonify(token=token)

    if user is not None:
        db.execute(
            "INSERT INTO login_attempts (user_id, username, at, success)"
            " VALUES (?, ?, ?, 0)",
            (user["id"], username, at),
        )
    failed_count += 1
    locked_until = (
        to_iso(now + LOCK_DURATION) if failed_count >= MAX_FAILED_ATTEMPTS else None
    )
    set_lockout(db, username, failed_count, locked_until)
    db.commit()
    return jsonify(error="Invalid username or password"), 401


@app.get("/api/me")
@login_required
def me(user: sqlite3.Row):
    return jsonify(
        id=user["id"],
        username=user["username"],
        last_login_at=user["last_login_at"],
    )


@app.get("/api/me/login-attempts")
@login_required
def my_login_attempts(user: sqlite3.Row):
    rows = (
        get_db()
        .execute(
            "SELECT at, success FROM login_attempts WHERE user_id = ?"
            " ORDER BY id DESC LIMIT 20",
            (user["id"],),
        )
        .fetchall()
    )
    return jsonify(
        items=[{"at": row["at"], "success": bool(row["success"])} for row in rows]
    )


@app.get("/api/admin/locks")
@admin_required
def list_locks(_user: sqlite3.Row):
    now = utcnow()
    rows = (
        get_db()
        .execute(
            "SELECT username, locked_until FROM lockouts"
            " WHERE locked_until IS NOT NULL"
        )
        .fetchall()
    )
    items = [
        {"username": row["username"], "locked_until": row["locked_until"]}
        for row in rows
        if row["locked_until"] and parse_iso(row["locked_until"]) > now
    ]
    items.sort(key=lambda item: item["locked_until"])
    return jsonify(items=items)


@app.post("/api/admin/locks/<username>/unlock")
@admin_required
def unlock(_user: sqlite3.Row, username: str):
    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone() or db.execute(
        "SELECT 1 FROM lockouts WHERE username = ?", (username,)
    ).fetchone()
    if exists is None:
        return jsonify(error="Unknown username"), 404
    set_lockout(db, username, 0, None)
    db.commit()
    return jsonify(username=username)


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify(error="Not found"), 404
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify(error="Not found"), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
