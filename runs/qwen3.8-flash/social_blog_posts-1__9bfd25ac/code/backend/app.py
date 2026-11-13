"""Multi-author blog: Flask API + static frontend server."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "blog.db"

app = Flask(__name__, static_folder=None)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,30}$")
PBKDF2_ITERATIONS = 120_000
MAX_TITLE_LEN = 300
MAX_CONTENT_LEN = 20_000
MAX_TAGS = 20
MAX_TAG_LEN = 50
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    token TEXT
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    taken_down INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (post_id, position)
);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    try:
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(digest_hex)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return secrets.compare_digest(digest, expected)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(SCHEMA)
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if admin_password:
            admin_hash = hash_password(admin_password)
        else:
            admin_hash = f"disabled${secrets.token_hex(32)}"
        db.execute(
            """
            INSERT INTO users (username, password_hash, is_admin)
            VALUES ('admin', ?, 1)
            ON CONFLICT(username) DO UPDATE SET
                password_hash = excluded.password_hash,
                is_admin = 1
            """,
            (admin_hash,),
        )
        db.commit()


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc: Exception | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def json_error(message: str, status: int):
    return jsonify({"error": message}), status


def get_json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    match = re.match(r"^\s*Bearer\s+(\S+)\s*$", header, re.IGNORECASE)
    if not match:
        return None
    token = match.group(1)
    row = get_db().execute("SELECT * FROM users WHERE token = ?", (token,)).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, json_error("Authentication required", 401)
    return user, None


def excerpt(content: str) -> str:
    return content.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ")[:200]


def serialize_post(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    tags = [
        t["tag"]
        for t in db.execute(
            "SELECT tag FROM post_tags WHERE post_id = ? ORDER BY position", (row["id"],)
        )
    ]
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
        "excerpt": excerpt(row["content"]),
        "taken_down": bool(row["taken_down"]),
    }


def fetch_post(db: sqlite3.Connection, post_id: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT p.*, u.username AS author FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()


def save_tags(db: sqlite3.Connection, post_id: int, tags: list[str]) -> None:
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    for position, tag in enumerate(tags):
        db.execute(
            "INSERT INTO post_tags (post_id, position, tag) VALUES (?, ?, ?)",
            (post_id, position, tag),
        )


def parse_post_data(data: dict):
    title = data.get("title")
    content = data.get("content")
    raw_tags = data.get("tags", [])
    if not isinstance(title, str) or not title.strip():
        return None, "Title is required"
    title = title.strip()
    if len(title) > MAX_TITLE_LEN:
        return None, f"Title must be at most {MAX_TITLE_LEN} characters"
    if not isinstance(content, str) or not content.strip():
        return None, "Content is required"
    if len(content) > MAX_CONTENT_LEN:
        return None, f"Content must be at most {MAX_CONTENT_LEN} characters"
    if not isinstance(raw_tags, list) or not all(isinstance(t, str) for t in raw_tags):
        return None, "Tags must be a list of strings"
    tags: list[str] = []
    seen: set[str] = set()
    for raw in raw_tags:
        tag = raw.strip()
        if not tag:
            continue
        if len(tag) > MAX_TAG_LEN:
            return None, f"Each tag must be at most {MAX_TAG_LEN} characters"
        if tag.lower() in seen:
            continue
        seen.add(tag.lower())
        tags.append(tag)
    if len(tags) > MAX_TAGS:
        return None, f"At most {MAX_TAGS} tags are allowed"
    return {"title": title, "content": content, "tags": tags}, None


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        return json_error(
            "Username must be 3-30 characters using letters, digits, '_', '.' or '-'", 400
        )
    username = username.strip()
    if not isinstance(password, str) or len(password) < 6:
        return json_error("Password must be at least 6 characters", 400)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
    except sqlite3.IntegrityError:
        return json_error("Username is already taken", 409)
    db.commit()
    return jsonify({"message": "Account created", "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Username and password are required", 400)
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return json_error("Invalid username or password", 401)
    token = secrets.token_hex(32)
    db.execute("UPDATE users SET token = ? WHERE id = ?", (token, row["id"]))
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return json_error("Authentication required", 401)
    return jsonify({"username": user["username"], "is_admin": bool(user["is_admin"])}), 200


# ---------------------------------------------------------------- posts


@app.get("/api/posts")
def list_posts():
    db = get_db()
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    author = (request.args.get("author") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(MAX_PAGE_SIZE, page_size))

    where = ["p.taken_down = 0"]
    params: list = []
    if q:
        escaped = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(lower(p.title) LIKE ? ESCAPE '\\' OR lower(p.content) LIKE ? ESCAPE '\\')")
        like = f"%{escaped}%"
        params.extend([like, like])
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = p.id AND lower(pt.tag) = ?)"
        )
        params.append(tag.lower())
    if author:
        where.append("lower(u.username) = ?")
        params.append(author.lower())
    where_sql = " AND ".join(where)

    total = db.execute(
        f"SELECT COUNT(*) AS n FROM posts p JOIN users u ON u.id = p.author_id WHERE {where_sql}",
        params,
    ).fetchone()["n"]
    rows = db.execute(
        f"""
        SELECT p.*, u.username AS author
        FROM posts p JOIN users u ON u.id = p.author_id
        WHERE {where_sql}
        ORDER BY p.created_at DESC, p.id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = [serialize_post(db, r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size}), 200


@app.post("/api/posts")
def create_post():
    user, err = require_user()
    if err:
        return err
    payload, error = parse_post_data(get_json_body())
    if error:
        return json_error(error, 400)
    db = get_db()
    stamp = now_iso()
    cur = db.execute(
        "INSERT INTO posts (title, content, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (payload["title"], payload["content"], user["id"], stamp, stamp),
    )
    save_tags(db, cur.lastrowid, payload["tags"])
    db.commit()
    row = fetch_post(db, cur.lastrowid)
    return jsonify(serialize_post(db, row)), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id: int):
    db = get_db()
    row = fetch_post(db, post_id)
    if row is None:
        return json_error("Post not found", 404)
    if row["taken_down"]:
        viewer = current_user()
        if viewer is None or not viewer["is_admin"]:
            return json_error("Post not found", 404)
    return jsonify(serialize_post(db, row)), 200


@app.put("/api/posts/<int:post_id>")
def update_post(post_id: int):
    user, err = require_user()
    if err:
        return err
    db = get_db()
    row = fetch_post(db, post_id)
    if row is None:
        return json_error("Post not found", 404)
    if row["author_id"] != user["id"]:
        if row["taken_down"] and not user["is_admin"]:
            return json_error("Post not found", 404)
        return json_error("You can only edit your own posts", 403)
    payload, error = parse_post_data(get_json_body())
    if error:
        return json_error(error, 400)
    db.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
        (payload["title"], payload["content"], now_iso(), post_id),
    )
    save_tags(db, post_id, payload["tags"])
    db.commit()
    row = fetch_post(db, post_id)
    return jsonify(serialize_post(db, row)), 200


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id: int):
    user, err = require_user()
    if err:
        return err
    db = get_db()
    row = fetch_post(db, post_id)
    if row is None:
        return json_error("Post not found", 404)
    if row["author_id"] != user["id"]:
        if row["taken_down"] and not user["is_admin"]:
            return json_error("Post not found", 404)
        return json_error("You can only delete your own posts", 403)
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return "", 204


# ---------------------------------------------------------------- admin


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id: int):
    user, err = require_user()
    if err:
        return err
    if not user["is_admin"]:
        return json_error("Admin access required", 403)
    db = get_db()
    row = fetch_post(db, post_id)
    if row is None:
        return json_error("Post not found", 404)
    new_state = 0 if row["taken_down"] else 1
    db.execute("UPDATE posts SET taken_down = ? WHERE id = ?", (new_state, post_id))
    db.commit()
    row = fetch_post(db, post_id)
    return jsonify(serialize_post(db, row)), 200


# ---------------------------------------------------------------- health + frontend


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return json_error("Not found", 404)
    candidate = DIST / path
    if path != "index.html" and candidate.is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return json_error("Frontend not built", 500)


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api"):
        return json_error("Not found", 404)
    return frontend("index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
