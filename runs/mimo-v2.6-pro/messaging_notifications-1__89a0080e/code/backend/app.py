"""Flask entry point: notification center API + frontend serving."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "notifications.db"
DIST = BASE_DIR / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_TYPE = "info"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications (user_id, created_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.message = message
        self.status = status

    def response(self):
        return jsonify({"error": self.message}), self.status


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return exc.response()


@app.errorhandler(404)
def handle_not_found(_exc):
    return jsonify({"error": "not found"}), 404


@app.errorhandler(405)
def handle_method_not_allowed(_exc):
    return jsonify({"error": "method not allowed"}), 405


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        if ADMIN_PASSWORD:
            password_hash = generate_password_hash(ADMIN_PASSWORD)
            row = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                    (ADMIN_USERNAME, password_hash),
                )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (password_hash, row["id"]),
                )
        conn.commit()
    finally:
        conn.close()


init_db()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("a JSON object body is required", 400)
    return data


def parse_bool_arg(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in ("true", "1"):
        return True
    if lowered in ("false", "0"):
        return False
    raise ApiError("read must be true or false", 400)


def parse_int_arg(name: str, default: int, lo: int, hi: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(f"{name} must be an integer", 400)
    return max(lo, min(hi, value))


def extract_message_and_type(data: dict) -> tuple[str, str]:
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ApiError("message must be a non-empty string", 400)
    ntype = data.get("type", DEFAULT_TYPE)
    if not isinstance(ntype, str) or not ntype.strip():
        raise ApiError("type must be a non-empty string", 400)
    return message, ntype


def get_auth_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_auth_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        return view(user, *args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_auth_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        if not user["is_admin"]:
            return jsonify({"error": "admin required"}), 403
        return view(user, *args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError("username must be a non-empty string", 400)
    if not isinstance(password, str) or not password:
        raise ApiError("password must be a non-empty string", 400)
    username = username.strip()
    if username == ADMIN_USERNAME:
        raise ApiError("username is reserved", 409)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError("username and password are required", 400)
    username = username.strip()
    if username == ADMIN_USERNAME and not ADMIN_PASSWORD:
        raise ApiError("admin sign-in is disabled", 401)
    user = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/notifications")
@login_required
def list_notifications(user):
    db = get_db()
    where = ["user_id = ?"]
    params: list = [user["id"]]

    raw_read = request.args.get("read")
    if raw_read is not None and raw_read != "":
        where.append("read = ?")
        params.append(1 if parse_bool_arg(raw_read) else 0)

    raw_type = request.args.get("type")
    if raw_type is not None and raw_type != "":
        where.append("type = ?")
        params.append(raw_type)

    page = parse_int_arg("page", 1, 1, 10**9)
    page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    clause = " WHERE " + " AND ".join(where)
    total = db.execute(
        "SELECT COUNT(*) AS n FROM notifications" + clause, params
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM notifications"
        + clause
        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    unread_count = db.execute(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0",
        (user["id"],),
    ).fetchone()["n"]

    return jsonify(
        {
            "items": [serialize(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread_count,
        }
    )


@app.post("/api/notifications")
@login_required
def create_notification(user):
    message, ntype = extract_message_and_type(json_body())
    db = get_db()
    cur = db.execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at)"
        " VALUES (?, ?, ?, 0, ?)",
        (user["id"], message, ntype, utcnow()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(serialize(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def read_all(user):
    db = get_db()
    cur = db.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
        (user["id"],),
    )
    db.commit()
    return jsonify({"updated": cur.rowcount}), 200


@app.get("/api/notifications/<int:notification_id>")
@login_required
def get_notification(user, notification_id: int):
    row = get_db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError("notification not found", 404)
    return jsonify(serialize(row))


@app.patch("/api/notifications/<int:notification_id>")
@login_required
def update_notification(user, notification_id: int):
    data = json_body()
    if "read" not in data or not isinstance(data["read"], bool):
        raise ApiError("read must be a boolean", 400)
    db = get_db()
    cur = db.execute(
        "UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?",
        (1 if data["read"] else 0, notification_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        raise ApiError("notification not found", 404)
    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (notification_id,)
    ).fetchone()
    return jsonify(serialize(row))


@app.delete("/api/notifications/<int:notification_id>")
@login_required
def delete_notification(user, notification_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        raise ApiError("notification not found", 404)
    return "", 204


@app.post("/api/admin/broadcast")
@admin_required
def broadcast(_user):
    message, ntype = extract_message_and_type(json_body())
    db = get_db()
    cur = db.execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at)"
        " SELECT id, ?, ?, 0, ? FROM users",
        (message, ntype, utcnow()),
    )
    db.commit()
    return jsonify({"delivered": cur.rowcount}), 200


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.post("/<path:path>")
@app.put("/<path:path>")
@app.patch("/<path:path>")
@app.delete("/<path:path>")
def frontend_missing(path: str):
    try:
        endpoint, _ = app.url_map.bind("localhost").match("/" + path, method="GET")
    except Exception:
        endpoint = None
    if endpoint not in (None, "frontend"):
        raise ApiError("method not allowed", 405)
    raise ApiError("not found", 404)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
