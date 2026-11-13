"""Notification center: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import os
import secrets
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

from db import close_db, execute, execute_many, init_db, query, query_one
from security import hash_password, issue_token, now_iso, user_for_token, verify_password

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_TYPE = "info"

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)

TRUE_VALUES = {"1", "true", "yes", "on", "read"}
FALSE_VALUES = {"0", "false", "no", "off", "unread"}


def ensure_admin_user() -> None:
    password = os.environ.get("ADMIN_PASSWORD", "") or ""
    row = query_one("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,))
    if password:
        password_hash = hash_password(password)
    else:
        password_hash = hash_password(secrets.token_urlsafe(32))
    if row is None:
        execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
            (ADMIN_USERNAME, password_hash, now_iso()),
        )
    else:
        execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
            (password_hash, row["id"]),
        )


init_db()
ensure_admin_user()


def serialize_notification(row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def serialize_user(row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


def bearer_token() -> str:
    header = request.headers.get("Authorization", "") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return ""


def current_user():
    return user_for_token(bearer_token())


def require_user(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def require_admin(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        if not user["is_admin"]:
            return jsonify({"error": "admin privileges required"}), 403
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in TRUE_VALUES:
        return True
    if normalized in FALSE_VALUES:
        return False
    return None


def parse_int(value, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def insert_notification(message, type_, user_id) -> dict:
    cursor = execute(
        "INSERT INTO notifications (user_id, message, type, read, created_at) VALUES (?, ?, ?, 0, ?)",
        (user_id, message, type_, now_iso()),
    )
    row = query_one("SELECT * FROM notifications WHERE id = ?", (cursor.lastrowid,))
    return serialize_notification(row)


@app.after_request
def add_cors_headers(response):
    if request.path.startswith("/api"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Authorization, Content-Type"
        )
        response.headers.setdefault(
            "Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS"
        )
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username is required"}), 400
    if not isinstance(password, str) or password == "":
        return jsonify({"error": "password is required"}), 400
    username = username.strip()
    if len(username) > 64 or len(password) > 1024:
        return jsonify({"error": "username or password is too long"}), 400
    existing = query_one("SELECT id FROM users WHERE username = ?", (username,))
    if existing is not None:
        return jsonify({"error": "username is already taken"}), 409
    cursor = execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
        (username, hash_password(password), now_iso()),
    )
    user = query_one("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,))
    token = issue_token(user["id"])
    return jsonify({"token": token, "user": serialize_user(user)}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    user = query_one("SELECT * FROM users WHERE username = ?", (username.strip(),))
    if user is None or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "invalid username or password"}), 401
    token = issue_token(user["id"])
    return jsonify({"token": token, "user": serialize_user(user)}), 200


@app.get("/api/auth/me")
@require_user
def me():
    return jsonify({"user": serialize_user(g.user)}), 200


@app.get("/api/notifications")
@require_user
def list_notifications():
    user = g.user
    clauses = ["user_id = ?"]
    params: list = [user["id"]]

    read_filter = request.args.get("read")
    if read_filter is not None and read_filter.strip() != "":
        value = parse_bool(read_filter)
        if value is None:
            return jsonify({"error": "invalid 'read' filter"}), 400
        clauses.append("read = ?")
        params.append(1 if value else 0)
    elif request.args.get("unread") is not None and request.args.get("unread").strip() != "":
        value = parse_bool(request.args.get("unread"))
        if value is None:
            return jsonify({"error": "invalid 'unread' filter"}), 400
        clauses.append("read = ?")
        params.append(0 if value else 1)

    type_filter = request.args.get("type")
    if type_filter is not None and type_filter.strip() != "":
        clauses.append("LOWER(type) = LOWER(?)")
        params.append(type_filter.strip())

    where = " AND ".join(clauses)
    page = max(1, parse_int(request.args.get("page"), 1))
    page_size = parse_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    total = query_one(f"SELECT COUNT(*) AS n FROM notifications WHERE {where}", tuple(params))["n"]
    rows = query(
        f"SELECT * FROM notifications WHERE {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        tuple(params) + (page_size, (page - 1) * page_size),
    )
    unread_count = query_one(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", (user["id"],)
    )["n"]

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
@require_user
def create_notification():
    body = json_body()
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "message is required"}), 400
    type_ = body.get("type")
    if not isinstance(type_, str) or not type_.strip():
        type_ = DEFAULT_TYPE
    notification = insert_notification(message, type_.strip(), g.user["id"])
    return jsonify(notification), 201


@app.get("/api/notifications/types")
@require_user
def notification_types():
    rows = query(
        "SELECT DISTINCT type FROM notifications WHERE user_id = ? ORDER BY type",
        (g.user["id"],),
    )
    return jsonify({"types": [row["type"] for row in rows]}), 200


@app.post("/api/notifications/read-all")
@require_user
def read_all_notifications():
    cursor = execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (g.user["id"],)
    )
    return jsonify({"updated": cursor.rowcount}), 200


@app.get("/api/notifications/<int:notification_id>")
@require_user
def get_notification(notification_id: int):
    row = query_one(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    )
    if row is None:
        return jsonify({"error": "notification not found"}), 404
    return jsonify(serialize_notification(row)), 200


@app.patch("/api/notifications/<int:notification_id>")
@require_user
def update_notification(notification_id: int):
    row = query_one(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    )
    if row is None:
        return jsonify({"error": "notification not found"}), 404
    body = json_body()
    if "read" not in body:
        return jsonify({"error": "'read' is required"}), 400
    value = parse_bool(body.get("read"))
    if value is None:
        return jsonify({"error": "'read' must be a boolean"}), 400
    execute("UPDATE notifications SET read = ? WHERE id = ?", (1 if value else 0, notification_id))
    updated = query_one("SELECT * FROM notifications WHERE id = ?", (notification_id,))
    return jsonify(serialize_notification(updated)), 200


@app.delete("/api/notifications/<int:notification_id>")
@require_user
def delete_notification(notification_id: int):
    row = query_one(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    )
    if row is None:
        return jsonify({"error": "notification not found"}), 404
    execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", (notification_id, g.user["id"]))
    return "", 204


@app.post("/api/admin/broadcast")
@require_admin
def broadcast():
    body = json_body()
    message = body.get("message")
    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "message is required"}), 400
    type_ = body.get("type")
    if not isinstance(type_, str) or not type_.strip():
        type_ = DEFAULT_TYPE

    recipients = query("SELECT id, is_admin FROM users ORDER BY id")
    user_inboxes = [row["id"] for row in recipients if not row["is_admin"]]
    created_at = now_iso()
    execute_many(
        "INSERT INTO notifications (user_id, message, type, read, created_at) VALUES (?, ?, ?, 0, ?)",
        [(row["id"], message, type_.strip(), created_at) for row in recipients],
    )
    return jsonify({"delivered": len(user_inboxes)}), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return jsonify({"error": "not found"}), 404
    if not DIST.is_dir():
        return jsonify({"error": "frontend build is not available"}), 503
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
