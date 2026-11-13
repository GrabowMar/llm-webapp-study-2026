"""Password hashing and session token helpers."""

from __future__ import annotations

import hashlib
import secrets

from werkzeug.security import check_password_hash, generate_password_hash

TOKEN_BYTES = 32


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="scrypt")


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except ValueError:
        return False


def new_token() -> str:
    """Fresh bearer token handed to the client."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def new_csrf_token() -> str:
    """Fresh anti-forgery token bound to a session."""
    return secrets.token_urlsafe(TOKEN_BYTES)


def token_hash(token: str) -> str:
    """Server side representation of a bearer token (never stored in clear)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
