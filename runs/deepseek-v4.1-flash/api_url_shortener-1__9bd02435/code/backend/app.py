"""Flask entry point for the URL shortener."""

import os
import secrets
import sqlite3
import string
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, redirect, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"
CODE_ALPHABET = string.ascii_letters + string.digits

app = Flask(__name__, static_folder=None)


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS links (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_url TEXT NOT NULL,
                short_code TEXT NOT NULL UNIQUE,
                click_count INTEGER NOT NULL DEFAULT 0,
                disabled INTEGER NOT NULL DEFAULT 0,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_id);
            CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC, id DESC);
            """
        )
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        existing = conn.execute(
            "SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE"
        ).fetchone()
        if admin_password:
            password_hash = generate_password_hash(admin_password)
            if existing is None:
                try:
                    conn.execute(
                        "INSERT INTO users (username, password_hash, is_admin, created_at) "
                        "VALUES ('admin', ?, 1, ?)",
                        (password_hash, utcnow()),
                    )
                except sqlite3.IntegrityError:
                    conn.execute(
                        "UPDATE users SET password_hash = ?, is_admin = 1 "
                        "WHERE username = 'admin' COLLATE NOCASE",
                        (password_hash,),
                    )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (password_hash, existing["id"]),
                )
        elif existing is not None:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (generate_password_hash(secrets.token_urlsafe(32)), existing["id"]),
            )
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (existing["id"],))
        conn.commit()
    finally:
        conn.close()


init_db()


def json_error(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


def auth_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = auth_user()
    if user is None:
        return None, json_error("Authentication required", 401)
    return user, None


def require_admin():
    user, error = require_user()
    if error is not None:
        return None, error
    if not user["is_admin"]:
        return None, json_error("Admin access required", 403)
    return user, None


def new_short_code(db: sqlite3.Connection) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(7))
        exists = db.execute(
            "SELECT 1 FROM links WHERE short_code = ?", (code,)
        ).fetchone()
        if exists is None:
            return code


def link_dict(row: sqlite3.Row) -> dict:
    keys = row.keys()
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner"] if "owner" in keys else row["owner_username"],
        "disabled": bool(row["disabled"]),
        "active": not bool(row["disabled"]),
    }


LINK_SELECT = (
    "SELECT l.*, u.username AS owner FROM links l "
    "JOIN users u ON u.id = l.owner_id"
)


def pagination_args():
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    return page, page_size


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    if request.path.startswith("/api/"):
        return json_error(error.description or error.name, error.code or 500)
    return error


@app.post("/api/auth/register")
def register():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return json_error("Username and password are required", 400)
    if len(username) > 64:
        return json_error("Username is too long", 400)
    if username.lower() == "admin":
        return json_error("That username is reserved", 400)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) "
            "VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return json_error("Username is already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = request.get_json(silent=True) or {}
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Username and password are required", 400)
    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user, error = require_user()
    if error is not None:
        return error
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "is_admin": bool(user["is_admin"]),
        }
    )


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:].strip()
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"})


@app.post("/api/links")
def create_link():
    user, error = require_user()
    if error is not None:
        return error
    payload = request.get_json(silent=True) or {}
    original_url = (
        payload.get("original_url")
        or payload.get("url")
        or payload.get("long_url")
    )
    if not isinstance(original_url, str) or not original_url.strip():
        return json_error("A URL is required", 400)
    original_url = original_url.strip()
    parsed = urlparse(original_url)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return json_error("Only http and https URLs are allowed", 400)
    if len(original_url) > 2048:
        return json_error("URL is too long", 400)

    db = get_db()
    for _ in range(10):
        code = new_short_code(db)
        try:
            cursor = db.execute(
                "INSERT INTO links (original_url, short_code, click_count, disabled, "
                "owner_id, created_at) VALUES (?, ?, 0, 0, ?, ?)",
                (original_url, code, user["id"], utcnow()),
            )
            db.commit()
            break
        except sqlite3.IntegrityError:
            db.rollback()
    else:
        return json_error("Could not create a short code", 500)

    row = db.execute(LINK_SELECT + " WHERE l.id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(link_dict(row)), 201


@app.get("/api/links")
def list_links():
    page, page_size = pagination_args()
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM links WHERE disabled = 0").fetchone()[0]
    rows = db.execute(
        LINK_SELECT
        + " WHERE l.disabled = 0 ORDER BY l.created_at DESC, l.id DESC "
        "LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [link_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/links/<int:link_id>")
def get_link(link_id: int):
    row = get_db().execute(
        LINK_SELECT + " WHERE l.id = ? AND l.disabled = 0", (link_id,)
    ).fetchone()
    if row is None:
        return json_error("Link not found", 404)
    return jsonify(link_dict(row))


@app.delete("/api/links/<int:link_id>")
def delete_link(link_id: int):
    user, error = require_user()
    if error is not None:
        return error
    db = get_db()
    row = db.execute(
        "SELECT * FROM links WHERE id = ? AND disabled = 0", (link_id,)
    ).fetchone()
    if row is None:
        return json_error("Link not found", 404)
    if row["owner_id"] != user["id"]:
        return json_error("You can only delete your own links", 403)
    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return jsonify({"status": "ok", "id": link_id})


@app.get("/api/admin/links")
def admin_list_links():
    _admin, error = require_admin()
    if error is not None:
        return error
    page, page_size = pagination_args()
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM links").fetchone()[0]
    rows = db.execute(
        LINK_SELECT + " ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [link_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
def admin_toggle_link(link_id: int):
    _admin, error = require_admin()
    if error is not None:
        return error
    db = get_db()
    row = db.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    if row is None:
        return json_error("Link not found", 404)
    db.execute(
        "UPDATE links SET disabled = ? WHERE id = ?",
        (0 if row["disabled"] else 1, link_id),
    )
    db.commit()
    updated = db.execute(LINK_SELECT + " WHERE l.id = ?", (link_id,)).fetchone()
    return jsonify(link_dict(updated))


@app.get("/r/<code>")
def follow_link(code: str):
    db = get_db()
    row = db.execute(
        "SELECT * FROM links WHERE short_code = ? AND disabled = 0", (code,)
    ).fetchone()
    if row is None:
        return json_error("Link not found", 404)
    db.execute(
        "UPDATE links SET click_count = click_count + 1 WHERE id = ?", (row["id"],)
    )
    db.commit()
    return redirect(row["original_url"], code=302)


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str):
    return json_error("Not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
