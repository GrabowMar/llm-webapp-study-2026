"""Flask entry point for the account service."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")
MIN_PASSWORD_LENGTH = 8

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                email TEXT,
                created_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_email
                ON accounts(lower(email)) WHERE email IS NOT NULL;
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS password_resets (
                token TEXT PRIMARY KEY,
                account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS outbox (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                sent_at TEXT NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def account_json(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def normalize_email(value):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Invalid email address")
    value = value.strip()
    if value == "":
        return None
    if not EMAIL_RE.match(value):
        raise ValueError("Invalid email address")
    return value


def current_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    conn = connect()
    try:
        return conn.execute(
            """
            SELECT accounts.id, accounts.username, accounts.email
            FROM sessions JOIN accounts ON accounts.id = sessions.account_id
            WHERE sessions.token = ?
            """,
            (token,),
        ).fetchone()
    finally:
        conn.close()


def require_account():
    account = current_account()
    if account is None:
        return None, error("Authentication required", 401)
    return account, None


def validate_password(password) -> str | None:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("Username is required")
    username = username.strip()
    message = validate_password(password)
    if message:
        return error(message)

    try:
        email = normalize_email(data.get("email"))
    except ValueError as exc:
        return error(str(exc))

    conn = connect()
    try:
        if conn.execute(
            "SELECT 1 FROM accounts WHERE username = ?", (username,)
        ).fetchone():
            return error("Username is already taken", 409)
        if email is not None and conn.execute(
            "SELECT 1 FROM accounts WHERE lower(email) = lower(?)", (email,)
        ).fetchone():
            return error("Email address is already in use", 409)

        try:
            cur = conn.execute(
                "INSERT INTO accounts (username, password_hash, email, created_at)"
                " VALUES (?, ?, ?, ?)",
                (username, generate_password_hash(password), email, now_iso()),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            return error("Username or email address is already in use", 409)

        row = conn.execute(
            "SELECT id, username, email FROM accounts WHERE id = ?",
            (cur.lastrowid,),
        ).fetchone()
        return jsonify(account_json(row)), 201
    finally:
        conn.close()


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required")

    conn = connect()
    try:
        row = conn.execute(
            "SELECT id, password_hash FROM accounts WHERE username = ?",
            (username.strip(),),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return error("Invalid username or password", 401)

        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], now_iso()),
        )
        conn.commit()
        return jsonify({"token": token})
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer "):].strip()
        conn = connect()
        try:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            conn.commit()
        finally:
            conn.close()
    return jsonify({"status": "ok"})


@app.get("/api/me")
def get_me():
    account, err = require_account()
    if err:
        return err
    return jsonify(account_json(account))


@app.patch("/api/me")
def update_me():
    account, err = require_account()
    if err:
        return err

    data = json_body()
    if "email" not in data:
        return error("Email is required")
    try:
        email = normalize_email(data.get("email"))
    except ValueError as exc:
        return error(str(exc))

    conn = connect()
    try:
        if email is not None and conn.execute(
            "SELECT 1 FROM accounts WHERE lower(email) = lower(?) AND id != ?",
            (email, account["id"]),
        ).fetchone():
            return error("Email address is already in use", 409)
        try:
            conn.execute(
                "UPDATE accounts SET email = ? WHERE id = ?",
                (email, account["id"]),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            return error("Email address is already in use", 409)

        row = conn.execute(
            "SELECT id, username, email FROM accounts WHERE id = ?",
            (account["id"],),
        ).fetchone()
        return jsonify(account_json(row))
    finally:
        conn.close()


@app.post("/api/me/password")
def change_password():
    account, err = require_account()
    if err:
        return err

    data = json_body()
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not isinstance(current_password, str):
        return error("Current password is required")
    message = validate_password(new_password)
    if message:
        return error(message)

    conn = connect()
    try:
        row = conn.execute(
            "SELECT password_hash FROM accounts WHERE id = ?", (account["id"],)
        ).fetchone()
        if row is None or not check_password_hash(
            row["password_hash"], current_password
        ):
            return error("Current password is incorrect", 400)

        conn.execute(
            "UPDATE accounts SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), account["id"]),
        )
        conn.commit()
        return jsonify({"status": "ok"})
    finally:
        conn.close()


@app.post("/api/auth/password-reset")
def request_password_reset():
    data = json_body()
    username = data.get("username")
    email = data.get("email")
    answer = {"message": "If the account exists, a reset link is on its way"}

    if not username and not email:
        return jsonify(answer)

    conn = connect()
    try:
        row = None
        if isinstance(username, str) and username.strip():
            row = conn.execute(
                "SELECT id, email FROM accounts WHERE username = ?",
                (username.strip(),),
            ).fetchone()
        if row is None and isinstance(email, str) and email.strip():
            row = conn.execute(
                "SELECT id, email FROM accounts WHERE lower(email) = lower(?)",
                (email.strip(),),
            ).fetchone()

        if row is not None and row["email"]:
            token = secrets.token_urlsafe(32)
            sent_at = now_iso()
            reset_url = f"{request.host_url.rstrip('/')}/reset?token={token}"
            body = (
                "Someone requested a password reset for your account.\n\n"
                f"Reset your password using this link:\n{reset_url}\n\n"
                "This link can only be used once. If you did not request this, "
                "you can ignore this message."
            )
            conn.execute(
                "INSERT INTO password_resets (token, account_id, created_at, used)"
                " VALUES (?, ?, ?, 0)",
                (token, row["id"], sent_at),
            )
            conn.execute(
                "INSERT INTO outbox (recipient, subject, body, sent_at)"
                " VALUES (?, ?, ?, ?)",
                (row["email"], "Password reset", body, sent_at),
            )
            conn.commit()

        return jsonify(
            {"message": "If the account exists, a reset link is on its way"}
        )
    finally:
        conn.close()


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset():
    data = json_body()
    token = data.get("token")
    new_password = data.get("new_password")
    if not isinstance(token, str) or not token:
        return error("Token is required")
    message = validate_password(new_password)
    if message:
        return error(message)

    conn = connect()
    try:
        row = conn.execute(
            "SELECT account_id FROM password_resets WHERE token = ? AND used = 0",
            (token,),
        ).fetchone()
        if row is None:
            return error("Invalid or already used reset token", 400)

        conn.execute(
            "UPDATE accounts SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), row["account_id"]),
        )
        conn.execute(
            "UPDATE password_resets SET used = 1 WHERE account_id = ?",
            (row["account_id"],),
        )
        conn.commit()
        return jsonify({"status": "ok"})
    finally:
        conn.close()


@app.get("/api/outbox")
def outbox():
    to = request.args.get("to")
    conn = connect()
    try:
        if to is None or to.strip() == "":
            rows = conn.execute(
                "SELECT id, recipient, subject, body, sent_at FROM outbox"
                " ORDER BY sent_at DESC, id DESC"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, recipient, subject, body, sent_at FROM outbox"
                " WHERE lower(recipient) = lower(?)"
                " ORDER BY sent_at DESC, id DESC",
                (to.strip(),),
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
    finally:
        conn.close()


@app.errorhandler(404)
def not_found(_exc):
    if request.path == "/api" or request.path.startswith("/api/"):
        return error("Not found", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
