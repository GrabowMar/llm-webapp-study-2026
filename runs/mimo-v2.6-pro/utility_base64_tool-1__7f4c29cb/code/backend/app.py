"""Flask entry point: base64 converter API + frontend serving."""

import base64
import binascii
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
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LEN = 80
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- database


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
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
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            direction TEXT NOT NULL,
            input TEXT NOT NULL,
            output TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_conversions_user
            ON conversions (user_id, id);
        """
    )
    db.commit()
    db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ------------------------------------------------------------------ helpers


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def error(message: str, status: int):
    return jsonify({"error": message}), status


def preview(value: str) -> str:
    if len(value) <= PREVIEW_LEN:
        return value
    return value[: PREVIEW_LEN - 3] + "..."


def encode_text(text: str) -> str:
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_text(encoded: str) -> str:
    raw = base64.b64decode(encoded, validate=True)
    return raw.decode("utf-8")


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id"
        " WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        return view(user, *args, **kwargs)

    return wrapped


def convert(direction: str, value: str):
    """Return (output, error_response)."""
    if direction == "encode":
        return encode_text(value), None
    try:
        return decode_text(value), None
    except UnicodeDecodeError:
        return None, error("decoded data is not valid UTF-8", 400)
    except (binascii.Error, ValueError):
        return None, error("invalid base64 input", 400)


def conversion_dict(row: sqlite3.Row, with_output: bool = False) -> dict:
    item = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }
    if with_output:
        item["output"] = row["output"]
    return item


# -------------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("JSON body required", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return error("username and password are required", 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username already taken", 409)

    created_at = now_iso()
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), created_at),
    )
    user_id = cur.lastrowid
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, created_at),
    )
    db.commit()
    return jsonify({"username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("JSON body required", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()

    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


# ------------------------------------------------------------------ base64


@app.post("/api/base64/encode")
def encode_endpoint():
    data = json_body()
    if data is None:
        return error("JSON body required", 400)
    text = data.get("text")
    if not isinstance(text, str):
        return error("text is required", 400)
    return jsonify({"encoded": encode_text(text)}), 200


@app.post("/api/base64/decode")
def decode_endpoint():
    data = json_body()
    if data is None:
        return error("JSON body required", 400)
    encoded = data.get("encoded")
    if not isinstance(encoded, str):
        return error("encoded is required", 400)
    text, err = convert("decode", encoded)
    if err is not None:
        return err
    return jsonify({"text": text}), 200


# ------------------------------------------------------------- conversions


@app.post("/api/conversions")
@require_auth
def create_conversion(user):
    data = json_body()
    if data is None:
        return error("JSON body required", 400)
    direction = data.get("direction")
    value = data.get("input")
    if direction not in ("encode", "decode"):
        return error("direction must be 'encode' or 'decode'", 400)
    if not isinstance(value, str):
        return error("input is required", 400)

    output, err = convert(direction, value)
    if err is not None:
        return err

    db = get_db()
    cur = db.execute(
        "INSERT INTO conversions (user_id, direction, input, output, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (user["id"], direction, value, output, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM conversions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(conversion_dict(row, with_output=True)), 201


@app.get("/api/conversions")
@require_auth
def list_conversions(user):
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except ValueError:
        return error("page and page_size must be integers", 400)
    if page < 1:
        return error("page must be >= 1", 400)
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        return error("page_size must be between 1 and %d" % MAX_PAGE_SIZE, 400)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM conversions WHERE user_id = ?", (user["id"],)
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM conversions WHERE user_id = ?"
        " ORDER BY id DESC LIMIT ? OFFSET ?",
        (user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [conversion_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.delete("/api/conversions/<int:conversion_id>")
@require_auth
def delete_conversion(user, conversion_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM conversions WHERE id = ? AND user_id = ?",
        (conversion_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return error("conversion not found", 404)
    return jsonify({"ok": True}), 200


# ----------------------------------------------------------------- health


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
