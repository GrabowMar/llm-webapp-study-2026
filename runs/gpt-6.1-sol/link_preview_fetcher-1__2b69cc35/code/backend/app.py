import hashlib
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from .preview import PreviewError, fetch_preview
except ImportError:
    from preview import PreviewError, fetch_preview

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
PREVIEW_FIELDS = (
    "id", "url", "final_url", "status_code", "title", "description",
    "image_url", "fetched_at",
)


def create_app(test_config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path(os.environ.get("DATA_DIR", "./data")) / "bookmarks.sqlite3"),
        MAX_CONTENT_LENGTH=16 * 1024,
    )
    if test_config:
        app.config.update(test_config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(app.config["DATABASE"])) as database:
        database.executescript("""
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS previews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                final_url TEXT NOT NULL,
                status_code INTEGER NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                image_url TEXT,
                fetched_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS previews_owner_order
                ON previews(user_id, id DESC);
            CREATE INDEX IF NOT EXISTS tokens_expiry ON tokens(expires_at);
        """)

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=15)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        database = g.pop("db", None)
        if database is not None:
            database.close()

    def authenticated(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            parts = request.headers.get("Authorization", "").split()
            if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 256:
                return {"error": "Please sign in to continue."}, 401
            token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
            user = db().execute(
                "SELECT users.id, users.username FROM tokens JOIN users "
                "ON users.id = tokens.user_id WHERE token_hash = ? AND expires_at > ?",
                (token_hash, datetime.now(UTC).isoformat()),
            ).fetchone()
            if user is None:
                return {"error": "Your session has expired. Please sign in again."}, 401
            g.user = user
            g.token_hash = token_hash
            return view(*args, **kwargs)
        return wrapped

    def json_body():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            raise PreviewError("Send a JSON object in the request body.", 400)
        return body

    def credentials():
        body = json_body()
        username, password = body.get("username"), body.get("password")
        if not isinstance(username, str) or not 1 <= len(username.strip()) <= 64:
            raise PreviewError("Username must be between 1 and 64 characters.", 400)
        if not isinstance(password, str) or not 1 <= len(password) <= 1024:
            raise PreviewError("Password must be between 1 and 1024 characters.", 400)
        if any(ord(character) < 32 for character in username):
            raise PreviewError("Username cannot contain control characters.", 400)
        return username.strip(), password

    def owned_preview(preview_id):
        row = db().execute(
            "SELECT * FROM previews WHERE id = ? AND user_id = ?",
            (preview_id, g.user["id"]),
        ).fetchone()
        if row is None:
            raise PreviewError("Preview not found.", 404)
        return row

    def serialize(row):
        return {field: row[field] for field in PREVIEW_FIELDS}

    @app.errorhandler(PreviewError)
    def preview_error(error):
        return {"error": str(error)}, error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api/") or request.path == "/api":
            return {"error": error.description}, error.code
        return error

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; img-src 'self' https: http: data:; "
            "style-src 'self'; script-src 'self'; connect-src 'self'; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
        )
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        username, password = credentials()
        password_hash = generate_password_hash(password)
        try:
            with db():
                db().execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, password_hash),
                )
        except sqlite3.IntegrityError:
            return {"error": "That username is already taken."}, 409
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        username, password = credentials()
        user = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return {"error": "Incorrect username or password."}, 401
        token = secrets.token_urlsafe(48)
        now = datetime.now(UTC)
        with db():
            db().execute("DELETE FROM tokens WHERE expires_at <= ?", (now.isoformat(),))
            db().execute(
                "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"],
                 (now + timedelta(days=30)).isoformat()),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        with db():
            db().execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.post("/api/previews")
    @authenticated
    def add_preview():
        url = json_body().get("url")
        preview = fetch_preview(url)
        with db():
            cursor = db().execute(
                "INSERT INTO previews (user_id, url, final_url, status_code, title, "
                "description, image_url, fetched_at, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (g.user["id"], preview["url"], preview["final_url"], preview["status_code"],
                 preview["title"], preview["description"], preview["image_url"],
                 preview["fetched_at"], preview["fetched_at"]),
            )
        return serialize(owned_preview(cursor.lastrowid)), 201

    @app.get("/api/previews")
    @authenticated
    def list_previews():
        try:
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("page_size", "12"))
        except (ValueError, TypeError):
            raise PreviewError("Page and page_size must be positive integers.", 400) from None
        if not 1 <= page <= 1_000_000 or not 1 <= page_size <= 100:
            raise PreviewError("Page must be positive and page_size between 1 and 100.", 400)
        total = db().execute(
            "SELECT COUNT(*) FROM previews WHERE user_id = ?", (g.user["id"],),
        ).fetchone()[0]
        rows = db().execute(
            "SELECT * FROM previews WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
            (g.user["id"], page_size, (page - 1) * page_size),
        ).fetchall()
        return {"items": [serialize(row) for row in rows], "total": total,
                "page": page, "page_size": page_size}

    @app.get("/api/previews/<int:preview_id>")
    @authenticated
    def get_preview(preview_id):
        return serialize(owned_preview(preview_id))

    @app.post("/api/previews/<int:preview_id>/refresh")
    @authenticated
    def refresh_preview(preview_id):
        row = owned_preview(preview_id)
        preview = fetch_preview(row["url"])
        with db():
            db().execute(
                "UPDATE previews SET final_url = ?, status_code = ?, title = ?, "
                "description = ?, image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
                (preview["final_url"], preview["status_code"], preview["title"],
                 preview["description"], preview["image_url"], preview["fetched_at"],
                 preview_id, g.user["id"]),
            )
        return serialize(owned_preview(preview_id))

    @app.delete("/api/previews/<int:preview_id>")
    @authenticated
    def delete_preview(preview_id):
        owned_preview(preview_id)
        with db():
            db().execute("DELETE FROM previews WHERE id = ? AND user_id = ?",
                         (preview_id, g.user["id"]))
        return "", 204

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return {"error": "Endpoint not found."}, 404
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
