"""Account routes: registration and sign-in."""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from db import execute, query_one, utc_now
from security import (
    create_session,
    delete_session,
    hash_password,
    require_auth,
    verify_password,
)

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

MIN_PASSWORD_LENGTH = 1
MAX_PASSWORD_LENGTH = 256
MAX_USERNAME_LENGTH = 64


def _payload() -> tuple[dict | None, str]:
    body = request.get_json(silent=True)
    if body is None:
        return None, "request body must be JSON"
    if not isinstance(body, dict):
        return None, "request body must be a JSON object"
    return body, ""


def _credentials(body: dict) -> tuple[tuple[str, str] | None, str]:
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, "username is required"
    if not isinstance(password, str):
        return None, "password is required"
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        return None, f"username must be at most {MAX_USERNAME_LENGTH} characters"
    if len(password) < MIN_PASSWORD_LENGTH:
        return None, "password is required"
    if len(password) > MAX_PASSWORD_LENGTH:
        return None, f"password must be at most {MAX_PASSWORD_LENGTH} characters"
    return (username, password), ""


def _find_user(username: str):
    return query_one("SELECT * FROM users WHERE username = ?", (username,))


@bp.post("/register")
def register():
    body, error = _payload()
    if error:
        return jsonify({"error": error}), 400

    credentials, error = _credentials(body)
    if error:
        return jsonify({"error": error}), 400

    username, password = credentials
    if _find_user(username) is not None:
        return jsonify({"error": "username is already taken"}), 409

    cursor = execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), utc_now()),
    )
    user_id = cursor.lastrowid
    token = create_session(user_id)
    return (
        jsonify(
            {
                "id": user_id,
                "username": username,
                "token": token,
                "user": {"id": user_id, "username": username},
            }
        ),
        201,
    )


@bp.post("/login")
def login():
    body, error = _payload()
    if error:
        return jsonify({"error": error}), 400

    credentials, error = _credentials(body)
    if error:
        return jsonify({"error": error}), 400

    username, password = credentials
    user = _find_user(username)
    if user is None or not verify_password(password, user["password_hash"]):
        return jsonify({"error": "invalid username or password"}), 401

    token = create_session(user["id"])
    return jsonify({"token": token})


@bp.get("/me")
@require_auth
def me():
    user = g.user
    return jsonify({"id": user["id"], "username": user["username"]})


@bp.post("/logout")
@require_auth
def logout():
    delete_session(g.current_token)
    return jsonify({"status": "logged out"})
