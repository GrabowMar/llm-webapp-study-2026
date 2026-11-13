"""Password hashing, bearer tokens and the authentication guard."""

from __future__ import annotations

import functools
import hashlib
import hmac
import secrets
import sqlite3

from flask import g, jsonify, request

from db import execute, query_one, utc_now

ALGORITHM = "pbkdf2_sha256"
ITERATIONS = 120_000
SALT_BYTES = 16


def hash_password(password: str) -> str:
    """Hash a plaintext password with PBKDF2-HMAC-SHA256 and a random salt."""

    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"{ALGORITHM}${ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a plaintext password against a stored hash in constant time."""

    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        salt = bytes.fromhex(salt_hex)
        expected = int(iterations)
    except (AttributeError, TypeError, ValueError):
        return False
    if algorithm != ALGORITHM:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, expected)
    return hmac.compare_digest(digest.hex(), digest_hex)


def create_session(user_id: int) -> str:
    """Create a bearer token for a user and store it."""

    token = secrets.token_urlsafe(32)
    execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, utc_now()),
    )
    return token


def delete_session(token: str) -> None:
    execute("DELETE FROM sessions WHERE token = ?", (token,))


def user_for_token(token: str) -> sqlite3.Row | None:  # type: ignore[name-defined]
    return query_one(
        """
        SELECT users.id, users.username, users.created_at
          FROM sessions
          JOIN users ON users.id = sessions.user_id
         WHERE sessions.token = ?
        """,
        (token,),
    )


def bearer_token() -> str | None:
    """Extract the bearer token from the request headers."""

    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    return token or None


def current_user() -> sqlite3.Row | None:
    """Return the user row of the signed-in request, if any."""

    token = bearer_token()
    if not token:
        return None
    user = user_for_token(token)
    if user is None:
        return None
    g.current_token = token
    return user


def require_auth(view):
    """Reject requests that do not carry a valid bearer token."""

    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper
