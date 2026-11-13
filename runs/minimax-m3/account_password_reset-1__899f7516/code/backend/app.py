"""Flask entry point: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from store import connect, init_db, now_iso

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

MIN_PASSWORD_LENGTH = 8
RESET_TOKEN_TTL = timedelta(hours=1)
RESET_TOKEN_BYTES = 32
SESSION_TOKEN_BYTES = 32
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+$")

app = Flask(__name__, static_folder=None)


@app.before_request
def open_database() -> None:
    g.db = connect()


@app.teardown_appcontext
def close_database(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def account_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def current_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return g.db.execute(
        "SELECT accounts.* FROM sessions JOIN accounts ON accounts.id = sessions.account_id"
        " WHERE sessions.token = ?",
        (token,),
    ).fetchone()


def valid_email(email: str) -> bool:
    return bool(EMAIL_PATTERN.match(email))


def create_session(account_id: int) -> str:
    token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
    g.db.execute(
        "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account_id, now_iso()),
    )
    return token


def delete_other_sessions(account_id: int, keep_token: str | None = None) -> None:
    if keep_token is None:
        g.db.execute("DELETE FROM sessions WHERE account_id = ?", (account_id,))
        return
    g.db.execute(
        "DELETE FROM sessions WHERE account_id = ? AND token != ?",
        (account_id, keep_token),
    )


def reset_link(token: str) -> str:
    return f"{request.host_url.rstrip('/')}/reset?token={token}"


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = as_text(data.get("username"))
    password = data.get("password")
    email = as_text(data.get("email"))

    if not username:
        return error("username is required")
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        return error(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if email and not valid_email(email):
        return error("invalid email address")

    db = g.db
    if db.execute("SELECT 1 FROM accounts WHERE username_key = ?", (username.lower(),)).fetchone():
        return error("username is already taken", 409)
    if email and db.execute("SELECT 1 FROM accounts WHERE email_key = ?", (email.lower(),)).fetchone():
        return error("email is already in use", 409)

    cursor = db.execute(
        "INSERT INTO accounts (username, username_key, email, email_key, password_hash, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            username,
            username.lower(),
            email or None,
            email.lower() if email else None,
            generate_password_hash(password),
            now_iso(),
        ),
    )
    row = db.execute("SELECT * FROM accounts WHERE id = ?", (cursor.lastrowid,)).fetchone()
    token = create_session(row["id"])
    payload = account_payload(row)
    payload["token"] = token
    return jsonify(payload), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = as_text(data.get("username"))
    password = data.get("password")

    if not username or not isinstance(password, str):
        return error("username and password are required")

    row = g.db.execute(
        "SELECT * FROM accounts WHERE username_key = ?", (username.lower(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    return jsonify({"token": create_session(row["id"])})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        g.db.execute("DELETE FROM sessions WHERE token = ?", (header[7:].strip(),))
    return jsonify({"status": "ok"})


@app.get("/api/me")
def me():
    row = current_account()
    if row is None:
        return error("authentication required", 401)
    return jsonify(account_payload(row))


@app.patch("/api/me")
def update_me():
    row = current_account()
    if row is None:
        return error("authentication required", 401)

    data = body()
    if "email" not in data:
        return error("email is required")

    raw = data.get("email")
    email = as_text(raw)
    if raw is not None and not isinstance(raw, str):
        return error("invalid email address")
    if not email:
        email = ""

    if email:
        if not valid_email(email):
            return error("invalid email address")
        clash = g.db.execute(
            "SELECT 1 FROM accounts WHERE email_key = ? AND id != ?", (email.lower(), row["id"])
        ).fetchone()
        if clash:
            return error("email is already in use", 409)
        g.db.execute(
            "UPDATE accounts SET email = ?, email_key = ? WHERE id = ?",
            (email, email.lower(), row["id"]),
        )
    else:
        g.db.execute("UPDATE accounts SET email = NULL, email_key = NULL WHERE id = ?", (row["id"],))

    updated = g.db.execute("SELECT * FROM accounts WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(account_payload(updated))


@app.post("/api/me/password")
def change_password():
    row = current_account()
    if row is None:
        return error("authentication required", 401)

    data = body()
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not isinstance(current_password, str) or not current_password:
        return error("current_password is required")
    if not isinstance(new_password, str) or len(new_password) < MIN_PASSWORD_LENGTH:
        return error(f"new_password must be at least {MIN_PASSWORD_LENGTH} characters")
    if not check_password_hash(row["password_hash"], current_password):
        return error("current password is incorrect")

    header = request.headers.get("Authorization", "")
    keep_token = header[7:].strip() if header.lower().startswith("bearer ") else None
    g.db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new_password), row["id"]),
    )
    delete_other_sessions(row["id"], keep_token)
    return jsonify({"status": "ok"})


@app.post("/api/auth/password-reset")
def request_password_reset():
    data = body()
    username = as_text(data.get("username"))
    email = as_text(data.get("email"))
    if not username and not email:
        return error("username or email is required")

    row = None
    if username:
        row = g.db.execute(
            "SELECT * FROM accounts WHERE username_key = ?", (username.lower(),)
        ).fetchone()
    if row is None and email:
        row = g.db.execute(
            "SELECT * FROM accounts WHERE email_key = ?", (email.lower(),)
        ).fetchone()

    if row is not None and row["email"]:
        token = secrets.token_hex(RESET_TOKEN_BYTES)
        expires_at = (datetime.now(timezone.utc) + RESET_TOKEN_TTL).isoformat(
            timespec="microseconds"
        ).replace("+00:00", "Z")
        g.db.execute(
            "INSERT INTO reset_tokens (token, account_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?)",
            (token, row["id"], now_iso(), expires_at),
        )
        link = reset_link(token)
        message_body = (
            f"Hi {row['username']},\n\n"
            "We received a request to reset the password for your account.\n\n"
            "Use this link to choose a new password. It can be used only once:\n"
            f"{link}\n\n"
            "If you did not ask for a new password you can ignore this message; "
            "your password stays as it is."
        )
        g.db.execute(
            "INSERT INTO outbox (to_address, subject, body, sent_at) VALUES (?, ?, ?, ?)",
            (row["email"], "Reset your password", message_body, now_iso()),
        )

    return jsonify({"message": "If the account exists, a reset link is on its way"})


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset():
    data = body()
    token = as_text(data.get("token"))
    new_password = data.get("new_password")
    if not token:
        return error("token is required")
    if not isinstance(new_password, str) or len(new_password) < MIN_PASSWORD_LENGTH:
        return error(f"new_password must be at least {MIN_PASSWORD_LENGTH} characters")

    row = g.db.execute("SELECT * FROM reset_tokens WHERE token = ?", (token,)).fetchone()
    if row is None or row["used_at"]:
        return error("invalid or already used reset token")
    if row["expires_at"] < now_iso():
        return error("reset token has expired")

    db = g.db
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute(
            "UPDATE accounts SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), row["account_id"]),
        )
        db.execute("UPDATE reset_tokens SET used_at = ? WHERE token = ?", (now_iso(), token))
        db.execute("DELETE FROM sessions WHERE account_id = ?", (row["account_id"],))
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

    return jsonify({"status": "ok"})


@app.get("/api/outbox")
def outbox():
    to = as_text(request.args.get("to"))
    if not to:
        return error("to is required")
    rows = g.db.execute(
        "SELECT * FROM outbox WHERE to_address = ? COLLATE NOCASE"
        " ORDER BY sent_at DESC, id DESC",
        (to,),
    ).fetchall()
    items = [
        {
            "id": row["id"],
            "to": row["to_address"],
            "subject": row["subject"],
            "body": row["body"],
            "sent_at": row["sent_at"],
        }
        for row in rows
    ]
    return jsonify({"items": items})


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return serve_frontend()


@app.errorhandler(405)
def method_not_allowed(_exc):
    if request.path.startswith("/api/"):
        return error("method not allowed", 405)
    return serve_frontend()


def serve_frontend():
    path = request.path.lstrip("/")
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    return serve_frontend()


init_db()
