"""Flask entry point: image gallery API + frontend serving."""

import base64
import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(Path(__file__).resolve().parent.parent / "data")))
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "gallery.db"

MAX_CONTENT_LENGTH = 40 * 1024 * 1024
PBKDF2_ITERATIONS = 200_000
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                title TEXT,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                uploader_id INTEGER NOT NULL REFERENCES users(id),
                file_path TEXT NOT NULL
            )
            """
        )


init_db()


@app.before_request
def ensure_db():
    if not DB_PATH.exists():
        init_db()


def hash_password(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS
    ).hex()


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_user():
    user = current_user()
    if user is None:
        return None, (jsonify({"error": "authentication required"}), 401)
    return user, None


def image_description(row: sqlite3.Row, username: str) -> dict:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "title": row["title"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "uploaded_at": row["uploaded_at"],
        "url": f"/api/images/{row['id']}/file",
        "uploader": username,
    }


def detect_content_type(data: bytes) -> str | None:
    if data.startswith(PNG_MAGIC):
        return "image/png"
    if data.startswith(JPEG_MAGIC):
        return "image/jpeg"
    return None


IMAGE_SELECT = (
    "SELECT i.id, i.filename, i.title, i.content_type, i.size_bytes, "
    "i.uploaded_at, i.file_path, i.uploader_id, u.username AS uploader "
    "FROM images i JOIN users u ON u.id = i.uploader_id"
)


@app.errorhandler(413)
def too_large(_e):
    return jsonify({"error": "request payload too large"}), 413


@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(_e):
    return jsonify({"error": "method not allowed"}), 405


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "invalid JSON body"}), 400
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "password is required"}), 400
    username = username.strip()
    salt = secrets.token_hex(16)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)",
            (username, hash_password(password, salt), salt),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "invalid JSON body"}), 400
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "invalid credentials"}), 401
    row = get_db().execute(
        "SELECT id, salt, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not secrets.compare_digest(
        row["password_hash"], hash_password(password, row["salt"])
    ):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (
            token,
            row["id"],
            datetime.now(timezone.utc).isoformat(timespec="seconds"),
        ),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
def logout():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer ") :].strip()
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"}), 200


@app.get("/api/images")
def list_images():
    def parse_int(name: str, default: int):
        raw = request.args.get(name)
        if raw is None:
            return default, None
        try:
            value = int(raw)
        except ValueError:
            return None, (jsonify({"error": f"{name} must be an integer"}), 400)
        if value < 1:
            return None, (jsonify({"error": f"{name} must be >= 1"}), 400)
        return value, None

    page, err = parse_int("page", 1)
    if err:
        return err
    page_size, err = parse_int("page_size", DEFAULT_PAGE_SIZE)
    if err:
        return err
    if page_size > MAX_PAGE_SIZE:
        page_size = MAX_PAGE_SIZE

    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM images").fetchone()["n"]
    rows = db.execute(
        IMAGE_SELECT + " ORDER BY i.uploaded_at DESC, i.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    items = [image_description(r, r["uploader"]) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.post("/api/images")
def upload_image():
    user, err = require_user()
    if err:
        return err
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "invalid JSON body"}), 400
    filename = body.get("filename")
    data_b64 = body.get("data")
    title = body.get("title")
    if not isinstance(filename, str) or not filename.strip():
        return jsonify({"error": "filename is required"}), 400
    if not isinstance(data_b64, str) or not data_b64:
        return jsonify({"error": "data is required"}), 400
    if title is not None and (not isinstance(title, str) or not title.strip()):
        title = None
    elif isinstance(title, str):
        title = title.strip() or None

    payload = data_b64
    if payload.startswith("data:") and "," in payload:
        payload = payload.split(",", 1)[1]
    try:
        raw = base64.b64decode(payload, validate=True)
    except (ValueError, TypeError):
        return jsonify({"error": "data must be valid base64"}), 400
    if not raw:
        return jsonify({"error": "image data is empty"}), 400

    content_type = detect_content_type(raw)
    if content_type is None:
        return jsonify({"error": "only PNG and JPEG images are supported"}), 400

    uploaded_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db = get_db()
    cur = db.execute(
        "INSERT INTO images (filename, title, content_type, size_bytes, uploaded_at, "
        "uploader_id, file_path) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (filename.strip(), title, content_type, len(raw), uploaded_at, user["id"], ""),
    )
    image_id = cur.lastrowid
    file_path = UPLOAD_DIR / f"{image_id}"
    file_path.write_bytes(raw)
    db.execute("UPDATE images SET file_path = ? WHERE id = ?", (str(file_path), image_id))
    db.commit()
    row = db.execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    return jsonify(image_description(row, row["uploader"])), 201


@app.get("/api/images/<int:image_id>")
def get_image(image_id: int):
    row = get_db().execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        return jsonify({"error": "image not found"}), 404
    return jsonify(image_description(row, row["uploader"]))


@app.get("/api/images/<int:image_id>/file")
def get_image_file(image_id: int):
    row = get_db().execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        return jsonify({"error": "image not found"}), 404
    path = Path(row["file_path"])
    if not path.is_file():
        return jsonify({"error": "image file missing"}), 404
    return Response(
        path.read_bytes(),
        mimetype=row["content_type"],
        headers={"Content-Length": str(row["size_bytes"])},
    )


@app.delete("/api/images/<int:image_id>")
def delete_image(image_id: int):
    user, err = require_user()
    if err:
        return err
    db = get_db()
    row = db.execute(IMAGE_SELECT + " WHERE i.id = ?", (image_id,)).fetchone()
    if row is None:
        return jsonify({"error": "image not found"}), 404
    if row["uploader_id"] != user["id"]:
        return jsonify({"error": "only the uploader may delete this image"}), 403
    db.execute("DELETE FROM images WHERE id = ?", (image_id,))
    db.commit()
    try:
        Path(row["file_path"]).unlink(missing_ok=True)
    except OSError:
        pass
    return jsonify({"status": "deleted"}), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
