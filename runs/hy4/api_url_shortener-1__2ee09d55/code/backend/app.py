"""URL shortener: JSON API, redirect endpoint and static frontend."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, g, jsonify, redirect, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "links.sqlite3"
DIST = BASE_DIR / "frontend" / "dist"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

CODE_RE = re.compile(r"^[A-Za-z0-9]{4,32}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")

app = Flask(__name__, static_folder=None)


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA busy_timeout = 30000")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
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
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_links_created ON links(created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_links_code ON links(short_code);
            """
        )
        conn.commit()
    finally:
        conn.close()

    admin_password = ADMIN_PASSWORD
    with app.app_context():
        conn = db()
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT id FROM users WHERE username = ?", ("admin",)).fetchone()
        if admin_password:
            password_hash = generate_password_hash(admin_password)
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                    ("admin", password_hash),
                )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ?",
                    (password_hash, "admin"),
                )
                conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
        elif row is not None:
            conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
            conn.execute("DELETE FROM users WHERE id = ?", (row["id"],))
        conn.execute("COMMIT")


init_db()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def json_error(message, status):
    return jsonify({"error": message}), status


def body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return (
        db()
        .execute(
            """
            SELECT u.id, u.username, u.is_admin
            FROM tokens t JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
            """,
            (token,),
        )
        .fetchone()
    )


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return json_error("Authentication required.", 401)
        return fn(user, *args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return json_error("Authentication required.", 401)
        if not user["is_admin"]:
            return json_error("Administrator access required.", 403)
        return fn(user, *args, **kwargs)

    return wrapper


def serialize_link(row, include_active=False):
    link = {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner"],
    }
    if include_active:
        link["is_active"] = bool(row["is_active"])
    return link


LINK_SELECT = """
    SELECT l.id, l.original_url, l.short_code, l.click_count, l.created_at,
           l.is_active, u.username AS owner
    FROM links l JOIN users u ON u.id = l.user_id
"""


def pagination():
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page = max(1, page)
    page_size = max(1, min(100, page_size))
    return page, page_size


def validate_url(url):
    if not isinstance(url, str):
        return None
    url = url.strip()
    if not url or len(url) > 2048 or any(c.isspace() for c in url):
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return None
    return url


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        return json_error(
            "Username must be 1-64 characters: letters, digits, '.', '_' or '-'.", 400
        )
    if username.lower() == "admin":
        return json_error("That username is reserved.", 400)
    if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
        return json_error("Password must be between 8 and 256 characters.", 400)
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        return json_error("Username is already taken.", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Invalid username or password.", 401)
    user = db().execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("Invalid username or password.", 401)
    if user["is_admin"] and not ADMIN_PASSWORD:
        return json_error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    return jsonify({"token": token, "username": username, "is_admin": bool(user["is_admin"])})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        db().execute("DELETE FROM tokens WHERE token = ?", (header[7:].strip(),))
    return jsonify({"status": "ok"})


@app.get("/api/me")
@require_user
def me(user):
    return jsonify(
        {"username": user["username"], "is_admin": bool(user["is_admin"])}
    )


@app.post("/api/links")
@require_user
def create_link(user):
    url = validate_url(body().get("original_url"))
    if url is None:
        return json_error("Enter a valid http or https address.", 400)
    conn = db()
    for _ in range(10):
        code = secrets.token_urlsafe(6).replace("-", "a").replace("_", "b")
        try:
            cursor = conn.execute(
                """
                INSERT INTO links (user_id, original_url, short_code, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (user["id"], url, code, now_iso()),
            )
            break
        except sqlite3.IntegrityError:
            continue
    else:
        return json_error("Could not generate a short code, please retry.", 500)
    row = conn.execute(LINK_SELECT + " WHERE l.id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize_link(row)), 201


@app.get("/api/links")
def list_links():
    page, page_size = pagination()
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM links WHERE is_active = 1"
    ).fetchone()[0]
    rows = conn.execute(
        LINK_SELECT
        + " WHERE l.is_active = 1 ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
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
def get_link(link_id):
    row = db().execute(
        LINK_SELECT + " WHERE l.id = ? AND l.is_active = 1", (link_id,)
    ).fetchone()
    if row is None:
        return json_error("Link not found.", 404)
    return jsonify(serialize_link(row))


@app.delete("/api/links/<int:link_id>")
@require_user
def delete_link(user, link_id):
    conn = db()
    row = conn.execute(
        "SELECT user_id FROM links WHERE id = ?", (link_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return json_error("Link not found.", 404)
    conn.execute("DELETE FROM links WHERE id = ?", (link_id,))
    return jsonify({"status": "ok"})


@app.get("/api/admin/links")
@require_admin
def admin_list_links(admin):
    page, page_size = pagination()
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM links").fetchone()[0]
    rows = conn.execute(
        LINK_SELECT
        + " ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(r, include_active=True) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
@require_admin
def admin_toggle_link(admin, link_id):
    conn = db()
    row = conn.execute(
        "SELECT is_active FROM links WHERE id = ?", (link_id,)
    ).fetchone()
    if row is None:
        return json_error("Link not found.", 404)
    conn.execute(
        "UPDATE links SET is_active = ? WHERE id = ?",
        (0 if row["is_active"] else 1, link_id),
    )
    updated = conn.execute(LINK_SELECT + " WHERE l.id = ?", (link_id,)).fetchone()
    return jsonify(serialize_link(updated, include_active=True))


@app.get("/r/<code>")
def follow_link(code):
    if not CODE_RE.fullmatch(code):
        return json_error("Link not found.", 404)
    conn = db()
    row = conn.execute(
        "SELECT original_url FROM links WHERE short_code = ? AND is_active = 1",
        (code,),
    ).fetchone()
    if row is None:
        return json_error("Link not found.", 404)
    conn.execute(
        "UPDATE links SET click_count = click_count + 1 WHERE short_code = ?",
        (code,),
    )
    return redirect(row["original_url"], code=302)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api" or path.startswith("r/"):
        return json_error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
