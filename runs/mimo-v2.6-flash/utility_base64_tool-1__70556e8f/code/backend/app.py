"""Flask entry point: base64 converter API, accounts and frontend serving."""

from __future__ import annotations

import base64
import binascii
import hashlib
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
from werkzeug.exceptions import HTTPException

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path.cwd() / "data"
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LENGTH = 100
DEFAULT_PAGE_SIZE = 10
PBKDF2_ITERATIONS = 120_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    input_preview TEXT NOT NULL,
    output_preview TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversions_user
    ON conversions (user_id, id DESC);
"""

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    """Raised to answer with a JSON error payload."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    try:
        con.execute("PRAGMA journal_mode=WAL")
        con.executescript(SCHEMA)
        con.commit()
    finally:
        con.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def require_str(data: dict, field: str) -> str:
    if field not in data:
        raise ApiError(400, f"'{field}' is required")
    value = data[field]
    if not isinstance(value, str):
        raise ApiError(400, f"'{field}' must be a string")
    return value


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS
        )
    except (ValueError, TypeError):
        return False
    return secrets.compare_digest(digest.hex(), digest_hex)


def encode_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_encoded(encoded: str) -> str:
    compact = "".join(encoded.split())
    compact += "=" * (-len(compact) % 4)
    try:
        raw = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiError(400, "Invalid base64 input") from exc
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ApiError(400, "Decoded data is not valid UTF-8 text") from exc


def preview(text: str) -> str:
    return text[:PREVIEW_LENGTH]


def conversion_payload(row: sqlite3.Row, include_output: bool = False) -> dict:
    payload = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": row["input_preview"],
        "output_preview": row["output_preview"],
        "created_at": row["created_at"],
    }
    if include_output:
        payload["output"] = row["output"]
    return payload


def authenticated_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    token = parts[1].strip()
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = authenticated_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def positive_int(value: str | None, default: int, name: str) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ApiError(400, f"'{name}' must be an integer") from exc
    if parsed < 1:
        raise ApiError(400, f"'{name}' must be >= 1")
    return parsed


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify({"error": error.message}), error.status


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    if request.path.startswith("/api/"):
        return jsonify({"error": error.description}), error.code
    return error.get_response(request.environ)


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = require_str(data, "username").strip()
    password = require_str(data, "password")
    if not username:
        raise ApiError(400, "'username' must not be empty")
    if not password:
        raise ApiError(400, "'password' must not be empty")
    if len(username) > 150:
        raise ApiError(400, "'username' is too long")
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), now()),
        )
        db.commit()
    except sqlite3.IntegrityError as exc:
        raise ApiError(409, "Username is already taken") from exc
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = require_str(data, "username").strip()
    password = require_str(data, "password")
    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/base64/encode")
def api_encode():
    data = json_body()
    text = require_str(data, "text")
    return jsonify({"encoded": encode_text(text)})


@app.post("/api/base64/decode")
def api_decode():
    data = json_body()
    encoded = require_str(data, "encoded")
    return jsonify({"text": decode_encoded(encoded)})


@app.post("/api/conversions")
@require_auth
def create_conversion():
    data = json_body()
    direction = require_str(data, "direction")
    if direction not in ("encode", "decode"):
        raise ApiError(400, "'direction' must be 'encode' or 'decode'")
    value = require_str(data, "input")
    output = encode_text(value) if direction == "encode" else decode_encoded(value)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO conversions "
        "(user_id, direction, input, output, input_preview, output_preview, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            direction,
            value,
            output,
            preview(value),
            preview(output),
            now(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT id, direction, input_preview, output_preview, created_at, output "
        "FROM conversions WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(conversion_payload(row, include_output=True)), 201


@app.get("/api/conversions")
@require_auth
def list_conversions():
    page = positive_int(request.args.get("page"), 1, "page")
    page_size = positive_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE, "page_size")
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM conversions WHERE user_id = ?", (g.user["id"],)
    ).fetchone()[0]
    rows = db.execute(
        "SELECT id, direction, input_preview, output_preview, created_at "
        "FROM conversions WHERE user_id = ? "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (g.user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [conversion_payload(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/conversions/<int:conversion_id>")
@require_auth
def delete_conversion(conversion_id: int):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, g.user["id"]),
    )
    db.commit()
    if cursor.rowcount == 0:
        raise ApiError(404, "Conversion not found")
    return jsonify({"status": "deleted"})


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
