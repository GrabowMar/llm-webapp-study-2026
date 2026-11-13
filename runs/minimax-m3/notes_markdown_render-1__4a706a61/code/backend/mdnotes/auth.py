"""Accounts, password hashing and bearer token handling."""

import hashlib
import secrets
from functools import wraps
from typing import Any, Callable, TypeVar

from flask import g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from .db import get_db, utcnow

TOKEN_BYTES = 32
F = TypeVar("F", bound=Callable[..., Any])


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_user(username: str, password: str) -> dict[str, Any]:
    db = get_db()
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utcnow()),
    )
    db.commit()
    return {"id": cursor.lastrowid, "username": username}


def find_user(username: str) -> Any:
    return get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, utcnow()),
    )
    db.commit()
    return token


def revoke_token(token: str) -> None:
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    db.commit()


def verify_credentials(username: str, password: str) -> Any:
    user = find_user(username)
    if user is None:
        return None
    if not check_password_hash(user["password_hash"], password):
        return None
    return user


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def current_user() -> Any:
    if "user" in g:
        return g.user
    token = bearer_token()
    if token is None:
        return None
    user = get_db().execute(
        "SELECT users.id AS id, users.username AS username "
        "FROM tokens JOIN users ON users.id = tokens.user_id "
        "WHERE tokens.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if user is None:
        return None
    g.user = user
    g.token = token
    return user


def require_auth(view: F) -> F:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        if current_user() is None:
            return jsonify({"error": "authentication required"}), 401
        return view(*args, **kwargs)

    return wrapper  # type: ignore[return-value]
