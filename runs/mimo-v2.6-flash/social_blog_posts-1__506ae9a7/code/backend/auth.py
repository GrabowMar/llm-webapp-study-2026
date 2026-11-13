"""Accounts and token authentication."""

import os
import secrets
from datetime import datetime, timezone
from functools import wraps

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_conn

ADMIN_USERNAME = "admin"


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def api_error(status: int, message: str):
    return jsonify({"error": message, "message": message}), status


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD") or ""


def bootstrap_admin():
    """Create or refresh the admin account when ADMIN_PASSWORD is set."""
    password = admin_password()
    if not password:
        return
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (generate_password_hash(password), existing["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                (ADMIN_USERNAME, generate_password_hash(password)),
            )


def create_user(username: str, password: str) -> dict:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        return {"id": cur.lastrowid, "username": username, "is_admin": 0}


def find_user(username: str):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        return dict(row) if row else None


def verify_login(username: str, password: str):
    if username == ADMIN_USERNAME and not admin_password():
        return None
    user = find_user(username)
    if not user or not check_password_hash(user["password_hash"], password):
        return None
    return user


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, utcnow()),
        )
    return token


def user_from_request():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    with get_conn() as conn:
        row = conn.execute(
            """SELECT u.id, u.username, u.is_admin
               FROM tokens t JOIN users u ON u.id = t.user_id
               WHERE t.token = ?""",
            (token,),
        ).fetchone()
    return dict(row) if row else None


def load_user_into_g():
    g.user = user_from_request()


def current_user():
    return getattr(g, "user", None)


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return api_error(401, "Sign in required")
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return api_error(401, "Sign in required")
        if not user["is_admin"]:
            return api_error(403, "Admin access required")
        return fn(*args, **kwargs)

    return wrapper


def register_routes(app):
    @app.post("/api/auth/register")
    def register():
        body = request.get_json(silent=True, force=True) or {}
        username = body.get("username")
        password = body.get("password")
        if not isinstance(username, str) or not username.strip():
            return api_error(400, "Username is required")
        if not isinstance(password, str) or not password:
            return api_error(400, "Password is required")
        username = username.strip()
        if username.lower() == ADMIN_USERNAME or find_user(username):
            return api_error(409, "Username is already taken")
        user = create_user(username, password)
        return jsonify({"username": user["username"]}), 201

    @app.post("/api/auth/login")
    def login():
        body = request.get_json(silent=True, force=True) or {}
        username = body.get("username")
        password = body.get("password")
        if not isinstance(username, str) or not username.strip():
            return api_error(400, "Username is required")
        if not isinstance(password, str) or not password:
            return api_error(400, "Password is required")
        user = verify_login(username.strip(), password)
        if not user:
            if username.strip() == ADMIN_USERNAME and not admin_password():
                return api_error(401, "Admin sign-in is disabled")
            return api_error(401, "Invalid username or password")
        token = create_token(user["id"])
        return jsonify({"token": token}), 200
