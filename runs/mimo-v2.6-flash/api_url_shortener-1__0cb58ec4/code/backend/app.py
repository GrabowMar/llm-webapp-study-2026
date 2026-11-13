"""Flask entry point for the URL shortener."""

from __future__ import annotations

import os
import secrets
import string
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, abort, g, jsonify, redirect, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_url TEXT NOT NULL,
    short_code TEXT NOT NULL UNIQUE,
    click_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_links_code ON links(short_code);
"""

CODE_ALPHABET = string.ascii_letters + string.digits

ADMIN_SIGNIN_ENABLED = False


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exception):
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
    }


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def init_admin() -> None:
    global ADMIN_SIGNIN_ENABLED
    password = os.environ.get("ADMIN_PASSWORD") or ""
    ADMIN_SIGNIN_ENABLED = bool(password)
    if not password:
        return
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
        pw_hash = generate_password_hash(password)
        if row is not None:
            conn.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, row["id"])
            )
        else:
            conn.execute(
                "INSERT INTO users (username, password_hash) VALUES ('admin', ?)",
                (pw_hash,),
            )
        conn.commit()
    finally:
        conn.close()


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id AS id, u.username AS username "
        "FROM users u JOIN tokens t ON t.user_id = u.id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        abort(401)
    return user


def require_admin():
    user = require_user()
    if user["username"] != "admin":
        abort(403)
    return user


@app.errorhandler(401)
def handle_unauthorized(_error):
    return jsonify({"error": "unauthorized"}), 401


@app.errorhandler(403)
def handle_forbidden(_error):
    return jsonify({"error": "forbidden"}), 403


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def text_field(data: dict, *keys: str) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str):
            return value
    return ""


def parse_paging() -> tuple[int, int]:
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    return page, page_size


def is_valid_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def new_short_code(db: sqlite3.Connection) -> str:
    for _ in range(32):
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(7))
        row = db.execute("SELECT 1 FROM links WHERE short_code = ?", (code,)).fetchone()
        if row is None:
            return code
    raise RuntimeError("could not generate a unique short code")


# ---------------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = text_field(data, "username").strip()
    password = text_field(data, "password")
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if username.lower() == "admin":
        return jsonify({"error": "username is reserved"}), 409
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = text_field(data, "username").strip()
    password = text_field(data, "password")
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if username == "admin" and not ADMIN_SIGNIN_ENABLED:
        return jsonify({"error": "admin sign-in is disabled"}), 401
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/links")
def create_link():
    user = require_user()
    data = json_body()
    original_url = text_field(
        data, "original_url", "url", "long_url", "target", "address"
    ).strip()
    if not original_url:
        return jsonify({"error": "original_url is required"}), 400
    if not is_valid_url(original_url):
        return jsonify({"error": "only http and https addresses are allowed"}), 400
    db = get_db()
    code = new_short_code(db)
    created_at = now_iso()
    cursor = db.execute(
        "INSERT INTO links (user_id, original_url, short_code, click_count, created_at, active) "
        "VALUES (?, ?, ?, 0, ?, 1)",
        (user["id"], original_url, code, created_at),
    )
    db.commit()
    row = db.execute(
        "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
        "u.username AS owner "
        "FROM links l JOIN users u ON u.id = l.user_id WHERE l.id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(serialize_link(row)), 201


@app.get("/api/links")
def list_links():
    page, page_size = parse_paging()
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS c FROM links WHERE active = 1"
    ).fetchone()["c"]
    rows = db.execute(
        "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
        "u.username AS owner "
        "FROM links l JOIN users u ON u.id = l.user_id "
        "WHERE l.active = 1 "
        "ORDER BY l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/links/<int:link_id>")
def get_link(link_id: int):
    db = get_db()
    row = db.execute(
        "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
        "u.username AS owner "
        "FROM links l JOIN users u ON u.id = l.user_id "
        "WHERE l.id = ? AND l.active = 1",
        (link_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(serialize_link(row))


@app.delete("/api/links/<int:link_id>")
def delete_link(link_id: int):
    user = require_user()
    db = get_db()
    row = db.execute(
        "SELECT id, user_id FROM links WHERE id = ? AND active = 1", (link_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return jsonify({"error": "not found"}), 404
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/admin/links")
def admin_list_links():
    require_admin()
    page, page_size = parse_paging()
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS c FROM links").fetchone()["c"]
    rows = db.execute(
        "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
        "u.username AS owner "
        "FROM links l JOIN users u ON u.id = l.user_id "
        "ORDER BY l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
def admin_toggle_link(link_id: int):
    require_admin()
    db = get_db()
    row = db.execute("SELECT active FROM links WHERE id = ?", (link_id,)).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    db.execute(
        "UPDATE links SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?",
        (link_id,),
    )
    db.commit()
    row = db.execute(
        "SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at, "
        "u.username AS owner "
        "FROM links l JOIN users u ON u.id = l.user_id WHERE l.id = ?",
        (link_id,),
    ).fetchone()
    return jsonify(serialize_link(row))


# ---------------------------------------------------------------------------
# Short-link redirect (must take precedence over the frontend routes)
# ---------------------------------------------------------------------------


@app.get("/r/<code>")
def follow_link(code: str):
    db = get_db()
    cursor = db.execute(
        "UPDATE links SET click_count = click_count + 1 "
        "WHERE short_code = ? AND active = 1",
        (code,),
    )
    db.commit()
    if cursor.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    row = db.execute(
        "SELECT original_url FROM links WHERE short_code = ?", (code,)
    ).fetchone()
    return redirect(row["original_url"], code=302)


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if path == "r" or path.startswith("r/"):
        return jsonify({"error": "not found"}), 404
    full = safe_join(str(DIST), path)
    if full is not None and Path(full).is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "frontend build not found"}), 404


init_db()
init_admin()
