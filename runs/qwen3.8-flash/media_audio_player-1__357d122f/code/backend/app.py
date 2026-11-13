"""Flask entry point for the audio library API."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("./data")
DB_PATH = DATA_DIR / "audio.db"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY") or secrets.token_hex(32)

_serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"], salt="auth-token")


class ApiError(Exception):
    def __init__(self, status: int, message: str, fields: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.fields = fields or {}


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.fields:
        body["fields"] = err.fields
    return jsonify(body), err.status


@app.errorhandler(404)
def handle_not_found(_err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return index()


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

def get_db() -> sqlite3.Connection:
    db = g.get("db")
    if db is None:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                url TEXT NOT NULL,
                duration REAL NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC)")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #

def create_token(user_id: int, username: str) -> str:
    return _serializer.dumps({"uid": user_id, "username": username})


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    try:
        data = _serializer.loads(token, max_age=60 * 60 * 24 * 30)
    except (BadSignature, SignatureExpired):
        return None
    row = get_db().execute(
        "SELECT * FROM users WHERE id = ?", (data.get("uid"),)
    ).fetchone()
    return row


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError(401, "authentication required")
    return user


# --------------------------------------------------------------------------- #
# Track serialization / validation
# --------------------------------------------------------------------------- #

def track_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "url": row["url"],
        "duration": row["duration"],
        "play_count": row["play_count"],
        "created_at": row["created_at"],
        "added_by": row["username"],
    }


TRACK_SELECT = (
    "SELECT t.*, u.username AS username FROM tracks t "
    "JOIN users u ON u.id = t.user_id"
)


def validate_track_payload(data) -> dict:
    if not isinstance(data, dict):
        raise ApiError(400, "request body must be a JSON object")

    fields = {}
    title = data.get("title")
    artist = data.get("artist")
    url = data.get("url")
    duration = data.get("duration")

    if not isinstance(title, str) or not title.strip():
        fields["title"] = "title is required"
    if not isinstance(artist, str) or not artist.strip():
        fields["artist"] = "artist is required"

    if not isinstance(url, str) or not url.strip():
        fields["url"] = "url is required"
    else:
        try:
            scheme = urlsplit(url.strip()).scheme.lower()
        except ValueError:
            scheme = ""
        if scheme not in ("http", "https"):
            fields["url"] = "url must start with http:// or https://"

    if duration is None or isinstance(duration, bool) or not isinstance(duration, (int, float)):
        fields["duration"] = "duration must be a number of seconds"
    elif duration <= 0:
        fields["duration"] = "duration must be greater than 0"

    if fields:
        raise ApiError(
            400,
            "; ".join(fields[k] for k in ("title", "artist", "url", "duration") if k in fields),
            fields,
        )

    return {
        "title": title.strip(),
        "artist": artist.strip(),
        "url": url.strip(),
        "duration": round(float(duration), 3),
    }


# --------------------------------------------------------------------------- #
# Auth routes
# --------------------------------------------------------------------------- #

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    fields = {}
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        fields["username"] = "username must be 3-32 characters: letters, digits, . _ -"
    if not isinstance(password, str) or len(password) < 8:
        fields["password"] = "password must be at least 8 characters"
    if fields:
        raise ApiError(400, "; ".join(fields.values()), fields)

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "username already taken", {"username": "username already taken"})
    db.commit()

    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return jsonify({"token": create_token(user["id"], user["username"])}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    fields = {}
    if not isinstance(username, str) or not username:
        fields["username"] = "username is required"
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        raise ApiError(400, "; ".join(fields.values()), fields)

    user = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "invalid username or password")

    return jsonify({"token": create_token(user["id"], user["username"])})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"username": user["username"]})


# --------------------------------------------------------------------------- #
# Track routes
# --------------------------------------------------------------------------- #

@app.get("/api/tracks")
def list_tracks():
    q = (request.args.get("q") or "").strip()
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        raise ApiError(400, "page and page_size must be integers")
    if page < 1:
        raise ApiError(400, "page must be 1 or greater")
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        raise ApiError(400, f"page_size must be between 1 and {MAX_PAGE_SIZE}")

    where = ""
    params: list = []
    if q:
        where = "WHERE (t.title LIKE ? OR t.artist LIKE ? OR u.username LIKE ?)"
        like = f"%{q}%"
        params = [like, like, like]

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM tracks t JOIN users u ON u.id = t.user_id {where}",
        params,
    ).fetchone()["n"]

    rows = db.execute(
        f"{TRACK_SELECT} {where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify({
        "items": [track_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/tracks")
def add_track():
    user = require_user()
    track = validate_track_payload(request.get_json(silent=True))

    db = get_db()
    cur = db.execute(
        "INSERT INTO tracks (title, artist, url, duration, user_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            track["title"],
            track["artist"],
            track["url"],
            track["duration"],
            user["id"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(f"{TRACK_SELECT} WHERE t.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(track_to_dict(row)), 201


def get_track_or_404(track_id: int) -> sqlite3.Row:
    row = get_db().execute(f"{TRACK_SELECT} WHERE t.id = ?", (track_id,)).fetchone()
    if row is None:
        raise ApiError(404, "track not found")
    return row


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id: int):
    return jsonify(track_to_dict(get_track_or_404(track_id)))


@app.delete("/api/tracks/<int:track_id>")
def delete_track(track_id: int):
    user = require_user()
    row = get_track_or_404(track_id)
    if row["user_id"] != user["id"]:
        raise ApiError(403, "you can only delete tracks you added")
    db = get_db()
    db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    db.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def register_play(track_id: int):
    db = get_db()
    db.execute("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,))
    db.commit()
    return jsonify(track_to_dict(get_track_or_404(track_id)))


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    return index(path)


def index(path: str = "index.html"):
    candidate = DIST / path
    if path and candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok"}


init_db()
