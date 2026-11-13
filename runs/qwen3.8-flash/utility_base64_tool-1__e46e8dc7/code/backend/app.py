"""Flask entry point for the base64 converter API and frontend."""

import base64
import binascii
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("./data")
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)

PREVIEW_CHARS = 100


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, "_db", None)
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
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            direction TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversions (user_id, created_at);
        """
    )
    db.commit()
    db.close()


def signin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = None
        if auth.startswith("Bearer "):
            token = auth[len("Bearer "):].strip()
        user = None
        if token:
            row = get_db().execute(
                "SELECT u.id, u.username FROM tokens t"
                " JOIN users u ON u.id = t.user_id"
                " WHERE t.token = ?",
                (token,),
            ).fetchone()
            if row is not None:
                user = {"id": row["id"], "username": row["username"], "token": token}
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def json_body() -> dict:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return {}


def encode_base64(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_base64(data: str) -> str:
    cleaned = "".join(data.split())
    try:
        decoded = base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("input is not valid base64")
    try:
        return decoded.decode("utf-8")
    except UnicodeDecodeError:
        raise ValueError("base64 decodes to bytes that are not valid UTF-8")


def convert(direction: str, value: str) -> str:
    if direction == "encode":
        if not isinstance(value, str):
            raise ValueError("'input' must be a string")
        return encode_base64(value)
    if not isinstance(value, str):
        raise ValueError("'input' must be a string")
    return decode_base64(value)


def preview(text: str) -> str:
    return text[:PREVIEW_CHARS]


def conversion_row(row: sqlite3.Row, output: str | None = None) -> dict:
    item = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }
    if output is not None:
        item["output"] = output
    return item


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "'username' is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "'password' is required"}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already exists"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "'username' and 'password' are required"}), 400
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401
    token = uuid.uuid4().hex
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


@app.post("/api/base64/encode")
def api_encode():
    body = json_body()
    text = body.get("text", "")
    if not isinstance(text, str):
        return jsonify({"error": "'text' must be a string"}), 400
    return jsonify({"encoded": encode_base64(text)})


@app.post("/api/base64/decode")
def api_decode():
    body = json_body()
    encoded = body.get("encoded")
    if not isinstance(encoded, str):
        return jsonify({"error": "'encoded' is required"}), 400
    try:
        text = decode_base64(encoded)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"text": text})


@app.post("/api/conversions")
@signin_required
def create_conversion():
    body = json_body()
    direction = body.get("direction")
    value = body.get("input")
    if direction not in ("encode", "decode"):
        return jsonify({"error": "'direction' must be 'encode' or 'decode'"}), 400
    try:
        output = convert(direction, value)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    conv_id = uuid.uuid4().hex
    now = utcnow()
    get_db().execute(
        "INSERT INTO conversions (id, user_id, direction, input, output, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (conv_id, g.user["id"], direction, value, output, now),
    )
    get_db().commit()
    return jsonify(
        {
            "id": conv_id,
            "direction": direction,
            "input_preview": preview(value),
            "output_preview": preview(output),
            "created_at": now,
            "output": output,
        }
    ), 201


@app.get("/api/conversions")
@signin_required
def list_conversions():
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 10))
    except ValueError:
        return jsonify({"error": "'page' and 'page_size' must be integers"}), 400
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > 100:
        page_size = 100
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS c FROM conversions WHERE user_id = ?", (g.user["id"],)
    ).fetchone()["c"]
    rows = db.execute(
        "SELECT * FROM conversions WHERE user_id = ?"
        " ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
        (g.user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    items = [conversion_row(r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.delete("/api/conversions/<conv_id>")
@signin_required
def delete_conversion(conv_id: str):
    db = get_db()
    cur = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?", (conv_id, g.user["id"])
    )
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "conversion not found"}), 404
    return "", 204


@app.errorhandler(404)
def not_found(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return err


@app.errorhandler(405)
def method_not_allowed(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return err


@app.errorhandler(500)
def server_error(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "internal server error"}), 500
    return err


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    target = (DIST / path).resolve()
    dist_root = DIST.resolve()
    if target.is_file() and str(target).startswith(str(dist_root)):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
