"""URL shortener: JSON API under /api, redirect endpoint, frontend serving."""

import hmac
import os
import secrets
import sqlite3
import string
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask
from flask import g
from flask import jsonify
from flask import redirect
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

DEFAULT_PAGE_SIZE = 10
CODE_ALPHABET = string.ascii_letters + string.digits
CODE_LENGTH = 7

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    click_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    owner TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_created_at ON links (created_at);
CREATE INDEX IF NOT EXISTS idx_links_short_code ON links (short_code);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def serialize_link(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner"],
        "is_active": bool(row["is_active"]),
    }


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------

def token_username():
    """Return the username for the Bearer token on the request, or None."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT username FROM tokens WHERE token = ?", (token,)
    ).fetchone()
    if row is None:
        return None
    username = row["username"]
    if username == ADMIN_USERNAME and not ADMIN_PASSWORD:
        return None
    return username


def require_user():
    username = token_username()
    if username is None:
        return None, (jsonify({"error": "Authentication required"}), 401)
    return username, None


def require_admin():
    username = token_username()
    if username is None:
        return None, (jsonify({"error": "Authentication required"}), 401)
    if username != ADMIN_USERNAME:
        return None, (jsonify({"error": "Admin privileges required"}), 403)
    return username, None


def issue_token(username: str) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, username, created_at) VALUES (?, ?, ?)",
        (token, username, now_iso()),
    )
    db.commit()
    return token


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "Password is required"}), 400
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        return jsonify({"error": "Username is reserved"}), 409
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "Username already taken"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "Password is required"}), 400
    username = username.strip()

    if username == ADMIN_USERNAME:
        if not ADMIN_PASSWORD:
            return jsonify({"error": "Admin sign-in is disabled"}), 401
        if not hmac.compare_digest(password, ADMIN_PASSWORD):
            return jsonify({"error": "Invalid username or password"}), 401
    else:
        row = get_db().execute(
            "SELECT password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return jsonify({"error": "Invalid username or password"}), 401

    return jsonify({"token": issue_token(username)})


# ---------------------------------------------------------------------------
# Links
# ---------------------------------------------------------------------------

def parse_pagination():
    raw_page = request.args.get("page", "1")
    raw_size = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(raw_page)
        page_size = int(raw_size)
    except (TypeError, ValueError):
        return None, None, (jsonify({"error": "Invalid pagination parameters"}), 400)
    if page < 1 or page_size < 1:
        return None, None, (jsonify({"error": "Invalid pagination parameters"}), 400)
    return page, page_size, None


def paged_response(rows, total: int, page: int, page_size: int):
    return jsonify(
        {
            "items": [serialize_link(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def find_link(link_id: str, active_only: bool = True):
    try:
        link_id = int(link_id)
    except (TypeError, ValueError):
        return None
    query = "SELECT * FROM links WHERE id = ?"
    if active_only:
        query += " AND is_active = 1"
    return get_db().execute(query, (link_id,)).fetchone()


def validate_url(url):
    if not isinstance(url, str) or not url.strip():
        return None, (jsonify({"error": "URL is required"}), 400)
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return None, (
            jsonify({"error": "Invalid URL: only http and https addresses are accepted"}),
            400,
        )
    return url, None


def generate_short_code(db) -> str:
    for _ in range(16):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        exists = db.execute(
            "SELECT 1 FROM links WHERE short_code = ?", (code,)
        ).fetchone()
        if exists is None:
            return code
    raise RuntimeError("Could not generate a unique short code")


@app.post("/api/links")
def create_link():
    username, err = require_user()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    raw_url = (
        data.get("url") or data.get("original_url") or data.get("long_url") or data.get("link")
    )
    url, err = validate_url(raw_url)
    if err:
        return err
    db = get_db()
    code = generate_short_code(db)
    db.execute(
        "INSERT INTO links (original_url, short_code, click_count, is_active, owner, created_at)"
        " VALUES (?, ?, 0, 1, ?, ?)",
        (url, code, username, now_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM links WHERE short_code = ?", (code,)).fetchone()
    return jsonify(serialize_link(row)), 201


@app.get("/api/links")
def list_links():
    page, page_size, err = parse_pagination()
    if err:
        return err
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM links WHERE is_active = 1"
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM links WHERE is_active = 1"
        " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return paged_response(rows, total, page, page_size)


@app.get("/api/links/<link_id>")
def get_link(link_id: str):
    row = find_link(link_id, active_only=True)
    if row is None:
        return jsonify({"error": "Link not found"}), 404
    return jsonify(serialize_link(row))


@app.delete("/api/links/<link_id>")
def delete_link(link_id: str):
    username, err = require_user()
    if err:
        return err
    row = find_link(link_id, active_only=True)
    if row is None:
        return jsonify({"error": "Link not found"}), 404
    if row["owner"] != username:
        return jsonify({"error": "You may only delete your own links"}), 403
    db = get_db()
    db.execute("DELETE FROM links WHERE id = ?", (row["id"],))
    db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

@app.get("/api/admin/links")
def admin_list_links():
    _, err = require_admin()
    if err:
        return err
    page, page_size, err = parse_pagination()
    if err:
        return err
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM links").fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM links ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return paged_response(rows, total, page, page_size)


@app.post("/api/admin/links/<link_id>/toggle")
def admin_toggle_link(link_id: str):
    _, err = require_admin()
    if err:
        return err
    row = find_link(link_id, active_only=False)
    if row is None:
        return jsonify({"error": "Link not found"}), 404
    db = get_db()
    db.execute(
        "UPDATE links SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?",
        (row["id"],),
    )
    db.commit()
    row = db.execute("SELECT * FROM links WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(serialize_link(row))


# ---------------------------------------------------------------------------
# Redirect
# ---------------------------------------------------------------------------

@app.get("/r/<code>")
def follow_link(code: str):
    db = get_db()
    row = db.execute(
        "SELECT * FROM links WHERE short_code = ? AND is_active = 1", (code,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "Link not found"}), 404
    db.execute(
        "UPDATE links SET click_count = click_count + 1 WHERE id = ?", (row["id"],)
    )
    db.commit()
    return redirect(row["original_url"], code=302)


# ---------------------------------------------------------------------------
# Health + frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/<path:rest>")
def api_not_found(rest: str):
    return jsonify({"error": "Not found"}), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
