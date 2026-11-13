"""Flask entry point: account service with password reset."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

MIN_PASSWORD = 8
MAX_PASSWORD = 1000
SESSION_TTL = timedelta(days=30)
RESET_TTL = timedelta(hours=1)
EMAIL_RE = re.compile(r"^[^@\s<>()\[\],;:\\\"]+@[^@\s<>()\[\],;:\\\"]+\.[^@\s<>()\[\],;:\\\"]+$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    email TEXT,
    email_lower TEXT UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_lower TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reset_tokens_user ON reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_addr TEXT NOT NULL,
    to_lower TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_to ON outbox(to_lower, id);
"""


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


init_db()
DUMMY_HASH = generate_password_hash(secrets.token_hex(8))


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api/"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def no_store(resp):
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def body_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def opt_str(data: dict, key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{key} must be a string")
    return value


def req_str(data: dict, key: str) -> str:
    value = opt_str(data, key)
    if value is None or value == "":
        raise ApiError(400, f"{key} is required")
    return value


def check_password(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise ApiError(400, f"Password must be at least {MIN_PASSWORD} characters long")
    if len(password) > MAX_PASSWORD:
        raise ApiError(400, f"Password must be at most {MAX_PASSWORD} characters long")


def clean_email(value: str) -> str:
    email = value.strip()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise ApiError(400, "Invalid email address")
    return email


def email_taken(email: str, exclude_user: int | None = None) -> bool:
    row = db().execute(
        "SELECT id FROM users WHERE email_lower = ?", (email.lower(),)
    ).fetchone()
    return row is not None and row["id"] != exclude_user


def user_json(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, iso(now() + SESSION_TTL)),
    )
    return token


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


def current_user() -> sqlite3.Row:
    token = bearer_token()
    if token:
        row = db().execute(
            "SELECT u.*, s.expires_at AS s_exp FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row is not None and row["s_exp"] > iso(now()):
            g.token_hash = hash_token(token)
            return row
    raise ApiError(401, "Authentication required")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = req_str(data, "username").strip()
    if not username or len(username) > 64:
        raise ApiError(400, "Username must be 1-64 characters")
    password = req_str(data, "password")
    check_password(password)
    raw_email = opt_str(data, "email")
    email = clean_email(raw_email) if raw_email is not None and raw_email.strip() else None

    conn = db()
    pw_hash = generate_password_hash(password)
    try:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            conn.execute("ROLLBACK")
            raise ApiError(409, "Username is already taken")
        if email and email_taken(email):
            conn.execute("ROLLBACK")
            raise ApiError(409, "Email address is already in use")
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, email, email_lower, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (username, pw_hash, email, email.lower() if email else None, iso(now())),
        )
        conn.execute("COMMIT")
    except sqlite3.IntegrityError:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise ApiError(409, "Username or email address is already in use")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(user_json(row)), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = req_str(data, "username")
    password = req_str(data, "password")
    row = db().execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    ok = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
    if row is None or not ok:
        raise ApiError(401, "Invalid username or password")
    db().execute("DELETE FROM sessions WHERE expires_at <= ?", (iso(now()),))
    return jsonify({"token": new_session(row["id"])})


@app.post("/api/auth/logout")
def logout():
    current_user()
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
    return "", 204


@app.get("/api/me")
def me():
    return jsonify(user_json(current_user()))


@app.patch("/api/me")
def update_me():
    user = current_user()
    data = body_json()
    if "email" not in data:
        raise ApiError(400, "email is required")
    raw = opt_str(data, "email")
    email = clean_email(raw) if raw is not None and raw.strip() else None
    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if email and email_taken(email, exclude_user=user["id"]):
            conn.execute("ROLLBACK")
            raise ApiError(409, "Email address is already in use")
        conn.execute(
            "UPDATE users SET email = ?, email_lower = ? WHERE id = ?",
            (email, email.lower() if email else None, user["id"]),
        )
        conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (user["id"],))
        conn.execute("COMMIT")
    except sqlite3.IntegrityError:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise ApiError(409, "Email address is already in use")
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify(user_json(row))


@app.post("/api/me/password")
def change_password():
    user = current_user()
    data = body_json()
    current = req_str(data, "current_password")
    new = req_str(data, "new_password")
    if not check_password_hash(user["password_hash"], current):
        raise ApiError(403, "Current password is incorrect")
    check_password(new)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new), user["id"]),
    )
    conn.execute(
        "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
        (user["id"], g.token_hash),
    )
    conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (user["id"],))
    conn.execute("COMMIT")
    return jsonify({"status": "ok"})


def base_url() -> str:
    configured = os.environ.get("PUBLIC_URL")
    return (configured or request.host_url).rstrip("/")


@app.post("/api/auth/password-reset")
def password_reset():
    data = body_json()
    username = opt_str(data, "username")
    email = opt_str(data, "email")
    username = username.strip() if username else ""
    email = email.strip() if email else ""
    if not username and not email:
        raise ApiError(400, "username or email is required")

    conn = db()
    row = None
    if username:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None and email:
        row = conn.execute(
            "SELECT * FROM users WHERE email_lower = ?", (email.lower(),)
        ).fetchone()

    if row is not None and row["email"]:
        token = secrets.token_urlsafe(32)
        stamp = now()
        link = f"{base_url()}/reset?token={token}"
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (row["id"],))
        conn.execute(
            "INSERT INTO reset_tokens (token_hash, user_id, email_lower, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (hash_token(token), row["id"], row["email_lower"], iso(stamp + RESET_TTL)),
        )
        conn.execute(
            "INSERT INTO outbox (to_addr, to_lower, subject, body, sent_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                row["email"],
                row["email_lower"],
                "Reset your password",
                f"Hello {row['username']},\n\n"
                "Someone asked to reset the password of your account. "
                f"Use this link to choose a new password (valid for 1 hour, single use):\n\n{link}\n\n"
                "If you did not ask for this, you can ignore this message.",
                iso(stamp),
            ),
        )
        conn.execute("COMMIT")

    return jsonify({"status": "ok", "message": "If the account exists, a reset link is on its way"})


@app.post("/api/auth/password-reset/confirm")
def password_reset_confirm():
    data = body_json()
    token = req_str(data, "token")
    new = req_str(data, "new_password")
    check_password(new)

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    row = conn.execute(
        "SELECT t.*, u.email_lower AS cur_email FROM reset_tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    valid = (
        row is not None
        and not row["used"]
        and row["expires_at"] > iso(now())
        and row["cur_email"] == row["email_lower"]
    )
    if not valid:
        conn.execute("ROLLBACK")
        raise ApiError(400, "This reset link is invalid or has expired")
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new), row["user_id"]),
    )
    conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (row["user_id"],))
    conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
    conn.execute("COMMIT")
    return jsonify({"status": "ok"})


@app.get("/api/outbox")
def outbox():
    to = (request.args.get("to") or "").strip()
    if not to:
        raise ApiError(400, "Query parameter 'to' is required")
    rows = db().execute(
        "SELECT id, to_addr, subject, body, sent_at FROM outbox "
        "WHERE to_lower = ? ORDER BY id DESC",
        (to.lower(),),
    ).fetchall()
    items = [
        {
            "id": r["id"],
            "to": r["to_addr"],
            "subject": r["subject"],
            "body": r["body"],
            "sent_at": r["sent_at"],
        }
        for r in rows
    ]
    return jsonify({"items": items})


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_rest):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
