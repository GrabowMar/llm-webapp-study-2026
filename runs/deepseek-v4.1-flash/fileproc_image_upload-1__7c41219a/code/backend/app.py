"""Flask entry point for the image gallery."""

from __future__ import annotations

import base64
import binascii
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
IMAGES_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "gallery.db"

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
app.json.ensure_ascii = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=15)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    try:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

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
                stored_name TEXT NOT NULL UNIQUE,
                uploaded_at TEXT NOT NULL,
                uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_images_uploader
                ON images(uploader_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def error(message: str, status: int):
    return jsonify(error=message), status


def json_body() -> dict | None:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return get_db().execute(
        """
        SELECT u.id, u.username
        FROM tokens AS t
        JOIN users AS u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token.strip(),),
    ).fetchone()


def require_user() -> sqlite3.Row | None:
    return current_user()


def image_to_json(row: sqlite3.Row) -> dict:
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


IMAGE_SELECT = """
    SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes,
           i.uploaded_at, i.stored_name, i.uploader_id, u.username
    FROM images AS i
    JOIN users AS u ON u.id = i.uploader_id
"""


def decode_image_data(value: str) -> bytes | None:
    text = value.strip()
    if text.lower().startswith("data:"):
        match = re.match(r"^data:[^,]*;base64,", text, re.IGNORECASE)
        if not match:
            return None
        text = text[match.end() :]
    text = re.sub(r"\s+", "", text)
    if not text:
        return None
    text = text.replace("-", "+").replace("_", "/")
    text += "=" * (-len(text) % 4)
    try:
        return base64.b64decode(text, validate=True)
    except (binascii.Error, ValueError):
        return None


def detect_content_type(data: bytes) -> tuple[str, str] | None:
    if data.startswith(PNG_SIGNATURE):
        return "image/png", ".png"
    if data.startswith(JPEG_SIGNATURE):
        return "image/jpeg", ".jpg"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object.", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 400)
    username = username.strip()
    if not username or not password:
        return error("Username and password are required.", 400)
    if len(username) > 64:
        return error("Username must be at most 64 characters.", 400)
    if len(password) > 256:
        return error("Password must be at most 256 characters.", 400)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("Username is already taken.", 409)

    return jsonify(id=cursor.lastrowid, username=username), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object.", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 400)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify(token=token)


@app.get("/api/auth/me")
def auth_me():
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)
    return jsonify(id=user["id"], username=user["username"])


@app.get("/api/images")
def list_images():
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        return error("page and page_size must be integers.", 400)
    if page < 1 or page_size < 1:
        return error("page and page_size must be positive integers.", 400)

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    rows = db.execute(
        IMAGE_SELECT + " ORDER BY i.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        items=[image_to_json(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.post("/api/images")
def upload_image():
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)

    body = json_body()
    if body is None:
        return error("Request body must be a JSON object.", 400)
    filename = body.get("filename")
    data = body.get("data")
    title = body.get("title")
    if not isinstance(filename, str) or not filename.strip():
        return error("filename is required.", 400)
    if not isinstance(data, str) or not data.strip():
        return error("data is required.", 400)
    if title is not None and not isinstance(title, str):
        return error("title must be a string.", 400)

    if not filename.strip():
        return error("filename is required.", 400)
    if len(filename) > 255:
        return error("filename must be at most 255 characters.", 400)
    title = title.strip() if isinstance(title, str) else None
    if title == "":
        title = None
    if title is not None and len(title) > 255:
        return error("title must be at most 255 characters.", 400)

    blob = decode_image_data(data)
    if blob is None or not blob:
        return error("data must be valid base64-encoded image data.", 400)
    detected = detect_content_type(blob)
    if detected is None:
        return error("Unsupported image format. Only PNG and JPEG are allowed.", 400)
    content_type, extension = detected

    stored_name = f"{uuid.uuid4().hex}{extension}"
    path = IMAGES_DIR / stored_name
    path.write_bytes(blob)

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO images
                (filename, title, content_type, size_bytes, stored_name,
                 uploaded_at, uploader_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                filename,
                title,
                content_type,
                len(blob),
                stored_name,
                utcnow(),
                user["id"],
            ),
        )
        db.commit()
    except Exception:
        db.rollback()
        path.unlink(missing_ok=True)
        raise

    row = db.execute(IMAGE_SELECT + " WHERE i.id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(image_to_json(row)), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    row = get_db().execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        return error("Image not found.", 404)
    return jsonify(image_to_json(row))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = get_db().execute(
        "SELECT content_type, stored_name FROM images WHERE id = ?", (image_id,)
    ).fetchone()
    if row is None:
        return error("Image not found.", 404)
    path = IMAGES_DIR / row["stored_name"]
    if not path.is_file():
        return error("Image file not found.", 404)
    return Response(path.read_bytes(), mimetype=row["content_type"])


@app.delete("/api/images/<int:image_id>")
def delete_image(image_id: int):
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)

    db = get_db()
    row = db.execute(
        "SELECT uploader_id, stored_name FROM images WHERE id = ?", (image_id,)
    ).fetchone()
    if row is None:
        return error("Image not found.", 404)
    if row["uploader_id"] != user["id"]:
        return error("You may only delete your own images.", 403)

    db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    db.commit()
    (IMAGES_DIR / row["stored_name"]).unlink(missing_ok=True)
    return "", 204


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str):
    return error("Not found.", 404)


@app.errorhandler(404)
def handle_404(_exc):
    if request.path == "/api" or request.path.startswith("/api/"):
        return error("Not found.", 404)
    return frontend()


@app.errorhandler(405)
def handle_405(_exc):
    return error("Method not allowed.", 405)


@app.errorhandler(413)
def handle_413(_exc):
    return error("Request body is too large.", 413)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path and path != "index.html":
        candidate = (DIST / path).resolve()
        if candidate.is_file() and DIST.resolve() in candidate.parents:
            return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
