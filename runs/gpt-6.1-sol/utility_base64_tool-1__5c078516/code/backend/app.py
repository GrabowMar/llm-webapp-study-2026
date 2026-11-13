import base64
import binascii
import hashlib
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, abort, current_app, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def database():
    if "database" not in g:
        g.database = sqlite3.connect(current_app.config["DATABASE"], timeout=10)
        g.database.row_factory = sqlite3.Row
        g.database.execute("PRAGMA foreign_keys = ON")
    return g.database


def json_body():
    if not request.is_json:
        abort(400, description="Send a JSON object in the request body.")
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        abort(400, description="Send a valid JSON object in the request body.")
    return body


def string_field(body, name):
    value = body.get(name)
    if not isinstance(value, str):
        abort(400, description=f"'{name}' must be a string.")
    return value


def credentials(body):
    username = string_field(body, "username").strip()
    password = string_field(body, "password")
    if not username or len(username) > 80:
        abort(400, description="Username must contain between 1 and 80 characters.")
    if not password or len(password) > 1024:
        abort(400, description="Password must contain between 1 and 1024 characters.")
    try:
        username.encode("utf-8")
        password.encode("utf-8")
    except UnicodeEncodeError:
        abort(400, description="Username and password must be valid UTF-8 text.")
    return username, password


def convert(direction, value):
    if direction == "encode":
        try:
            return base64.b64encode(value.encode("utf-8")).decode("ascii")
        except UnicodeEncodeError:
            abort(400, description="The input must be valid UTF-8 text.")
    if direction != "decode":
        abort(400, description="'direction' must be 'encode' or 'decode'.")
    try:
        decoded = base64.b64decode(value, validate=True)
        if base64.b64encode(decoded).decode("ascii") != value:
            raise ValueError
    except (binascii.Error, ValueError):
        abort(400, description="Invalid Base64. Use standard Base64 with correct padding and no whitespace.")
    try:
        return decoded.decode("utf-8")
    except UnicodeDecodeError:
        abort(400, description="The decoded data is not valid UTF-8 text.")


def authenticated(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        authorization = request.headers.get("Authorization", "").split()
        if len(authorization) != 2 or authorization[0].lower() != "bearer":
            abort(401, description="Please sign in to access your history.")
        digest = hashlib.sha256(authorization[1].encode()).hexdigest()
        user = database().execute(
            "SELECT users.id, users.username FROM tokens JOIN users ON users.id = tokens.user_id "
            "WHERE token_hash = ? AND expires_at > ?",
            (digest, datetime.now(UTC).isoformat()),
        ).fetchone()
        if user is None:
            abort(401, description="Your session has expired. Please sign in again.")
        g.user = user
        g.token_hash = digest
        return view(*args, **kwargs)

    return wrapped


def conversion_object(row, include_output=False):
    def preview(value):
        return value if len(value) <= 160 else value[:159] + "…"

    result = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": preview(row["input"]),
        "output_preview": preview(row["output"]),
        "created_at": row["created_at"],
    }
    if include_output:
        result["output"] = row["output"]
    return result


def create_app(data_dir=None):
    app = Flask(__name__, static_folder=None)
    directory = Path(data_dir or os.environ.get("DATA_DIR", "./data"))
    directory.mkdir(parents=True, exist_ok=True)
    app.config.update(DATABASE=str(directory / "base64.sqlite3"), MAX_CONTENT_LENGTH=2 * 1024 * 1024)
    with app.app_context():
        db = database()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                direction TEXT NOT NULL CHECK (direction IN ('encode', 'decode')),
                input TEXT NOT NULL,
                output TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS conversions_user_id ON conversions(user_id, id DESC);
            """
        )
        db.close()
        g.pop("database", None)

    @app.teardown_appcontext
    def close_database(exception=None):
        db = g.pop("database", None)
        if db is not None:
            db.close()

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path == "/api" or request.path.startswith("/api/"):
            return {"error": error.description}, error.code
        return error

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        )
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        username, password = credentials(json_body())
        db = database()
        try:
            cursor = db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            abort(409, description="That username is already taken. Try another one.")
        return {"id": cursor.lastrowid, "username": username}, 201

    @app.post("/api/auth/login")
    def login():
        username, password = credentials(json_body())
        db = database()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            abort(401, description="Incorrect username or password.")
        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        db.execute("DELETE FROM tokens WHERE expires_at <= ?", (now.isoformat(),))
        db.execute(
            "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), user["id"], (now + timedelta(days=30)).isoformat()),
        )
        db.commit()
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = database()
        db.execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
        db.commit()
        return "", 204

    @app.post("/api/base64/encode")
    def encode():
        return {"encoded": convert("encode", string_field(json_body(), "text"))}

    @app.post("/api/base64/decode")
    def decode():
        return {"text": convert("decode", string_field(json_body(), "encoded"))}

    @app.post("/api/conversions")
    @authenticated
    def save_conversion():
        body = json_body()
        direction = string_field(body, "direction")
        value = string_field(body, "input")
        output = convert(direction, value)
        db = database()
        cursor = db.execute(
            "INSERT INTO conversions (user_id, direction, input, output, created_at) VALUES (?, ?, ?, ?, ?)",
            (g.user["id"], direction, value, output, datetime.now(UTC).isoformat()),
        )
        db.commit()
        row = db.execute("SELECT * FROM conversions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return conversion_object(row, include_output=True), 201

    @app.get("/api/conversions")
    @authenticated
    def history():
        def positive_integer(name, default, maximum):
            raw = request.args.get(name, str(default))
            if not raw.isascii() or not raw.isdecimal() or len(raw) > 10:
                abort(400, description=f"'{name}' must be a positive integer up to {maximum}.")
            value = int(raw)
            if not 1 <= value <= maximum:
                abort(400, description=f"'{name}' must be a positive integer up to {maximum}.")
            return value

        page = positive_integer("page", 1, 1_000_000_000)
        page_size = positive_integer("page_size", 10, 100)
        db = database()
        total = db.execute("SELECT COUNT(*) FROM conversions WHERE user_id = ?", (g.user["id"],)).fetchone()[0]
        rows = db.execute(
            "SELECT * FROM conversions WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
            (g.user["id"], page_size, (page - 1) * page_size),
        ).fetchall()
        return {"items": [conversion_object(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.delete("/api/conversions/<int:conversion_id>")
    @authenticated
    def delete_conversion(conversion_id):
        db = database()
        cursor = db.execute("DELETE FROM conversions WHERE id = ? AND user_id = ?", (conversion_id, g.user["id"]))
        db.commit()
        if cursor.rowcount == 0:
            abort(404, description="Conversion not found.")
        return "", 204

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            abort(404, description="API endpoint not found.")
        candidate = (DIST / path).resolve()
        if candidate.is_relative_to(DIST) and candidate.is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
