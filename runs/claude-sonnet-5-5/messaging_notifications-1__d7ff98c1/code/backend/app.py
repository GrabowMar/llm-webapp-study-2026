"""Notification center: Flask API plus the built frontend."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notifications.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

TOKEN_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@+-]{3,64}$")
PASSWORD_MIN, PASSWORD_MAX = 8, 128
MESSAGE_MAX = 1000
TYPE_MAX = 32
DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE = 20, 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications (user_id, id DESC);
"""

DUMMY_HASH = generate_password_hash("dummy-password-for-timing")


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("DELETE FROM tokens WHERE expires_at < ?", (iso(now()),))
        if ADMIN_PASSWORD:
            conn.execute(
                "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, NULL)",
                (ADMIN_USERNAME,),
            )
        conn.commit()
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


def error(status: int, message: str):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if exc.code == 413:
        return error(413, "request too large")
    return error(exc.code or 500, exc.name.lower())


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < iso(now()):
        return None
    if row["username"].lower() == ADMIN_USERNAME and not ADMIN_PASSWORD:
        return None
    return row


def is_admin(user: sqlite3.Row) -> bool:
    return bool(ADMIN_PASSWORD) and user["username"] == ADMIN_USERNAME


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def credentials():
    data = body()
    if data is None:
        return None, None, error(400, "JSON object body required")
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None, error(400, "username and password must be strings")
    return username, password, None


@app.post("/api/auth/register")
def register():
    username, password, err = credentials()
    if err:
        return err
    if not USERNAME_RE.fullmatch(username):
        return error(400, "username must be 3-64 characters: letters, digits, _ . @ + -")
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        return error(400, f"password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters")
    if username.lower() == ADMIN_USERNAME:
        return error(409, "username already taken")
    try:
        with db():
            db().execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
    except sqlite3.IntegrityError:
        return error(409, "username already taken")
    return jsonify({"username": username}), 201


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with db():
        db().execute(
            "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_token(token), user_id, iso(now() + TOKEN_TTL)),
        )
    return token


@app.post("/api/auth/login")
def login():
    username, password, err = credentials()
    if err:
        return err
    bad = error(401, "invalid username or password")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if username.lower() == ADMIN_USERNAME:
        if not ADMIN_PASSWORD or row is None:
            return bad
        ok = hmac.compare_digest(password.encode(), ADMIN_PASSWORD.encode())
        return jsonify({"token": issue_token(row["id"])}) if ok else bad
    if row is None or not row["password_hash"]:
        check_password_hash(DUMMY_HASH, password)
        return bad
    if not check_password_hash(row["password_hash"], password):
        return bad
    return jsonify({"token": issue_token(row["id"])})


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers["Authorization"].partition(" ")[2].strip()
    with db():
        db().execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(header),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"username": g.user["username"], "is_admin": is_admin(g.user)})


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def parse_notification(data: dict | None, default_type: str):
    if data is None:
        return None, error(400, "JSON object body required")
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        return None, error(400, "message must be a non-empty string")
    if len(message) > MESSAGE_MAX:
        return None, error(400, f"message must be at most {MESSAGE_MAX} characters")
    ntype = data.get("type", default_type)
    if ntype is None:
        ntype = default_type
    if not isinstance(ntype, str) or not ntype.strip() or len(ntype) > TYPE_MAX:
        return None, error(400, f"type must be a non-empty string of at most {TYPE_MAX} characters")
    return (message, ntype.strip()), None


def parse_int_param(name: str, default: int, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None:
        return default, None
    if not re.fullmatch(r"[0-9]{1,9}", raw) or int(raw) < 1:
        return None, error(400, f"{name} must be a positive integer")
    value = int(raw)
    if maximum is not None:
        value = min(value, maximum)
    return value, None


@app.get("/api/notifications")
@login_required
def list_notifications():
    page, err = parse_int_param("page", 1)
    if err:
        return err
    page_size, err = parse_int_param("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    if err:
        return err
    where, params = ["user_id = ?"], [g.user["id"]]
    read = request.args.get("read")
    if read is not None:
        if read.lower() not in ("true", "false"):
            return error(400, "read must be true or false")
        where.append("read = ?")
        params.append(1 if read.lower() == "true" else 0)
    ntype = request.args.get("type")
    if ntype:
        where.append("type = ?")
        params.append(ntype)
    clause = " AND ".join(where)
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM notifications WHERE {clause}", params).fetchone()[0]
    unread = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0",
        (g.user["id"],),
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM notifications WHERE {clause} ORDER BY id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread,
        }
    )


@app.post("/api/notifications")
@login_required
def create_notification():
    parsed, err = parse_notification(body(), "info")
    if err:
        return err
    message, ntype = parsed
    conn = db()
    with conn:
        cur = conn.execute(
            "INSERT INTO notifications (user_id, message, type, read, created_at) "
            "VALUES (?, ?, ?, 0, ?)",
            (g.user["id"], message, ntype, iso(now())),
        )
    row = conn.execute("SELECT * FROM notifications WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def read_all():
    conn = db()
    with conn:
        cur = conn.execute(
            "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
            (g.user["id"],),
        )
    return jsonify({"updated": cur.rowcount})


def own_notification(nid: int):
    return db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (nid, g.user["id"]),
    ).fetchone()


@app.get("/api/notifications/<int:nid>")
@login_required
def get_notification(nid: int):
    row = own_notification(nid)
    if row is None:
        return error(404, "notification not found")
    return jsonify(serialize(row))


@app.patch("/api/notifications/<int:nid>")
@login_required
def update_notification(nid: int):
    data = body()
    if data is None or not isinstance(data.get("read"), bool):
        return error(400, "read must be true or false")
    conn = db()
    with conn:
        cur = conn.execute(
            "UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?",
            (1 if data["read"] else 0, nid, g.user["id"]),
        )
    if cur.rowcount == 0:
        return error(404, "notification not found")
    return jsonify(serialize(own_notification(nid)))


@app.delete("/api/notifications/<int:nid>")
@login_required
def delete_notification(nid: int):
    conn = db()
    with conn:
        cur = conn.execute(
            "DELETE FROM notifications WHERE id = ? AND user_id = ?",
            (nid, g.user["id"]),
        )
    if cur.rowcount == 0:
        return error(404, "notification not found")
    return "", 204


@app.post("/api/admin/broadcast")
@login_required
def broadcast():
    if not is_admin(g.user):
        return error(403, "admin only")
    parsed, err = parse_notification(body(), "announcement")
    if err:
        return err
    message, ntype = parsed
    conn = db()
    with conn:
        cur = conn.execute(
            "INSERT INTO notifications (user_id, message, type, read, created_at) "
            "SELECT id, ?, ?, 0, ? FROM users ORDER BY id",
            (message, ntype, iso(now())),
        )
    return jsonify({"delivered": cur.rowcount})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error(404, "not found")
    target = (DIST / path).resolve()
    if target.is_relative_to(DIST.resolve()) and target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
