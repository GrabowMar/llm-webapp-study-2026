"""Password hashing and bearer-token helpers (standard library only)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

PBKDF2_ITERATIONS = 120_000
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Check a password against a stored hash."""
    if not isinstance(password, str) or not isinstance(stored, str):
        return False
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    try:
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64decode(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(username: str, secret: bytes) -> str:
    """Create a signed bearer token for the given username."""
    now = int(time.time())
    payload = {"u": username, "iat": now, "exp": now + TOKEN_TTL_SECONDS}
    body = _b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{_b64encode(signature)}"


def read_token(token: str, secret: bytes) -> str | None:
    """Validate a bearer token and return the username it was issued for."""
    if not token or "." not in token:
        return None
    body, _, signature = token.partition(".")
    expected = hmac.new(secret, body.encode("ascii"), hashlib.sha256).digest()
    try:
        given = _b64decode(signature)
    except (ValueError, TypeError):
        return None
    if not hmac.compare_digest(expected, given):
        return None
    try:
        payload = json.loads(_b64decode(body))
    except (ValueError, TypeError):
        return None
    if not isinstance(payload, dict):
        return None
    username = payload.get("u")
    expires_at = payload.get("exp")
    if not isinstance(username, str) or not isinstance(expires_at, int):
        return None
    if expires_at < int(time.time()):
        return None
    return username
