"""Flask entry point: account service with password reset."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "app.db"

SESSION_TTL = 60 * 60 * 24 * 30  # 30 days
RESET_TTL = 60 * 60  # 1 hour

app = Flask(__name__, static_folder=None)


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS reset_tokens (
            token_hash TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS outbox (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            to_addr TEXT NOT NULL,
            subject TEXT NOT NULL,
            body TEXT NOT NULL,
            sent_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000).hex()


def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    value = email.strip()
    return value.lower() if value else None


def valid_password(password: str | None) -> bool:
    return isinstance(password, str) and len(password) >= 8


def get_json() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def generate_session_token(account_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token_hash, account_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), account_id, utcnow()),
    )
    db.commit()
    return token


def current_account():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id "
        "WHERE s.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    return row


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        account = current_account()
        if account is None:
            return jsonify({"error": "unauthorized"}), 401
        g.account = account
        return fn(*args, **kwargs)

    return wrapper


def send_outbox(to_addr: str, subject: str, body: str) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO outbox (to_addr, subject, body, sent_at) VALUES (?, ?, ?, ?)",
        (to_addr, subject, body, utcnow()),
    )
    db.commit()
    return cur.lastrowid


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = get_json()
    username = str(data.get("username", "")).strip()
    password = data.get("password")
    email = normalize_email(data.get("email"))

    if not username:
        return jsonify({"error": "username is required"}), 400
    if not valid_password(password):
        return jsonify({"error": "password must be at least 8 characters"}), 400

    salt = secrets.token_hex(16)
    password_hash = hash_password(password, salt)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO accounts (username, email, password_hash, password_salt, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (username, email, password_hash, salt, utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username or email already taken"}), 409

    account_id = cur.lastrowid
    return jsonify({"id": account_id, "username": username, "email": email}), 201


@app.post("/api/auth/login")
def login():
    data = get_json()
    username = str(data.get("username", "")).strip()
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    row = get_db().execute(
        "SELECT * FROM accounts WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not hmac.compare_digest(
        row["password_hash"], hash_password(password, row["password_salt"])
    ):
        return jsonify({"error": "invalid credentials"}), 401

    token = generate_session_token(row["id"])
    return jsonify({"token": token})


@app.get("/api/me")
@require_auth
def me():
    account = g.account
    return jsonify(
        {"id": account["id"], "username": account["username"], "email": account["email"]}
    )


@app.patch("/api/me")
@require_auth
def update_me():
    data = get_json()
    account = g.account

    if "email" in data:
        new_email = normalize_email(data.get("email"))
        db = get_db()
        try:
            db.execute(
                "UPDATE accounts SET email = ? WHERE id = ?",
                (new_email, account["id"]),
            )
            db.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "email already taken"}), 409

    if "username" in data:
        new_username = str(data.get("username", "")).strip()
        if new_username and new_username != account["username"]:
            db = get_db()
            try:
                db.execute(
                    "UPDATE accounts SET username = ? WHERE id = ?",
                    (new_username, account["id"]),
                )
                db.commit()
            except sqlite3.IntegrityError:
                return jsonify({"error": "username already taken"}), 409

    row = get_db().execute(
        "SELECT * FROM accounts WHERE id = ?", (account["id"],)
    ).fetchone()
    return jsonify(
        {"id": row["id"], "username": row["username"], "email": row["email"]}
    )


@app.post("/api/me/password")
@require_auth
def change_password():
    data = get_json()
    account = g.account
    current = data.get("current_password")
    new_password = data.get("new_password")

    if not hmac.compare_digest(
        account["password_hash"],
        hash_password(current or "", account["password_salt"]),
    ):
        return jsonify({"error": "current password is incorrect"}), 401
    if not valid_password(new_password):
        return jsonify({"error": "new password must be at least 8 characters"}), 400

    salt = secrets.token_hex(16)
    password_hash = hash_password(new_password, salt)
    db = get_db()
    db.execute(
        "UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?",
        (password_hash, salt, account["id"]),
    )
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/auth/password-reset")
def password_reset():
    data = get_json()
    username = str(data.get("username", "")).strip()
    email = normalize_email(data.get("email"))

    db = get_db()
    account = None
    if username:
        account = db.execute(
            "SELECT * FROM accounts WHERE username = ?", (username,)
        ).fetchone()
    elif email:
        account = db.execute(
            "SELECT * FROM accounts WHERE email = ?", (email,)
        ).fetchone()

    if account is None or not account["email"]:
        return jsonify({"ok": True})

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO reset_tokens (token_hash, account_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), account["id"], utcnow()),
    )
    db.commit()

    reset_url = f"{request.host_url.rstrip('/')}/reset?token={token}"
    body = (
        f"Hello {account['username']},\n\n"
        f"To reset your password, follow this link:\n{reset_url}\n\n"
        f"This link expires in one hour."
    )
    send_outbox(account["email"], "Password reset", body)

    return jsonify({"ok": True})


@app.post("/api/auth/password-reset/confirm")
def password_reset_confirm():
    data = get_json()
    token = data.get("token")
    new_password = data.get("new_password")

    if not token or not valid_password(new_password):
        return jsonify({"error": "invalid request"}), 400

    db = get_db()
    row = db.execute(
        "SELECT * FROM reset_tokens WHERE token_hash = ?", (hash_token(token),)
    ).fetchone()
    if row is None:
        return jsonify({"error": "invalid or expired token"}), 400

    created = datetime.fromisoformat(row["created_at"])
    if (datetime.now(timezone.utc) - created).total_seconds() > RESET_TTL:
        db.execute("DELETE FROM reset_tokens WHERE token_hash = ?", (row["token_hash"],))
        db.commit()
        return jsonify({"error": "invalid or expired token"}), 400

    salt = secrets.token_hex(16)
    password_hash = hash_password(new_password, salt)
    db.execute(
        "UPDATE accounts SET password_hash = ?, password_salt = ? WHERE id = ?",
        (password_hash, salt, row["account_id"]),
    )
    db.execute("DELETE FROM reset_tokens WHERE token_hash = ?", (row["token_hash"],))
    db.commit()

    return jsonify({"ok": True})


@app.get("/api/outbox")
def outbox():
    to_addr = request.args.get("to")
    if not to_addr:
        return jsonify({"items": []})
    rows = get_db().execute(
        "SELECT id, to_addr AS 'to', subject, body, sent_at FROM outbox "
        "WHERE to_addr = ? ORDER BY sent_at DESC, id DESC",
        (to_addr,),
    ).fetchall()
    items = [dict(row) for row in rows]
    return jsonify({"items": items})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
