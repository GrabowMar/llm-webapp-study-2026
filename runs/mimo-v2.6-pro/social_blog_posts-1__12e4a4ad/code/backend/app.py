"""Multi-author blog: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"

_raw_data_dir = Path(os.environ.get("DATA_DIR", "data"))
DATA_DIR = _raw_data_dir if _raw_data_dir.is_absolute() else Path.cwd() / _raw_data_dir
DB_PATH = DATA_DIR / "blog.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

EXCERPT_LENGTH = 200
DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    taken_down INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    PRIMARY KEY (post_id, tag)
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
"""


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.executescript(SCHEMA)
        if ADMIN_ENABLED:
            db.execute(
                "INSERT INTO users (username, password_hash, created_at) "
                "VALUES (?, ?, ?) "
                "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash",
                (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), now_iso()),
            )
        db.commit()
    finally:
        db.close()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def error(message: str, status: int):
    return {"error": message}, status


def make_excerpt(content: str) -> str:
    return re.sub(r"[\r\n]+", " ", content[:EXCERPT_LENGTH])


def serialize_post(row: sqlite3.Row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
        "excerpt": make_excerpt(row["content"]),
    }


def tags_for(db: sqlite3.Connection, post_ids: list[int]) -> dict[int, list[str]]:
    result: dict[int, list[str]] = {pid: [] for pid in post_ids}
    if not post_ids:
        return result
    placeholders = ",".join("?" for _ in post_ids)
    rows = db.execute(
        f"SELECT post_id, tag FROM post_tags WHERE post_id IN ({placeholders}) "
        "ORDER BY rowid",
        post_ids,
    ).fetchall()
    for row in rows:
        result[row["post_id"]].append(row["tag"])
    return result


def load_post(db: sqlite3.Connection, post_id: int):
    return db.execute(
        "SELECT p.*, u.username AS author FROM posts p "
        "JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()


def post_payload(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    return serialize_post(row, tags_for(db, [row["id"]])[row["id"]])


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()


def is_admin(user) -> bool:
    return user is not None and user["username"] == ADMIN_USERNAME


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        if not is_admin(user):
            return error("admin access required", 403)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None
    return body


def parse_tags(value):
    if value is None:
        return [], None
    if not isinstance(value, list):
        return None, "tags must be a list of strings"
    tags: list[str] = []
    for item in value:
        if not isinstance(item, str):
            return None, "tags must be a list of strings"
        tag = item.strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags, None


def validate_post_body(body):
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        return None, None, None, "title is required"
    content = body.get("content")
    if not isinstance(content, str) or not content.strip():
        return None, None, None, "content is required"
    tags, tags_error = parse_tags(body.get("tags"))
    if tags_error:
        return None, None, None, tags_error
    return title.strip(), content, tags, None


def parse_paging():
    page_raw = request.args.get("page", "1")
    page_size_raw = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(page_raw)
        page_size = int(page_size_raw)
    except (TypeError, ValueError):
        return None, None, "page and page_size must be integers"
    if page < 1 or page_size < 1:
        return None, None, "page and page_size must be positive integers"
    return page, page_size, None


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return error("request body must be a JSON object", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        return error("username 'admin' is reserved", 400)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username already taken", 409)
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return {"username": username}, 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return error("request body must be a JSON object", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if username == ADMIN_USERNAME and not ADMIN_ENABLED:
        return error("invalid username or password", 401)
    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return {"token": token}, 200


# --------------------------------------------------------------------------
# posts
# --------------------------------------------------------------------------

@app.get("/api/posts")
def list_posts():
    page, page_size, paging_error = parse_paging()
    if paging_error:
        return error(paging_error, 400)
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    author = (request.args.get("author") or "").strip()

    user = current_user()
    visible_sql = "(p.taken_down = 0 OR ?)"
    visible_param = 1 if is_admin(user) else 0

    where = [visible_sql]
    params: list = [visible_param]
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append(
            "(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')"
        )
        params.extend([f"%{escaped}%", f"%{escaped}%"])
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = p.id "
            "AND lower(pt.tag) = lower(?))"
        )
        params.append(tag)
    if author:
        where.append("lower(u.username) = lower(?)")
        params.append(author)
    where_sql = " AND ".join(where)

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM posts p JOIN users u ON u.id = p.author_id "
        f"WHERE {where_sql}",
        params,
    ).fetchone()[0]
    rows = db.execute(
        f"SELECT p.*, u.username AS author FROM posts p "
        f"JOIN users u ON u.id = p.author_id WHERE {where_sql} "
        "ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    tag_map = tags_for(db, [row["id"] for row in rows])
    items = [serialize_post(row, tag_map[row["id"]]) for row in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}, 200


@app.post("/api/posts")
@login_required
def create_post():
    body = json_body()
    if body is None:
        return error("request body must be a JSON object", 400)
    title, content, tags, validation_error = validate_post_body(body)
    if validation_error:
        return error(validation_error, 400)
    db = get_db()
    now = now_iso()
    cursor = db.execute(
        "INSERT INTO posts (title, content, author_id, created_at, updated_at, taken_down) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (title, content, g.user["id"], now, now),
    )
    post_id = cursor.lastrowid
    db.executemany(
        "INSERT INTO post_tags (post_id, tag) VALUES (?, ?)",
        [(post_id, tag) for tag in tags],
    )
    db.commit()
    return post_payload(db, load_post(db, post_id)), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id: int):
    user = current_user()
    db = get_db()
    row = load_post(db, post_id)
    if row is None or (row["taken_down"] and not is_admin(user)):
        return error("post not found", 404)
    return post_payload(db, row), 200


@app.put("/api/posts/<int:post_id>")
@login_required
def update_post(post_id: int):
    body = json_body()
    if body is None:
        return error("request body must be a JSON object", 400)
    title, content, tags, validation_error = validate_post_body(body)
    if validation_error:
        return error(validation_error, 400)
    db = get_db()
    row = load_post(db, post_id)
    if row is None or (row["taken_down"] and not is_admin(g.user)):
        return error("post not found", 404)
    if row["author_id"] != g.user["id"]:
        return error("only the author can edit this post", 403)
    db.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
        (title, content, now_iso(), post_id),
    )
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    db.executemany(
        "INSERT INTO post_tags (post_id, tag) VALUES (?, ?)",
        [(post_id, tag) for tag in tags],
    )
    db.commit()
    return post_payload(db, load_post(db, post_id)), 200


@app.delete("/api/posts/<int:post_id>")
@login_required
def delete_post(post_id: int):
    db = get_db()
    row = load_post(db, post_id)
    if row is None or (row["taken_down"] and not is_admin(g.user)):
        return error("post not found", 404)
    if row["author_id"] != g.user["id"]:
        return error("only the author can delete this post", 403)
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return {"ok": True}, 200


# --------------------------------------------------------------------------
# admin
# --------------------------------------------------------------------------

@app.post("/api/admin/posts/<int:post_id>/toggle")
@admin_required
def toggle_post(post_id: int):
    db = get_db()
    row = db.execute("SELECT taken_down FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is None:
        return error("post not found", 404)
    new_state = 0 if row["taken_down"] else 1
    db.execute("UPDATE posts SET taken_down = ? WHERE id = ?", (new_state, post_id))
    db.commit()
    return {"taken_down": bool(new_state)}, 200


# --------------------------------------------------------------------------
# misc API + frontend
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api")
@app.route("/api/<path:rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(rest: str = ""):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
