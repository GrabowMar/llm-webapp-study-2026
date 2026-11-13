"""Flask entry point."""

import base64
import binascii
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LENGTH = 100
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 256
TOKEN_TTL = timedelta(days=30)
DUMMY_HASH = generate_password_hash("dummy-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('encode', 'decode')),
    input TEXT NOT NULL,
    output TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversions_user
    ON conversions (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);
"""


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def string_field(data: dict, name: str) -> str:
    if name not in data or data[name] is None:
        raise ApiError(400, f"'{name}' is required")
    value = data[name]
    if not isinstance(value, str):
        raise ApiError(400, f"'{name}' must be a string")
    return value


def encode_text(text: str) -> str:
    try:
        raw = text.encode("utf-8")
    except UnicodeEncodeError:
        raise ApiError(400, "Text is not valid Unicode") from None
    return base64.b64encode(raw).decode("ascii")


def decode_text(encoded: str) -> str:
    compact = "".join(encoded.split())
    if not compact.isascii():
        raise ApiError(400, "Invalid base64: contains non-ASCII characters")
    if len(compact) % 4 != 0:
        raise ApiError(400, "Invalid base64: length must be a multiple of 4 (check padding)")
    try:
        raw = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "Invalid base64: contains characters outside the base64 alphabet or misplaced padding") from None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise ApiError(400, "Decoded data is not valid UTF-8 text") from None


def convert(direction: str, value: str) -> str:
    if direction == "encode":
        return encode_text(value)
    return decode_text(value)


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= iso(now_utc()):
        return None
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def preview(value: str) -> str:
    return value[:PREVIEW_LENGTH]


def serialize_conversion(row, include_output: bool = False) -> dict:
    data = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
        "input_length": len(row["input"]),
        "output_length": len(row["output"]),
    }
    if include_output:
        data["output"] = row["output"]
    return data


def positive_int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"'{name}' must be a positive integer") from None
    if value < 1:
        raise ApiError(400, f"'{name}' must be a positive integer")
    return value


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        messages = {
            404: "Not found",
            405: "Method not allowed",
            413: "Request body too large",
        }
        message = messages.get(err.code, err.description or err.name)
        return jsonify({"error": message}), err.code
    return err


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = string_field(data, "username").strip()
    password = string_field(data, "password")
    if not username:
        raise ApiError(400, "Username must not be empty")
    if len(username) > MAX_USERNAME_LENGTH:
        raise ApiError(400, f"Username must be at most {MAX_USERNAME_LENGTH} characters")
    if not password:
        raise ApiError(400, "Password must not be empty")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ApiError(400, f"Password must be at most {MAX_PASSWORD_LENGTH} characters")
    db = get_db()
    created = iso(now_utc())
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), created),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken") from None
    return jsonify({"id": cur.lastrowid, "username": username, "created_at": created}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = string_field(data, "username").strip()
    password = string_field(data, "password")
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = now_utc()
    db.execute("DELETE FROM tokens WHERE expires_at <= ?", (iso(now),))
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], iso(now), iso(now + TOKEN_TTL)),
    )
    db.commit()
    return {"token": token, "username": row["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    db.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


@app.post("/api/base64/encode")
def encode_endpoint():
    text = string_field(json_body(), "text")
    return {"encoded": encode_text(text)}


@app.post("/api/base64/decode")
def decode_endpoint():
    encoded = string_field(json_body(), "encoded")
    return {"text": decode_text(encoded)}


@app.post("/api/conversions")
@login_required
def create_conversion():
    data = json_body()
    direction = string_field(data, "direction")
    if direction not in ("encode", "decode"):
        raise ApiError(400, "'direction' must be 'encode' or 'decode'")
    value = string_field(data, "input")
    output = convert(direction, value)
    db = get_db()
    created = iso(now_utc())
    cur = db.execute(
        "INSERT INTO conversions (user_id, direction, input, output, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (g.user["id"], direction, value, output, created),
    )
    db.commit()
    row = db.execute("SELECT * FROM conversions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize_conversion(row, include_output=True)), 201


@app.get("/api/conversions")
@login_required
def list_conversions():
    page = positive_int_arg("page", 1)
    page_size = min(positive_int_arg("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM conversions WHERE user_id = ?", (g.user["id"],)
    ).fetchone()[0]
    rows = db.execute(
        "SELECT * FROM conversions WHERE user_id = ? "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (g.user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [serialize_conversion(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/conversions/<int:conversion_id>")
@login_required
def get_conversion(conversion_id: int):
    row = get_db().execute(
        "SELECT * FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Conversion not found")
    data = serialize_conversion(row, include_output=True)
    data["input"] = row["input"]
    return data


@app.delete("/api/conversions/<int:conversion_id>")
@login_required
def delete_conversion(conversion_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, g.user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        raise ApiError(404, "Conversion not found")
    return "", 204


@app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend build not found", 404
    return send_from_directory(DIST, "index.html")


init_db()
