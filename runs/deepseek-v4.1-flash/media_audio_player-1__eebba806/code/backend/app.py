"""Audio library API and frontend host."""

from __future__ import annotations

import math
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "audio.db"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.executescript(
            """
            PRAGMA journal_mode = WAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
                artist TEXT NOT NULL DEFAULT '',
                url TEXT NOT NULL,
                duration INTEGER NOT NULL DEFAULT 0,
                play_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                added_by TEXT NOT NULL,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_created
                ON tracks (created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_tracks_user ON tracks (user_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


# ---------------------------------------------------------------------------
# Response / auth helpers
# ---------------------------------------------------------------------------


def error_response(
    message: str, status: int = 400, fields: dict[str, str] | None = None
):
    payload: dict[str, object] = {"error": message, "message": message}
    if fields:
        payload["errors"] = fields
    return jsonify(payload), status


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header or not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def require_user() -> sqlite3.Row | None:
    return current_user()


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


def get_track(track_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def valid_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


_DURATION_RE = re.compile(r"^\d+(?:\.\d+)?$")
_CLOCK_RE = re.compile(r"^(?:(\d+):)?([0-5]?\d):([0-5]?\d)(?:\.(\d+))?$")


def parse_duration(value: object) -> tuple[int | None, str | None]:
    if value is None or value == "":
        return 0, None
    if isinstance(value, bool):
        return None, "Duration must be a number of seconds."
    if isinstance(value, (int, float)):
        seconds = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return 0, None
        if _DURATION_RE.match(text):
            seconds = float(text)
        else:
            match = _CLOCK_RE.match(text)
            if not match:
                return None, "Duration must be a number of seconds."
            hours = int(match.group(1) or 0)
            minutes = int(match.group(2))
            secs = int(match.group(3))
            fraction = float("0." + match.group(4)) if match.group(4) else 0.0
            seconds = hours * 3600 + minutes * 60 + secs + fraction
    else:
        return None, "Duration must be a number of seconds."
    if not math.isfinite(seconds) or seconds < 0 or seconds > 86400 * 10:
        return None, "Duration must be a positive number of seconds."
    return int(round(seconds)), None


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")

    fields: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "Username is required."
    elif len(username.strip()) > 150:
        fields["username"] = "Username must be 150 characters or fewer."
    if not isinstance(password, str) or not password:
        fields["password"] = "Password is required."
    elif len(password) > 1000:
        fields["password"] = "Password is too long."
    if fields:
        return error_response("Please correct the highlighted fields.", 400, fields)

    username = username.strip()  # type: ignore[union-attr]
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error_response(
            "That username is already taken.", 409, {"username": "That username is already taken."}
        )

    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip():
        return error_response(
            "Username and password are required.",
            400,
            {
                **({"username": "Username is required."} if not isinstance(username, str) or not username.strip() else {}),
                **({"password": "Password is required."} if not isinstance(password, str) or not password else {}),
            },
        )

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error_response("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"], "id": row["id"]})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        conn = get_db()
        conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
        conn.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Track endpoints
# ---------------------------------------------------------------------------


@app.get("/api/tracks")
def list_tracks():
    query = (request.args.get("q") or "").strip()
    try:
        page = int(request.args.get("page", "1"))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        page_size = 20
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    where = ""
    params: list[object] = []
    if query:
        like = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where = " WHERE title LIKE ? ESCAPE '\\' OR artist LIKE ? ESCAPE '\\'"
        params = [like, like]

    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM tracks" + where, params
    ).fetchone()["n"]
    rows = conn.execute(
        "SELECT * FROM tracks"
        + where
        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [track_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/tracks")
def create_track():
    user = require_user()
    if user is None:
        return error_response("Authentication required.", 401)

    body = json_body()
    title = body.get("title")
    artist = body.get("artist", "")
    url = body.get("url")
    fields: dict[str, str] = {}

    if not isinstance(title, str) or not title.strip():
        fields["title"] = "Title is required."
    elif len(title.strip()) > 300:
        fields["title"] = "Title must be 300 characters or fewer."

    if artist is None:
        artist = ""
    if not isinstance(artist, str):
        fields["artist"] = "Artist must be text."
    elif len(artist.strip()) > 300:
        fields["artist"] = "Artist must be 300 characters or fewer."

    if not isinstance(url, str) or not url.strip():
        fields["url"] = "An audio URL is required."
    elif not valid_url(url.strip()):
        fields["url"] = "Audio URL must start with http:// or https://."

    duration, duration_error = parse_duration(body.get("duration"))
    if duration_error:
        fields["duration"] = duration_error

    if fields:
        first = next(iter(fields.values()))
        return error_response(first, 400, fields)

    conn = get_db()
    cur = conn.execute(
        """
        INSERT INTO tracks
            (title, artist, url, duration, play_count, created_at, added_by, user_id)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        """,
        (
            title.strip(),
            artist.strip(),
            url.strip(),
            duration or 0,
            now_iso(),
            user["username"],
            user["id"],
        ),
    )
    conn.commit()
    row = get_track(int(cur.lastrowid))
    return jsonify(track_to_dict(row)), 201


@app.get("/api/tracks/<int:track_id>")
def read_track(track_id: int):
    row = get_track(track_id)
    if row is None:
        return error_response("Track not found.", 404)
    return jsonify(track_to_dict(row))


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    user = require_user()
    if user is None:
        return error_response("Authentication required.", 401)

    row = get_track(track_id)
    if row is None:
        return error_response("Track not found.", 404)
    if row["user_id"] != user["id"]:
        return error_response("You can only delete your own tracks.", 403)

    conn = get_db()
    conn.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    conn.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def play_track(track_id: int):
    conn = get_db()
    row = get_track(track_id)
    if row is None:
        return error_response("Track not found.", 404)
    conn.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    conn.commit()
    row = get_track(track_id)
    return jsonify(track_to_dict(row))


# ---------------------------------------------------------------------------
# Health, API fallback and frontend
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error_response("Not found.", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
