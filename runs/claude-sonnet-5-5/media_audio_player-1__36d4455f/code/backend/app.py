"""Audio library API and frontend server."""

import hashlib
import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
MAX_USERNAME = 64
MAX_PASSWORD = 256
MAX_TEXT = 200
MAX_URL = 2048
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

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
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    duration REAL,
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tracks_created ON tracks(created_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False

DUMMY_HASH = generate_password_hash("dummy-password")


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(status: int, message: str, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        if exc.code == 413:
            return error(413, "Request body too large")
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def unexpected(exc: Exception):
    app.logger.exception("Unhandled error", exc_info=exc)
    return error(500, "Internal server error")


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT users.id, users.username, tokens.expires_at FROM tokens "
        "JOIN users ON users.id = tokens.user_id WHERE tokens.token_hash = ?",
        (token_hash(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= iso(now()):
        return None
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, error(401, "Authentication required")
    return user, None


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def track_json(row) -> dict:
    duration = row["duration"]
    if duration is not None and float(duration).is_integer():
        duration = int(duration)
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "url": row["url"],
        "duration": duration,
        "play_count": row["play_count"],
        "created_at": row["created_at"],
        "added_by": row["username"],
    }


TRACK_SELECT = (
    "SELECT tracks.*, users.username AS username FROM tracks "
    "JOIN users ON users.id = tracks.user_id"
)


def fetch_track(track_id: int):
    return db().execute(TRACK_SELECT + " WHERE tracks.id = ?", (track_id,)).fetchone()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) > MAX_PASSWORD:
        errors["password"] = f"Password must be at most {MAX_PASSWORD} characters"
    if errors:
        return error(400, "Validation failed", errors)
    username = username.strip()
    try:
        conn = db()
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso(now())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "Username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    ok = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
    if row is None or not ok:
        return error(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (iso(now()),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_hash(token), row["id"], iso(now() + TOKEN_TTL)),
    )
    conn.commit()
    return {"token": token}


@app.get("/api/auth/me")
def me():
    user, err = require_user()
    if err:
        return err
    return {"username": user["username"]}


def parse_positive_int(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be a positive integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    return value, None


@app.get("/api/tracks")
def list_tracks():
    page, err = parse_positive_int("page", 1)
    if err:
        return error(400, err)
    page_size, err = parse_positive_int("page_size", DEFAULT_PAGE_SIZE)
    if err:
        return error(400, err)
    page_size = min(page_size, MAX_PAGE_SIZE)
    q = (request.args.get("q") or "").strip()
    where = ""
    params: list = []
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        where = " WHERE (tracks.title LIKE ? ESCAPE '\\' OR tracks.artist LIKE ? ESCAPE '\\')"
        params = [like, like]
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM tracks" + where, params).fetchone()[0]
    rows = conn.execute(
        TRACK_SELECT
        + where
        + " ORDER BY tracks.created_at DESC, tracks.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [track_json(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def valid_audio_url(url: str) -> bool:
    if len(url) > MAX_URL or any(c.isspace() or ord(c) < 32 for c in url):
        return False
    try:
        parts = urlsplit(url)
        parts.port
    except ValueError:
        return False
    return parts.scheme.lower() in ("http", "https") and bool(parts.hostname)


@app.post("/api/tracks")
def create_track():
    user, err = require_user()
    if err:
        return err
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    errors = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > MAX_TEXT:
        errors["title"] = f"Title must be at most {MAX_TEXT} characters"

    artist = data.get("artist")
    if artist is None:
        artist = ""
    if not isinstance(artist, str):
        errors["artist"] = "Artist must be a string"
    elif len(artist.strip()) > MAX_TEXT:
        errors["artist"] = f"Artist must be at most {MAX_TEXT} characters"

    url = data.get("url")
    if not isinstance(url, str) or not url.strip():
        errors["url"] = "URL is required"
    else:
        url = url.strip()
        if not valid_audio_url(url):
            errors["url"] = "URL must be a valid http or https address"

    duration = data.get("duration")
    if duration is not None:
        if (
            isinstance(duration, bool)
            or not isinstance(duration, (int, float))
            or not math.isfinite(duration)
            or duration < 0
        ):
            errors["duration"] = "Duration must be a non-negative number of seconds"

    if errors:
        return error(400, "Validation failed", errors)

    conn = db()
    cur = conn.execute(
        "INSERT INTO tracks (title, artist, url, duration, created_at, user_id) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (title.strip(), artist.strip(), url, duration, iso(now()), user["id"]),
    )
    conn.commit()
    return jsonify(track_json(fetch_track(cur.lastrowid))), 201


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id: int):
    row = fetch_track(track_id)
    if row is None:
        return error(404, "Track not found")
    return track_json(row)


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    user, err = require_user()
    if err:
        return err
    conn = db()
    row = conn.execute("SELECT user_id FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error(404, "Track not found")
    if row["user_id"] != user["id"]:
        return error(403, "You can only delete your own tracks")
    conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def add_play(track_id: int):
    conn = db()
    cur = conn.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    conn.commit()
    if cur.rowcount == 0:
        return error(404, "Track not found")
    return track_json(fetch_track(track_id))


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str):
    return error(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
