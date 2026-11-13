"""Flask entry point: URL shortener API and frontend host."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit

from flask import Flask, Response, abort, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join
from werkzeug.urls import iri_to_uri

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

ADMIN_NAME = "admin"
TOKEN_TTL = timedelta(days=30)
CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
CODE_LENGTH = 7
MAX_URL_LENGTH = 2048
MAX_PASSWORD_LENGTH = 128
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,32}$")
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS links_created ON links(created_at DESC, id DESC);
"""

LINK_SELECT = (
    "SELECT links.id, links.original_url, links.short_code, links.click_count, "
    "links.created_at, links.active, links.owner_id, users.username AS owner "
    "FROM links JOIN users ON users.id = links.owner_id "
)

app = Flask(__name__, static_folder=None)


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute(
            "DELETE FROM tokens WHERE user_id IN "
            "(SELECT id FROM users WHERE username = ?)",
            (ADMIN_NAME,),
        )
        conn.execute(
            "DELETE FROM tokens WHERE expires_at < ?", (now_iso(),)
        )
        conn.commit()
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def error(message: str, status: int):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def handle_http(exc: HTTPException):
    if request.path.startswith("/api/") or request.path.startswith("/r/"):
        return error(exc.description or exc.name, exc.code or 500)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    app.logger.exception("unhandled error", exc_info=exc)
    return error("Internal server error", 500)


@app.after_request
def security_headers(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    """Return the signed-in user row, or None."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT users.id, users.username, tokens.expires_at FROM tokens "
        "JOIN users ON users.id = tokens.user_id WHERE tokens.token_hash = ?",
        (token_digest(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        return None
    if row["username"] == ADMIN_NAME and not admin_password():
        return None
    return row


def is_admin(user) -> bool:
    return user["username"] == ADMIN_NAME and bool(admin_password())


def require_user():
    user = current_user()
    if user is None:
        abort(401, "Authentication required")
    return user


def require_admin():
    user = require_user()
    if not is_admin(user):
        abort(403, "Admin access required")
    return user


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "Request body must be a JSON object")
    return data


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_digest(token), user_id, expires),
    )
    db.commit()
    return token


DUMMY_HASH = generate_password_hash("dummy-password")


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return error("Username and password are required", 400)
    if not USERNAME_RE.match(username):
        return error(
            "Username must be 1-32 characters: letters, digits, '.', '_' or '-'", 400
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        return error(f"Password must be at most {MAX_PASSWORD_LENGTH} characters", 400)
    if username.lower() == ADMIN_NAME:
        return error("Username is not available", 409)
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("Username is not available", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required", 400)
    username = username.strip()
    if len(password) > MAX_PASSWORD_LENGTH:
        return error("Invalid username or password", 401)
    db = get_db()

    if username.lower() == ADMIN_NAME:
        expected = admin_password()
        if not expected or not hmac.compare_digest(
            password.encode(), expected.encode()
        ):
            return error("Invalid username or password", 401)
        row = db.execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_NAME,)
        ).fetchone()
        if row is None:
            cur = db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (ADMIN_NAME, "!"),
            )
            db.commit()
            user_id = cur.lastrowid
        else:
            user_id = row["id"]
        return jsonify({"token": issue_token(user_id)})

    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return error("Invalid username or password", 401)
    if not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)
    return jsonify({"token": issue_token(row["id"])})


def validate_url(value) -> str:
    if not isinstance(value, str):
        abort(400, "Address is required")
    url = value.strip()
    if not url:
        abort(400, "Address is required")
    if len(url) > MAX_URL_LENGTH:
        abort(400, f"Address must be at most {MAX_URL_LENGTH} characters")
    if any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url):
        abort(400, "Address must not contain spaces or control characters")
    try:
        parts = urlsplit(url)
        _ = parts.port
    except ValueError:
        abort(400, "Address is not a valid URL")
    if parts.scheme.lower() not in ("http", "https"):
        abort(400, "Only http and https addresses are allowed")
    if not parts.hostname:
        abort(400, "Address must include a host")
    if not url.isascii():
        url = iri_to_uri(url)
    return url


def link_json(row, admin: bool = False) -> dict:
    out = {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner"],
    }
    if admin:
        out["active"] = bool(row["active"])
    return out


def paging():
    def read(name: str, default: int) -> int:
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except ValueError:
            abort(400, f"{name} must be an integer")
        if value < 1:
            abort(400, f"{name} must be at least 1")
        return value

    page = read("page", 1)
    page_size = min(read("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    return page, page_size


def paged_links(where: str, admin: bool):
    page, page_size = paging()
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM links {where}").fetchone()[0]
    rows = db.execute(
        LINK_SELECT
        + where
        + " ORDER BY links.created_at DESC, links.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [link_json(r, admin) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/links")
def create_link():
    user = require_user()
    data = json_body()
    raw = data.get("original_url", data.get("url"))
    url = validate_url(raw)
    db = get_db()
    for _ in range(10):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        try:
            cur = db.execute(
                "INSERT INTO links (original_url, short_code, created_at, owner_id) "
                "VALUES (?, ?, ?, ?)",
                (url, code, now_iso(), user["id"]),
            )
            db.commit()
            break
        except sqlite3.IntegrityError:
            db.rollback()
    else:
        abort(500, "Could not allocate a short code")
    row = db.execute(LINK_SELECT + "WHERE links.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(link_json(row)), 201


@app.get("/api/links")
def list_links():
    return paged_links("WHERE links.active = 1", False)


def active_link(link_id: int):
    row = get_db().execute(
        LINK_SELECT + "WHERE links.id = ? AND links.active = 1", (link_id,)
    ).fetchone()
    if row is None:
        abort(404, "Link not found")
    return row


@app.get("/api/links/<int:link_id>")
def get_link(link_id: int):
    return jsonify(link_json(active_link(link_id)))


@app.delete("/api/links/<int:link_id>")
def delete_link(link_id: int):
    user = require_user()
    row = active_link(link_id)
    if row["owner_id"] != user["id"]:
        abort(403, "You can only delete your own links")
    db = get_db()
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return "", 204


@app.get("/api/admin/links")
def admin_list_links():
    require_admin()
    return paged_links("", True)


@app.post("/api/admin/links/<int:link_id>/toggle")
def admin_toggle_link(link_id: int):
    require_admin()
    db = get_db()
    cur = db.execute(
        "UPDATE links SET active = 1 - active WHERE id = ?", (link_id,)
    )
    db.commit()
    if cur.rowcount == 0:
        abort(404, "Link not found")
    row = db.execute(LINK_SELECT + "WHERE links.id = ?", (link_id,)).fetchone()
    return jsonify(link_json(row, True))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    abort(404, "Not found")


@app.get("/r/<code>")
def follow(code: str):
    db = get_db()
    row = db.execute(
        "SELECT id, original_url FROM links WHERE short_code = ? AND active = 1",
        (code,),
    ).fetchone()
    if row is None:
        abort(404, "Link not found")
    if request.method != "HEAD":
        db.execute(
            "UPDATE links SET click_count = click_count + 1 WHERE id = ?",
            (row["id"],),
        )
        db.commit()
    resp = Response(status=302)
    resp.headers["Location"] = row["original_url"]
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target is not None and os.path.isfile(target):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
