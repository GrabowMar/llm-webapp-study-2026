"""Image gallery: Flask JSON API plus the built frontend."""

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
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
IMAGE_DIR = DATA_DIR / "images"
DB_PATH = DATA_DIR / "gallery.db"
SECRET_PATH = DATA_DIR / "secret.key"

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_BODY_BYTES = MAX_IMAGE_BYTES * 4 // 3 + 64 * 1024
TOKEN_MAX_AGE = 30 * 24 * 3600
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD = 6
MAX_PASSWORD = 128
MAX_FILENAME = 255
MAX_TITLE = 200

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"

DATA_DIR.mkdir(parents=True, exist_ok=True)
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_BODY_BYTES
app.json.sort_keys = False


def load_secret() -> bytes:
    if SECRET_PATH.exists():
        return SECRET_PATH.read_bytes()
    key = secrets.token_bytes(32)
    tmp = SECRET_PATH.with_name(f"secret.{uuid.uuid4().hex}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(key)
    try:
        os.link(tmp, SECRET_PATH)
    except FileExistsError:
        pass
    finally:
        os.unlink(tmp)
    return SECRET_PATH.read_bytes()


serializer = URLSafeTimedSerializer(load_secret(), salt="gallery-auth")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    filename TEXT NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    storage_name TEXT NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS images_order ON images(uploaded_at DESC, id DESC);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def error_response(status: int, message: str, headers=None):
    resp = jsonify({"error": message})
    resp.status_code = status
    if headers:
        resp.headers.update(headers)
    return resp


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    headers = {"WWW-Authenticate": "Bearer"} if err.status == 401 else None
    return error_response(err.status, err.message, headers)


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if not request.path.startswith("/api"):
        return err
    if err.code == 413:
        return error_response(413, "Request body is too large (max 10 MB image)")
    return error_response(err.code or 500, err.description or err.name)


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error: %s", err)
    return error_response(500, "Internal server error")


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return body


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError(401, "Authentication required")
    try:
        payload = serializer.loads(token.strip(), max_age=TOKEN_MAX_AGE)
        user_id = int(payload["uid"])
    except (BadSignature, SignatureExpired, KeyError, TypeError, ValueError):
        raise ApiError(401, "Invalid or expired token")
    row = db().execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        raise ApiError(401, "Invalid or expired token")
    return row


def credentials() -> tuple[str, str]:
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required strings")
    return username.strip(), password


DUMMY_HASH = generate_password_hash("dummy-password")


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    if not USERNAME_RE.match(username):
        raise ApiError(
            400,
            "Username must be 3-32 characters: letters, digits, '_', '.' or '-'",
        )
    if len(password) < MIN_PASSWORD:
        raise ApiError(400, f"Password must be at least {MIN_PASSWORD} characters")
    if len(password) > MAX_PASSWORD:
        raise ApiError(400, f"Password must be at most {MAX_PASSWORD} characters")
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = serializer.dumps({"uid": row["id"]})
    return jsonify({"token": token, "username": row["username"]})


def sniff_image(data: bytes) -> str | None:
    if data.startswith(PNG_SIGNATURE):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


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
    "SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes, "
    "i.uploaded_at, i.storage_name, i.user_id, u.username "
    "FROM images i JOIN users u ON u.id = i.user_id"
)


def int_param(name: str, default: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be an integer")
    if value < 1:
        raise ApiError(400, f"{name} must be at least 1")
    if maximum is not None and value > maximum:
        raise ApiError(400, f"{name} must be at most {maximum}")
    return value


@app.get("/api/images")
def list_images():
    page = int_param("page", 1)
    page_size = int_param("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    rows = conn.execute(
        IMAGE_SELECT + " ORDER BY i.uploaded_at DESC, i.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [image_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/images")
def upload_image():
    user = current_user()
    body = json_body()

    filename = body.get("filename")
    if not isinstance(filename, str) or not filename.strip():
        raise ApiError(400, "filename is required")
    filename = filename.strip()
    if len(filename) > MAX_FILENAME:
        raise ApiError(400, f"filename must be at most {MAX_FILENAME} characters")

    title = body.get("title")
    if title is not None:
        if not isinstance(title, str):
            raise ApiError(400, "title must be a string")
        title = title.strip() or None
        if title is not None and len(title) > MAX_TITLE:
            raise ApiError(400, f"title must be at most {MAX_TITLE} characters")

    encoded = body.get("data")
    if not isinstance(encoded, str) or not encoded.strip():
        raise ApiError(400, "data is required (base64-encoded image)")
    try:
        data = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "data is not valid base64")
    if not data:
        raise ApiError(400, "data is empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(413, "Image is too large (max 10 MB)")

    content_type = sniff_image(data)
    if content_type is None:
        raise ApiError(415, "Only PNG and JPEG images are supported")

    storage_name = uuid.uuid4().hex
    path = IMAGE_DIR / storage_name
    path.write_bytes(data)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO images (user_id, filename, title, content_type, "
            "size_bytes, uploaded_at, storage_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user["id"], filename, title, content_type, len(data), utcnow(), storage_name),
        )
        conn.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    row = conn.execute(IMAGE_SELECT + " WHERE i.id = ?", (cur.lastrowid,)).fetchone()
    resp = jsonify(image_dict(row))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/images/{row['id']}"
    return resp


def get_image_row(image_id: int) -> sqlite3.Row:
    row = db().execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Image not found")
    return row


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    return jsonify(image_dict(get_image_row(image_id)))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = get_image_row(image_id)
    try:
        data = (IMAGE_DIR / row["storage_name"]).read_bytes()
    except FileNotFoundError:
        raise ApiError(404, "Image file not found")
    resp = Response(data, mimetype=row["content_type"])
    resp.headers["Content-Type"] = row["content_type"]
    resp.headers["Content-Length"] = str(len(data))
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Cache-Control"] = "public, max-age=3600"
    return resp


@app.delete("/api/images/<int:image_id>")
def delete_image(image_id: int):
    user = current_user()
    row = get_image_row(image_id)
    if row["user_id"] != user["id"]:
        raise ApiError(403, "Only the uploader can delete this image")
    conn = db()
    cur = conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
    conn.commit()
    if cur.rowcount:
        (IMAGE_DIR / row["storage_name"]).unlink(missing_ok=True)
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>")
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and target.is_relative_to(DIST.resolve()):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
