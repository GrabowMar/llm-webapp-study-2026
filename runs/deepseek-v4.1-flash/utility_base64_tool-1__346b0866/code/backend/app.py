"""Flask entry point for the Base64 converter."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.sqlite3"

PREVIEW_LENGTH = 100
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
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
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS conversions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                direction TEXT NOT NULL,
                input TEXT NOT NULL,
                output TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_conversions_user
                ON conversions (user_id, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 240_000)
    return f"pbkdf2_sha256$240000${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    db = get_db()
    return db.execute(
        """
        SELECT users.id, users.username
        FROM sessions JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ?
        """,
        (token_digest(token.strip()),),
    ).fetchone()


def require_user() -> tuple[sqlite3.Row | None, tuple | None]:
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def preview(value: str) -> str:
    if len(value) <= PREVIEW_LENGTH:
        return value
    return value[:PREVIEW_LENGTH] + "..."


def encode_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_text(encoded: str) -> str:
    compact = "".join(encoded.split())
    try:
        raw = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid base64 input") from exc
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Decoded data is not valid UTF-8 text") from exc


def convert(direction: object, value: object) -> str:
    if direction not in ("encode", "decode"):
        raise ValueError("direction must be 'encode' or 'decode'")
    if not isinstance(value, str):
        raise ValueError("input must be a string")
    return encode_text(value) if direction == "encode" else decode_text(value)


def conversion_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required")
    if not isinstance(password, str) or not password:
        return error("Password is required")
    username = username.strip()
    if len(username) > 150:
        return error("Username is too long")
    if len(password) > 1024:
        return error("Password is too long")

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("Username is already taken", 409)
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("Username is already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required")
    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not verify_password(password, user["password_hash"]):
        return error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_digest(token), user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token, "username": user["username"]})


@app.get("/api/auth/me")
def me():
    user, failure = require_user()
    if failure:
        return failure
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_digest(token.strip()),))
        db.commit()
    return jsonify({"ok": True})


@app.post("/api/base64/encode")
def base64_encode():
    body = json_body()
    text = body.get("text")
    if not isinstance(text, str):
        return error("text must be a string")
    return jsonify({"encoded": encode_text(text)})


@app.post("/api/base64/decode")
def base64_decode():
    body = json_body()
    encoded = body.get("encoded")
    if not isinstance(encoded, str):
        return error("encoded must be a string")
    try:
        text = decode_text(encoded)
    except ValueError as exc:
        return error(str(exc))
    return jsonify({"text": text})


@app.post("/api/conversions")
def create_conversion():
    user, failure = require_user()
    if failure:
        return failure
    body = json_body()
    direction = body.get("direction")
    value = body.get("input")
    try:
        output = convert(direction, value)
    except ValueError as exc:
        return error(str(exc))

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO conversions (user_id, direction, input, output, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user["id"], direction, value, output, utcnow()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM conversions WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    result = conversion_dict(row)
    result["output"] = row["output"]
    return jsonify(result)


@app.get("/api/conversions")
def list_conversions():
    user, failure = require_user()
    if failure:
        return failure
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        return error("page and page_size must be integers")
    page = max(1, page)
    page_size = min(max(1, page_size), MAX_PAGE_SIZE)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM conversions WHERE user_id = ?", (user["id"],)
    ).fetchone()[0]
    rows = db.execute(
        """
        SELECT * FROM conversions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [conversion_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/conversions/<int:conversion_id>")
def delete_conversion(conversion_id: int):
    user, failure = require_user()
    if failure:
        return failure
    db = get_db()
    cursor = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, user["id"]),
    )
    db.commit()
    if cursor.rowcount == 0:
        return error("Conversion not found", 404)
    return jsonify({"ok": True})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
