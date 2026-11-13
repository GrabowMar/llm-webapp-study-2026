"""Flask entry point."""

import base64
import binascii
import hashlib
import os
import re
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data")).resolve()
DB_PATH = DATA_DIR / "app.db"
IMAGES_DIR = DATA_DIR / "images"

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_FILENAME_LEN = 255
MAX_TITLE_LEN = 200
MAX_USERNAME_LEN = 64
MAX_PASSWORD_LEN = 1024
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
TOKEN_TTL = timedelta(days=30)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_IMAGE_BYTES * 4 // 3 + 64 * 1024
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    title TEXT,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    storage_name TEXT NOT NULL UNIQUE,
    uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS images_uploaded_idx ON images (uploaded_at DESC, id DESC);
"""


def init_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    resp = jsonify({"error": err.message})
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if not request.path.startswith("/api"):
        return err
    messages = {
        413: f"Request too large; images may be at most {MAX_IMAGE_BYTES // (1024 * 1024)} MB",
    }
    resp = jsonify({"error": messages.get(err.code, err.description or err.name)})
    resp.status_code = err.code or 500
    return resp


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error", exc_info=err)
    if request.path.startswith("/api"):
        return jsonify({"error": "Internal server error"}), 500
    return Response("Internal server error", status=500)


@app.after_request
def security_headers(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    return resp


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer" or not value.strip():
        return None
    return value.strip()


def current_user() -> sqlite3.Row | None:
    if "user" in g:
        return g.user
    user = None
    token = bearer_token()
    if token:
        user = get_db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = ? AND t.expires_at > ?",
            (hash_token(token), iso(now_utc())),
        ).fetchone()
    g.user = user
    return user


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


@app.get("/api/health")
def health():
    return {"status": "ok"}


def validate_credentials(data: dict) -> tuple[str, str]:
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    if not username:
        raise ApiError(400, "username must not be empty")
    if not password:
        raise ApiError(400, "password must not be empty")
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = validate_credentials(json_body())
    if len(username) > MAX_USERNAME_LEN:
        raise ApiError(400, f"username must be at most {MAX_USERNAME_LEN} characters")
    if re.search(r"[\x00-\x1f\x7f\s]", username):
        raise ApiError(400, "username must not contain whitespace or control characters")
    if len(password) > MAX_PASSWORD_LEN:
        raise ApiError(400, f"password must be at most {MAX_PASSWORD_LEN} characters")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso(now_utc())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    username, password = validate_credentials(json_body())
    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = now_utc()
    db.execute("DELETE FROM tokens WHERE expires_at <= ?", (iso(now),))
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), user["id"], iso(now), iso(now + TOKEN_TTL)),
    )
    db.commit()
    return {"token": token, "username": user["username"]}


@app.get("/api/auth/me")
def me():
    user = require_user()
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/logout")
def logout():
    require_user()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(bearer_token()),))
    db.commit()
    return "", 204


def detect_content_type(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


DATA_URL_RE = re.compile(r"^data:[^,]*?;base64,", re.IGNORECASE)


def decode_base64(value: str) -> bytes:
    value = DATA_URL_RE.sub("", value.strip(), count=1)
    value = re.sub(r"\s+", "", value)
    if not value:
        raise ApiError(400, "data must not be empty")
    if "-" in value or "_" in value:
        value = value.replace("-", "+").replace("_", "/")
    value += "=" * (-len(value) % 4)
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError):
        raise ApiError(400, "data is not valid base64")


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


IMAGE_SELECT = (
    "SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes, i.uploaded_at, "
    "i.storage_name, i.user_id, u.username AS uploader "
    "FROM images i JOIN users u ON u.id = i.user_id"
)


def get_image_row(image_id: int) -> sqlite3.Row:
    row = get_db().execute(f"{IMAGE_SELECT} WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Image not found")
    return row


def int_param(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer")
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer")
    return value


@app.get("/api/images")
def list_images():
    page = int_param("page", 1)
    page_size = min(int_param("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    rows = db.execute(
        f"{IMAGE_SELECT} ORDER BY i.uploaded_at DESC, i.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [image_json(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/images")
def create_image():
    user = require_user()
    body = json_body()

    filename = body.get("filename")
    if not isinstance(filename, str) or not filename.strip():
        raise ApiError(400, "filename is required")
    filename = filename.strip()
    if len(filename) > MAX_FILENAME_LEN:
        raise ApiError(400, f"filename must be at most {MAX_FILENAME_LEN} characters")
    if re.search(r"[\x00-\x1f\x7f]", filename):
        raise ApiError(400, "filename must not contain control characters")

    title = body.get("title")
    if title is not None:
        if not isinstance(title, str):
            raise ApiError(400, "title must be a string")
        title = title.strip() or None
        if title is not None and len(title) > MAX_TITLE_LEN:
            raise ApiError(400, f"title must be at most {MAX_TITLE_LEN} characters")

    raw = body.get("data")
    if not isinstance(raw, str):
        raise ApiError(400, "data is required and must be a base64 string")
    data = decode_base64(raw)
    if not data:
        raise ApiError(400, "data must not be empty")
    if len(data) > MAX_IMAGE_BYTES:
        raise ApiError(413, f"Image is too large; the maximum is {MAX_IMAGE_BYTES // (1024 * 1024)} MB")
    content_type = detect_content_type(data)
    if content_type is None:
        raise ApiError(400, "Unsupported image format; only PNG and JPEG images are accepted")

    storage_name = uuid.uuid4().hex
    path = IMAGES_DIR / storage_name
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO images (user_id, filename, title, content_type, size_bytes, storage_name, uploaded_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user["id"], filename, title, content_type, len(data), storage_name, iso(now_utc())),
        )
        db.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    row = get_image_row(cur.lastrowid)
    resp = jsonify(image_json(row))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/images/{row['id']}"
    return resp


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    return image_json(get_image_row(image_id))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = get_image_row(image_id)
    path = IMAGES_DIR / row["storage_name"]
    try:
        data = path.read_bytes()
    except FileNotFoundError:
        raise ApiError(404, "Image file not found")
    resp = Response(data, mimetype=row["content_type"])
    resp.headers["Content-Length"] = str(len(data))
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    resp.headers["Content-Security-Policy"] = "default-src 'none'"
    return resp


@app.delete("/api/images/<int:image_id>")
def delete_image(image_id: int):
    user = require_user()
    row = get_image_row(image_id)
    if row["user_id"] != user["id"]:
        raise ApiError(403, "Only the uploader may delete this image")
    db = get_db()
    db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    db.commit()
    (IMAGES_DIR / row["storage_name"]).unlink(missing_ok=True)
    return "", 204


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_storage()
