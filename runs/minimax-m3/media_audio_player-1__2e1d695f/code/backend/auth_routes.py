"""Account routes: register, login, logout and "who am I"."""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from auth import (
    find_user_by_username,
    hash_password,
    issue_token,
    load_user,
    login_required,
    revoke_token,
    verify_password,
)
from common import error_response, get_db
from db import utc_now

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

MAX_USERNAME = 64
MIN_PASSWORD = 1


def _public_user(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"]}


@bp.post("/register")
def register():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("A JSON body with username and password is required", 400)

    username = payload.get("username")
    password = payload.get("password")

    errors: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > MAX_USERNAME:
        errors["username"] = f"Username must be {MAX_USERNAME} characters or fewer"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < MIN_PASSWORD:
        errors["password"] = f"Password must be at least {MIN_PASSWORD} character"
    if errors:
        return error_response("Please fix the highlighted fields", 400, errors)

    username = username.strip()
    password_hash = hash_password(password)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, password_hash, utc_now()),
        )
    except Exception as exc:  # sqlite3.IntegrityError
        if "UNIQUE" in str(exc).upper():
            return error_response("That username is already taken", 409, {"username": "That username is already taken"})
        raise

    user = {"id": cursor.lastrowid, "username": username}
    token = issue_token(user["id"])
    return jsonify({**_public_user(user), "token": token}), 201


@bp.post("/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return error_response("A JSON body with username and password is required", 400)

    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip():
        return error_response("Username and password are required", 400)

    db = get_db()
    user = find_user_by_username(db, username.strip())
    if user is None or not verify_password(user["password_hash"], password):
        return error_response("Invalid username or password", 401)

    token = issue_token(user["id"])
    return jsonify({"token": token, **_public_user(user)}), 200


@bp.post("/logout")
def logout():
    header = request.headers.get("Authorization", "")
    token = header.split(None, 1)[1].strip() if len(header.split(None, 1)) == 2 else None
    if token:
        revoke_token(token)
    return jsonify({"ok": True}), 200


@bp.get("/me")
@login_required
def me():
    user = g.user
    return jsonify({**_public_user(user), "created_at": user.get("created_at")}), 200


__all__ = ["bp", "load_user"]
