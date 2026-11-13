"""Flask entry point: image gallery API and frontend hosting."""

from __future__ import annotations

import base64
import binascii
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_file, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
FILES_DIR = DATA_DIR / "files"
DB_PATH = DATA_DIR / "gallery.db"
DIST = BASE_DIR / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_CONTENT_LENGTH = 32 * 1024 * 1024

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT COLLATE NOCASE NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    stored_name TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_images_recent ON images (uploaded_at DESC, id DESC);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def detect_content_type(data: bytes) -> str | None:
    if data.startswith(PNG_MAGIC):
        return "image/png"
    if data.startswith(JPEG_MAGIC):
        return "image/jpeg"
    return None


def decode_base64(payload: str) -> bytes:
    payload = "".join(payload.split())
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]
    payload += "=" * (-len(payload) % 4)
    return base64.b64decode(payload, validate=True)


app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)


def error(message: str, status: int):
    return jsonify({"error": message}), status


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def image_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "uploaded_at": row["uploaded_at"],
        "url": f"/api/images/{row['id']}/file",
        "uploader": row["uploader"],
    }


def fetch_image(image_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes,
               i.stored_name, i.uploaded_at, i.user_id, u.username AS uploader
        FROM images i
        JOIN users u ON u.id = i.user_id
        WHERE i.id = ?
        """,
        (image_id,),
    ).fetchone()


def parse_query_int(name: str, default: int, minimum: int, maximum: int):
    raw = request.args.get(name)
    if raw is None:
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, error(f"{name} must be an integer", 400)
    value = max(minimum, min(maximum, value))
    return value, None


@app.errorhandler(404)
def not_found(_e):
    return jsonify({"error": "not found"}), 404


@app.errorhandler(405)
def method_not_allowed(_e):
    return jsonify({"error": "method not allowed"}), 405


@app.errorhandler(413)
def payload_too_large(_e):
    return jsonify({"error": "request payload too large"}), 413


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


@app.get("/api/images")
def list_images():
    page, err = parse_query_int("page", 1, 1, 1_000_000)
    if err:
        return err
    page_size, err = parse_query_int("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    if err:
        return err
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    rows = db.execute(
        """
        SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes,
               i.uploaded_at, i.user_id, u.username AS uploader
        FROM images i
        JOIN users u ON u.id = i.user_id
        ORDER BY i.uploaded_at DESC, i.id DESC
        LIMIT ? OFFSET ?
        """,
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [image_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/images")
@login_required
def create_image():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error("JSON body required", 400)
    filename = body.get("filename")
    data = body.get("data")
    title = body.get("title")
    if not isinstance(filename, str) or not filename.strip():
        return error("filename is required", 400)
    if not isinstance(data, str) or not data.strip():
        return error("data is required", 400)
    if title is not None and not isinstance(title, str):
        return error("title must be a string", 400)
    try:
        raw = decode_base64(data)
    except (binascii.Error, ValueError):
        return error("data must be valid base64", 400)
    content_type = detect_content_type(raw)
    if content_type is None:
        return error("only PNG and JPEG images are supported", 400)
    stored_name = uuid.uuid4().hex
    path = FILES_DIR / stored_name
    path.write_bytes(raw)
    clean_title = title.strip() if isinstance(title, str) and title.strip() else None
    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO images (filename, title, content_type, size_bytes, stored_name, uploaded_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                filename.strip(),
                clean_title,
                content_type,
                len(raw),
                stored_name,
                now_iso(),
                g.user["id"],
            ),
        )
        db.commit()
    except sqlite3.Error:
        path.unlink(missing_ok=True)
        raise
    image_id = cursor.lastrowid
    return jsonify(image_to_dict(fetch_image(image_id))), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    row = fetch_image(image_id)
    if row is None:
        return error("image not found", 404)
    return jsonify(image_to_dict(row))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = fetch_image(image_id)
    if row is None:
        return error("image not found", 404)
    path = FILES_DIR / row["stored_name"]
    if not path.is_file():
        return error("image file not found", 404)
    return send_file(path, mimetype=row["content_type"], conditional=True)


@app.delete("/api/images/<int:image_id>")
@login_required
def delete_image(image_id: int):
    row = fetch_image(image_id)
    if row is None:
        return error("image not found", 404)
    if row["user_id"] != g.user["id"]:
        return error("only the uploader can delete this image", 403)
    db = get_db()
    db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    db.commit()
    (FILES_DIR / row["stored_name"]).unlink(missing_ok=True)
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
