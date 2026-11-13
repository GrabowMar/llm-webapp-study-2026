"""Flask API and frontend host for the multi-author blog."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "blog.db")))
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    taken_down INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);

CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL,
    tag TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (post_id, tag),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag COLLATE NOCASE);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat(timespec="microseconds")


def next_timestamp(previous: str | None = None) -> str:
    now = utcnow()
    if previous:
        try:
            prev = datetime.fromisoformat(previous)
            if prev.tzinfo is None:
                prev = prev.replace(tzinfo=timezone.utc)
            if now <= prev:
                now = prev + timedelta(microseconds=1)
        except ValueError:
            pass
    return iso(now)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.executescript(SCHEMA)
        if ADMIN_PASSWORD:
            password_hash = generate_password_hash(ADMIN_PASSWORD)
            conn.execute(
                "INSERT OR IGNORE INTO users "
                "(username, password_hash, is_admin, created_at) "
                "VALUES ('admin', ?, 1, ?)",
                (password_hash, iso(utcnow())),
            )
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 "
                "WHERE username = 'admin' COLLATE NOCASE",
                (password_hash,),
            )
        else:
            row = conn.execute(
                "SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE"
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (generate_password_hash(secrets.token_urlsafe(32)), row[0]),
                )
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (row[0],))
        conn.commit()
    finally:
        conn.close()


init_db()


def current_user() -> dict | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    token = parts[1].strip()
    row = get_db().execute(
        "SELECT u.id, u.username, u.is_admin "
        "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def error(message: str, status: int):
    return jsonify({"error": message}), status


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def post_row(post_id: int):
    return get_db().execute(
        "SELECT p.*, u.username AS author FROM posts p "
        "JOIN users u ON u.id = p.user_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()


def serialize_post(row: sqlite3.Row) -> dict:
    tags = [
        r["tag"]
        for r in get_db().execute(
            "SELECT tag FROM post_tags WHERE post_id = ? ORDER BY position, rowid",
            (row["id"],),
        ).fetchall()
    ]
    content = row["content"]
    excerpt = re.sub(r"\r\n|\r|\n", " ", content[:200])
    return {
        "id": row["id"],
        "title": row["title"],
        "content": content,
        "tags": tags,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
        "excerpt": excerpt,
        "taken_down": bool(row["taken_down"]),
    }


def parse_tags(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        value = value.split(",")
    if not isinstance(value, list):
        raise ValueError("Tags must be a list of strings.")
    tags: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            raise ValueError("Tags must be a list of strings.")
        tag = item.strip()
        if not tag:
            continue
        if len(tag) > 50:
            raise ValueError("Tags must be at most 50 characters long.")
        key = tag.casefold()
        if key in seen:
            continue
        seen.add(key)
        tags.append(tag)
    return tags


def clean_text(data: dict, key: str, label: str):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        return None, f"{label} is required."
    return value, None


def like_pattern(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def page_int(name: str, default: int, maximum: int) -> int:
    raw = request.args.get(name)
    try:
        value = int(raw) if raw is not None else default
    except (TypeError, ValueError):
        return default
    if value < 1:
        return default
    return min(value, maximum)


@app.errorhandler(404)
def handle_404(_exc):
    if request.path == "/api" or request.path.startswith("/api/"):
        return error("Not found.", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_exc):
    return error("Method not allowed.", 405)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("Expected a JSON object.", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required.", 400)
    username = username.strip()
    if len(username) > 50:
        return error("Username must be at most 50 characters long.", 400)
    if username.casefold() == "admin":
        return error("That username is reserved.", 409)
    if not isinstance(password, str) or not password:
        return error("Password is required.", 400)
    if len(password) > 200:
        return error("Password must be at most 200 characters long.", 400)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) "
            "VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), iso(utcnow())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("That username is already taken.", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("Expected a JSON object.", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 400)
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], iso(utcnow())),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)
    return jsonify(user)


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token = ?", (parts[1].strip(),))
        db.commit()
    return jsonify({"ok": True})


@app.get("/api/posts")
def list_posts():
    user = current_user()
    page = page_int("page", 1, 1_000_000)
    page_size = page_int("page_size", 10, 1000)
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    author = (request.args.get("author") or "").strip()

    conditions: list[str] = []
    params: list[object] = []
    if not (user and user["is_admin"]):
        conditions.append("p.taken_down = 0")
    if q:
        conditions.append(
            "(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')"
        )
        pattern = like_pattern(q)
        params.extend([pattern, pattern])
    if tag:
        conditions.append(
            "EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id "
            "AND t.tag = ? COLLATE NOCASE)"
        )
        params.append(tag)
    if author:
        conditions.append("u.username = ? COLLATE NOCASE")
        params.append(author)
    where = (" WHERE " + " AND ".join(conditions)) if conditions else ""

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.user_id" + where,
        params,
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT p.*, u.username AS author FROM posts p "
        "JOIN users u ON u.id = p.user_id" + where +
        " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_post(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/posts")
def create_post():
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)
    data = json_body()
    if data is None:
        return error("Expected a JSON object.", 400)
    title, title_error = clean_text(data, "title", "Title")
    if title_error:
        return error(title_error, 400)
    content, content_error = clean_text(data, "content", "Content")
    if content_error:
        return error(content_error, 400)
    try:
        tags = parse_tags(data.get("tags"))
    except ValueError as exc:
        return error(str(exc), 400)

    db = get_db()
    created = iso(utcnow())
    cur = db.execute(
        "INSERT INTO posts (user_id, title, content, created_at, updated_at, taken_down) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (user["id"], title.strip(), content, created, created),
    )
    post_id = cur.lastrowid
    for position, tag in enumerate(tags):
        db.execute(
            "INSERT INTO post_tags (post_id, tag, position) VALUES (?, ?, ?)",
            (post_id, tag, position),
        )
    db.commit()
    return jsonify(serialize_post(post_row(post_id))), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id: int):
    user = current_user()
    row = post_row(post_id)
    if row is None or (row["taken_down"] and not (user and user["is_admin"])):
        return error("Post not found.", 404)
    return jsonify(serialize_post(row))


@app.put("/api/posts/<int:post_id>")
def update_post(post_id: int):
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)
    row = post_row(post_id)
    if row is None or (row["taken_down"] and not user["is_admin"]):
        return error("Post not found.", 404)
    if row["user_id"] != user["id"]:
        return error("Only the author may edit this post.", 403)
    data = json_body()
    if data is None:
        return error("Expected a JSON object.", 400)
    title, title_error = clean_text(data, "title", "Title")
    if title_error:
        return error(title_error, 400)
    content, content_error = clean_text(data, "content", "Content")
    if content_error:
        return error(content_error, 400)
    try:
        tags = parse_tags(data.get("tags"))
    except ValueError as exc:
        return error(str(exc), 400)

    updated = next_timestamp(row["updated_at"])
    db = get_db()
    db.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
        (title.strip(), content, updated, post_id),
    )
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    for position, tag in enumerate(tags):
        db.execute(
            "INSERT INTO post_tags (post_id, tag, position) VALUES (?, ?, ?)",
            (post_id, tag, position),
        )
    db.commit()
    return jsonify(serialize_post(post_row(post_id)))


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id: int):
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)
    row = post_row(post_id)
    if row is None or (row["taken_down"] and not user["is_admin"]):
        return error("Post not found.", 404)
    if row["user_id"] != user["id"]:
        return error("Only the author may delete this post.", 403)
    db = get_db()
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return "", 204


@app.post("/api/admin/posts/<int:post_id>/toggle")
def admin_toggle_post(post_id: int):
    user = current_user()
    if user is None:
        return error("Authentication required.", 401)
    if not user["is_admin"]:
        return error("Administrator access required.", 403)
    row = post_row(post_id)
    if row is None:
        return error("Post not found.", 404)
    db = get_db()
    db.execute(
        "UPDATE posts SET taken_down = ? WHERE id = ?",
        (0 if row["taken_down"] else 1, post_id),
    )
    db.commit()
    return jsonify(serialize_post(post_row(post_id)))


@app.get("/")
def frontend_index():
    return send_from_directory(DIST, "index.html")


@app.get("/<path:path>")
def frontend_file(path: str):
    if path == "api" or path.startswith("api/"):
        return error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
