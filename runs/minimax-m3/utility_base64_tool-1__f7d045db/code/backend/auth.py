"""Account creation, sign in and bearer token handling."""

from __future__ import annotations

import secrets
import sqlite3
from functools import wraps
from typing import Any, Callable

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

try:  # package import
    from . import db
except ImportError:  # top-level import (gunicorn: "app:app")
    import db  # type: ignore[no-redef]

MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 256


class AuthError(Exception):
    """Raised when credentials cannot be processed."""


def normalize_username(username: Any) -> str:
    """Validate and normalize a username."""
    if not isinstance(username, str):
        raise AuthError("Username must be a string")
    username = username.strip()
    if not username:
        raise AuthError("Username is required")
    if len(username) > MAX_USERNAME_LENGTH:
        raise AuthError(f"Username must be at most {MAX_USERNAME_LENGTH} characters")
    return username


def normalize_password(password: Any) -> str:
    """Validate a password."""
    if not isinstance(password, str):
        raise AuthError("Password must be a string")
    if not password:
        raise AuthError("Password is required")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise AuthError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters")
    return password


def create_user(username: str, password: str) -> dict[str, Any]:
    """Create a new account and return its public representation."""
    with db.get_conn() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), db.now_iso()),
            )
        except sqlite3.IntegrityError as exc:
            raise AuthError("Username is already taken") from exc
        return {"id": cursor.lastrowid, "username": username}


def verify_user(username: str, password: str) -> sqlite3.Row | None:
    """Return the user row when the credentials match, otherwise None."""
    with db.get_conn() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
    if row is None:
        return None
    if not check_password_hash(row["password_hash"], password):
        return None
    return row


def issue_token(user_id: int) -> str:
    """Create a fresh bearer token for a user."""
    token = secrets.token_urlsafe(32)
    with db.get_conn() as conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, db.now_iso()),
        )
    return token


def user_for_token(token: str) -> sqlite3.Row | None:
    """Return the user owning a token, or None when the token is unknown."""
    if not token:
        return None
    with db.get_conn() as conn:
        return conn.execute(
            "SELECT users.id, users.username FROM tokens "
            "JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
            (token,),
        ).fetchone()


def bearer_token() -> str | None:
    """Extract the bearer token from the Authorization header."""
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def require_auth(view: Callable) -> Callable:
    """Reject requests that do not carry a valid bearer token."""

    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        token = bearer_token()
        user = user_for_token(token) if token else None
        if user is None:
            return jsonify(error="Authentication required", message="Authentication required"), 401
        g.user = user
        g.token = token
        return view(*args, **kwargs)

    return wrapper
