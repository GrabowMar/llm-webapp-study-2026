"""Multi-author blog API and static frontend server."""

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "blog.db"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def error_body(message, errors=None):
    body = {"error": message, "message": message}
    if errors:
        body["errors"] = errors
    return body


@app.errorhandler(ApiError)
def handle_api_error(exc):
    return jsonify(error_body(exc.message, exc.errors)), exc.status


@app.errorhandler(HTTPException)
def handle_http_error(exc):
    if request.path.startswith("/api"):
        return jsonify(error_body(exc.description or exc.name)), exc.code
    return exc


@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    if isinstance(exc, HTTPException):
        return handle_http_error(exc)
    if isinstance(exc, ApiError):
        return handle_api_error(exc)
    if request.path.startswith("/api"):
        app.logger.exception("Unhandled API error")
        return jsonify(error_body("Internal server error")), 500
    raise exc


@app.after_request
def add_cors(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    return response


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.create_function("py_lower", 1, lambda value: (value or "").lower(), deterministic=True)
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL COLLATE NOCASE,
                is_admin INTEGER NOT NULL DEFAULT 0,
                admin_key TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                tags TEXT NOT NULL DEFAULT '[]',
                author TEXT NOT NULL COLLATE NOCASE,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                hidden INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS post_tags (
                post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                position INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON post_tags(tag);
            CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author COLLATE NOCASE);
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def next_timestamp(previous=None):
    stamp = now_iso()
    if previous and stamp <= previous:
        moment = datetime.strptime(previous, "%Y-%m-%dT%H:%M:%S.%fZ") + timedelta(microseconds=1)
        stamp = moment.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    return stamp


def digest(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}:{key.hex()}"


def verify_password(stored, password):
    try:
        salt_hex, expected = stored.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), 120_000)
        return hmac.compare_digest(key.hex(), expected)
    except (ValueError, TypeError):
        return False


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Expected a JSON object.")
    return data


def bearer_token():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def current_user():
    token = bearer_token()
    if not token:
        return None
    row = get_db().execute(
        "SELECT * FROM tokens WHERE token_hash = ?", (digest(token),)
    ).fetchone()
    if row is None:
        return None
    if row["is_admin"]:
        if not ADMIN_PASSWORD or not hmac.compare_digest(row["admin_key"] or "", digest(ADMIN_PASSWORD)):
            return None
        return {"username": "admin", "is_admin": True}
    return {"username": row["username"], "is_admin": False}


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required.")
    return user


def require_admin():
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin access required.")
    return user


def mint_token(username, is_admin=False, admin_key=None):
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token_hash, username, is_admin, admin_key, created_at) VALUES (?, ?, ?, ?, ?)",
        (digest(token), username, 1 if is_admin else 0, admin_key, now_iso()),
    )
    get_db().commit()
    return token


def make_excerpt(content):
    collapsed = re.sub(r"\r\n|\r|\n", " ", content)
    return collapsed[:200]


def serialize_post(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": json.loads(row["tags"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
        "excerpt": make_excerpt(row["content"]),
    }


def find_post(post_id, allow_hidden=False):
    row = get_db().execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Post not found.")
    if row["hidden"] and not allow_hidden:
        raise ApiError(404, "Post not found.")
    return row


def set_post_tags(post_id, tags):
    db = get_db()
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    for position, tag in enumerate(tags):
        db.execute(
            "INSERT INTO post_tags (post_id, tag, position) VALUES (?, ?, ?)",
            (post_id, tag.lower(), position),
        )


def validate_credentials(data, registering=False):
    errors = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    else:
        username = username.strip()
        if len(username) > 64:
            errors["username"] = "Username must be at most 64 characters."
        elif registering and username.lower() == "admin":
            errors["username"] = "This username is reserved."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > 1024:
        errors["password"] = "Password is too long."
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return username, password


def validate_post(data):
    errors = {}
    title = data.get("title")
    content = data.get("content")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be at most 200 characters."
    if not isinstance(content, str) or not content.strip():
        errors["content"] = "Content is required."
    elif len(content) > 200_000:
        errors["content"] = "Content is too long."

    raw_tags = data.get("tags")
    if raw_tags is None:
        raw_tags = []
    if isinstance(raw_tags, str):
        raw_tags = raw_tags.split(",")
    tags = []
    if not isinstance(raw_tags, list):
        errors["tags"] = "Tags must be a list of strings."
    else:
        seen = set()
        for item in raw_tags:
            if not isinstance(item, str):
                errors["tags"] = "Each tag must be a string."
                break
            tag = item.strip()
            if not tag:
                continue
            if len(tag) > 50:
                errors["tags"] = "Each tag must be at most 50 characters."
                break
            key = tag.lower()
            if key not in seen:
                seen.add(key)
                tags.append(tag)
        if len(tags) > 20:
            errors["tags"] = "At most 20 tags are allowed."
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return {"title": title.strip(), "content": content, "tags": tags}


def parse_positive_int(value, default, maximum=None):
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if number < 1:
        return 1
    if maximum is not None:
        number = min(number, maximum)
    return number


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password = validate_credentials(json_body(), registering=True)
    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if exists:
        raise ApiError(409, "Username already taken.", {"username": "Username already taken."})
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), now_iso()),
    )
    token = mint_token(username)
    return jsonify({"id": cursor.lastrowid, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    username, password = validate_credentials(json_body())
    if username.lower() == "admin":
        if not ADMIN_PASSWORD:
            raise ApiError(401, "Admin sign-in is disabled.")
        if not hmac.compare_digest(password, ADMIN_PASSWORD):
            raise ApiError(401, "Invalid username or password.")
        token = mint_token("admin", is_admin=True, admin_key=digest(ADMIN_PASSWORD))
        return jsonify({"token": token})

    row = get_db().execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if row is None or not verify_password(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    return jsonify({"token": mint_token(row["username"])})


def list_where(q, tag, author, include_hidden):
    clauses = []
    params = []
    if not include_hidden:
        clauses.append("p.hidden = 0")
    if q:
        clauses.append(
            "(instr(py_lower(p.title), py_lower(?)) > 0 OR instr(py_lower(p.content), py_lower(?)) > 0)"
        )
        params.extend([q, q])
    if tag:
        clauses.append("EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag = ?)")
        params.append(tag.strip().lower())
    if author:
        clauses.append("p.author = ? COLLATE NOCASE")
        params.append(author.strip())
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    return where, params


@app.get("/api/posts")
def list_posts():
    q = (request.args.get("q") or "").strip()
    tag = (request.args.get("tag") or "").strip()
    author = (request.args.get("author") or "").strip()
    page = parse_positive_int(request.args.get("page"), 1)
    page_size = parse_positive_int(request.args.get("page_size"), 10, 100)
    user = current_user()
    is_admin = bool(user and user["is_admin"])
    include_hidden = is_admin and request.args.get("include_hidden") in ("1", "true", "True")

    where, params = list_where(q, tag, author, is_admin)
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM posts p" + where, params).fetchone()[0]
    rows = db.execute(
        "SELECT p.* FROM posts p" + where + " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    items = []
    for row in rows:
        item = serialize_post(row)
        if include_hidden:
            item["taken_down"] = bool(row["hidden"])
        items.append(item)
    return jsonify({
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/posts")
def create_post():
    user = require_user()
    payload = validate_post(json_body())
    stamp = now_iso()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO posts (title, content, tags, author, created_at, updated_at, hidden) "
        "VALUES (?, ?, ?, ?, ?, ?, 0)",
        (
            payload["title"],
            payload["content"],
            json.dumps(payload["tags"], ensure_ascii=False),
            user["username"],
            stamp,
            stamp,
        ),
    )
    post_id = cursor.lastrowid
    set_post_tags(post_id, payload["tags"])
    db.commit()
    return jsonify(serialize_post(find_post(post_id))), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id):
    user = current_user()
    is_admin = bool(user and user["is_admin"])
    row = find_post(post_id, allow_hidden=is_admin)
    result = serialize_post(row)
    if is_admin:
        result["taken_down"] = bool(row["hidden"])
    return jsonify(result)


@app.put("/api/posts/<int:post_id>")
def update_post(post_id):
    user = require_user()
    row = find_post(post_id)
    if row["author"].lower() != user["username"].lower():
        raise ApiError(403, "You may only edit your own posts.")
    payload = validate_post(json_body())
    stamp = next_timestamp(row["updated_at"])
    db = get_db()
    db.execute(
        "UPDATE posts SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?",
        (
            payload["title"],
            payload["content"],
            json.dumps(payload["tags"], ensure_ascii=False),
            stamp,
            post_id,
        ),
    )
    set_post_tags(post_id, payload["tags"])
    db.commit()
    return jsonify(serialize_post(find_post(post_id, allow_hidden=True)))


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id):
    user = require_user()
    row = find_post(post_id)
    if row["author"].lower() != user["username"].lower():
        raise ApiError(403, "You may only delete your own posts.")
    db = get_db()
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return jsonify({"ok": True, "id": post_id})


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id):
    require_admin()
    row = find_post(post_id, allow_hidden=True)
    new_hidden = 0 if row["hidden"] else 1
    db = get_db()
    db.execute("UPDATE posts SET hidden = ? WHERE id = ?", (new_hidden, post_id))
    db.commit()
    result = serialize_post(find_post(post_id, allow_hidden=True))
    result["taken_down"] = bool(new_hidden)
    return jsonify(result)


@app.get("/api/admin/posts")
def admin_taken_down_posts():
    require_admin()
    rows = get_db().execute(
        "SELECT * FROM posts WHERE hidden = 1 ORDER BY created_at DESC, id DESC"
    ).fetchall()
    return jsonify({"items": [serialize_post(row) for row in rows]})


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
def api_not_found(_rest):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError(404, "Not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)
