"""Audio library: JSON API under /api plus the frontend build."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from itsdangerous import BadSignature
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DIST = BASE_DIR / "frontend" / "dist"
DB_PATH = DATA_DIR / "app.db"

TOKEN_MAX_AGE = 30 * 24 * 60 * 60
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL,
                duration NUMERIC NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                added_by TEXT NOT NULL
            );
            """
        )


def load_secret_key() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = DATA_DIR / ".secret_key"
    key = secrets.token_hex(32).encode("ascii")
    try:
        with key_file.open("xb") as fh:
            fh.write(key)
        return key
    except FileExistsError:
        return key_file.read_bytes()


init_db()
serializer = URLSafeTimedSerializer(load_secret_key(), salt="auth-token")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def error(message: str, status: int):
    return jsonify({"error": message}), status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def track_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "url": row["url"],
        "duration": row["duration"],
        "play_count": row["play_count"],
        "created_at": row["created_at"],
        "added_by": row["added_by"],
    }


def get_track_or_none(track_id: int):
    row = get_db().execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    return track_to_dict(row) if row else None


def current_username():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        payload = serializer.loads(token.strip(), max_age=TOKEN_MAX_AGE)
    except BadSignature:
        return None
    if not isinstance(payload, dict):
        return None
    username = payload.get("username")
    if not isinstance(username, str):
        return None
    db = get_db()
    row = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    return username if row else None


def require_user():
    """Return (username, error_response); exactly one is not None."""
    username = current_username()
    if username is None:
        return None, error("authentication required", 401)
    return username, None


def body_json():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None, error("request body must be a JSON object", 400)
    return body, None


def field_str(body: dict, name: str, *, required: bool):
    """Return (value, error_response)."""
    value = body.get(name)
    if value is None:
        if required:
            return None, error(f"{name} is required", 400)
        return "", None
    if not isinstance(value, str):
        return None, error(f"{name} must be a string", 400)
    value = value.strip()
    if required and not value:
        return None, error(f"{name} is required", 400)
    return value, None


def parse_duration(value):
    """Return (duration, error_response)."""
    if value is None:
        return 0, None
    if isinstance(value, bool):
        return None, error("duration must be a non-negative number", 400)
    if isinstance(value, (int, float)):
        duration = value
    elif isinstance(value, str):
        try:
            duration = float(value)
        except ValueError:
            return None, error("duration must be a non-negative number", 400)
    else:
        return None, error("duration must be a non-negative number", 400)
    if duration != duration or duration < 0:
        return None, error("duration must be a non-negative number", 400)
    if isinstance(duration, float) and duration.is_integer():
        return int(duration), None
    return duration, None


def valid_audio_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def parse_paging():
    def parse_int(name: str, default: int) -> int:
        try:
            return int(request.args.get(name, ""))
        except (TypeError, ValueError):
            return default

    page = max(parse_int("page", 1), 1)
    page_size = parse_int("page_size", DEFAULT_PAGE_SIZE)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)
    return page, page_size


def like_pattern(q: str) -> str:
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


# ---------------------------------------------------------------------------
# Accounts
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    body, err = body_json()
    if err:
        return err
    username, err = field_str(body, "username", required=True)
    if err:
        return err
    password = body.get("password")
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    if len(username) > 64:
        return error("username must be at most 64 characters", 400)
    if len(password) > 256:
        return error("password must be at most 256 characters", 400)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body, err = body_json()
    if err:
        return err
    username, err = field_str(body, "username", required=True)
    if err:
        return err
    password = body.get("password")
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    db = get_db()
    row = db.execute(
        "SELECT password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = serializer.dumps({"username": username})
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    username, err = require_user()
    if err:
        return err
    return jsonify({"username": username}), 200


# ---------------------------------------------------------------------------
# Tracks
# ---------------------------------------------------------------------------

@app.get("/api/tracks")
def list_tracks():
    q = request.args.get("q", "").strip()
    page, page_size = parse_paging()
    db = get_db()
    if q:
        pattern = like_pattern(q)
        where = "WHERE lower(title) LIKE lower(?) ESCAPE '\\' OR lower(artist) LIKE lower(?) ESCAPE '\\'"
        params: tuple = (pattern, pattern)
    else:
        where = ""
        params = ()
    total = db.execute(f"SELECT COUNT(*) AS n FROM tracks {where}", params).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM tracks {where} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [track_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.post("/api/tracks")
def add_track():
    username, err = require_user()
    if err:
        return err
    body, err = body_json()
    if err:
        return err
    title, err = field_str(body, "title", required=True)
    if err:
        return err
    artist, err = field_str(body, "artist", required=False)
    if err:
        return err
    url, err = field_str(body, "url", required=True)
    if err:
        return err
    if not valid_audio_url(url):
        return error("url must be an http or https address", 400)
    duration, err = parse_duration(body.get("duration"))
    if err:
        return err
    db = get_db()
    created_at = now_iso()
    cur = db.execute(
        "INSERT INTO tracks (title, artist, url, duration, play_count, created_at, added_by)"
        " VALUES (?, ?, ?, ?, 0, ?, ?)",
        (title, artist, url, duration, created_at, username),
    )
    db.commit()
    return jsonify(get_track_or_none(cur.lastrowid)), 201


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id: int):
    track = get_track_or_none(track_id)
    if track is None:
        return error("track not found", 404)
    return jsonify(track), 200


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    username, err = require_user()
    if err:
        return err
    db = get_db()
    row = db.execute("SELECT added_by FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error("track not found", 404)
    if row["added_by"] != username:
        return error("only the user who added a track may delete it", 403)
    db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    db.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def add_play(track_id: int):
    db = get_db()
    row = db.execute("SELECT 1 FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error("track not found", 404)
    db.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    db.commit()
    return jsonify(get_track_or_none(track_id)), 200


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
