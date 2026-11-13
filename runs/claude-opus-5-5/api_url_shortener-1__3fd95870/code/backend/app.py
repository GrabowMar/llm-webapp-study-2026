"""Flask entry point."""

import hashlib
import os
import re
import secrets
import sqlite3
import string
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.urls import iri_to_uri
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

TOKEN_TTL = timedelta(days=30)
CODE_ALPHABET = string.ascii_letters + string.digits
CODE_LENGTH = 7
MAX_URL_LENGTH = 2048
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@+-]{3,64}$")
MIN_PASSWORD_LENGTH = 4
MAX_PASSWORD_LENGTH = 256

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    click_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS links_created_idx ON links (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
"""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="microseconds").replace("+00:00", "Z")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
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
        if ADMIN_PASSWORD:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) "
                "VALUES (?, ?, 1, ?) "
                "ON CONFLICT(username) DO UPDATE SET "
                "password_hash = excluded.password_hash, is_admin = 1",
                (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), iso(now_utc())),
            )
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (iso(now_utc()),))
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


def error(status: int, message: str):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    if isinstance(exc, HTTPException):
        return handle_http_error(exc)
    app.logger.exception("Unhandled error")
    return error(500, "Internal server error")


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, u.is_admin, s.expires_at FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < iso(now_utc()):
        return None
    if row["is_admin"] and not ADMIN_PASSWORD:
        return None
    g.user = {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            return error(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "Authentication required")
        if not user["is_admin"]:
            return error(403, "Admin access required")
        return fn(*args, **kwargs)

    return wrapper


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def short_url_for(code: str) -> str:
    return f"{request.host_url.rstrip('/')}/r/{code}"


def link_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": short_url_for(row["short_code"]),
        "owner": row["owner"],
        "is_active": bool(row["is_active"]),
    }


LINK_SELECT = (
    "SELECT l.id, l.original_url, l.short_code, l.click_count, l.is_active, "
    "l.created_at, l.user_id, u.username AS owner FROM links l JOIN users u ON u.id = l.user_id"
)


def get_link(link_id: int, include_inactive: bool = False):
    sql = LINK_SELECT + " WHERE l.id = ?"
    if not include_inactive:
        sql += " AND l.is_active = 1"
    return db().execute(sql, (link_id,)).fetchone()


def paging():
    def parse(name: str, default: int):
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except ValueError:
            return None
        return value if value >= 1 else None

    page = parse("page", 1)
    page_size = parse("page_size", DEFAULT_PAGE_SIZE)
    if page is None:
        return None, None, "page must be a positive integer"
    if page_size is None:
        return None, None, "page_size must be a positive integer"
    return page, min(page_size, MAX_PAGE_SIZE), None


def paged_links(where: str):
    page, page_size, err = paging()
    if err:
        return error(400, err)
    total = db().execute(f"SELECT COUNT(*) FROM links l {where}").fetchone()[0]
    rows = db().execute(
        f"{LINK_SELECT} {where} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [link_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_url(value) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return "original_url is required"
    value = value.strip()
    if len(value) > MAX_URL_LENGTH:
        return f"original_url must be at most {MAX_URL_LENGTH} characters"
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in value):
        return "original_url must not contain whitespace or control characters"
    try:
        parts = urlsplit(value)
        hostname = parts.hostname
        parts.port
    except ValueError:
        return "original_url is not a valid URL"
    if parts.scheme.lower() not in ("http", "https"):
        return "Only http and https URLs are allowed"
    if not parts.netloc or not hostname:
        return "original_url must include a host"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        return error(
            400,
            "username must be 3-64 characters: letters, digits or _ . @ + -",
        )
    username = username.strip()
    if not isinstance(password, str) or not (
        MIN_PASSWORD_LENGTH <= len(password) <= MAX_PASSWORD_LENGTH
    ):
        return error(
            400,
            f"password must be {MIN_PASSWORD_LENGTH}-{MAX_PASSWORD_LENGTH} characters",
        )
    if username.lower() == ADMIN_USERNAME:
        return error(409, "Username is already taken")
    try:
        cur = db().execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), iso(now_utc())),
        )
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


_DUMMY_HASH = generate_password_hash(secrets.token_urlsafe(16))


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return error(400, "username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is not None and row["is_admin"] and not ADMIN_PASSWORD:
        row = None
    valid = check_password_hash(row["password_hash"] if row else _DUMMY_HASH, password)
    if row is None or not valid:
        return error(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    created = now_utc()
    db().execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], iso(created), iso(created + TOKEN_TTL)),
    )
    return jsonify(
        {"token": token, "username": row["username"], "is_admin": bool(row["is_admin"])}
    )


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        db().execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token.strip()),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"], "is_admin": user["is_admin"]})


@app.post("/api/links")
@login_required
def create_link():
    data = json_body()
    raw = data.get("original_url")
    if raw is None:
        raw = data.get("url")
    message = validate_url(raw)
    if message:
        return error(400, message)
    url = raw.strip()
    created = iso(now_utc())
    for _ in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        try:
            cur = db().execute(
                "INSERT INTO links (original_url, short_code, user_id, created_at) VALUES (?, ?, ?, ?)",
                (url, code, current_user()["id"], created),
            )
            break
        except sqlite3.IntegrityError:
            continue
    else:
        return error(500, "Could not generate a unique short code")
    return jsonify(link_json(get_link(cur.lastrowid, include_inactive=True))), 201


@app.get("/api/links")
def list_links():
    return paged_links("WHERE l.is_active = 1")


@app.get("/api/links/<int:link_id>")
def get_link_view(link_id: int):
    row = get_link(link_id)
    if row is None:
        return error(404, "Link not found")
    return jsonify(link_json(row))


@app.delete("/api/links/<int:link_id>")
@login_required
def delete_link(link_id: int):
    row = get_link(link_id)
    if row is None:
        return error(404, "Link not found")
    if row["user_id"] != current_user()["id"]:
        return error(403, "You can only delete your own links")
    db().execute("DELETE FROM links WHERE id = ?", (link_id,))
    return "", 204


@app.get("/api/admin/links")
@admin_required
def admin_list_links():
    return paged_links("")


@app.post("/api/admin/links/<int:link_id>/toggle")
@admin_required
def admin_toggle_link(link_id: int):
    cur = db().execute(
        "UPDATE links SET is_active = 1 - is_active WHERE id = ?", (link_id,)
    )
    if cur.rowcount == 0:
        return error(404, "Link not found")
    return jsonify(link_json(get_link(link_id, include_inactive=True)))


class RedirectResponse(Response):
    autocorrect_location_header = False

    def get_wsgi_headers(self, environ):
        headers = super().get_wsgi_headers(environ)
        if "Location" in self.headers:
            headers["Location"] = self.headers["Location"]
        return headers


@app.get("/r/<code>")
def follow(code: str):
    row = db().execute(
        "UPDATE links SET click_count = click_count + 1 "
        "WHERE short_code = ? AND is_active = 1 RETURNING original_url",
        (code,),
    ).fetchone()
    if row is None:
        return error(404, "Link not found")
    url = row["original_url"]
    location = url if url.isascii() else iri_to_uri(url)
    resp = RedirectResponse(status=302)
    resp.headers["Location"] = location
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/r/<path:code>")
def follow_invalid(code: str):
    return error(404, "Link not found")


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str = ""):
    return error(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
