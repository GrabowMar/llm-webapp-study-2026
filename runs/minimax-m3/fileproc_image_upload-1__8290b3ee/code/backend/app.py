"""Flask application serving the image gallery API and the built frontend."""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DIST = PROJECT_DIR / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
FILES_DIR = DATA_DIR / "files"
DB_PATH = DATA_DIR / "gallery.db"

MAX_UPLOAD_BYTES = 32 * 1024 * 1024
DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 1000
TOKEN_TTL_DAYS = 30

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SIGNATURE = b"\xff\xd8\xff"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256:260000")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class ApiError(Exception):
    """Raised to abort a request with a JSON error body."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def error(message: str, status: int) -> tuple[Response, int]:
    return jsonify({"error": message, "message": message}), status


def detect_content_type(data: bytes) -> str | None:
    """Detect PNG/JPEG from the file content itself."""
    if data.startswith(PNG_SIGNATURE):
        return "image/png"
    if data.startswith(JPEG_SIGNATURE):
        return "image/jpeg"
    return None


def extension_for(content_type: str) -> str:
    return ".png" if content_type == "image/png" else ".jpg"


def decode_base64(payload: str) -> bytes | None:
    """Decode base64 image data, tolerating data URLs and whitespace."""
    if not isinstance(payload, str):
        return None
    cleaned = payload.strip()
    if cleaned.startswith("data:") and "," in cleaned:
        cleaned = cleaned.split(",", 1)[1]
    cleaned = "".join(cleaned.split())
    if not cleaned:
        return None
    padding = (-len(cleaned)) % 4
    try:
        return base64.b64decode(cleaned + "=" * padding, validate=True)
    except (binascii.Error, ValueError):
        return None


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_name TEXT NOT NULL,
    uploader_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    uploaded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_uploaded_at ON images(uploaded_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


def close_db(_exception: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def current_user() -> sqlite3.Row | None:
    """Return the signed-in user for the current request, if any."""
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens
        JOIN users ON users.id = tokens.user_id
        WHERE tokens.token_hash = ? AND tokens.created_at >= ?
        """,
        (
            hash_token(token),
            (
                datetime.now(timezone.utc) - timedelta(days=TOKEN_TTL_DAYS)
            ).isoformat(),
        ),
    ).fetchone()
    return row


def require_user() -> tuple[sqlite3.Row | None, tuple[Response, int] | None]:
    user = current_user()
    if user is None:
        return None, error("Authentication required.", 401)
    return user, None


def image_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "uploaded_at": row["uploaded_at"],
        "url": f"/api/images/{row['id']}/file",
        "uploader": row["uploader_username"],
    }


def fetch_image(image_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        """
        SELECT images.*, users.username AS uploader_username
        FROM images
        JOIN users ON users.id = images.uploader_id
        WHERE images.id = ?
        """,
        (image_id,),
    ).fetchone()


def parse_pagination() -> tuple[int, int]:
    raw_page = request.args.get("page", "1")
    raw_page_size = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(raw_page)
    except (TypeError, ValueError):
        raise ApiError("'page' must be an integer.", 400)
    try:
        page_size = int(raw_page_size)
    except (TypeError, ValueError):
        raise ApiError("'page_size' must be an integer.", 400)
    if page < 1:
        raise ApiError("'page' must be 1 or greater.", 400)
    if page_size < 1:
        raise ApiError("'page_size' must be 1 or greater.", 400)
    return page, min(page_size, MAX_PAGE_SIZE)


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
    app.teardown_appcontext(close_db)
    init_db()

    @app.errorhandler(413)
    def too_large(_exception: Any) -> tuple[Response, int]:
        return error("The uploaded image is too large.", 413)

    @app.errorhandler(ApiError)
    def api_error(exception: ApiError) -> tuple[Response, int]:
        return error(exception.message, exception.status)

    @app.get("/api/health")
    def health() -> Any:
        return jsonify({"status": "ok"})

    @app.post("/api/auth/register")
    def register() -> Any:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error("A JSON body is required.", 400)
        username = body.get("username")
        password = body.get("password")
        if not isinstance(username, str) or not username.strip():
            return error("'username' is required.", 400)
        if not isinstance(password, str) or not password:
            return error("'password' is required.", 400)
        username = username.strip()

        connection = get_db()
        try:
            cursor = connection.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, hash_password(password), now_iso()),
            )
            connection.commit()
        except sqlite3.IntegrityError:
            return error("That username is already taken.", 409)
        user_id = cursor.lastrowid
        return (
            jsonify({"id": user_id, "username": username, "created_at": now_iso()}),
            201,
        )

    @app.post("/api/auth/login")
    def login() -> Any:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error("A JSON body is required.", 400)
        username = body.get("username")
        password = body.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            return error("'username' and 'password' are required.", 400)

        connection = get_db()
        row = connection.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return error("Invalid username or password.", 401)

        token = secrets.token_urlsafe(32)
        connection.execute(
            "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
            (hash_token(token), row["id"], now_iso()),
        )
        connection.commit()
        return jsonify({"token": token})

    @app.get("/api/auth/me")
    def me() -> Any:
        user, failure = require_user()
        if failure is not None:
            return failure
        assert user is not None
        return jsonify({"id": user["id"], "username": user["username"]})

    @app.get("/api/images")
    def list_images() -> Any:
        page, page_size = parse_pagination()

        connection = get_db()
        total = connection.execute("SELECT COUNT(*) AS count FROM images").fetchone()[
            "count"
        ]
        rows = connection.execute(
            """
            SELECT images.*, users.username AS uploader_username
            FROM images
            JOIN users ON users.id = images.uploader_id
            ORDER BY images.uploaded_at DESC, images.id DESC
            LIMIT ? OFFSET ?
            """,
            (page_size, (page - 1) * page_size),
        ).fetchall()
        return jsonify(
            {
                "items": [image_payload(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        )

    @app.post("/api/images")
    def upload_image() -> Any:
        user, failure = require_user()
        if failure is not None:
            return failure
        assert user is not None

        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error("A JSON body is required.", 400)
        filename = body.get("filename")
        payload = body.get("data")
        title = body.get("title")
        if not isinstance(filename, str) or not filename.strip():
            return error("'filename' is required.", 400)
        if not isinstance(payload, str) or not payload.strip():
            return error("'data' is required.", 400)
        if title is not None and not isinstance(title, str):
            return error("'title' must be a string.", 400)

        data = decode_base64(payload)
        if data is None:
            return error("'data' must be valid base64 image data.", 400)
        if not data:
            return error("'data' must not be empty.", 400)
        content_type = detect_content_type(data)
        if content_type is None:
            return error("Only PNG and JPEG images are supported.", 400)

        FILES_DIR.mkdir(parents=True, exist_ok=True)
        storage_name = f"{secrets.token_hex(16)}{extension_for(content_type)}"
        (FILES_DIR / storage_name).write_bytes(data)

        title_value = title.strip() if isinstance(title, str) and title.strip() else None
        connection = get_db()
        cursor = connection.execute(
            """
            INSERT INTO images
                (filename, title, content_type, size_bytes, storage_name, uploader_id, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                filename.strip(),
                title_value,
                content_type,
                len(data),
                storage_name,
                user["id"],
                now_iso(),
            ),
        )
        connection.commit()

        row = fetch_image(int(cursor.lastrowid))
        assert row is not None
        return jsonify(image_payload(row)), 201

    @app.get("/api/images/<int:image_id>")
    def get_image(image_id: int) -> Any:
        row = fetch_image(image_id)
        if row is None:
            return error("Image not found.", 404)
        return jsonify(image_payload(row))

    @app.get("/api/images/<int:image_id>/file")
    def get_image_file(image_id: int) -> Any:
        row = fetch_image(image_id)
        if row is None:
            return error("Image not found.", 404)
        path = FILES_DIR / row["storage_name"]
        if not path.is_file():
            return error("Image not found.", 404)
        data = path.read_bytes()
        response = Response(data, mimetype=row["content_type"])
        response.headers["Content-Length"] = str(len(data))
        response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    @app.delete("/api/images/<int:image_id>")
    def delete_image(image_id: int) -> Any:
        user, failure = require_user()
        if failure is not None:
            return failure
        assert user is not None

        row = fetch_image(image_id)
        if row is None:
            return error("Image not found.", 404)
        if row["uploader_id"] != user["id"]:
            return error("Only the uploader can delete this image.", 403)

        path = FILES_DIR / row["storage_name"]
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        connection = get_db()
        connection.execute("DELETE FROM images WHERE id = ?", (image_id,))
        connection.commit()
        return jsonify({"status": "deleted", "id": image_id})

    @app.get("/")
    @app.get("/<path:path>")
    def serve_frontend(path: str = "index.html") -> Any:
        if path.startswith("api/"):
            return error("Not found.", 404)
        candidate = DIST / path
        if path and candidate.is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
