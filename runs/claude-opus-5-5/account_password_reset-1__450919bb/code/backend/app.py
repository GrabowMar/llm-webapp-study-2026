"""Flask entry point."""

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
PUBLIC_BASE_URL = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
RESET_TOKEN_TTL = timedelta(hours=1)
MIN_PASSWORD = 8
MAX_PASSWORD = 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DUMMY_HASH = generate_password_hash(secrets.token_hex(16))

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    email TEXT,
    email_norm TEXT UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS reset_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);
CREATE INDEX IF NOT EXISTS reset_tokens_user ON reset_tokens(user_id);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_addr TEXT NOT NULL,
    to_norm TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_to ON outbox(to_norm, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
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


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def get_str(data: dict, key: str) -> str | None:
    value = data.get(key)
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"{key} must be a string")
    return value


def validate_password(value, field: str = "password") -> str:
    if not isinstance(value, str):
        raise ApiError(400, f"{field} is required")
    if len(value) < MIN_PASSWORD:
        raise ApiError(400, f"{field} must be at least {MIN_PASSWORD} characters long")
    if len(value) > MAX_PASSWORD:
        raise ApiError(400, f"{field} is too long")
    return value


def normalize_email(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError(400, "email must be a string")
    value = value.strip()
    if value == "":
        return None
    if len(value) > 254 or not EMAIL_RE.match(value):
        raise ApiError(400, "email is not a valid email address")
    return value


def user_json(row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def current_user():
    token = bearer_token()
    if token is None:
        raise ApiError(401, "Authentication required")
    row = db().execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (sha256(token),),
    ).fetchone()
    if row is None:
        raise ApiError(401, "Authentication required")
    return row


def send_mail(to: str, subject: str, text: str) -> None:
    db().execute(
        "INSERT INTO outbox (to_addr, to_norm, subject, body, sent_at) VALUES (?, ?, ?, ?, ?)",
        (to, to.lower(), subject, text, iso(now())),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = get_str(data, "username")
    if username is None or not username.strip():
        raise ApiError(400, "username is required")
    username = username.strip()
    if len(username) > 64 or not username.isprintable():
        raise ApiError(400, "username must be at most 64 printable characters")
    password = validate_password(data.get("password"))
    email = normalize_email(data.get("email"))
    password_hash = generate_password_hash(password)
    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            raise ApiError(409, "Username is already taken")
        if email and conn.execute(
            "SELECT 1 FROM users WHERE email_norm = ?", (email.lower(),)
        ).fetchone():
            raise ApiError(409, "Email address is already in use")
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, email, email_norm, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (username, password_hash, email, email.lower() if email else None, iso(now())),
        )
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(user_json(row)), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    row = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (sha256(token), row["id"], iso(now())),
    )
    return {"token": token}


@app.post("/api/auth/logout")
def logout():
    token = bearer_token()
    if token:
        db().execute("DELETE FROM sessions WHERE token_hash = ?", (sha256(token),))
    return "", 204


@app.get("/api/me")
def me():
    return user_json(current_user())


@app.patch("/api/me")
def update_me():
    user = current_user()
    data = body()
    if "email" not in data:
        raise ApiError(400, "email is required")
    email = normalize_email(data.get("email"))
    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if email and conn.execute(
            "SELECT 1 FROM users WHERE email_norm = ? AND id != ?", (email.lower(), user["id"])
        ).fetchone():
            raise ApiError(409, "Email address is already in use")
        conn.execute(
            "UPDATE users SET email = ?, email_norm = ? WHERE id = ?",
            (email, email.lower() if email else None, user["id"]),
        )
        if (email or "").lower() != (user["email"] or "").lower():
            conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (user["id"],))
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return user_json(row)


@app.post("/api/me/password")
def change_password():
    user = current_user()
    data = body()
    current = data.get("current_password")
    if not isinstance(current, str):
        raise ApiError(400, "current_password is required")
    new = validate_password(data.get("new_password"), "new_password")
    if not check_password_hash(user["password_hash"], current):
        raise ApiError(403, "Current password is incorrect")
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new), user["id"]),
        )
        conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (user["id"],))
        conn.execute(
            "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
            (user["id"], sha256(bearer_token() or "")),
        )
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return {"status": "ok"}


@app.post("/api/auth/password-reset")
def request_password_reset():
    data = body()
    username = get_str(data, "username")
    email = get_str(data, "email")
    username = username.strip() if username else None
    email = email.strip() if email else None
    if not username and not email:
        raise ApiError(400, "username or email is required")
    conn = db()
    row = None
    if username:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None and email:
        row = conn.execute(
            "SELECT * FROM users WHERE email_norm = ?", (email.lower(),)
        ).fetchone()
    if row is not None and row["email"]:
        token = secrets.token_urlsafe(32)
        created = now()
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute("DELETE FROM reset_tokens WHERE user_id = ?", (row["id"],))
            conn.execute(
                "INSERT INTO reset_tokens (token_hash, user_id, created_at, expires_at)"
                " VALUES (?, ?, ?, ?)",
                (sha256(token), row["id"], iso(created), iso(created + RESET_TOKEN_TTL)),
            )
            link = f"{PUBLIC_BASE_URL}/reset?token={token}"
            minutes = int(RESET_TOKEN_TTL.total_seconds() // 60)
            send_mail(
                row["email"],
                "Reset your password",
                f"Hello {row['username']},\n\n"
                "Someone asked to reset the password for your account. "
                "To choose a new password, open this link:\n\n"
                f"{link}\n\n"
                f"The link works once and expires in {minutes} minutes. "
                "If you did not ask for a reset, you can ignore this message.\n",
            )
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
    return jsonify({"message": "If the account exists, a reset link is on its way"}), 200


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset():
    data = body()
    token = data.get("token")
    if not isinstance(token, str) or not token:
        raise ApiError(400, "token is required")
    new = validate_password(data.get("new_password"), "new_password")
    password_hash = generate_password_hash(new)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        stamp = iso(now())
        row = conn.execute(
            "SELECT user_id FROM reset_tokens"
            " WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
            (sha256(token), stamp),
        ).fetchone()
        if row is None:
            raise ApiError(400, "This reset link is invalid or has expired")
        user_id = row["user_id"]
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
        conn.execute(
            "UPDATE reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL",
            (stamp, user_id),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return {"status": "ok"}


@app.get("/api/outbox")
def outbox():
    to = (request.args.get("to") or "").strip()
    if not to:
        raise ApiError(400, "to is required")
    rows = db().execute(
        "SELECT * FROM outbox WHERE to_norm = ? ORDER BY id DESC", (to.lower(),)
    ).fetchall()
    return {
        "items": [
            {
                "id": r["id"],
                "to": r["to_addr"],
                "subject": r["subject"],
                "body": r["body"],
                "sent_at": r["sent_at"],
            }
            for r in rows
        ]
    }


@app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
