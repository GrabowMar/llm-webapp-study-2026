"""Flask entry point for the URL shortener."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, redirect, request, send_from_directory
from werkzeug.exceptions import HTTPException, NotFound

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (ROOT / "data"))
DB_PATH = DATA_DIR / "urlshortener.db"

CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 7
PBKDF2_ROUNDS = 120_000
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# helpers

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def err(message: str, status: int):
    return jsonify({"error": message}), status


def get_db() -> sqlite3.Connection:
    db = getattr(g, "db", None)
    if db is None:
        db = g.db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA busy_timeout = 5000")
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT    NOT NULL,
    short_code   TEXT    NOT NULL UNIQUE,
    click_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL,
    owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    active       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at DESC, id DESC);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA busy_timeout = 10000")
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# passwords / admin

def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD") or ""


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ROUNDS
    )
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, salt, digest = stored.split("$", 2)
        check = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ROUNDS
        )
    except ValueError:
        return False
    return secrets.compare_digest(check.hex(), digest)


def ensure_admin() -> None:
    password = admin_password()
    if not password:
        return
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA busy_timeout = 10000")
    db.execute(
        "INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        ("admin", hash_password(password), now_iso()),
    )
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# auth / sessions

def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return token


def require_user():
    user = current_user()
    if user is None:
        return None, err("Authentication required", 401)
    return user, None


def require_admin():
    user = current_user()
    if user is None:
        return None, err("Authentication required", 401)
    if user["username"] != "admin":
        return None, err("Admin access required", 403)
    return user, None


# ---------------------------------------------------------------------------
# links

LINK_SELECT = (
    "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
    "l.active, u.username AS owner, l.owner_id "
    "FROM links l JOIN users u ON u.id = l.owner_id"
)


def serialize_link(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner"],
        "active": bool(row["active"]),
    }


def fetch_link(link_id: int) -> sqlite3.Row | None:
    return get_db().execute(LINK_SELECT + " WHERE l.id = ?", (link_id,)).fetchone()


def generate_code(db: sqlite3.Connection) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not db.execute("SELECT 1 FROM links WHERE short_code = ?", (code,)).fetchone():
            return code


def clean_url(raw) -> str | None:
    if not isinstance(raw, str):
        return None
    url = raw.strip()
    if not url or len(url) > 2048:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.netloc or not parsed.hostname:
        return None
    return url


def paginate() -> tuple[int, int]:
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    return max(1, page), min(max(1, page_size), MAX_PAGE_SIZE)


# ---------------------------------------------------------------------------
# auth endpoints

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("Request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return err("username is required", 400)
    if not isinstance(password, str) or not password:
        return err("password is required", 400)
    username = username.strip()
    if len(username) > 64:
        return err("username must be at most 64 characters", 400)
    if len(password) > 128:
        return err("password must be at most 128 characters", 400)
    if username == "admin":
        return err("This username is reserved", 409)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return err("Username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("Request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return err("username and password are required", 400)
    username = username.strip()

    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()

    if username == "admin":
        env_password = admin_password()
        if not env_password or not secrets.compare_digest(password, env_password):
            return err("Invalid username or password", 401)
        if row is None:
            db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                ("admin", hash_password(env_password), now_iso()),
            )
            db.commit()
            row = db.execute(
                "SELECT id, password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
    else:
        if row is None or not verify_password(password, row["password_hash"]):
            return err("Invalid username or password", 401)

    token = issue_token(row["id"])
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------------------
# link endpoints

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/links")
def create_link():
    user, error = require_user()
    if error:
        return error
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return err("Request body must be a JSON object", 400)
    url = clean_url(data.get("original_url", data.get("url")))
    if url is None:
        return err("Only http and https addresses are accepted", 400)
    db = get_db()
    for _attempt in range(5):
        code = generate_code(db)
        try:
            cur = db.execute(
                "INSERT INTO links (original_url, short_code, created_at, owner_id, active) "
                "VALUES (?, ?, ?, ?, 1)",
                (url, code, now_iso(), user["id"]),
            )
            db.commit()
            break
        except sqlite3.IntegrityError:
            db.rollback()
    else:
        return err("Could not allocate a short code, try again", 500)
    return jsonify(serialize_link(fetch_link(cur.lastrowid))), 201


@app.get("/api/links")
def list_links():
    page, page_size = paginate()
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM links WHERE active = 1").fetchone()["n"]
    rows = db.execute(
        LINK_SELECT + " WHERE l.active = 1 ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/links/<int:link_id>")
def get_link(link_id: int):
    row = fetch_link(link_id)
    if row is None or not row["active"]:
        return err("Link not found", 404)
    return jsonify(serialize_link(row))


@app.delete("/api/links/<int:link_id>")
def delete_link(link_id: int):
    user, error = require_user()
    if error:
        return error
    row = fetch_link(link_id)
    if row is None or not row["active"]:
        return err("Link not found", 404)
    if row["owner_id"] != user["id"]:
        return err("You can only delete your own links", 403)
    db = get_db()
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return jsonify(serialize_link(row))


# ---------------------------------------------------------------------------
# admin endpoints

@app.get("/api/admin/links")
def admin_links():
    _user, error = require_admin()
    if error:
        return error
    page, page_size = paginate()
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM links").fetchone()["n"]
    rows = db.execute(
        LINK_SELECT + " ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
def admin_toggle_link(link_id: int):
    _user, error = require_admin()
    if error:
        return error
    row = fetch_link(link_id)
    if row is None:
        return err("Link not found", 404)
    db = get_db()
    db.execute(
        "UPDATE links SET active = ? WHERE id = ?", (0 if row["active"] else 1, link_id)
    )
    db.commit()
    return jsonify(serialize_link(fetch_link(link_id)))


# ---------------------------------------------------------------------------
# redirects (must win over the frontend catch-all below)

@app.get("/r/<code>")
def follow(code: str):
    db = get_db()
    row = db.execute(LINK_SELECT + " WHERE l.short_code = ?", (code,)).fetchone()
    if row is None or not row["active"]:
        return err("Link not found", 404)
    db.execute("UPDATE links SET click_count = click_count + 1 WHERE id = ?", (row["id"],))
    db.commit()
    return redirect(row["original_url"], code=302)


# ---------------------------------------------------------------------------
# frontend

@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    return jsonify({"error": exc.description or exc.name}), exc.code


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/") or path == "r" or path.startswith("r/"):
        return err("Not found", 404)
    if path:
        try:
            return send_from_directory(DIST, path)
        except NotFound:
            pass
    try:
        return send_from_directory(DIST, "index.html")
    except NotFound:
        return err("Not found", 404)


init_db()
ensure_admin()
