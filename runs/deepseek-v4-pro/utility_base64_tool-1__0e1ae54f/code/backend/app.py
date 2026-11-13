"""Base64 converter Flask application."""

import base64
import binascii
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.sqlite3"

PREVIEW_LENGTH = 80

app = Flask(__name__, static_folder=None)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
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
        """
    )
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header.removeprefix("Bearer ").strip() if header.startswith("Bearer ") else ""
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        row = get_db().execute(
            "SELECT user_id FROM sessions WHERE token = ?", (token,)
        ).fetchone()
        if row is None:
            return jsonify({"error": "Invalid or expired token"}), 401
        g.user_id = row["user_id"]
        return fn(*args, **kwargs)

    return wrapper


def encode_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_text(encoded: str) -> str:
    return base64.b64decode(encoded, validate=True).decode("utf-8")


def make_preview(value: str) -> str:
    value = value.replace("\n", " ")
    if len(value) > PREVIEW_LENGTH:
        return value[:PREVIEW_LENGTH] + "..."
    return value


def conversion_payload(row, include_output=False):
    payload = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": make_preview(row["input"]),
        "output_preview": make_preview(row["output"]),
        "created_at": row["created_at"],
    }
    if include_output:
        payload["output"] = row["output"]
    return payload


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return jsonify({"error": "Username already taken"}), 409
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/base64/encode")
def encode():
    data = request.get_json(silent=True) or {}
    text = data.get("text")
    if text is None:
        return jsonify({"error": "text is required"}), 400
    return jsonify({"encoded": encode_text(text)})


@app.post("/api/base64/decode")
def decode():
    data = request.get_json(silent=True) or {}
    encoded = data.get("encoded")
    if encoded is None:
        return jsonify({"error": "encoded is required"}), 400
    try:
        text = decode_text(encoded)
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return jsonify({"error": "Invalid base64 input"}), 400
    return jsonify({"text": text})


@app.post("/api/conversions")
@require_auth
def create_conversion():
    data = request.get_json(silent=True) or {}
    direction = data.get("direction")
    value = data.get("input")
    if direction not in ("encode", "decode"):
        return jsonify({"error": "direction must be 'encode' or 'decode'"}), 400
    if value is None:
        return jsonify({"error": "input is required"}), 400
    if direction == "encode":
        output = encode_text(value)
    else:
        try:
            output = decode_text(value)
        except (binascii.Error, ValueError, UnicodeDecodeError):
            return jsonify({"error": "Invalid base64 input"}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO conversions (user_id, direction, input, output, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (g.user_id, direction, value, output, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM conversions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(conversion_payload(row, include_output=True)), 201


@app.get("/api/conversions")
@require_auth
def list_conversions():
    page = max(request.args.get("page", 1, type=int) or 1, 1)
    page_size = max(request.args.get("page_size", 10, type=int) or 10, 1)
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS c FROM conversions WHERE user_id = ?", (g.user_id,)
    ).fetchone()["c"]
    rows = db.execute(
        "SELECT * FROM conversions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [conversion_payload(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/conversions/<int:conversion_id>")
@require_auth
def delete_conversion(conversion_id):
    db = get_db()
    cur = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, g.user_id),
    )
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "Conversion not found"}), 404
    return jsonify({"status": "ok"})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
