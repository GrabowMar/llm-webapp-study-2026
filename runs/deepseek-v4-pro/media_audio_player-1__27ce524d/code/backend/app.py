"""Audio library Flask backend."""

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
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
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            artist TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL,
            duration INTEGER NOT NULL DEFAULT 0,
            play_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            added_by TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def row_to_track(row) -> dict:
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


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None
    return user


def error(message, status):
    return jsonify({"error": message}), status


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return error("username and password are required", 400)
    if len(username) > 64:
        return error("username is too long", 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return error("username is already taken", 409)

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    user_id = cur.lastrowid
    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


def valid_audio_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


@app.get("/api/tracks")
def list_tracks():
    q = (request.args.get("q") or "").strip()
    try:
        page = max(int(request.args.get("page", 1)), 1)
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        page_size = 20
    page_size = min(max(page_size, 1), 100)

    db = get_db()
    where = ""
    params: list = []
    if q:
        like = f"%{q}%"
        where = "WHERE title LIKE ? OR artist LIKE ? OR url LIKE ?"
        params = [like, like, like]

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM tracks {where}", params
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"""
        SELECT * FROM tracks {where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    items = [row_to_track(r) for r in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/tracks")
def add_track():
    user = require_user()
    if user is None:
        return error("authentication required", 401)

    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    artist = (data.get("artist") or "").strip()
    url = (data.get("url") or "").strip()

    if not title:
        return error("title is required", 400)
    if not url:
        return error("url is required", 400)
    if not valid_audio_url(url):
        return error("url must be a valid http or https audio address", 400)

    duration = data.get("duration")
    if duration is None:
        duration = 0
    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 0
    if duration < 0:
        duration = 0

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO tracks (title, artist, url, duration, play_count, created_at, user_id, added_by)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (title, artist, url, duration, now_iso(), user["id"], user["username"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM tracks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_track(row)), 201


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id):
    row = get_db().execute(
        "SELECT * FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()
    if row is None:
        return error("track not found", 404)
    return jsonify(row_to_track(row))


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id):
    user = require_user()
    if user is None:
        return error("authentication required", 401)

    db = get_db()
    row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error("track not found", 404)
    if row["user_id"] != user["id"]:
        return error("you can only delete your own tracks", 403)

    db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    db.commit()
    return jsonify({"deleted": True})


@app.post("/api/tracks/<int:track_id>/plays")
def record_play(track_id):
    db = get_db()
    row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error("track not found", 404)
    db.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    db.commit()
    row = db.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    return jsonify(row_to_track(row))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
