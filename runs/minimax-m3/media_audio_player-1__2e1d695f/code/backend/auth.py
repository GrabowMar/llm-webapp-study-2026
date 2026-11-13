"""Authentication helpers: password hashing and bearer token sessions."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from functools import wraps
from typing import Any, Callable

from flask import g, request
from werkzeug.security import check_password_hash, generate_password_hash

from common import error_response, get_db
from db import utc_now

PASSWORD_METHOD = "scrypt"
TOKEN_BYTES = 32


def hash_password(password: str) -> str:
    return generate_password_hash(password, method=PASSWORD_METHOD)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except (ValueError, TypeError):
        return False


def hash_token(token: str) -> str:
    """Tokens are stored as digests so the database never holds usable tokens."""

    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(user_id: int) -> str:
    """Create a session token for a user and return the plaintext token."""

    token = secrets.token_urlsafe(TOKEN_BYTES)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, utc_now()),
    )
    return token


def revoke_token(token: str) -> None:
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))


def _token_from_request() -> str | None:
    header = request.headers.get("Authorization", "")
    if header:
        parts = header.split(None, 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            candidate = parts[1].strip()
            if candidate:
                return candidate
        elif len(parts) == 1 and parts[0].strip():
            # Tolerate a bare token without the "Bearer " prefix.
            return parts[0].strip()
    token = request.args.get("token")
    return token.strip() if token else None


def load_user() -> dict[str, Any] | None:
    """Resolve the signed-in user for the current request, if any."""

    if "current_user" in g:
        return g.current_user

    user = None
    token = _token_from_request()
    if token:
        db = get_db()
        row = db.execute(
            """
            SELECT u.id, u.username, u.created_at
              FROM sessions s
              JOIN users u ON u.id = s.user_id
             WHERE s.token_hash = ?
            """,
            (hash_token(token),),
        ).fetchone()
        if row is not None:
            user = dict(row)

    g.current_user = user
    return user


def login_required(view: Callable) -> Callable:
    """Reject requests without a valid bearer token."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        user = load_user()
        if user is None:
            return error_response("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def find_user_by_username(db: sqlite3.Connection, username: str) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT id, username, password_hash, created_at FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()
    return dict(row) if row is not None else None
