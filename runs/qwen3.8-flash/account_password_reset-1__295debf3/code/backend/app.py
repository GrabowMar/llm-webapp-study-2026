"""Flask entry point: accounts, password reset and a fake email outbox."""

import hashlib
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL_SECONDS = 3600
PBKDF2_ITERATIONS = 120_000

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA journal_mode = WAL")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            email TEXT UNIQUE COLLATE NOCASE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reset_tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at REAL NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL
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
    db.commit()
    db.close()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt, digest = stored.split("$")
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), int(iterations)
    ).hex()
    return algo == "pbkdf2_sha256" and secrets.compare_digest(check, digest)


def valid_password(password) -> bool:
    return isinstance(password, str) and len(password) >= 8


def valid_email(email) -> bool:
    return isinstance(email, str) and bool(EMAIL_RE.match(email.strip()))


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def user_public(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "username": row["username"], "email": row["email"]}


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header.removeprefix("Bearer ").strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def message_from_row(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "to": row["recipient"],
        "subject": row["subject"],
        "body": row["body"],
        "sent_at": row["sent_at"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    email = body.get("email")

    if not isinstance(username, str) or not username.strip():
        return error("Username is required", 400)
    username = username.strip()
    if not valid_password(password):
        return error("Password must be at least 8 characters", 400)
    if email is not None and email != "" and not valid_email(email):
        return error("Email address is not valid", 400)
    email = email.strip() if isinstance(email, str) and email.strip() else None

    db = get_db()
    if db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone():
        return error("Username is already taken", 409)
    if email is not None and db.execute(
        "SELECT 1 FROM users WHERE email = ?", (email,)
    ).fetchone():
        return error("Email address is already in use", 409)

    cur = db.execute(
        "INSERT INTO users (username, password_hash, email, created_at) VALUES (?, ?, ?, ?)",
        (username, hash_password(password), email, utcnow()),
    )
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(user_public(row)), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required", 400)

    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/me")
def me():
    user, err = require_user()
    if err:
        return err
    return jsonify(user_public(user))


@app.patch("/api/me")
def update_me():
    user, err = require_user()
    if err:
        return err

    body = json_body()
    if "email" not in body:
        return error("Email is required", 400)
    email = body["email"]
    if email is None or (isinstance(email, str) and not email.strip()):
        email = None
    elif not valid_email(email):
        return error("Email address is not valid", 400)
    else:
        email = email.strip()

    db = get_db()
    if email is not None and db.execute(
        "SELECT 1 FROM users WHERE email = ? AND id != ?", (email, user["id"])
    ).fetchone():
        return error("Email address is already in use", 409)
    db.execute("UPDATE users SET email = ? WHERE id = ?", (email, user["id"]))
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
    return jsonify(user_public(row))


@app.post("/api/me/password")
def change_password():
    user, err = require_user()
    if err:
        return err

    body = json_body()
    current = body.get("current_password")
    new = body.get("new_password")
    if not isinstance(current, str) or not verify_password(current, user["password_hash"]):
        return error("Current password is incorrect", 401)
    if not valid_password(new):
        return error("New password must be at least 8 characters", 400)

    db = get_db()
    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_password(new), user["id"]),
    )
    db.execute("DELETE FROM reset_tokens WHERE user_id = ?", (user["id"],))
    db.commit()
    return jsonify({"ok": True})


@app.post("/api/auth/password-reset")
def request_password_reset():
    body = json_body()
    username = body.get("username")
    email = body.get("email")

    user = None
    db = get_db()
    if isinstance(username, str) and username.strip():
        user = db.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
    elif isinstance(email, str) and email.strip():
        user = db.execute(
            "SELECT * FROM users WHERE email = ?", (email.strip(),)
        ).fetchone()

    if user is not None and user["email"]:
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
            (
                hashlib.sha256(token.encode()).hexdigest(),
                user["id"],
                time.time() + TOKEN_TTL_SECONDS,
                utcnow(),
            ),
        )
        link = f"{request.url_root.rstrip('/')}/reset?token={token}"
        body_text = (
            "You asked to reset your password.\n\n"
            f"Use this single-use link to choose a new password:\n{link}\n\n"
            "If you did not request this, you can ignore this message."
        )
        db.execute(
            "INSERT INTO outbox (recipient, subject, body, sent_at) VALUES (?, ?, ?, ?)",
            (user["email"], "Reset your password", body_text, utcnow()),
        )
        db.commit()

    return jsonify(
        {"message": "If the account exists, a reset link is on its way"}
    )


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset():
    body = json_body()
    token = body.get("token")
    new_password = body.get("new_password")

    if not isinstance(token, str) or not token:
        return error("Token is required", 400)
    if not valid_password(new_password):
        return error("New password must be at least 8 characters", 400)

    db = get_db()
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    row = db.execute(
        "SELECT * FROM reset_tokens WHERE token_hash = ?", (token_hash,)
    ).fetchone()
    if row is None or row["used_at"] is not None or row["expires_at"] < time.time():
        return error("Reset link is invalid or has expired", 400)

    db.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (hash_password(new_password), row["user_id"]),
    )
    db.execute(
        "UPDATE reset_tokens SET used_at = ? WHERE token_hash = ?",
        (utcnow(), token_hash),
    )
    db.execute("DELETE FROM sessions WHERE user_id = ?", (row["user_id"],))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/outbox")
def list_outbox():
    to = request.args.get("to")
    if not to:
        return error("Query parameter 'to' is required", 400)
    rows = get_db().execute(
        "SELECT * FROM outbox WHERE recipient = ? COLLATE NOCASE ORDER BY id DESC",
        (to.strip(),),
    ).fetchall()
    return jsonify({"items": [message_from_row(r) for r in rows]})


@app.errorhandler(404)
def not_found(_err):
    if request.path.startswith("/api"):
        return error("Not found", 404)
    return serve_frontend("index.html")


@app.errorhandler(405)
def method_not_allowed(_err):
    if request.path.startswith("/api"):
        return error("Method not allowed", 405)
    return serve_frontend("index.html")


@app.get("/api/<path:_rest>")
@app.post("/api/<path:_rest>")
@app.patch("/api/<path:_rest>")
def api_not_found(_rest: str):
    return error("Not found", 404)


def serve_frontend(path: str):
    if DIST.is_dir() and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    return serve_frontend(path)


init_db()
