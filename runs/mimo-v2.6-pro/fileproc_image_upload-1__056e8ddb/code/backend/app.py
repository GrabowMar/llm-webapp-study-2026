"""Flask image gallery: JSON API under /api and the built frontend."""

from __future__ import annotations

import base64
import binascii
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import Response
from flask import g
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
IMAGE_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "gallery.db"
DIST = BASE_DIR / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

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
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    storage_name TEXT NOT NULL,
    uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(SCHEMA)


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def api_error(message: str, status: int):
    return {"error": message}, status


def json_body():
    data = request.get_json(silent=True)
    if data is None:
        data = request.get_json(force=True, silent=True)
    return data


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return api_error("authentication required", 401)
        token = header[len("Bearer "):].strip()
        if not token:
            return api_error("authentication required", 401)
        row = get_db().execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if row is None:
            return api_error("invalid or expired token", 401)
        g.user_id = row["id"]
        g.username = row["username"]
        return view(*args, **kwargs)

    return wrapped


def image_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "uploaded_at": row["uploaded_at"],
        "url": f"/api/images/{row['id']}/file",
        "uploader": row["username"],
    }


IMAGE_SELECT = (
    "SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes,"
    " i.uploaded_at, i.uploader_id, u.username"
    " FROM images i JOIN users u ON u.id = i.uploader_id"
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    if not isinstance(body, dict):
        return api_error("a JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str):
        return api_error("username must be a string", 400)
    if not isinstance(password, str):
        return api_error("password must be a string", 400)
    username = username.strip()
    if not username:
        return api_error("username must not be empty", 400)
    if not password:
        return api_error("password must not be empty", 400)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return api_error("username already taken", 409)
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password, method="pbkdf2:sha256:600000"), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return api_error("username already taken", 409)
    return {"username": username}, 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if not isinstance(body, dict):
        return api_error("a JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return api_error("username is required", 400)
    if not isinstance(password, str) or not password:
        return api_error("password is required", 400)
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return {"token": token}


@app.get("/api/images")
def list_images():
    page = request.args.get("page", "1")
    page_size = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(page)
        page_size = int(page_size)
    except ValueError:
        return api_error("page and page_size must be integers", 400)
    if page < 1:
        return api_error("page must be at least 1", 400)
    if page_size < 1:
        return api_error("page_size must be at least 1", 400)
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM images").fetchone()["n"]
    rows = db.execute(
        IMAGE_SELECT + " ORDER BY i.uploaded_at DESC, i.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [image_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/images")
@require_auth
def create_image():
    body = json_body()
    if not isinstance(body, dict):
        return api_error("a JSON body is required", 400)
    filename = body.get("filename")
    raw = body.get("data")
    title = body.get("title")
    if not isinstance(filename, str):
        return api_error("filename must be a string", 400)
    filename = filename.strip()
    if not filename:
        return api_error("filename must not be empty", 400)
    if not isinstance(raw, str):
        return api_error("data must be a base64 string", 400)
    if title is not None and not isinstance(title, str):
        return api_error("title must be a string", 400)

    payload = raw.strip()
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]
    payload = "".join(payload.split())
    if not payload:
        return api_error("image data is empty", 400)
    payload += "=" * (-len(payload) % 4)
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return api_error("data is not valid base64", 400)
    if not data:
        return api_error("image data is empty", 400)

    if data.startswith(PNG_MAGIC):
        content_type = "image/png"
    elif data.startswith(JPEG_MAGIC):
        content_type = "image/jpeg"
    else:
        return api_error("unsupported image format: only PNG and JPEG are allowed", 400)

    storage_name = uuid.uuid4().hex + ".img"
    (IMAGE_DIR / storage_name).write_bytes(data)

    db = get_db()
    cur = db.execute(
        "INSERT INTO images (filename, title, content_type, size_bytes,"
        " uploaded_at, storage_name, uploader_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (filename, title, content_type, len(data), now_iso(), storage_name, g.user_id),
    )
    db.commit()
    row = db.execute(IMAGE_SELECT + " WHERE i.id = ?", (cur.lastrowid,)).fetchone()
    return image_dict(row), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    row = get_db().execute(
        IMAGE_SELECT + " WHERE i.id = ?", (image_id,)
    ).fetchone()
    if row is None:
        return api_error("image not found", 404)
    return image_dict(row)


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = get_db().execute(
        "SELECT content_type, storage_name FROM images WHERE id = ?",
        (image_id,),
    ).fetchone()
    if row is None:
        return api_error("image not found", 404)
    path = IMAGE_DIR / row["storage_name"]
    if not path.is_file():
        return api_error("image not found", 404)
    return Response(path.read_bytes(), content_type=row["content_type"])


@app.delete("/api/images/<int:image_id>")
@require_auth
def delete_image(image_id: int):
    db = get_db()
    row = db.execute(
        "SELECT uploader_id, storage_name FROM images WHERE id = ?", (image_id,)
    ).fetchone()
    if row is None:
        return api_error("image not found", 404)
    if row["uploader_id"] != g.user_id:
        return api_error("only the uploader may delete this image", 403)
    db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    db.commit()
    (IMAGE_DIR / row["storage_name"]).unlink(missing_ok=True)
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(error):
    if request.path == "/api" or request.path.startswith("/api/"):
        return api_error("not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(error):
    return api_error("method not allowed", 405)
