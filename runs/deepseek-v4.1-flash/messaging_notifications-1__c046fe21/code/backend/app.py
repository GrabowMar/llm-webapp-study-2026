"""Flask application: notification center API and frontend hosting."""

from __future__ import annotations

import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notifications.db"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_USERNAME = "admin"

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(exception: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_notifications_user
                ON notifications (user_id, created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);
            """
        )
        connection.execute(
            "INSERT OR IGNORE INTO users"
            " (username, password_hash, is_admin, created_at)"
            " VALUES (?, NULL, 1, ?)",
            (ADMIN_USERNAME, now_iso()),
        )
        connection.execute(
            "UPDATE users SET is_admin = 1 WHERE username = ?", (ADMIN_USERNAME,)
        )
        connection.commit()
    finally:
        connection.close()


def json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def serialize_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


def serialize_notification(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = value.strip()
    return token or None


def resolve_user() -> sqlite3.Row | None:
    token = bearer_token()
    if not token:
        return None
    row = get_db().execute(
        "SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id"
        " WHERE tokens.token = ?",
        (token,),
    ).fetchone()
    return row


def auth_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        user = resolve_user()
        if user is None:
            return json_error("Unauthorized", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    @auth_required
    def wrapped(*args: Any, **kwargs: Any):
        if not g.user["is_admin"]:
            return json_error("Forbidden", 403)
        return view(*args, **kwargs)

    return wrapped


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return token


def body_json() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def notification_payload() -> tuple[str, str] | None:
    data = body_json()
    message = data.get("message")
    type_value = data.get("type", "info")
    if not isinstance(message, str) or not message.strip():
        return None
    if not isinstance(type_value, str) or not type_value.strip():
        type_value = "info"
    return message, type_value.strip()


def parse_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "read"):
            return True
        if lowered in ("false", "0", "unread"):
            return False
    return None


def parse_positive_int(value: Any, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if number < 1:
        return default
    return number


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("username is required")
    if not isinstance(password, str) or not password:
        return json_error("password is required")
    username = username.strip()
    if username == ADMIN_USERNAME:
        return json_error("username is not available", 409)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at)"
            " VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return json_error("username is already taken", 409)

    row = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize_user(row)), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("username and password are required")

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()

    if row is not None and row["is_admin"]:
        if not ADMIN_PASSWORD or not hmac.compare_digest(
            password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
        ):
            return json_error("Invalid credentials", 401)
    else:
        if row is None or not row["password_hash"]:
            return json_error("Invalid credentials", 401)
        if not check_password_hash(row["password_hash"], password):
            return json_error("Invalid credentials", 401)

    return jsonify({"token": issue_token(row["id"])})


@app.get("/api/auth/me")
@auth_required
def me():
    return jsonify(serialize_user(g.user))


@app.get("/api/notifications")
@auth_required
def list_notifications():
    db = get_db()
    user_id = g.user["id"]

    clauses = ["user_id = ?"]
    params: list[Any] = [user_id]

    read_filter = request.args.get("read")
    if read_filter is not None and read_filter.strip() != "":
        parsed = parse_bool(read_filter)
        if parsed is not None:
            clauses.append("read = ?")
            params.append(1 if parsed else 0)

    type_filter = request.args.get("type")
    if type_filter is not None and type_filter.strip() != "":
        clauses.append("type = ?")
        params.append(type_filter.strip())

    where = " WHERE " + " AND ".join(clauses)
    page = parse_positive_int(request.args.get("page"), 1)
    page_size = parse_positive_int(request.args.get("page_size"), 20)
    offset = (page - 1) * page_size

    total = db.execute(
        "SELECT COUNT(*) AS count FROM notifications" + where, params
    ).fetchone()["count"]
    rows = db.execute(
        "SELECT * FROM notifications"
        + where
        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    unread_count = db.execute(
        "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read = 0",
        (user_id,),
    ).fetchone()["count"]

    return jsonify(
        {
            "items": [serialize_notification(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread_count,
        }
    )


@app.post("/api/notifications")
@auth_required
def create_notification():
    payload = notification_payload()
    if payload is None:
        return json_error("message is required")
    message, type_value = payload

    db = get_db()
    cursor = db.execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at)"
        " VALUES (?, ?, ?, 0, ?)",
        (g.user["id"], message, type_value, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_notification(row)), 201


@app.post("/api/notifications/read-all")
@auth_required
def read_all():
    db = get_db()
    cursor = db.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
        (g.user["id"],),
    )
    db.commit()
    return jsonify({"updated": cursor.rowcount})


@app.get("/api/notifications/<int:notification_id>")
@auth_required
def get_notification(notification_id: int):
    row = get_db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    ).fetchone()
    if row is None:
        return json_error("Not found", 404)
    return jsonify(serialize_notification(row))


@app.patch("/api/notifications/<int:notification_id>")
@auth_required
def update_notification(notification_id: int):
    data = body_json()
    if "read" not in data:
        return json_error("read is required")
    read = parse_bool(data.get("read"))
    if read is None:
        return json_error("read must be a boolean")

    db = get_db()
    cursor = db.execute(
        "UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?",
        (1 if read else 0, notification_id, g.user["id"]),
    )
    if cursor.rowcount == 0:
        db.rollback()
        return json_error("Not found", 404)
    db.commit()
    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (notification_id,)
    ).fetchone()
    return jsonify(serialize_notification(row))


@app.delete("/api/notifications/<int:notification_id>")
@auth_required
def delete_notification(notification_id: int):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    )
    if cursor.rowcount == 0:
        db.rollback()
        return json_error("Not found", 404)
    db.commit()
    return jsonify({"deleted": True, "id": notification_id})


@app.post("/api/admin/broadcast")
@admin_required
def broadcast():
    payload = notification_payload()
    if payload is None:
        return json_error("message is required")
    message, type_value = payload

    db = get_db()
    users = db.execute("SELECT id FROM users").fetchall()
    created_at = now_iso()
    db.executemany(
        "INSERT INTO notifications (user_id, message, type, read, created_at)"
        " VALUES (?, ?, ?, 0, ?)",
        [(user["id"], message, type_value, created_at) for user in users],
    )
    db.commit()
    return jsonify({"delivered": len(users)})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return json_error("Not found", 404)
    try:
        candidate = (DIST / path).resolve()
        candidate.relative_to(DIST.resolve())
        if candidate.is_file():
            return send_from_directory(DIST, path)
    except (OSError, ValueError):
        pass
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
