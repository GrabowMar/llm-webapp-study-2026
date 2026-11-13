"""Flask entry point."""

from __future__ import annotations

import hashlib
import math
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,64}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 256
TITLE_MAX = 200
ARTIST_MAX = 200
URL_MAX = 2048
DURATION_MAX = 7 * 24 * 3600
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False

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
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
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
CREATE INDEX IF NOT EXISTS idx_tracks_created ON tracks(created_at DESC, id DESC);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
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


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="microseconds").replace("+00:00", "Z")


def error(status: int, message: str, errors: dict | None = None):
    body: dict = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def unhandled(exc: Exception):
    app.logger.exception("Unhandled error")
    return error(500, "Internal server error")


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    else:
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; media-src http: https:; connect-src 'self'; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
        )
    return resp


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


# ---------------------------------------------------------------- auth


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username, t.expires_at FROM tokens t "
            "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row and row["expires_at"] > iso(now()):
            g.user = {"id": row["id"], "username": row["username"]}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            resp = error(401, "Authentication required")
            resp[0].headers["WWW-Authenticate"] = "Bearer"
            return resp
        return fn(*args, **kwargs)

    return wrapper


def read_credentials():
    data = json_body()
    if data is None:
        return None, None, error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    if errors:
        return None, None, error(400, "Validation failed", errors)
    return username.strip(), password, None


@app.post("/api/auth/register")
def register():
    username, password, err = read_credentials()
    if err:
        return err
    errors = {}
    if not USERNAME_RE.fullmatch(username):
        errors["username"] = (
            "Username must be 3-64 characters: letters, digits, '_', '.', '@' or '-'"
        )
    if len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters"
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters"
    if errors:
        return error(400, "Validation failed", errors)
    created = iso(now())
    try:
        cur = db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), created),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username, "created_at": created}), 201


_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))


@app.post("/api/auth/login")
def login():
    username, password, err = read_credentials()
    if err:
        return err
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password)
        return error(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    t = now()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (iso(t),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], iso(t), iso(t + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify(
        {"token": token, "user": {"id": row["id"], "username": row["username"]}}
    )


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token.strip()),))
    db().commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify(current_user())


# ---------------------------------------------------------------- tracks

TRACK_SELECT = (
    "SELECT t.id, t.title, t.artist, t.url, t.duration, t.play_count, t.created_at, "
    "t.user_id, u.username AS added_by FROM tracks t JOIN users u ON u.id = t.user_id"
)


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
        "added_by": row["added_by"],
    }


def get_track_row(track_id: int):
    return db().execute(f"{TRACK_SELECT} WHERE t.id = ?", (track_id,)).fetchone()


def has_control_chars(s: str) -> bool:
    return any(ord(c) < 32 or ord(c) == 127 for c in s)


def validate_url(value) -> str | None | tuple:
    if not isinstance(value, str) or not value.strip():
        return None, "URL is required"
    url = value.strip()
    if len(url) > URL_MAX:
        return None, f"URL must be at most {URL_MAX} characters"
    if has_control_chars(url) or any(c.isspace() for c in url):
        return None, "URL must not contain spaces or control characters"
    try:
        parts = urlsplit(url)
        host = parts.hostname
        parts.port
    except ValueError:
        return None, "URL is not valid"
    if parts.scheme.lower() not in ("http", "https"):
        return None, "URL must start with http:// or https://"
    if not host:
        return None, "URL must include a host"
    return url, None


def parse_duration_str(value: str):
    s = value.strip()
    if not s:
        return None
    if re.fullmatch(r"\d+(\.\d+)?", s):
        return float(s) if "." in s else int(s)
    m = re.fullmatch(r"(?:(\d+):)?(\d{1,2}):(\d{2})", s)
    if m and int(m.group(3)) < 60 and (m.group(1) is None or int(m.group(2)) < 60):
        return int(m.group(1) or 0) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
    return value


def parse_track(data: dict):
    errors = {}
    clean = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > TITLE_MAX:
        errors["title"] = f"Title must be at most {TITLE_MAX} characters"
    elif has_control_chars(title.strip()):
        errors["title"] = "Title must not contain control characters"
    else:
        clean["title"] = title.strip()

    artist = data.get("artist")
    if artist is None:
        clean["artist"] = ""
    elif not isinstance(artist, str):
        errors["artist"] = "Artist must be a string"
    elif len(artist.strip()) > ARTIST_MAX:
        errors["artist"] = f"Artist must be at most {ARTIST_MAX} characters"
    elif has_control_chars(artist.strip()):
        errors["artist"] = "Artist must not contain control characters"
    else:
        clean["artist"] = artist.strip()

    url, url_err = validate_url(data.get("url"))
    if url_err:
        errors["url"] = url_err
    else:
        clean["url"] = url

    duration = data.get("duration")
    if isinstance(duration, str):
        duration = parse_duration_str(duration)
    if duration is None or duration == "":
        clean["duration"] = None
    elif isinstance(duration, bool) or not isinstance(duration, (int, float)):
        errors["duration"] = "Duration must be a number of seconds"
    elif not math.isfinite(duration) or duration < 0:
        errors["duration"] = "Duration must be a non-negative number of seconds"
    elif duration > DURATION_MAX:
        errors["duration"] = "Duration is too long"
    else:
        clean["duration"] = duration

    return clean, errors


def int_param(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default, None
    try:
        value = int(raw.strip())
    except ValueError:
        return None, f"'{name}' must be a positive integer"
    if value < 1:
        return None, f"'{name}' must be a positive integer"
    return value, None


@app.get("/api/tracks")
def list_tracks():
    page, err1 = int_param("page", 1)
    page_size, err2 = int_param("page_size", DEFAULT_PAGE_SIZE)
    errors = {}
    if err1:
        errors["page"] = err1
    if err2:
        errors["page_size"] = err2
    if errors:
        return error(400, "Invalid query parameters", errors)
    page_size = min(page_size, MAX_PAGE_SIZE)

    where = ""
    params: list = []
    q = (request.args.get("q") or "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        where = (
            " WHERE (t.title LIKE ? ESCAPE '\\' OR t.artist LIKE ? ESCAPE '\\')"
        )
        params = [pattern, pattern]

    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM tracks t{where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"{TRACK_SELECT}{where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [track_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/tracks")
@login_required
def create_track():
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    clean, errors = parse_track(data)
    if errors:
        return error(400, "Validation failed", errors)
    conn = db()
    cur = conn.execute(
        "INSERT INTO tracks (title, artist, url, duration, play_count, created_at, user_id) "
        "VALUES (?, ?, ?, ?, 0, ?, ?)",
        (
            clean["title"],
            clean["artist"],
            clean["url"],
            clean["duration"],
            iso(now()),
            current_user()["id"],
        ),
    )
    conn.commit()
    resp = jsonify(track_json(get_track_row(cur.lastrowid)))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/tracks/{cur.lastrowid}"
    return resp


@app.get("/api/tracks/<int:track_id>")
def get_track(track_id: int):
    row = get_track_row(track_id)
    if row is None:
        return error(404, "Track not found")
    return jsonify(track_json(row))


@app.delete("/api/tracks/<int:track_id>")
@login_required
def delete_track(track_id: int):
    row = get_track_row(track_id)
    if row is None:
        return error(404, "Track not found")
    if row["user_id"] != current_user()["id"]:
        return error(403, "You can only delete tracks you added")
    conn = db()
    conn.execute("DELETE FROM tracks WHERE id = ? AND user_id = ?", (track_id, current_user()["id"]))
    conn.commit()
    return "", 204


@app.post("/api/tracks/<int:track_id>/plays")
def record_play(track_id: int):
    conn = db()
    cur = conn.execute(
        "UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,)
    )
    conn.commit()
    if cur.rowcount == 0:
        return error(404, "Track not found")
    return jsonify(track_json(get_track_row(track_id)))


# ---------------------------------------------------------------- misc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error(404, "Not found")
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
