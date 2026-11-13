"""Image gallery: Flask API + static frontend."""

from __future__ import annotations

import base64
import binascii
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_file, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = BASE / "data"
FILES_DIR = DATA_DIR / "files"
DB_PATH = DATA_DIR / "gallery.db"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                title TEXT,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                storage_name TEXT NOT NULL
            )
            """
        )


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


def current_user() -> sqlite3.Row | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    return row


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError(401, "authentication required")
    return user


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(413)
def handle_too_large(_err):
    return jsonify({"error": "file too large"}), 413


def detect_content_type(data: bytes) -> str | None:
    if data.startswith(PNG_SIGNATURE):
        return "image/png"
    if data.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    return None


def decode_data(raw: str) -> bytes:
    if not isinstance(raw, str) or not raw.strip():
        raise ApiError(400, "data is required")
    raw = raw.strip()
    if raw.startswith("data:"):
        if "," not in raw:
            raise ApiError(400, "invalid data")
        raw = raw.split(",", 1)[1]
    try:
        return base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "data is not valid base64")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username:
        raise ApiError(400, "username is required")
    if not password:
        raise ApiError(400, "password is required")

    password_hash = generate_password_hash(password)
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, password_hash, now_iso()),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "username already exists")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        raise ApiError(400, "username and password are required")

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()

    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "invalid username or password")

    token = secrets.token_hex(32)
    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], now_iso()),
        )
    return jsonify({"token": token})


@app.get("/api/images")
def list_images():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    if page_size > 100:
        page_size = 100

    with get_db() as conn:
        total = conn.execute("SELECT COUNT(*) AS c FROM images").fetchone()["c"]
        rows = conn.execute(
            """
            SELECT i.*, u.username
            FROM images i
            JOIN users u ON u.id = i.uploader_id
            ORDER BY i.id DESC
            LIMIT ? OFFSET ?
            """,
            (page_size, (page - 1) * page_size),
        ).fetchall()

    items = [image_dict(r) for r in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/images")
def create_image():
    user = require_user()
    body = request.get_json(silent=True) or {}
    filename = (body.get("filename") or "").strip()
    if not filename:
        raise ApiError(400, "filename is required")
    title = body.get("title")
    if title is not None:
        title = str(title).strip() or None

    data = decode_data(body.get("data", ""))
    content_type = detect_content_type(data)
    if content_type is None:
        raise ApiError(400, "only PNG and JPEG images are supported")

    storage_name = secrets.token_hex(16)
    path = FILES_DIR / storage_name
    path.write_bytes(data)

    try:
        with get_db() as conn:
            cur = conn.execute(
                """
                INSERT INTO images
                    (filename, title, content_type, size_bytes, uploaded_at, uploader_id, storage_name)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    filename,
                    title,
                    content_type,
                    len(data),
                    now_iso(),
                    user["id"],
                    storage_name,
                ),
            )
            image_id = cur.lastrowid
            row = conn.execute(
                """
                SELECT i.*, u.username
                FROM images i
                JOIN users u ON u.id = i.uploader_id
                WHERE i.id = ?
                """,
                (image_id,),
            ).fetchone()
    except Exception:
        path.unlink(missing_ok=True)
        raise

    return jsonify(image_dict(row)), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    with get_db() as conn:
        row = conn.execute(
            """
            SELECT i.*, u.username
            FROM images i
            JOIN users u ON u.id = i.uploader_id
            WHERE i.id = ?
            """,
            (image_id,),
        ).fetchone()
    if row is None:
        raise ApiError(404, "image not found")
    return jsonify(image_dict(row))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    with get_db() as conn:
        row = conn.execute(
            "SELECT storage_name, content_type, filename FROM images WHERE id = ?",
            (image_id,),
        ).fetchone()
    if row is None:
        raise ApiError(404, "image not found")
    path = FILES_DIR / row["storage_name"]
    if not path.is_file():
        raise ApiError(404, "image file not found")
    return send_file(path, mimetype=row["content_type"])


@app.delete("/api/images/<int:image_id>")
def delete_image(image_id: int):
    user = require_user()
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, uploader_id, storage_name FROM images WHERE id = ?",
            (image_id,),
        ).fetchone()
        if row is None:
            raise ApiError(404, "image not found")
        if row["uploader_id"] != user["id"]:
            raise ApiError(403, "only the uploader may delete this image")
        conn.execute("DELETE FROM images WHERE id = ?", (image_id,))

    (FILES_DIR / row["storage_name"]).unlink(missing_ok=True)
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
