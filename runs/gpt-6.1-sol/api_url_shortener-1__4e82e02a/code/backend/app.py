import hashlib
import os
import re
import secrets
import sqlite3
import time
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, abort, g, redirect, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
LINK_QUERY = """
    SELECT links.*, users.username AS owner
    FROM links JOIN users ON users.id = links.owner_id
"""


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path("data") / "shortlinks.sqlite3"),
        ADMIN_PASSWORD=os.environ.get("ADMIN_PASSWORD", ""),
        MAX_CONTENT_LENGTH=32 * 1024,
    )
    if config:
        app.config.update(config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    def database():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=20)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_database(_error):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    with app.app_context():
        db = database()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_url TEXT NOT NULL,
                short_code TEXT NOT NULL UNIQUE,
                click_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                owner_id INTEGER NOT NULL REFERENCES users(id),
                is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE INDEX IF NOT EXISTS links_active_newest ON links(is_active, id DESC);
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        """)
        admin = db.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
        password = app.config["ADMIN_PASSWORD"]
        with db:
            if admin is None:
                db.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                    (generate_password_hash(password) if password else "",),
                )
            elif not password or not check_password_hash(admin["password_hash"], password):
                db.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
                db.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (generate_password_hash(password) if password else "", admin["id"]),
                )

    def error(message, status=400):
        return {"error": message}, status

    def json_body():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            abort(400, description="Send a JSON object in the request body.")
        return body

    def credentials():
        body = json_body()
        username, password = body.get("username"), body.get("password")
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,32}", username):
            abort(400, description="Username must be 1–32 letters, numbers, dots, dashes, or underscores.")
        if not isinstance(password, str) or not password or len(password) > 256:
            abort(400, description="Password must be between 1 and 256 characters.")
        return username, password

    def authenticated(admin_only=False):
        def decorator(view):
            @wraps(view)
            def wrapped(*args, **kwargs):
                parts = request.headers.get("Authorization", "").split()
                if len(parts) != 2 or parts[0].lower() != "bearer" or len(parts[1]) > 256:
                    return error("Please sign in to continue.", 401)
                token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
                g.user = database().execute(
                    """SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
                    WHERE token_hash = ? AND expires_at > ?""",
                    (token_hash, int(time.time())),
                ).fetchone()
                if g.user is None or (g.user["is_admin"] and not app.config["ADMIN_PASSWORD"]):
                    return error("Your session has expired. Please sign in again.", 401)
                if admin_only and not g.user["is_admin"]:
                    return error("Administrator access is required.", 403)
                g.token_hash = token_hash
                return view(*args, **kwargs)

            return wrapped

        return decorator

    def serialize_link(row):
        return {
            "id": row["id"],
            "original_url": row["original_url"],
            "short_code": row["short_code"],
            "click_count": row["click_count"],
            "created_at": row["created_at"],
            "short_url": f"/r/{row['short_code']}",
            "owner": row["owner"],
            "is_active": bool(row["is_active"]),
        }

    def paged_links(include_disabled=False, owner_id=None):
        try:
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("page_size", "10"))
        except ValueError:
            return error("Page and page_size must be whole numbers.")
        if page < 1 or not 1 <= page_size <= 100 or page > 2147483647:
            return error("Page must be positive and page_size must be between 1 and 100.")
        conditions = [] if include_disabled else ["links.is_active = 1"]
        parameters = []
        if owner_id is not None:
            conditions.append("links.owner_id = ?")
            parameters.append(owner_id)
        query = request.args.get("q", "").strip()[:256]
        if query:
            conditions.append("(links.original_url LIKE ? OR links.short_code LIKE ?)")
            parameters.extend([f"%{query}%", f"%{query}%"])
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        db = database()
        with db:
            db.execute("BEGIN")
            total = db.execute("SELECT COUNT(*) FROM links" + where, parameters).fetchone()[0]
            rows = db.execute(
                LINK_QUERY + where + " ORDER BY links.id DESC LIMIT ? OFFSET ?",
                [*parameters, page_size, (page - 1) * page_size],
            ).fetchall()
        return {"items": [serialize_link(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        username, password = credentials()
        if username.lower() == "admin":
            return error("This username is reserved.", 409)
        db = database()
        try:
            with db:
                cursor = db.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, generate_password_hash(password)),
                )
        except sqlite3.IntegrityError:
            return error("That username is already taken.", 409)
        return {"id": cursor.lastrowid, "username": username}, 201

    @app.post("/api/auth/login")
    def login():
        username, password = credentials()
        db = database()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if (
            user is None
            or (user["is_admin"] and not app.config["ADMIN_PASSWORD"])
            or not check_password_hash(user["password_hash"], password)
        ):
            return error("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"], int(time.time()) + 30 * 86400),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated()
    def current_user():
        return {"id": g.user["id"], "username": g.user["username"], "is_admin": bool(g.user["is_admin"])}

    @app.post("/api/auth/logout")
    @authenticated()
    def logout():
        db = database()
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.post("/api/links")
    @authenticated()
    def create_link():
        url = json_body().get("original_url")
        if not isinstance(url, str) or not url.strip():
            return error("Enter an address to shorten.")
        url = url.strip()
        try:
            parsed = urlsplit(url)
            valid = parsed.scheme in ("http", "https") and bool(parsed.hostname)
            _ = parsed.port
            if len(url) > 8192 or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in url):
                valid = False
        except ValueError:
            valid = False
        if not valid:
            return error("Enter a valid URL beginning with http:// or https:// (up to 8,192 characters).")
        db = database()
        for _ in range(5):
            code = secrets.token_urlsafe(6)
            try:
                with db:
                    cursor = db.execute(
                        """INSERT INTO links (original_url, short_code, created_at, owner_id)
                        VALUES (?, ?, ?, ?)""",
                        (url, code, datetime.now(UTC).isoformat(), g.user["id"]),
                    )
                row = db.execute(LINK_QUERY + " WHERE links.id = ?", (cursor.lastrowid,)).fetchone()
                return serialize_link(row), 201
            except sqlite3.IntegrityError:
                continue
        return error("Could not generate a short link. Please try again.", 503)

    @app.get("/api/links")
    def list_links():
        return paged_links()

    @app.get("/api/links/mine")
    @authenticated()
    def my_links():
        return paged_links(owner_id=g.user["id"])

    @app.get("/api/stats")
    def stats():
        row = database().execute(
            """SELECT COUNT(*) AS total_links, COALESCE(SUM(click_count), 0) AS total_clicks,
            COALESCE(SUM(substr(created_at, 1, 10) = ?), 0) AS links_today
            FROM links WHERE is_active = 1""",
            (datetime.now(UTC).date().isoformat(),),
        ).fetchone()
        return dict(row)

    @app.get("/api/links/<int:link_id>")
    def get_link(link_id):
        row = database().execute(
            LINK_QUERY + " WHERE links.id = ? AND links.is_active = 1", (link_id,)
        ).fetchone()
        if row is None:
            return error("Link not found.", 404)
        return serialize_link(row)

    @app.delete("/api/links/<int:link_id>")
    @authenticated()
    def delete_link(link_id):
        db = database()
        with db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM links WHERE id = ? AND is_active = 1", (link_id,)).fetchone()
            if row is None:
                return error("Link not found.", 404)
            if row["owner_id"] != g.user["id"]:
                return error("You can only delete your own links.", 403)
            db.execute("DELETE FROM links WHERE id = ?", (link_id,))
        return "", 204

    @app.get("/api/admin/links")
    @authenticated(admin_only=True)
    def admin_links():
        return paged_links(include_disabled=True)

    @app.post("/api/admin/links/<int:link_id>/toggle")
    @authenticated(admin_only=True)
    def toggle_link(link_id):
        db = database()
        with db:
            cursor = db.execute("UPDATE links SET is_active = 1 - is_active WHERE id = ?", (link_id,))
            if cursor.rowcount == 0:
                return error("Link not found.", 404)
            row = db.execute(LINK_QUERY + " WHERE links.id = ?", (link_id,)).fetchone()
        return serialize_link(row)

    @app.get("/r/<code>")
    def follow_link(code):
        db = database()
        with db:
            row = db.execute(
                """UPDATE links SET click_count = click_count + 1
                WHERE short_code = ? AND is_active = 1 RETURNING original_url""",
                (code,),
            ).fetchone() if request.method == "GET" else db.execute(
                "SELECT original_url FROM links WHERE short_code = ? AND is_active = 1", (code,)
            ).fetchone()
        if row is None:
            return error("This short link does not exist or has been disabled.", 404)
        response = redirect(row["original_url"], code=302)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(HTTPException)
    def http_error(exc):
        return error(exc.description, exc.code)

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path == "/api" or request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        if response.status_code == 401:
            response.headers["WWW-Authenticate"] = "Bearer"
        return response

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path in ("api", "r") or path.startswith(("api/", "r/")):
            abort(404, description="Endpoint not found.")
        candidate = safe_join(str(DIST), path)
        if candidate and Path(candidate).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
