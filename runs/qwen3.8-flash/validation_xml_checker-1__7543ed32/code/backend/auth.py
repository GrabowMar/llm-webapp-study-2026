"""Password hashing and bearer-token sessions."""

import hashlib
import hmac
import secrets

from db import get_conn, now_iso

PBKDF2_ROUNDS = 120_000


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ROUNDS
    )
    return digest.hex()


def create_user(username: str, password: str) -> int | None:
    """Insert a new user; returns its id, or None if the username exists."""
    salt = secrets.token_hex(16)
    try:
        with get_conn() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, salt, created_at)"
                " VALUES (?, ?, ?, ?)",
                (username, hash_password(password, salt), salt, now_iso()),
            )
            return cur.lastrowid
    except Exception:
        return None


def verify_user(username: str, password: str) -> int | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, password_hash, salt FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    if row is None:
        return None
    if hmac.compare_digest(row["password_hash"], hash_password(password, row["salt"])):
        return row["id"]
    return None


def issue_token(user_id: int) -> str:
    token = secrets.token_hex(32)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, now_iso()),
        )
    return token


def user_for_token(token: str) -> dict | None:
    if not token:
        return None
    with get_conn() as conn:
        row = conn.execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
    return dict(row) if row else None
