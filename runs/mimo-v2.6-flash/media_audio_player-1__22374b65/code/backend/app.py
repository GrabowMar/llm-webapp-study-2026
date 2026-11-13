"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import re
import secrets
import sqlite3
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

import db
from db import get_db, utcnow

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 1000

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(db.close_db)


# ---------------------------------------------------------------- helpers


def error(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


def body() -> dict:
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        return {}
    return data


def text_field(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        return ""
    return value.strip()


def current_user():
    """Return the signed-in user row for the request, or None."""
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def serialize_track(row) -> dict:
    duration = row["duration"]
    if isinstance(duration, float) and duration.is_integer():
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


def valid_audio_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https"):
        return False
    if not parts.netloc or " " in value:
        return False
    return True


def parse_duration(value) -> float | None:
    """Accept seconds (int/float/numeric string) or an ``m:ss`` string."""
    if value is None or value == "":
        return 0.0
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        seconds = float(value)
    elif isinstance(value, str):
        raw = value.strip()
        if re.fullmatch(r"\d+(\.\d+)?", raw):
            seconds = float(raw)
        elif re.fullmatch(r"\d+:\d{1,2}(:\d{1,2})?", raw):
            parts = [int(part) for part in raw.split(":")]
            seconds = 0.0
            for part in parts:
                seconds = seconds * 60 + part
        else:
            return None
    else:
        return None
    if seconds < 0 or seconds != seconds or seconds == float("inf"):
        return None
    return seconds


# ---------------------------------------------------------------- accounts


@app.post("/api/auth/register")
def register():
    data = body()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if not username:
        return error("Username is required.", 400)
    if not password:
        return error("Password is required.", 400)
    if len(password) > 200:
        return error("Password is too long.", 400)

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("Username is already taken.", 409)
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at)"
            " VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
    except sqlite3.IntegrityError:
        return error("Username is already taken.", 409)
    conn.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if not username or not password:
        return error("Username and password are required.", 400)

    conn = get_db()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    conn.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        conn = get_db()
        conn.execute("DELETE FROM tokens WHERE token = ?", (token.strip(),))
        conn.commit()
    return jsonify({"ok": True}), 200


# ---------------------------------------------------------------- tracks


@app.get("/api/tracks")
def list_tracks():
    raw_q = request.args.get("q", "")
    q = raw_q.strip() if isinstance(raw_q, str) else ""

    raw_page = request.args.get("page", "1")
    raw_size = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(raw_page)
        page_size = int(raw_size)
    except (TypeError, ValueError):
        return error("page and page_size must be integers.", 400)
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 1
    page_size = min(page_size, MAX_PAGE_SIZE)

    where = ""
    params: list = []
    if q:
        escaped = (
            q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        where = (
            " WHERE LOWER(t.title) LIKE ? ESCAPE '\\'"
            " OR LOWER(t.artist) LIKE ? ESCAPE '\\'"
            " OR LOWER(u.username) LIKE ? ESCAPE '\\'"
        )
        params = [pattern, pattern, pattern]

    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM tracks t"
        " JOIN users u ON u.id = t.user_id" + where,
        params,
    ).fetchone()["n"]
    rows = conn.execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id"
        + where
        + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_track(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.post("/api/tracks")
def create_track():
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)

    data = body()
    title = text_field(data, "title")
    artist = text_field(data, "artist")
    url = text_field(data, "url")

    if not title:
        return error("Title is required.", 400)
    if len(title) > 300:
        return error("Title is too long.", 400)
    if len(artist) > 300:
        return error("Artist is too long.", 400)
    if not url:
        return error("URL is required.", 400)
    if not valid_audio_url(url):
        return error("Only http and https audio URLs are allowed.", 400)

    duration = parse_duration(data.get("duration"))
    if duration is None:
        return error("Duration must be a non-negative number of seconds.", 400)

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO tracks (user_id, title, artist, url, duration, play_count, created_at)"
        " VALUES (?, ?, ?, ?, ?, 0, ?)",
        (user["id"], title, artist, url, duration, utcnow()),
    )
    conn.commit()
    row = conn.execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(serialize_track(row)), 201


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id: int):
    row = get_db().execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (track_id,),
    ).fetchone()
    if row is None:
        return error("Track not found.", 404)
    return jsonify(serialize_track(row)), 200


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)

    conn = get_db()
    row = conn.execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (track_id,),
    ).fetchone()
    if row is None:
        return error("Track not found.", 404)
    if row["user_id"] != user["id"]:
        return error("You can only delete your own tracks.", 403)
    conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.commit()
    return jsonify({"ok": True, "id": track_id}), 200


@app.post("/api/tracks/<int:track_id>/plays")
def add_play(track_id: int):
    conn = get_db()
    row = conn.execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (track_id,),
    ).fetchone()
    if row is None:
        return error("Track not found.", 404)
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    conn.commit()
    row = conn.execute(
        "SELECT t.*, u.username FROM tracks t"
        " JOIN users u ON u.id = t.user_id WHERE t.id = ?",
        (track_id,),
    ).fetchone()
    return jsonify(serialize_track(row)), 200


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found.", 404)
    if path != "index.html" and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return error("Frontend build not found.", 404)


db.init_db()
