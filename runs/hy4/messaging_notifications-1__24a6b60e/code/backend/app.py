"""Notification center: Flask API, SQLite storage and static frontend serving."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "notifications.db"

DEFAULT_TYPE = "info"
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                is_admin      INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token   TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message    TEXT NOT NULL,
                type       TEXT NOT NULL,
                read       INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_user
                ON notifications (user_id, created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_notifications_unread
                ON notifications (user_id, read);
            """
        )
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        admin_hash = generate_password_hash(admin_password) if admin_password else None
        conn.execute(
            """
            INSERT INTO users (username, password_hash, is_admin)
            VALUES ('admin', ?, 1)
            ON CONFLICT(username) DO UPDATE
                SET password_hash = excluded.password_hash, is_admin = 1
            """,
            (admin_hash,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def error(message: str, status: int):
    response = jsonify({"error": message})
    if status == 401:
        response.headers["WWW-Authenticate"] = "Bearer"
    return response, status


def body() -> dict | None:
    data = request.get_json(force=True, silent=True)
    return data if isinstance(data, dict) else None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def parse_bool(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return True
        if lowered in ("false", "0", "no", "off"):
            return False
    return None


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return db().execute(
        """
        SELECT u.id, u.username, u.is_admin, u.password_hash
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        if not user["is_admin"]:
            return error("admin only", 403)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def notification_fields(data: dict):
    message = data.get("message")
    if not isinstance(message, str) or message == "":
        return None
    notification_type = data.get("type", DEFAULT_TYPE)
    if notification_type is None:
        notification_type = DEFAULT_TYPE
    if not isinstance(notification_type, str) or notification_type == "":
        notification_type = DEFAULT_TYPE
    return message, notification_type


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    data = body()
    if data is None:
        return error("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip() or len(username) > 150:
        return error("username is required", 400)
    if not isinstance(password, str) or password == "":
        return error("password is required", 400)
    if username.strip().lower() == "admin":
        return error("username is reserved", 409)
    conn = db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
            (username, generate_password_hash(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error("username already exists", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    if data is None:
        return error("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("invalid credentials", 401)
    conn = db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not user["password_hash"] or not check_password_hash(user["password_hash"], password):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    conn.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers["Authorization"][7:].strip()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
    conn.commit()
    return jsonify({"status": "ok"})


@app.get("/api/notifications")
@login_required
def list_notifications():
    conn = db()
    user_id = g.user["id"]
    where = ["user_id = ?"]
    params: list = [user_id]

    read_value = request.args.get("read")
    if read_value is not None and read_value.strip().lower() not in ("", "all"):
        read = parse_bool(read_value)
        if read is None:
            return error("invalid read filter", 400)
        where.append("read = ?")
        params.append(int(read))

    type_value = request.args.get("type")
    if type_value is not None and type_value != "":
        where.append("type = ?")
        params.append(type_value)

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except ValueError:
        return error("invalid pagination", 400)
    if page < 1 or page_size < 1:
        return error("invalid pagination", 400)

    clause = " AND ".join(where)
    total = conn.execute(
        f"SELECT COUNT(*) FROM notifications WHERE {clause}", params
    ).fetchone()[0]
    unread_count = conn.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0", (user_id,)
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM notifications WHERE {clause} "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
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
def create_notification():
    data = body()
    if data is None:
        return error("invalid JSON body", 400)
    fields = notification_fields(data)
    if fields is None:
        return error("message is required", 400)
    message, notification_type = fields
    conn = db()
    cursor = conn.execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at) "
        "VALUES (?, ?, ?, 0, ?)",
        (g.user["id"], message, notification_type, utc_now()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM notifications WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def read_all():
    conn = db()
    cursor = conn.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (g.user["id"],)
    )
    conn.commit()
    return jsonify({"updated": cursor.rowcount})


def owned_notification(notification_id: int):
    return db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    ).fetchone()


@app.get("/api/notifications/<int:notification_id>")
@login_required
def get_notification(notification_id: int):
    row = owned_notification(notification_id)
    if row is None:
        return error("notification not found", 404)
    return jsonify(serialize(row))


@app.patch("/api/notifications/<int:notification_id>")
@login_required
def patch_notification(notification_id: int):
    row = owned_notification(notification_id)
    if row is None:
        return error("notification not found", 404)
    data = body()
    if data is None:
        return error("invalid JSON body", 400)
    read = parse_bool(data.get("read"))
    if read is None:
        return error("read must be a boolean", 400)
    conn = db()
    conn.execute("UPDATE notifications SET read = ? WHERE id = ?", (int(read), row["id"]))
    conn.commit()
    row = conn.execute("SELECT * FROM notifications WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(serialize(row))


@app.delete("/api/notifications/<int:notification_id>")
@login_required
def delete_notification(notification_id: int):
    row = owned_notification(notification_id)
    if row is None:
        return error("notification not found", 404)
    conn = db()
    conn.execute("DELETE FROM notifications WHERE id = ?", (row["id"],))
    conn.commit()
    return jsonify({"deleted": True, "id": row["id"]})


@app.post("/api/admin/broadcast")
@admin_required
def broadcast():
    data = body()
    if data is None:
        return error("invalid JSON body", 400)
    fields = notification_fields(data)
    if fields is None:
        return error("message is required", 400)
    message, notification_type = fields
    conn = db()
    users = conn.execute("SELECT id FROM users WHERE is_admin = 0 ORDER BY id").fetchall()
    created_at = utc_now()
    conn.executemany(
        "INSERT INTO notifications (user_id, message, type, read, created_at) "
        "VALUES (?, ?, ?, 0, ?)",
        [(row["id"], message, notification_type, created_at) for row in users],
    )
    conn.commit()
    return jsonify({"delivered": len(users)})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
