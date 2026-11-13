"""Flask entry point."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from fetcher import FetchError, InvalidURL, fetch_preview, normalize_url

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"
TOKEN_TTL = timedelta(days=30)
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
USERNAME_MAX = 64
PASSWORD_MIN = 6
PASSWORD_MAX = 256

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
CREATE TABLE IF NOT EXISTS previews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    final_url TEXT,
    status_code INTEGER,
    title TEXT,
    description TEXT,
    image_url TEXT,
    fetched_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_previews_user ON previews(user_id, created_at DESC, id DESC);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


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
def close_db(_exc) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(message: str, status: int):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error(exc.description or exc.name, exc.code or 500)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    if isinstance(exc, HTTPException):
        return handle_http_error(exc)
    app.logger.exception("unhandled error")
    return error("internal server error", 500)


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return {}
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 256:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= now_iso():
        return None
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


def validate_credentials(data: dict):
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None, "username and password are required"
    username = username.strip()
    if not username:
        return None, None, "username is required"
    if len(username) > USERNAME_MAX:
        return None, None, f"username must be at most {USERNAME_MAX} characters"
    if any(ch.isspace() or not ch.isprintable() for ch in username):
        return None, None, "username must not contain spaces or control characters"
    if not password:
        return None, None, "password is required"
    return username, password, None


@app.post("/api/auth/register")
def register():
    username, password, err = validate_credentials(json_body())
    if err:
        return error(err, 400)
    if len(password) < PASSWORD_MIN:
        return error(f"password must be at least {PASSWORD_MIN} characters", 400)
    if len(password) > PASSWORD_MAX:
        return error(f"password must be at most {PASSWORD_MAX} characters", 400)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error("username is already taken", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, err = validate_credentials(json_body())
    if err:
        return error(err, 400)
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or len(password) > PASSWORD_MAX or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    conn.execute("DELETE FROM tokens WHERE user_id = ? AND expires_at <= ?", (row["id"], now_iso()))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            hash_token(token),
            row["id"],
            now_iso(),
            (now + TOKEN_TTL).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        ),
    )
    conn.commit()
    return {"token": token, "username": row["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token.strip()),))
    conn.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "url": row["url"],
        "final_url": row["final_url"],
        "status_code": row["status_code"],
        "title": row["title"],
        "description": row["description"],
        "image_url": row["image_url"],
        "fetched_at": row["fetched_at"],
    }


def get_owned(preview_id: int):
    return db().execute(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user["id"])
    ).fetchone()


def parse_positive_int(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default, None
    try:
        value = int(raw.strip())
    except ValueError:
        return None, f"{name} must be a positive integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    return value, None


@app.get("/api/previews")
@login_required
def list_previews():
    page, err = parse_positive_int("page", 1)
    if err:
        return error(err, 400)
    page_size, err = parse_positive_int("page_size", DEFAULT_PAGE_SIZE)
    if err:
        return error(err, 400)
    page_size = min(page_size, MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM previews WHERE user_id = ?", (g.user["id"],)
    ).fetchone()[0]
    offset = (page - 1) * page_size
    rows = conn.execute(
        "SELECT * FROM previews WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (g.user["id"], page_size, offset),
    ).fetchall() if offset < total else []
    return {
        "items": [serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/previews")
@login_required
def create_preview():
    data = json_body()
    try:
        url = normalize_url(data.get("url"))
    except InvalidURL as exc:
        return error(str(exc), 400)
    try:
        result = fetch_preview(url)
    except InvalidURL as exc:
        return error(str(exc), 400)
    except FetchError as exc:
        return error(f"could not fetch the page: {exc}", 502)
    conn = db()
    ts = now_iso()
    cur = conn.execute(
        "INSERT INTO previews (user_id, url, final_url, status_code, title, description, image_url, "
        "fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            url,
            result.final_url,
            result.status_code,
            result.title,
            result.description,
            result.image_url,
            ts,
            ts,
        ),
    )
    conn.commit()
    return jsonify(serialize(get_owned(cur.lastrowid))), 201


@app.get("/api/previews/<int:preview_id>")
@login_required
def get_preview(preview_id: int):
    row = get_owned(preview_id)
    if row is None:
        return error("preview not found", 404)
    return serialize(row)


@app.post("/api/previews/<int:preview_id>/refresh")
@login_required
def refresh_preview(preview_id: int):
    row = get_owned(preview_id)
    if row is None:
        return error("preview not found", 404)
    try:
        result = fetch_preview(row["url"])
    except (FetchError, InvalidURL) as exc:
        return error(f"could not fetch the page: {exc}", 502)
    conn = db()
    cur = conn.execute(
        "UPDATE previews SET final_url = ?, status_code = ?, title = ?, description = ?, "
        "image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
        (
            result.final_url,
            result.status_code,
            result.title,
            result.description,
            result.image_url,
            now_iso(),
            preview_id,
            g.user["id"],
        ),
    )
    conn.commit()
    if cur.rowcount == 0:
        return error("preview not found", 404)
    return serialize(get_owned(preview_id))


@app.delete("/api/previews/<int:preview_id>")
@login_required
def delete_preview(preview_id: int):
    conn = db()
    cur = conn.execute(
        "DELETE FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user["id"])
    )
    conn.commit()
    if cur.rowcount == 0:
        return error("preview not found", 404)
    return "", 204


@app.route("/api", strict_slashes=False, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_rest: str = ""):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")
