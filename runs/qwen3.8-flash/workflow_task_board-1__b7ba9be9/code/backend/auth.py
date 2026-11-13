"""Accounts: registration, login and Bearer-token sessions."""

import secrets
from datetime import datetime, timezone

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import connect
from errors import ApiError

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

MIN_PASSWORD = 8
MAX_USERNAME = 64


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return body


def _validate_credentials(body: dict) -> tuple[str, str]:
    errors: dict[str, str] = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < MIN_PASSWORD:
        errors["password"] = f"Password must be at least {MIN_PASSWORD} characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return username.strip(), password


@auth_bp.post("/register")
def register():
    body = _json_body()
    username, password = _validate_credentials(body)
    conn = connect()
    try:
        try:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), now_iso()),
            )
        except Exception:
            conn.rollback()
            existing = conn.execute(
                "SELECT 1 FROM users WHERE username = ?", (username,)
            ).fetchone()
            if existing:
                raise ApiError(
                    409,
                    "Validation failed",
                    {"username": "Username is already taken"},
                ) from None
            raise
        conn.commit()
    finally:
        conn.close()
    return jsonify({"message": "Account created", "username": username}), 201


@auth_bp.post("/login")
def login():
    body = _json_body()
    errors: dict[str, str] = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    if errors:
        raise ApiError(400, "Validation failed", errors)

    conn = connect()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            raise ApiError(401, "Invalid username or password")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], now_iso()),
        )
        conn.commit()
    finally:
        conn.close()
    return jsonify({"token": token}), 200


@auth_bp.get("/me")
def me():
    current_user_id()
    return jsonify({"username": g.user["username"]})


def current_user_id() -> int:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "Authentication required")
    conn = connect()
    try:
        row = conn.execute(
            "SELECT s.user_id, u.username FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token.strip(),),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        raise ApiError(401, "Invalid or expired token")
    g.user = {"id": row["user_id"], "username": row["username"]}
    return row["user_id"]
