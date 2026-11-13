"""Account helpers: password hashing and bearer token handling."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable, Optional, Tuple

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db

__all__ = [
    "hash_password",
    "verify_password",
    "create_token",
    "create_user",
    "authenticate",
    "login_required",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except ValueError:
        return False


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, utc_now()),
    )
    get_db().commit()
    return token


def create_user(username: str, password: str) -> Tuple[Optional[int], Optional[str]]:
    """Create an account.  Returns ``(user_id, None)`` or ``(None, error)``."""
    exists = get_db().execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if exists is not None:
        return None, "username is already taken"
    cursor = get_db().execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), utc_now()),
    )
    get_db().commit()
    return int(cursor.lastrowid), None


def authenticate(username: str, password: str) -> Optional[Any]:
    row = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        return None
    if not verify_password(row["password_hash"], password):
        return None
    return row


def token_from_request() -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def current_user() -> Optional[Any]:
    """Return the signed-in user row, or ``None`` when there is no valid token."""
    token = token_from_request()
    if token is None:
        return None
    row = (
        get_db()
        .execute(
            "SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
            (token,),
        )
        .fetchone()
    )
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper
