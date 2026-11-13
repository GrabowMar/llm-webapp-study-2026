"""Password hashing and bearer token helpers."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from db import execute, query_one

PBKDF2_ITERATIONS = 120_000
TOKEN_BYTES = 32


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, digest = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        expected = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt),
            int(iterations),
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(expected.hex(), digest)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_digest(token), user_id, now_iso()),
    )
    return token


def user_for_token(token: str):
    if not token:
        return None
    return query_one(
        "SELECT u.id, u.username, u.is_admin, u.created_at "
        "FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token_hash = ?",
        (token_digest(token),),
    )
