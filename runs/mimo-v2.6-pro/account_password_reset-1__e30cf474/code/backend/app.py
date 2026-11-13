"""Account service: registration, sign-in, password reset and an outbox."""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

MIN_PASSWORD_LENGTH = 8
PBKDF2_ITERATIONS = 200_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email
    ON accounts (lower(email)) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at TEXT NOT NULL,
    used_at TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Passwords and tokens
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_b64, digest_b64 = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(digest_b64)
    except (ValueError, TypeError):
        return False
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, int(iterations)
    )
    return hmac.compare_digest(candidate, expected)


def new_token() -> str:
    return secrets.token_urlsafe(32)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def error(message: str, status: int):
    return jsonify({"error": message}), status


def check_password(password) -> str | None:
    if not isinstance(password, str):
        return "password is required"
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


def check_email(email) -> str | None:
    if email is None:
        return None
    if not isinstance(email, str) or not EMAIL_RE.match(email):
        return "invalid email address"
    return None


def account_json(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def get_account_by_token(token: str):
    row = get_db().execute(
        """
        SELECT a.* FROM auth_tokens t
        JOIN accounts a ON a.id = t.account_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("authentication required", 401)
        account = get_account_by_token(header[len("Bearer "):].strip())
        if account is None:
            return error("invalid or expired token", 401)
        g.account = account
        return view(*args, **kwargs)

    return wrapped


def json_body():
    return request.get_json(silent=True) or {}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    email = body.get("email")

    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    username = username.strip()
    problem = check_password(password)
    if problem:
        return error(problem, 400)
    if email is not None and not isinstance(email, str):
        return error("invalid email address", 400)
    if isinstance(email, str):
        email = email.strip() or None
    problem = check_email(email)
    if problem:
        return error(problem, 400)

    db = get_db()
    if db.execute(
        "SELECT 1 FROM accounts WHERE username = ?", (username,)
    ).fetchone():
        return error("username already taken", 400)
    if email is not None and db.execute(
        "SELECT 1 FROM accounts WHERE lower(email) = lower(?)", (email,)
    ).fetchone():
        return error("email address already in use", 400)

    cur = db.execute(
        "INSERT INTO accounts (username, email, password_hash, created_at)"
        " VALUES (?, ?, ?, ?)",
        (username, email, hash_password(password), utcnow()),
    )
    db.commit()
    row = db.execute(
        "SELECT id, username, email FROM accounts WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(account_json(row)), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute(
        "SELECT * FROM accounts WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("invalid username or password", 401)

    token = new_token()
    db.execute(
        "INSERT INTO auth_tokens (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer "):].strip()
    db = get_db()
    db.execute("DELETE FROM auth_tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"message": "signed out"})


# ---------------------------------------------------------------------------
# Account
# ---------------------------------------------------------------------------

@app.get("/api/me")
@login_required
def me():
    return jsonify(account_json(g.account))


@app.patch("/api/me")
@login_required
def update_me():
    body = json_body()
    if "email" not in body:
        return error("email is required", 400)
    email = body.get("email")
    if email is not None and not isinstance(email, str):
        return error("invalid email address", 400)
    if isinstance(email, str):
        email = email.strip() or None
    problem = check_email(email)
    if problem:
        return error(problem, 400)

    db = get_db()
    if email is not None and db.execute(
        "SELECT 1 FROM accounts WHERE lower(email) = lower(?) AND id != ?",
        (email, g.account["id"]),
    ).fetchone():
        return error("email address already in use", 400)

    db.execute(
        "UPDATE accounts SET email = ? WHERE id = ?", (email, g.account["id"])
    )
    db.commit()
    row = db.execute(
        "SELECT id, username, email FROM accounts WHERE id = ?", (g.account["id"],)
    ).fetchone()
    return jsonify(account_json(row))


@app.post("/api/me/password")
@login_required
def change_password():
    body = json_body()
    current = body.get("current_password")
    new = body.get("new_password")
    if not isinstance(current, str):
        return error("current_password is required", 400)
    problem = check_password(new)
    if problem:
        return error(problem, 400)

    db = get_db()
    row = db.execute(
        "SELECT password_hash FROM accounts WHERE id = ?", (g.account["id"],)
    ).fetchone()
    if not verify_password(current, row["password_hash"]):
        return error("current password is incorrect", 400)

    db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (hash_password(new), g.account["id"]),
    )
    db.commit()
    return jsonify({"message": "password updated"})


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

@app.post("/api/auth/password-reset")
def password_reset():
    body = json_body()
    email = body.get("email")
    username = body.get("username")

    db = get_db()
    account = None
    if isinstance(email, str) and email.strip():
        account = db.execute(
            "SELECT * FROM accounts WHERE lower(email) = lower(?)", (email.strip(),)
        ).fetchone()
    if account is None and isinstance(username, str) and username.strip():
        account = db.execute(
            "SELECT * FROM accounts WHERE username = ?", (username.strip(),)
        ).fetchone()

    if account is not None and account["email"]:
        token = new_token()
        db.execute(
            "INSERT INTO reset_tokens (token, account_id, created_at)"
            " VALUES (?, ?, ?)",
            (token, account["id"], utcnow()),
        )
        link = f"/reset?token={token}"
        body_text = (
            f"Hello {account['username']},\n\n"
            "A password reset was requested for your account.\n"
            "Open the link below to choose a new password. It can be used once:\n\n"
            f"{link}\n\n"
            "If you did not request this, you can ignore this message.\n"
        )
        db.execute(
            "INSERT INTO outbox (recipient, subject, body, sent_at)"
            " VALUES (?, ?, ?, ?)",
            (account["email"], "Password reset", body_text, utcnow()),
        )
        db.commit()

    return jsonify({"message": "If the account exists, a reset link is on its way"})


@app.post("/api/auth/password-reset/confirm")
def password_reset_confirm():
    body = json_body()
    token = body.get("token")
    new = body.get("new_password")
    if not isinstance(token, str) or not token.strip():
        return error("token is required", 400)
    problem = check_password(new)
    if problem:
        return error(problem, 400)

    db = get_db()
    row = db.execute(
        "SELECT * FROM reset_tokens WHERE token = ?", (token.strip(),)
    ).fetchone()
    if row is None or row["used_at"] is not None:
        return error("invalid or used reset token", 400)

    db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (hash_password(new), row["account_id"]),
    )
    db.execute(
        "UPDATE reset_tokens SET used_at = ? WHERE token = ?", (utcnow(), row["token"])
    )
    db.commit()
    return jsonify({"message": "password updated"})


# ---------------------------------------------------------------------------
# Outbox
# ---------------------------------------------------------------------------

@app.get("/api/outbox")
def outbox():
    recipient = request.args.get("to")
    db = get_db()
    if recipient is not None and recipient.strip():
        rows = db.execute(
            "SELECT * FROM outbox WHERE lower(recipient) = lower(?)"
            " ORDER BY sent_at DESC, id DESC",
            (recipient.strip(),),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM outbox ORDER BY sent_at DESC, id DESC"
        ).fetchall()
    items = [
        {
            "id": row["id"],
            "to": row["recipient"],
            "subject": row["subject"],
            "body": row["body"],
            "sent_at": row["sent_at"],
        }
        for row in rows
    ]
    return jsonify({"items": items})


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
