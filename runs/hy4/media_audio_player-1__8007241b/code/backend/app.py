"""Flask entry point: JSON API + static frontend."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "library.sqlite3"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                url TEXT NOT NULL,
                duration TEXT NOT NULL DEFAULT '0',
                duration_is_number INTEGER NOT NULL DEFAULT 1,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at DESC, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def error(message: str, status: int, **extra):
    payload = {"error": message}
    payload.update(extra)
    return jsonify(payload), status


def validation_error(errors: dict):
    return error(next(iter(errors.values())), 400, errors=errors)


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


TRACK_SELECT = """
    SELECT t.id, t.title, t.artist, t.url, t.duration, t.duration_is_number,
           t.play_count, t.created_at, u.username AS added_by, t.user_id
    FROM tracks t JOIN users u ON u.id = t.user_id
"""


def track_dict(row: sqlite3.Row, viewer_id=None) -> dict:
    duration = row["duration"]
    if row["duration_is_number"]:
        number = float(duration)
        duration = int(number) if number.is_integer() else number
    result = {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "url": row["url"],
        "duration": duration,
        "play_count": row["play_count"],
        "created_at": row["created_at"],
        "added_by": row["added_by"],
        "owned_by_me": viewer_id is not None and viewer_id == row["user_id"],
    }
    return result


def viewer_id():
    user = current_user()
    return user["id"] if user else None


def get_track(track_id: int):
    return get_db().execute(TRACK_SELECT + " WHERE t.id = ?", (track_id,)).fetchone()


def parse_duration(value):
    """Return (stored_text, is_number) or None when invalid. Preserves the
    client's type: JSON numbers round-trip as numbers, strings as strings."""
    if value is None:
        return ("0", 1)
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return (str(value), 1) if value >= 0 else None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            if float(text) < 0:
                return None
        except ValueError:
            pass
        return (text, 0)
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    elif len(username.strip()) > 80:
        errors["username"] = "username must be at most 80 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    username = username.strip()
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username is already taken", 409, errors={"username": "username is already taken"})

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, cur.lastrowid, now_iso()),
    )
    db.commit()
    return jsonify({"username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token})


def positive_int(value, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return number if number > 0 else default


@app.get("/api/tracks")
def list_tracks():
    q = request.args.get("q", "").strip()
    page = positive_int(request.args.get("page"), 1)
    page_size = min(positive_int(request.args.get("page_size"), 20), 100)

    where = ""
    params: list = []
    if q:
        like = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where = " WHERE t.title LIKE ? ESCAPE '\\' OR t.artist LIKE ? ESCAPE '\\' OR t.url LIKE ? ESCAPE '\\'"
        params = [like, like, like]

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM tracks t" + where, params).fetchone()[0]
    owner = viewer_id()
    rows = db.execute(
        TRACK_SELECT + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [track_dict(row, owner) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_track(data: dict):
    errors = {}
    title = data.get("title")
    artist = data.get("artist")
    url = data.get("url")

    if not isinstance(title, str) or not title.strip():
        errors["title"] = "title is required"
    elif len(title.strip()) > 200:
        errors["title"] = "title must be at most 200 characters"
    if not isinstance(artist, str) or not artist.strip():
        errors["artist"] = "artist is required"
    elif len(artist.strip()) > 200:
        errors["artist"] = "artist must be at most 200 characters"

    if not isinstance(url, str) or not url.strip():
        errors["url"] = "url is required"
    elif len(url.strip()) > 2048:
        errors["url"] = "url is too long"
    else:
        parsed = urlparse(url.strip())
        if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
            errors["url"] = "url must be an http or https address"

    duration = parse_duration(data.get("duration"))
    if duration is None:
        errors["duration"] = "duration must be a non-negative number"

    if errors:
        return None, validation_error(errors)
    return (title.strip(), artist.strip(), url.strip(), duration), None


@app.post("/api/tracks")
def add_track():
    user, failure = require_user()
    if failure:
        return failure
    values, failure = validate_track(body())
    if failure:
        return failure
    title, artist, url, duration = values
    cur = get_db().execute(
        """INSERT INTO tracks (title, artist, url, duration, duration_is_number, created_at, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (title, artist, url, duration[0], duration[1], now_iso(), user["id"]),
    )
    get_db().commit()
    return jsonify(track_dict(get_track(cur.lastrowid), user["id"])), 201


@app.get("/api/tracks/<int:track_id>")
def one_track(track_id: int):
    row = get_track(track_id)
    if row is None:
        return error("Track not found", 404)
    return jsonify(track_dict(row, viewer_id()))


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    user, failure = require_user()
    if failure:
        return failure
    db = get_db()
    row = db.execute("SELECT user_id FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error("Track not found", 404)
    if row["user_id"] != user["id"]:
        return error("You may only delete your own tracks", 403)
    db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    db.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def add_play(track_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM tracks WHERE id = ?", (track_id,)).fetchone() is None:
        return error("Track not found", 404)
    db.execute("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,))
    db.commit()
    return jsonify(track_dict(get_track(track_id), viewer_id()))


@app.errorhandler(404)
@app.errorhandler(405)
def api_error(exc):
    if request.path.startswith("/api/"):
        return error(exc.name or "Not found", exc.code or 404)
    return exc.get_response()


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
