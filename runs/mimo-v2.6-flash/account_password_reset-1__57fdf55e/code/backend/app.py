"""Flask entry point: JSON API plus static frontend."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

MIN_PASSWORD_LENGTH = 8
RESET_MESSAGE = "If the account exists, a reset link is on its way"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    used_at TEXT
);
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_address TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_to ON outbox (LOWER(to_address));
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
        conn.execute("PRAGMA journal_mode=WAL")
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def fail(message: str, status: int):
    return jsonify({"error": message}), status


def password_problem(password) -> str | None:
    if not isinstance(password, str) or len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters long."
    return None


def email_problem(email) -> str | None:
    if not isinstance(email, str) or not email.strip():
        return "Email must be a non-empty string."
    value = email.strip()
    if value.count("@") != 1 or any(part == "" for part in value.split("@")):
        return "Email must be a valid address."
    if any(ch.isspace() for ch in value):
        return "Email must be a valid address."
    return None


def current_account() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if header[:7].lower() != "bearer ":
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT id, username, email, password_hash FROM sessions "
            "JOIN accounts ON accounts.id = sessions.account_id "
            "WHERE sessions.token = ?",
            (token,),
        )
        .fetchone()
    )
    return row


def account_payload(account: sqlite3.Row) -> dict:
    return {
        "id": account["id"],
        "username": account["username"],
        "email": account["email"],
    }


def queue_message(to_address: str, subject: str, body: str) -> None:
    get_db().execute(
        "INSERT INTO outbox (to_address, subject, body, sent_at) VALUES (?, ?, ?, ?)",
        (to_address, subject, body, utcnow()),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    email = data.get("email")

    if not isinstance(username, str) or not username.strip():
        return fail("Username is required.", 400)
    username = username.strip()
    if email is not None and isinstance(email, str) and not email.strip():
        email = None
    if email is not None:
        problem = email_problem(email)
        if problem:
            return fail(problem, 400)
        email = email.strip()
    problem = password_problem(password)
    if problem:
        return fail(problem, 400)

    db = get_db()
    if db.execute("SELECT id FROM accounts WHERE username = ?", (username,)).fetchone():
        return fail("Username is already taken.", 409)
    if email is not None:
        if db.execute(
            "SELECT id FROM accounts WHERE LOWER(email) = LOWER(?)", (email,)
        ).fetchone():
            return fail("Email is already in use.", 409)

    cursor = db.execute(
        "INSERT INTO accounts (username, password_hash, email) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), email),
    )
    db.commit()
    return jsonify(
        {"id": cursor.lastrowid, "username": username, "email": email}
    ), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username:
        return fail("Username is required.", 400)
    if not isinstance(password, str) or not password:
        return fail("Password is required.", 400)

    account = get_db().execute(
        "SELECT id, password_hash FROM accounts WHERE username = ?", (username,)
    ).fetchone()
    if account is None or not check_password_hash(account["password_hash"], password):
        return fail("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, account_id, created_at) VALUES (?, ?, ?)",
        (token, account["id"], utcnow()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


@app.get("/api/me")
def get_me():
    account = current_account()
    if account is None:
        return fail("Authentication required.", 401)
    return jsonify(account_payload(account)), 200


@app.patch("/api/me")
def update_me():
    account = current_account()
    if account is None:
        return fail("Authentication required.", 401)

    data = json_body()
    if "email" not in data:
        return fail("Email is required.", 400)
    email = data.get("email")
    if email is None or (isinstance(email, str) and not email.strip()):
        new_email = None
    else:
        problem = email_problem(email)
        if problem:
            return fail(problem, 400)
        new_email = email.strip()
        db = get_db()
        duplicate = db.execute(
            "SELECT id FROM accounts WHERE LOWER(email) = LOWER(?) AND id != ?",
            (new_email, account["id"]),
        ).fetchone()
        if duplicate:
            return fail("Email is already in use.", 409)

    db = get_db()
    db.execute("UPDATE accounts SET email = ? WHERE id = ?", (new_email, account["id"]))
    db.commit()
    updated = db.execute(
        "SELECT id, username, email FROM accounts WHERE id = ?", (account["id"],)
    ).fetchone()
    return jsonify(account_payload(updated)), 200


@app.post("/api/me/password")
def change_password():
    account = current_account()
    if account is None:
        return fail("Authentication required.", 401)

    data = json_body()
    current = data.get("current_password")
    new = data.get("new_password")
    if not isinstance(current, str) or not current:
        return fail("Current password is required.", 400)
    problem = password_problem(new)
    if problem:
        return fail(problem, 400)
    if not check_password_hash(account["password_hash"], current):
        return fail("Current password is incorrect.", 401)

    db = get_db()
    db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new), account["id"]),
    )
    db.commit()
    return jsonify({"message": "Password updated."}), 200


@app.post("/api/auth/password-reset")
def request_password_reset():
    data = json_body()
    identifier = data.get("username")
    if not isinstance(identifier, str) or not identifier.strip():
        identifier = data.get("email")
    if not isinstance(identifier, str) or not identifier.strip():
        return fail("Username or email is required.", 400)
    identifier = identifier.strip()

    db = get_db()
    account = db.execute(
        "SELECT id, email FROM accounts WHERE username = ?", (identifier,)
    ).fetchone()
    if account is None:
        account = db.execute(
            "SELECT id, email FROM accounts WHERE email IS NOT NULL "
            "AND LOWER(email) = LOWER(?)",
            (identifier,),
        ).fetchone()

    if account is not None and account["email"]:
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO password_reset_tokens (token, account_id, created_at) "
            "VALUES (?, ?, ?)",
            (token, account["id"], utcnow()),
        )
        link = f"{request.url_root.rstrip('/')}/reset?token={token}"
        queue_message(
            account["email"],
            "Reset your password",
            "Someone asked to reset the password for your account.\n\n"
            f"Open this link to choose a new password:\n{link}\n\n"
            "The link can be used once. If you did not ask for this, "
            "you can ignore this message.",
        )
    db.commit()
    return jsonify({"message": RESET_MESSAGE}), 200


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset():
    data = json_body()
    token = data.get("token")
    new = data.get("new_password")
    if not isinstance(token, str) or not token.strip():
        return fail("Reset token is required.", 400)
    problem = password_problem(new)
    if problem:
        return fail(problem, 400)

    db = get_db()
    row = db.execute(
        "SELECT token, account_id, used_at FROM password_reset_tokens WHERE token = ?",
        (token.strip(),),
    ).fetchone()
    if row is None or row["used_at"] is not None:
        return fail("Reset link is invalid or has already been used.", 400)

    db.execute(
        "UPDATE accounts SET password_hash = ? WHERE id = ?",
        (generate_password_hash(new), row["account_id"]),
    )
    db.execute(
        "UPDATE password_reset_tokens SET used_at = ? WHERE token = ?",
        (utcnow(), row["token"]),
    )
    db.commit()
    return jsonify({"message": "Password has been reset."}), 200


@app.get("/api/outbox")
def list_outbox():
    to_address = (request.args.get("to") or "").strip()
    if not to_address:
        return fail("Missing required query parameter: to.", 400)
    rows = (
        get_db()
        .execute(
            "SELECT id, to_address, subject, body, sent_at FROM outbox "
            "WHERE LOWER(to_address) = LOWER(?) ORDER BY id DESC",
            (to_address,),
        )
        .fetchall()
    )
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
    return jsonify({"items": items}), 200


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found."}), 404
    return "Not found.", 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend build not found.", 404
    return send_from_directory(DIST, "index.html")


init_db()
