"""Base64 converter API and frontend server."""

import base64
import binascii
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"
PREVIEW_LEN = 200
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.executescript(
            """
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
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_conversions_user
                ON conversions(user_id, id DESC);
            """
        )
        db.commit()
    finally:
        db.close()


init_db()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def error(message, status):
    return jsonify({"error": message}), status


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object")
    return data


def preview(value):
    return value[:PREVIEW_LEN]


def convert(direction, value):
    if direction == "encode":
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    if direction == "decode":
        try:
            raw = base64.b64decode(value.strip(), validate=True)
        except (binascii.Error, ValueError):
            raise ValueError("Invalid base64 input")
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("Decoded data is not valid UTF-8")
    raise ValueError("direction must be 'encode' or 'decode'")


def conversion_dict(row, include_output=False):
    result = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }
    if include_output:
        result["output"] = row["output"]
    return result


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        """SELECT u.id, u.username FROM tokens t
           JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
        (token,),
    ).fetchone()
    return row


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        return fn(user["id"], *args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    try:
        data = body()
    except ValueError as exc:
        return error(str(exc), 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    try:
        data = body()
    except ValueError as exc:
        return error(str(exc), 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    db = get_db()
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/base64/encode")
def encode_endpoint():
    try:
        data = body()
    except ValueError as exc:
        return error(str(exc), 400)
    text = data.get("text")
    if not isinstance(text, str):
        return error("text must be a string", 400)
    return jsonify({"encoded": convert("encode", text)})


@app.post("/api/base64/decode")
def decode_endpoint():
    try:
        data = body()
    except ValueError as exc:
        return error(str(exc), 400)
    encoded = data.get("encoded")
    if not isinstance(encoded, str):
        return error("encoded must be a string", 400)
    try:
        text = convert("decode", encoded)
    except ValueError as exc:
        return error(str(exc), 400)
    return jsonify({"text": text})


@app.post("/api/conversions")
@require_auth
def create_conversion(user_id):
    try:
        data = body()
    except ValueError as exc:
        return error(str(exc), 400)
    direction = data.get("direction")
    value = data.get("input")
    if direction not in ("encode", "decode"):
        return error("direction must be 'encode' or 'decode'", 400)
    if not isinstance(value, str):
        return error("input must be a string", 400)
    try:
        output = convert(direction, value)
    except ValueError as exc:
        return error(str(exc), 400)
    db = get_db()
    cur = db.execute(
        """INSERT INTO conversions (user_id, direction, input, output, created_at)
           VALUES (?, ?, ?, ?, ?)""",
        (user_id, direction, value, output, now_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM conversions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(conversion_dict(row, include_output=True))


def pagination():
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    page = max(1, page)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    return page, page_size


@app.get("/api/conversions")
@require_auth
def list_conversions(user_id):
    page, page_size = pagination()
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM conversions WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    rows = db.execute(
        """SELECT * FROM conversions WHERE user_id = ?
           ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
        (user_id, page_size, (page - 1) * page_size),
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
@require_auth
def delete_conversion(user_id, conversion_id):
    db = get_db()
    cur = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, user_id),
    )
    db.commit()
    if cur.rowcount == 0:
        return error("Conversion not found", 404)
    return jsonify({"status": "deleted", "id": conversion_id})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
