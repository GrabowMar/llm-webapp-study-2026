"""Flask entry point for the notification center."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"

app = Flask(__name__, static_folder=None)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
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
                ON notifications (user_id, created_at DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


def row_to_notification(row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (user_id, token) VALUES (?, ?)",
        (user_id, token),
    )
    db.commit()
    return token


def create_user(username: str, password: str) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return cur.lastrowid


def current_user() -> sqlite3.Row | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        """
        SELECT u.id, u.username
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def is_admin(user) -> bool:
    return user is not None and user["username"] == ADMIN_USERNAME


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        if not is_admin(user):
            return jsonify({"error": "forbidden"}), 403
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def parse_notification_body(data) -> tuple[str, str] | None:
    if not isinstance(data, dict):
        return None
    message = data.get("message")
    ntype = data.get("type", "info")
    if not isinstance(message, str) or not message.strip():
        return None
    if not isinstance(ntype, str) or not ntype.strip():
        ntype = "info"
    return message.strip(), ntype.strip()


def find_notification_for_user(notification_id: int, user_id: int) -> sqlite3.Row | None:
    db = get_db()
    return db.execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, user_id),
    ).fetchone()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "invalid body"}), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "password required"}), 400
    username = username.strip()

    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return jsonify({"error": "username taken"}), 409

    user_id = create_user(username, password)
    token = issue_token(user_id)
    return jsonify({"token": token}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "invalid body"}), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "invalid credentials"}), 401
    username = username.strip()

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = issue_token(row["id"])
    return jsonify({"token": token})


@app.get("/api/notifications")
@login_required
def list_notifications():
    user_id = g.user["id"]
    db = get_db()

    read_filter = request.args.get("read")
    type_filter = request.args.get("type")
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20

    conditions = ["user_id = ?"]
    params: list = [user_id]
    if read_filter == "true":
        conditions.append("read = 1")
    elif read_filter == "false":
        conditions.append("read = 0")
    if type_filter:
        conditions.append("type = ?")
        params.append(type_filter)

    where = " AND ".join(conditions)

    unread_row = db.execute(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0",
        (user_id,),
    ).fetchone()
    unread_count = unread_row["c"]

    total_row = db.execute(
        f"SELECT COUNT(*) AS c FROM notifications WHERE {where}", params
    ).fetchone()
    total = total_row["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM notifications WHERE {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()

    return jsonify(
        {
            "items": [row_to_notification(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread_count,
        }
    )


@app.post("/api/notifications")
@login_required
def create_notification():
    data = request.get_json(silent=True)
    parsed = parse_notification_body(data)
    if parsed is None:
        return jsonify({"error": "message required"}), 400
    message, ntype = parsed

    db = get_db()
    created_at = utcnow()
    cur = db.execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at) VALUES (?, ?, ?, 0, ?)",
        (g.user["id"], message, ntype, created_at),
    )
    db.commit()

    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(row_to_notification(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def read_all():
    db = get_db()
    cur = db.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
        (g.user["id"],),
    )
    db.commit()
    return jsonify({"updated": cur.rowcount})


@app.get("/api/notifications/<int:notification_id>")
@login_required
def get_notification(notification_id):
    row = find_notification_for_user(notification_id, g.user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(row_to_notification(row))


@app.patch("/api/notifications/<int:notification_id>")
@login_required
def update_notification(notification_id):
    row = find_notification_for_user(notification_id, g.user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "read" not in data:
        return jsonify({"error": "read required"}), 400
    read_value = data["read"]
    if not isinstance(read_value, bool):
        return jsonify({"error": "read must be boolean"}), 400

    db = get_db()
    db.execute(
        "UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?",
        (1 if read_value else 0, notification_id, g.user["id"]),
    )
    db.commit()

    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (notification_id,)
    ).fetchone()
    return jsonify(row_to_notification(row))


@app.delete("/api/notifications/<int:notification_id>")
@login_required
def delete_notification(notification_id):
    row = find_notification_for_user(notification_id, g.user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404

    db = get_db()
    db.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    )
    db.commit()
    return "", 204


@app.post("/api/admin/broadcast")
@admin_required
def broadcast():
    data = request.get_json(silent=True)
    parsed = parse_notification_body(data)
    if parsed is None:
        return jsonify({"error": "message required"}), 400
    message, ntype = parsed

    db = get_db()
    user_ids = [r["id"] for r in db.execute("SELECT id FROM users").fetchall()]
    if user_ids:
        created_at = utcnow()
        db.executemany(
            "INSERT INTO notifications (user_id, message, type, read, created_at) VALUES (?, ?, ?, 0, ?)",
            [(uid, message, ntype, created_at) for uid in user_ids],
        )
        db.commit()
    return jsonify({"delivered": len(user_ids)})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
