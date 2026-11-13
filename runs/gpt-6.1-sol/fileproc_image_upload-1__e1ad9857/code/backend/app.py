import base64
import binascii
import hashlib
import os
import re
import secrets
import sqlite3
import time
import warnings
from datetime import UTC, datetime
from functools import wraps
from io import BytesIO
from pathlib import Path

from flask import Flask, g, request, send_file, send_from_directory
from PIL import Image, UnidentifiedImageError
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
MAX_IMAGE_BYTES = 15 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATA_DIR=os.environ.get("DATA_DIR", "./data"),
        MAX_CONTENT_LENGTH=22 * 1024 * 1024,
    )
    if config:
        app.config.update(config)
    data_dir = Path(app.config["DATA_DIR"])
    data_dir.mkdir(parents=True, exist_ok=True)
    app.config["DATABASE"] = str(data_dir / "gallery.sqlite3")

    def get_db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=15)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(error=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    with app.app_context():
        db = get_db()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                title TEXT,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS image_files (
                image_id INTEGER PRIMARY KEY REFERENCES images(id) ON DELETE CASCADE,
                data BLOB NOT NULL
            );
            CREATE INDEX IF NOT EXISTS images_newest ON images(uploaded_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS images_uploader ON images(user_id);
        """)
        db.commit()

    def error(message, status=400):
        return {"error": message}, status

    def json_body():
        body = request.get_json(silent=True)
        return body if isinstance(body, dict) else None

    def credentials(body):
        if body is None:
            return None
        username, password = body.get("username"), body.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            return None
        username = username.strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,32}", username):
            return None
        if not 1 <= len(password) <= 256:
            return None
        return username, password

    def authenticated(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            auth = request.headers.get("Authorization", "").split()
            if len(auth) != 2 or auth[0].lower() != "bearer" or len(auth[1]) > 128:
                return error("Please sign in to continue.", 401)
            token_hash = hashlib.sha256(auth[1].encode()).hexdigest()
            user = get_db().execute(
                "SELECT users.id, users.username FROM sessions JOIN users "
                "ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?",
                (token_hash, int(time.time())),
            ).fetchone()
            if user is None:
                return error("Your session has expired. Please sign in again.", 401)
            g.user = user
            g.token_hash = token_hash
            return view(*args, **kwargs)

        return wrapped

    def description(row):
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

    def find_image(image_id):
        return get_db().execute(
            "SELECT images.*, users.username FROM images "
            "JOIN users ON images.user_id = users.id WHERE images.id = ?",
            (image_id,),
        ).fetchone()

    @app.errorhandler(HTTPException)
    def http_error(exc):
        if exc.code == 413:
            return error("This image is too large. The maximum file size is 15 MB.", 413)
        return error(exc.description, exc.code)

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' blob: data:; "
            "style-src 'self' 'unsafe-inline'; script-src 'self'; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        )
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        values = credentials(json_body())
        if values is None:
            return error(
                "Use a username of 1–32 letters, numbers, dots, underscores or hyphens "
                "and a password of 1–256 characters."
            )
        username, password = values
        db = get_db()
        try:
            with db:
                db.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, generate_password_hash(password)),
                )
        except sqlite3.IntegrityError:
            return error("That username is already taken. Try another one.", 409)
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        values = credentials(json_body())
        if values is None:
            return error("Enter a valid username and password.")
        username, password = values
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return error("The username or password is incorrect.", 401)
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"], int(time.time()) + 2592000),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = get_db()
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return {"message": "Signed out."}

    @app.get("/api/images")
    def list_images():
        try:
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("page_size", "12"))
        except ValueError:
            return error("Page and page_size must be positive integers.")
        if page < 1 or not 1 <= page_size <= 100 or page > 1_000_000:
            return error("Page must be positive and page_size must be between 1 and 100.")
        conditions, params = [], []
        uploader = request.args.get("uploader", "").strip()
        search = request.args.get("q", "").strip()[:200]
        if uploader:
            conditions.append("users.username = ?")
            params.append(uploader)
        if search:
            pattern = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            conditions.append(
                "(images.filename LIKE ? ESCAPE '\\' OR images.title LIKE ? ESCAPE '\\' "
                "OR users.username LIKE ? ESCAPE '\\')"
            )
            params.extend([pattern] * 3)
        source = " FROM images JOIN users ON images.user_id = users.id"
        if conditions:
            source += " WHERE " + " AND ".join(conditions)
        db = get_db()
        total = db.execute("SELECT COUNT(*)" + source, params).fetchone()[0]
        rows = db.execute(
            "SELECT images.*, users.username" + source + " ORDER BY uploaded_at DESC, images.id DESC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
        return {"items": [description(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.post("/api/images")
    @authenticated
    def upload_image():
        body = json_body()
        if body is None:
            return error("Send a JSON object with filename and base64 data.")
        filename, encoded, title = body.get("filename"), body.get("data"), body.get("title")
        if not isinstance(filename, str) or not filename.strip() or len(filename) > 255 or any(ord(c) < 32 for c in filename):
            return error("Provide a filename of 1–255 characters.")
        if title is not None and (not isinstance(title, str) or len(title) > 200):
            return error("The title must be text, up to 200 characters.")
        if not isinstance(encoded, str) or not encoded:
            return error("Provide the image as base64 data.")
        if len(encoded) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
            return error("This image is too large. The maximum file size is 15 MB.", 413)
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            return error("The image data is not valid base64.")
        if len(raw) > MAX_IMAGE_BYTES:
            return error("This image is too large. The maximum file size is 15 MB.", 413)
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(raw)) as image:
                    content_type = {"PNG": "image/png", "JPEG": "image/jpeg"}.get(image.format)
                    if content_type is None:
                        return error("Only PNG and JPEG images are supported.")
                    image.verify()
                with Image.open(BytesIO(raw)) as image:
                    image.load()
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
            return error("This file is not a valid PNG or JPEG image, or its dimensions are too large.")
        uploaded_at = datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")
        db = get_db()
        with db:
            cursor = db.execute(
                "INSERT INTO images (filename, title, content_type, size_bytes, uploaded_at, user_id) VALUES (?, ?, ?, ?, ?, ?)",
                (filename, title.strip() or None if title is not None else None, content_type, len(raw), uploaded_at, g.user["id"]),
            )
            db.execute("INSERT INTO image_files (image_id, data) VALUES (?, ?)", (cursor.lastrowid, raw))
        return description(find_image(cursor.lastrowid)), 201

    @app.get("/api/images/<int:image_id>")
    def get_image(image_id):
        image = find_image(image_id)
        if image is None:
            return error("This image could not be found.", 404)
        return description(image)

    @app.get("/api/images/<int:image_id>/file")
    def image_file(image_id):
        row = get_db().execute(
            "SELECT data, content_type FROM image_files JOIN images ON images.id = image_files.image_id WHERE images.id = ?",
            (image_id,),
        ).fetchone()
        if row is None:
            return error("This image could not be found.", 404)
        return send_file(BytesIO(row["data"]), mimetype=row["content_type"], conditional=False)

    @app.delete("/api/images/<int:image_id>")
    @authenticated
    def delete_image(image_id):
        image = find_image(image_id)
        if image is None:
            return error("This image could not be found.", 404)
        if image["user_id"] != g.user["id"]:
            return error("You can only delete images you uploaded.", 403)
        db = get_db()
        with db:
            db.execute("DELETE FROM images WHERE id = ?", (image_id,))
        return {"message": "Image deleted."}

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
