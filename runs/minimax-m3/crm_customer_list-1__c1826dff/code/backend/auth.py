"""Accounts, password hashing and bearer token sessions."""

import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import g, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db, utcnow
from errors import api_error

SESSION_TTL_DAYS = 30


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except ValueError:
        return False


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (
        (datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS))
        .strftime("%Y-%m-%dT%H:%M:%S.%f")
        + "Z"
    )
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, utcnow(), expires_at),
    )
    return token


def delete_session(token: str) -> None:
    get_db().execute("DELETE FROM sessions WHERE token = ?", (token,))


def bearer_token() -> str:
    header = request.headers.get("Authorization", "").strip()
    if not header:
        return ""
    parts = header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    if len(parts) == 1:
        return parts[0]
    return ""


def current_user():
    if "current_user" in g:
        return g.current_user
    user = None
    token = bearer_token()
    if token:
        row = get_db().execute(
            "SELECT u.id AS id, u.username AS username FROM sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires_at > ?",
            (token, utcnow()),
        ).fetchone()
        if row is not None:
            user = row
    g.current_user = user
    return user


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return api_error(401, "Authentication required. Sign in to continue.")
        return view(*args, **kwargs)

    return wrapper
