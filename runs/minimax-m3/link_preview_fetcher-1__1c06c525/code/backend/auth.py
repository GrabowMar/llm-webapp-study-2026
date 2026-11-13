"""Password hashing, bearer tokens and the authentication decorator."""

import hashlib
import hmac
import secrets
from functools import wraps

from flask import g, jsonify, request

from db import execute, query_one
from utils import now_iso

PBKDF2_ITERATIONS = 120_000
TOKEN_BYTES = 32


def hash_password(password: str, salt: bytes | None = None) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash."""
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (AttributeError, TypeError, ValueError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def issue_token(user_id: int) -> str:
    """Create and persist a new bearer token for a user."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso()))
    return token


def resolve_token(token: str):
    """Return the user row behind a token, or None."""
    if not token:
        return None
    return query_one(
        "SELECT users.id AS id, users.username AS username FROM tokens "
        "JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
        (token,),
    )


def bearer_token() -> str | None:
    """Extract the bearer token from the Authorization header."""
    header = request.headers.get("Authorization", "") or ""
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def require_auth(view):
    """Reject requests without a valid bearer token."""

    @wraps(view)
    def wrapper(*args, **kwargs):
        user = resolve_token(bearer_token() or "")
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper
