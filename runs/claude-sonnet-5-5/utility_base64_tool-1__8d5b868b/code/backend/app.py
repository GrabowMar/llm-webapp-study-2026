"""Flask entry point: base64 converter API and frontend host."""

import base64
import binascii
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LENGTH = 100
MAX_USERNAME = 64
MAX_PASSWORD = 256
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
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
CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversions(user_id, id DESC);
"""


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object")
    return data


def require_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError("Authentication required", 401)
    row = db().execute(
        "SELECT users.id, users.username FROM tokens JOIN users ON users.id = tokens.user_id "
        "WHERE tokens.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None:
        raise ApiError("Invalid or expired token", 401)
    g.token_hash = hash_token(token)
    return row


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        message = err.description or err.name
        if err.code == 413:
            message = "Request body too large"
        return jsonify({"error": message}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def encode_text(text) -> str:
    if not isinstance(text, str):
        raise ApiError("'text' must be a string")
    try:
        raw = text.encode("utf-8")
    except UnicodeEncodeError:
        raise ApiError("'text' is not valid Unicode text")
    return base64.b64encode(raw).decode("ascii")


def decode_text(encoded) -> str:
    if not isinstance(encoded, str):
        raise ApiError("'encoded' must be a string")
    compact = "".join(encoded.split())
    try:
        raw = base64.b64decode(compact.encode("ascii"), validate=True)
    except (binascii.Error, UnicodeEncodeError, ValueError):
        raise ApiError("Input is not valid base64")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ApiError("Decoded data is not valid UTF-8 text")


def preview(value: str) -> str:
    if len(value) <= PREVIEW_LENGTH:
        return value
    return value[:PREVIEW_LENGTH] + "…"


def conversion_dict(row: sqlite3.Row, full: bool = False) -> dict:
    data = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }
    if full:
        data["output"] = row["output"]
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError("'username' is required")
    username = username.strip()
    if len(username) > MAX_USERNAME:
        raise ApiError(f"'username' must be at most {MAX_USERNAME} characters")
    if not isinstance(password, str) or not password:
        raise ApiError("'password' is required")
    if len(password) > MAX_PASSWORD:
        raise ApiError(f"'password' must be at most {MAX_PASSWORD} characters")
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError("Username is already taken", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError("'username' and 'password' are required")
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], now()),
    )
    conn.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
def logout():
    require_user()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
    conn.commit()
    return "", 204


@app.post("/api/base64/encode")
def api_encode():
    data = json_body()
    if "text" not in data:
        raise ApiError("'text' is required")
    return jsonify({"encoded": encode_text(data["text"])})


@app.post("/api/base64/decode")
def api_decode():
    data = json_body()
    if "encoded" not in data:
        raise ApiError("'encoded' is required")
    return jsonify({"text": decode_text(data["encoded"])})


@app.post("/api/conversions")
def create_conversion():
    user = require_user()
    data = json_body()
    direction = data.get("direction")
    if direction not in ("encode", "decode"):
        raise ApiError("'direction' must be 'encode' or 'decode'")
    if "input" not in data:
        raise ApiError("'input' is required")
    value = data["input"]
    if not isinstance(value, str):
        raise ApiError("'input' must be a string")
    output = encode_text(value) if direction == "encode" else decode_text(value)
    conn = db()
    cur = conn.execute(
        "INSERT INTO conversions (user_id, direction, input, output, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (user["id"], direction, value, output, now()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM conversions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(conversion_dict(row, full=True)), 201


def int_param(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(f"'{name}' must be an integer")
    if value < 1:
        raise ApiError(f"'{name}' must be at least 1")
    return value


@app.get("/api/conversions")
def list_conversions():
    user = require_user()
    page = int_param("page", 1)
    page_size = min(int_param("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM conversions WHERE user_id = ?", (user["id"],)
    ).fetchone()[0]
    rows = conn.execute(
        "SELECT * FROM conversions WHERE user_id = ? ORDER BY created_at DESC, id DESC "
        "LIMIT ? OFFSET ?",
        (user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [conversion_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/conversions/<int:conversion_id>")
def delete_conversion(conversion_id: int):
    user = require_user()
    conn = db()
    cur = conn.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?", (conversion_id, user["id"])
    )
    conn.commit()
    if cur.rowcount == 0:
        raise ApiError("Conversion not found", 404)
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError("Not found", 404)
    target = safe_join(str(DIST), path)
    if target is not None and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
