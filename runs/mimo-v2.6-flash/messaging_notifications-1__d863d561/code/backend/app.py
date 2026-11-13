"""Notification center: JSON API under /api plus the frontend build."""

from __future__ import annotations

import functools
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "notifications.db"

ADMIN_USERNAME = "admin"
DEFAULT_PAGE_SIZE = 100
MAX_PAGE_SIZE = 1000

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                is_admin INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                "read" INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_notifications_user "
            "ON notifications(user_id, created_at)"
        )
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        password_hash = generate_password_hash(admin_password) if admin_password else None
        db.execute(
            """
            INSERT INTO users (username, password_hash, is_admin)
            VALUES (?, ?, 1)
            ON CONFLICT(username) DO UPDATE SET
                password_hash = excluded.password_hash,
                is_admin = 1
            """,
            (ADMIN_USERNAME, password_hash),
        )
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def notification_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def body_json() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def text_field(data: dict[str, Any], name: str) -> str | None:
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        return None
    return value


def int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def read_filter_arg(raw: str | None) -> int | None:
    """Translate the ``read`` query parameter into a SQL value, if filtering."""
    if raw is None:
        return None
    value = raw.strip().lower()
    if value in ("true", "1", "yes", "read"):
        return 1
    if value in ("false", "0", "no", "unread"):
        return 0
    return None


def auth_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username, u.is_admin
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = auth_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def error(message: str, status: int) -> Any:
    return jsonify({"error": message}), status


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if username is None or password is None:
        return error("username and password are required", 400)
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if username is None or password is None:
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or row["password_hash"] is None:
        return error("invalid credentials", 401)
    if not check_password_hash(row["password_hash"], password):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@login_required
def me():
    user = g.user
    return jsonify(
        {"username": user["username"], "is_admin": bool(user["is_admin"])}
    ), 200


# ---------------------------------------------------------------------------
# Notification routes
# ---------------------------------------------------------------------------


@app.get("/api/notifications")
@login_required
def list_notifications():
    user = g.user
    page = max(int_arg("page", 1), 1)
    page_size = int_arg("page_size", DEFAULT_PAGE_SIZE)
    if page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    page_size = min(page_size, MAX_PAGE_SIZE)

    where = ["user_id = ?"]
    params: list[Any] = [user["id"]]

    read_value = read_filter_arg(request.args.get("read"))
    if read_value is not None:
        where.append('"read" = ?')
        params.append(read_value)

    type_value = request.args.get("type")
    if type_value is not None and type_value != "":
        where.append("type = ?")
        params.append(type_value)

    where_sql = " AND ".join(where)
    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM notifications WHERE {where_sql}", params
    ).fetchone()["n"]
    unread_count = db.execute(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND \"read\" = 0",
        (user["id"],),
    ).fetchone()["n"]
    rows = db.execute(
        f"""
        SELECT id, message, type, "read", created_at
        FROM notifications
        WHERE {where_sql}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [notification_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread_count,
        }
    ), 200


@app.post("/api/notifications")
@login_required
def create_notification():
    user = g.user
    data = body_json()
    message = text_field(data, "message")
    if message is None:
        return error("message is required", 400)
    raw_type = data.get("type")
    if raw_type is not None and not isinstance(raw_type, str):
        return error("type must be a string", 400)
    type_name = raw_type.strip() if isinstance(raw_type, str) and raw_type.strip() else "info"
    created_at = now_iso()
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO notifications (user_id, message, type, "read", created_at)
        VALUES (?, ?, ?, 0, ?)
        """,
        (user["id"], message, type_name, created_at),
    )
    db.commit()
    row = db.execute(
        'SELECT id, message, type, "read", created_at FROM notifications WHERE id = ?',
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(notification_json(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def mark_all_read():
    user = g.user
    db = get_db()
    cur = db.execute(
        'UPDATE notifications SET "read" = 1 WHERE user_id = ? AND "read" = 0',
        (user["id"],),
    )
    db.commit()
    return jsonify({"updated": cur.rowcount}), 200


@app.get("/api/notifications/<int:notification_id>")
@login_required
def get_notification(notification_id: int):
    user = g.user
    row = get_db().execute(
        'SELECT id, message, type, "read", created_at FROM notifications '
        "WHERE id = ? AND user_id = ?",
        (notification_id, user["id"]),
    ).fetchone()
    if row is None:
        return error("notification not found", 404)
    return jsonify(notification_json(row)), 200


@app.patch("/api/notifications/<int:notification_id>")
@login_required
def update_notification(notification_id: int):
    user = g.user
    data = body_json()
    if "read" not in data:
        return error("read is required", 400)
    read = data["read"]
    if isinstance(read, bool):
        value = 1 if read else 0
    elif isinstance(read, int) and read in (0, 1):
        value = read
    else:
        return error("read must be a boolean", 400)
    db = get_db()
    cur = db.execute(
        'UPDATE notifications SET "read" = ? WHERE id = ? AND user_id = ?',
        (value, notification_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return error("notification not found", 404)
    row = db.execute(
        'SELECT id, message, type, "read", created_at FROM notifications WHERE id = ?',
        (notification_id,),
    ).fetchone()
    return jsonify(notification_json(row)), 200


@app.delete("/api/notifications/<int:notification_id>")
@login_required
def delete_notification(notification_id: int):
    user = g.user
    db = get_db()
    cur = db.execute(
        "DELETE FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return error("notification not found", 404)
    return jsonify({"deleted": True}), 200


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------


@app.post("/api/admin/broadcast")
@login_required
def broadcast():
    user = g.user
    if not user["is_admin"]:
        return error("forbidden", 403)
    data = body_json()
    message = text_field(data, "message")
    if message is None:
        return error("message is required", 400)
    raw_type = data.get("type")
    if raw_type is not None and not isinstance(raw_type, str):
        return error("type must be a string", 400)
    type_name = raw_type.strip() if isinstance(raw_type, str) and raw_type.strip() else "announcement"
    created_at = now_iso()
    db = get_db()
    user_ids = [row["id"] for row in db.execute("SELECT id FROM users").fetchall()]
    db.executemany(
        'INSERT INTO notifications (user_id, message, type, "read", created_at) '
        "VALUES (?, ?, ?, 0, ?)",
        [(uid, message, type_name, created_at) for uid in user_ids],
    )
    db.commit()
    return jsonify({"delivered": len(user_ids)}), 200


# ---------------------------------------------------------------------------
# Frontend hosting
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if path != "index.html" and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return "frontend build not found", 404


@app.errorhandler(404)
def not_found(_exc: Any):
    if request.path.startswith("/api"):
        return jsonify({"error": "not found"}), 404
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return "frontend build not found", 404


@app.errorhandler(405)
def method_not_allowed(_exc: Any):
    if request.path.startswith("/api"):
        return jsonify({"error": "method not allowed"}), 405
    return "method not allowed", 405


init_db()
