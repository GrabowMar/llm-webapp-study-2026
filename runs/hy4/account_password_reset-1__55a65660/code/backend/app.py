"""Account service with password reset: Flask API + static frontend."""

from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = BASE / "data"
DB_PATH = DATA_DIR / "app.sqlite3"

MIN_PASSWORD_LENGTH = 8
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=None)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_error=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                email TEXT,
                email_key TEXT UNIQUE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reset_tokens (
                token_hash TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used_at TEXT
            );
            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                sent_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_outbox_recipient
                ON outbox (recipient COLLATE NOCASE, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def json_error(message: str, status: int):
    return jsonify(error=message), status


def body() -> dict:
    value = request.get_json(silent=True)
    return value if isinstance(value, dict) else {}


def valid_password(password) -> bool:
    return isinstance(password, str) and len(password) >= MIN_PASSWORD_LENGTH


def normalize_email(email) -> str | None:
    if not isinstance(email, str):
        return None
    email = email.strip()
    if not EMAIL_RE.fullmatch(email):
        return None
    return email


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def public_account(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def current_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return db().execute(
        """SELECT a.* FROM sessions s
           JOIN accounts a ON a.id = s.account_id
           WHERE s.token = ?""",
        (token,),
    ).fetchone()


def require_account():
    account = current_account()
    if account is None:
        return None, json_error("Authentication required", 401)
    return account, None


def find_account(identifier: str) -> sqlite3.Row | None:
    if not isinstance(identifier, str) or not identifier.strip():
        return None
    value = identifier.strip()
    return db().execute(
        "SELECT * FROM accounts WHERE username = ? OR email_key = ?",
        (value, value.lower()),
    ).fetchone()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("Username is required", 400)
    username = username.strip()
    if not valid_password(password):
        return json_error(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters", 400
        )
    email_value = data.get("email")
    if email_value in (None, ""):
        email = None
    else:
        email = normalize_email(email_value)
        if email is None:
            return json_error("Invalid email address", 400)

    conn = db()
    if conn.execute(
        "SELECT 1 FROM accounts WHERE username = ?", (username,)
    ).fetchone():
        return json_error("Username already taken", 409)
    if email is not None and conn.execute(
        "SELECT 1 FROM accounts WHERE email_key = ?", (email.lower(),)
    ).fetchone():
        return json_error("Email address already in use", 409)

    cur = conn.execute(
        """INSERT INTO accounts (username, password_hash, email, email_key, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (username, generate_password_hash(password), email,
         email.lower() if email else None, utcnow()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(public_account(row)), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Invalid username or password", 401)
    row = db().execute(
        "SELECT * FROM accounts WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return json_error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute(
        "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    conn.commit()
    return jsonify(token=token)


@app.post("/api/auth/logout")
def logout():
    account, error = require_account()
    if error:
        return error
    token = request.headers.get("Authorization", "")[7:].strip()
    conn = db()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    return jsonify(status="ok")


@app.get("/api/me")
def get_me():
    account, error = require_account()
    if error:
        return error
    return jsonify(public_account(account))


@app.patch("/api/me")
def patch_me():
    account, error = require_account()
    if error:
        return error
    data = body()
    if "email" not in data:
        return json_error("email is required", 400)
    raw = data["email"]
    if raw in (None, ""):
        email = None
    else:
        email = normalize_email(raw)
        if email is None:
            return json_error("Invalid email address", 400)

    conn = db()
    if email is not None and conn.execute(
        "SELECT 1 FROM accounts WHERE email_key = ? AND id != ?",
        (email.lower(), account["id"]),
    ).fetchone():
        return json_error("Email address already in use", 409)
    conn.execute(
        "UPDATE accounts SET email = ?, email_key = ? WHERE id = ?",
        (email, email.lower() if email else None, account["id"]),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account["id"],)).fetchone()
    return jsonify(public_account(row))


@app.post("/api/me/password")
def change_password():
    account, error = require_account()
    if error:
        return error
    data = body()
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not isinstance(current_password, str) or not check_password_hash(
        account["password_hash"], current_password
    ):
        return json_error("Current password is incorrect", 400)
    if not valid_password(new_password):
        return json_error(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters", 400
        )
    conn = db()
    conn.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_password), account["id"]),
    )
    conn.commit()
    return jsonify(status="ok")


@app.post("/api/auth/password-reset")
def password_reset():
    data = body()
    identifier = data.get("username") or data.get("email")
    account = find_account(identifier) if identifier else None
    if account is not None and account["email"]:
        token = secrets.token_urlsafe(32)
        link = f"{request.host_url.rstrip('/')}/reset?token={token}"
        conn = db()
        conn.execute(
            "INSERT INTO reset_tokens (token_hash, account_id, created_at, expires_at) "
            "VALUES (?, ?, ?, ?)",
            (
                token_hash(token),
                account["id"],
                utcnow(),
                datetime.fromtimestamp(
                    datetime.now(timezone.utc).timestamp() + 3600, timezone.utc
                ).isoformat(timespec="microseconds"),
            ),
        )
        conn.execute(
            """INSERT INTO outbox (recipient, subject, body, sent_at)
               VALUES (?, ?, ?, ?)""",
            (
                account["email"],
                "Reset your password",
                f"Hello {account['username']},\n\n"
                "A password reset was requested for your account.\n"
                "Open this single-use link to set a new password:\n"
                f"{link}\n\n"
                "If you did not request this, you can ignore this message.\n",
                utcnow(),
            ),
        )
        conn.commit()
    return jsonify(
        message="If the account exists, a reset link is on its way"
    )


@app.post("/api/auth/password-reset/confirm")
def password_reset_confirm():
    data = body()
    token = data.get("token")
    new_password = data.get("new_password")
    if not isinstance(token, str) or not token:
        return json_error("Invalid or expired token", 400)
    if not valid_password(new_password):
        return json_error(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters", 400
        )
    conn = db()
    row = conn.execute(
        "SELECT * FROM reset_tokens WHERE token_hash = ?", (token_hash(token),)
    ).fetchone()
    valid = (
        row is not None
        and row["used_at"] is None
        and datetime.fromisoformat(row["expires_at"]) > datetime.now(timezone.utc)
    )
    if not valid:
        return json_error("Invalid or expired token", 400)
    conn.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_password), row["account_id"]),
    )
    conn.execute(
        "UPDATE reset_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL",
        (utcnow(), row["token_hash"]),
    )
    conn.execute(
        "DELETE FROM sessions WHERE account_id = ?", (row["account_id"],)
    )
    conn.commit()
    return jsonify(status="ok")


@app.get("/api/outbox")
def outbox():
    to = request.args.get("to")
    if not to:
        return jsonify(items=[])
    rows = db().execute(
        """SELECT id, recipient AS "to", subject, body, sent_at
           FROM outbox WHERE recipient = ? COLLATE NOCASE
           ORDER BY id DESC""",
        (to.strip(),),
    ).fetchall()
    return jsonify(items=[dict(row) for row in rows])


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("Not found", 404)
    if ".." in path.split("/"):
        return json_error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
