"""Image gallery: JSON API, SQLite storage, and the built frontend."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from uuid import uuid4

from flask import Flask, g, jsonify, request, send_file, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("GALLERY_DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "gallery.sqlite3"
FILES_DIR = DATA_DIR / "files"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    with closing(get_db()) as conn:
        with conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL
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
                    uploader TEXT NOT NULL,
                    file_name TEXT NOT NULL
                );
                """
            )


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def api_error(message: str, status: int):
    return jsonify({"error": message}), status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        expected = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 200_000
        )
        return hmac.compare_digest(expected.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def credentials(body):
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, None, api_error("username is required", 400)
    if not isinstance(password, str) or not password:
        return None, None, api_error("password is required", 400)
    return username.strip(), password, None


def issue_token(conn, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    return token


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return api_error("authentication required", 401)
        token = header[len("Bearer ") :].strip()
        if not token:
            return api_error("authentication required", 401)
        with closing(get_db()) as conn:
            row = conn.execute(
                """SELECT u.id AS id, u.username AS username
                   FROM tokens t JOIN users u ON u.id = t.user_id
                   WHERE t.token = ?""",
                (token,),
            ).fetchone()
        if row is None:
            return api_error("invalid or expired token", 401)
        g.user = {"id": row["id"], "username": row["username"]}
        return view(*args, **kwargs)

    return wrapper


def image_json(row: sqlite3.Row) -> dict:
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


def detect_content_type(blob: bytes) -> tuple[str, str] | None:
    if blob.startswith(PNG_SIGNATURE):
        return "image/png", ".png"
    if blob.startswith(JPEG_SIGNATURE):
        return "image/jpeg", ".jpg"
    return None


def decode_base64(value: str) -> bytes | None:
    encoded = re.sub(r"\s+", "", value.strip())
    if encoded.lower().startswith("data:"):
        _, _, encoded = encoded.partition(",")
        if not encoded:
            return None
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        try:
            return base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
        except (binascii.Error, ValueError):
            return None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return api_error("expected a JSON object", 400)
    username, password, err = credentials(body)
    if err:
        return err
    with closing(get_db()) as conn:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            return api_error("username already taken", 409)
        with conn:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, hash_password(password)),
            )
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return api_error("expected a JSON object", 400)
    username, password, err = credentials(body)
    if err:
        return err
    with closing(get_db()) as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            return api_error("invalid username or password", 401)
        with conn:
            token = issue_token(conn, row["id"])
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@require_auth
def logout():
    token = request.headers.get("Authorization", "")[len("Bearer ") :].strip()
    with closing(get_db()) as conn:
        with conn:
            conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
    return jsonify({"ok": True})


@app.get("/api/images")
def list_images():
    def positive_int(name: str, default: int, maximum: int | None = None) -> int:
        try:
            value = int(request.args.get(name, default))
        except (TypeError, ValueError):
            return default
        if value < 1:
            return default
        return min(value, maximum) if maximum is not None else value

    page = positive_int("page", 1)
    page_size = positive_int("page_size", 20, 100)
    with closing(get_db()) as conn:
        total = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
        rows = conn.execute(
            "SELECT * FROM images ORDER BY uploaded_at DESC, id DESC LIMIT ? OFFSET ?",
            (page_size, (page - 1) * page_size),
        ).fetchall()
    return jsonify(
        {
            "items": [image_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/images")
@require_auth
def upload_image():
    body = json_body()
    if body is None:
        return api_error("expected a JSON object", 400)
    filename = body.get("filename")
    if not isinstance(filename, str) or not filename.strip():
        return api_error("filename is required", 400)
    raw_data = body.get("data")
    if not isinstance(raw_data, str) or not raw_data.strip():
        return api_error("data is required", 400)
    title = body.get("title")
    if title is not None and not isinstance(title, str):
        return api_error("title must be a string", 400)

    blob = decode_base64(raw_data)
    if not blob:
        return api_error("data must be valid base64 image data", 400)
    detected = detect_content_type(blob)
    if detected is None:
        return api_error("only PNG and JPEG images are supported", 400)
    content_type, extension = detected

    file_name = f"{uuid4().hex}{extension}"
    file_path = FILES_DIR / file_name
    try:
        file_path.write_bytes(blob)
        with closing(get_db()) as conn:
            with conn:
                cursor = conn.execute(
                    """INSERT INTO images
                       (filename, title, content_type, size_bytes, uploaded_at, uploader, file_name)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (
                        filename.strip()[:255],
                        title.strip() or None if isinstance(title, str) else None,
                        content_type,
                        len(blob),
                        now_iso(),
                        g.user["username"],
                        file_name,
                    ),
                )
                row = conn.execute("SELECT * FROM images WHERE id = ?", (cursor.lastrowid,)).fetchone()
    except Exception:
        file_path.unlink(missing_ok=True)
        raise
    return jsonify(image_json(row)), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    with closing(get_db()) as conn:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        return api_error("image not found", 404)
    return jsonify(image_json(row))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    with closing(get_db()) as conn:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    if row is None:
        return api_error("image not found", 404)
    file_path = FILES_DIR / row["file_name"]
    if not file_path.is_file():
        return api_error("image file not found", 404)
    response = send_file(
        file_path,
        mimetype=row["content_type"],
        as_attachment=False,
        download_name=row["filename"],
    )
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.delete("/api/images/<int:image_id>")
@require_auth
def delete_image(image_id: int):
    with closing(get_db()) as conn:
        row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
        if row is None:
            return api_error("image not found", 404)
        if row["uploader"] != g.user["username"]:
            return api_error("only the uploader may delete this image", 403)
        with conn:
            conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
    (FILES_DIR / row["file_name"]).unlink(missing_ok=True)
    return jsonify({"ok": True})


@app.errorhandler(413)
def too_large(_error):
    return api_error("request body too large", 413)


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return api_error("not found", 404)
    return frontend("index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
