"""Multi-author blog: Flask JSON API under /api plus the built frontend."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "blog.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

SESSION_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_MIN, PASSWORD_MAX = 8, 128
TITLE_MAX = 200
CONTENT_MAX = 100_000
TAG_MAX_LEN = 30
TAG_MAX_COUNT = 10
DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE = 10, 100
EXCERPT_LEN = 200

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    taken_down INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id);
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    tag TEXT NOT NULL COLLATE NOCASE,
    PRIMARY KEY (post_id, position)
);
CREATE INDEX IF NOT EXISTS post_tags_tag ON post_tags(tag);
"""


def _casefold(value):
    return value.casefold() if isinstance(value, str) else value


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.create_function("casefold", 1, _casefold, deterministic=True)
    return conn


def init_db():
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def bump_iso(previous):
    prev = datetime.fromisoformat(previous.replace("Z", "+00:00"))
    return (prev + timedelta(milliseconds=1)).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def add_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password, stored):
    try:
        _, salt_hex, digest_hex = stored.split("$")
        expected = bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1, dklen=32
        )
    except (ValueError, AttributeError):
        return False
    return hmac.compare_digest(actual, expected)


DUMMY_HASH = hash_password(secrets.token_hex(8))


def token_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if hasattr(g, "_user"):
        return g._user
    user = None
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        row = db().execute(
            "SELECT u.id, u.username, u.is_admin, s.expires_at FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (token_digest(token),),
        ).fetchone()
        if row and row["expires_at"] > now_iso():
            is_admin = bool(row["is_admin"]) and bool(ADMIN_PASSWORD)
            if not row["is_admin"] or is_admin:
                user = {"id": row["id"], "username": row["username"], "is_admin": is_admin}
    g._user = user
    return user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


def issue_token(user_id):
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso(),))
    expires = (datetime.now(timezone.utc) + SESSION_TTL).isoformat(timespec="milliseconds")
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (token_digest(token), user_id, expires.replace("+00:00", "Z")),
    )
    conn.commit()
    return token


def credentials():
    data = json_body()
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(
            400,
            "Validation failed",
            {
                **({} if isinstance(username, str) else {"username": "Username is required"}),
                **({} if isinstance(password, str) else {"password": "Password is required"}),
            },
        )
    return username, password


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    errors = {}
    if not USERNAME_RE.match(username):
        errors["username"] = (
            "Username must be 3-32 characters: letters, digits, underscore, dot or hyphen"
        )
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        errors["password"] = f"Password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
    conn = db()
    invalid = ApiError(401, "Invalid username or password")
    if username.lower() == ADMIN_USERNAME:
        if not ADMIN_PASSWORD or not hmac.compare_digest(
            hashlib.sha256(password.encode()).digest(),
            hashlib.sha256(ADMIN_PASSWORD.encode()).digest(),
        ):
            raise invalid
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, is_admin) VALUES (?, NULL, 1)",
            (ADMIN_USERNAME,),
        )
        conn.commit()
        row = conn.execute(
            "SELECT id FROM users WHERE username = ? AND is_admin = 1", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            raise invalid
        return {"token": issue_token(row["id"])}
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ? AND is_admin = 0", (username,)
    ).fetchone()
    ok = verify_password(password, row["password_hash"] if row else DUMMY_HASH)
    if not row or not ok:
        raise invalid
    return {"token": issue_token(row["id"])}


@app.get("/api/auth/me")
def me():
    user = require_user()
    return {"username": user["username"], "is_admin": user["is_admin"]}


def excerpt_of(content):
    return re.sub(r"[\r\n]+", " ", content[:EXCERPT_LEN])


def tags_for(post_ids):
    result = {pid: [] for pid in post_ids}
    if post_ids:
        marks = ",".join("?" * len(post_ids))
        rows = db().execute(
            f"SELECT post_id, tag FROM post_tags WHERE post_id IN ({marks}) "
            "ORDER BY post_id, position",
            list(post_ids),
        )
        for r in rows:
            result[r["post_id"]].append(r["tag"])
    return result


def serialize(rows):
    tag_map = tags_for([r["id"] for r in rows])
    user = current_user()
    is_admin = bool(user and user["is_admin"])
    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "content": r["content"],
            "tags": tag_map[r["id"]],
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "author": r["author"],
            "excerpt": excerpt_of(r["content"]),
        }
        for r in rows
    ]
    if is_admin:
        for item, r in zip(items, rows):
            item["taken_down"] = bool(r["taken_down"])
    return items


POST_SELECT = (
    "SELECT p.id, p.user_id, p.title, p.content, p.created_at, p.updated_at, p.taken_down, "
    "u.username AS author FROM posts p JOIN users u ON u.id = p.user_id"
)


def fetch_post(post_id):
    return db().execute(POST_SELECT + " WHERE p.id = ?", (post_id,)).fetchone()


def visible_post(post_id):
    row = fetch_post(post_id)
    user = current_user()
    if row is None or (row["taken_down"] and not (user and user["is_admin"])):
        raise ApiError(404, "Post not found")
    return row


def validate_post(data):
    errors = {}
    title, content, tags = data.get("title"), data.get("content"), data.get("tags")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > TITLE_MAX:
        errors["title"] = f"Title must be at most {TITLE_MAX} characters"
    if not isinstance(content, str) or not content.strip():
        errors["content"] = "Content is required"
    elif len(content) > CONTENT_MAX:
        errors["content"] = f"Content must be at most {CONTENT_MAX} characters"
    clean_tags = []
    if tags is None:
        pass
    elif not isinstance(tags, list):
        errors["tags"] = "Tags must be a list of strings"
    else:
        seen = set()
        for tag in tags:
            if not isinstance(tag, str):
                errors["tags"] = "Tags must be a list of strings"
                break
            tag = tag.strip()
            if not tag:
                errors["tags"] = "Tags must not be empty"
                break
            if len(tag) > TAG_MAX_LEN:
                errors["tags"] = f"Each tag must be at most {TAG_MAX_LEN} characters"
                break
            if "," in tag or any(ord(c) < 32 for c in tag):
                errors["tags"] = "Tags must not contain commas or control characters"
                break
            if tag.casefold() not in seen:
                seen.add(tag.casefold())
                clean_tags.append(tag)
        if "tags" not in errors and len(clean_tags) > TAG_MAX_COUNT:
            errors["tags"] = f"At most {TAG_MAX_COUNT} tags are allowed"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return title.strip(), content, clean_tags


def write_tags(conn, post_id, tags):
    conn.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    conn.executemany(
        "INSERT INTO post_tags (post_id, position, tag) VALUES (?, ?, ?)",
        [(post_id, i, t) for i, t in enumerate(tags)],
    )


def int_param(name, default):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer")
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer")
    return value


@app.get("/api/posts")
def list_posts():
    page = int_param("page", 1)
    page_size = min(int_param("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    user = current_user()
    only_down = bool(user and user["is_admin"] and request.args.get("taken_down") in ("1", "true"))
    where, params = ["p.taken_down = ?"], [1 if only_down else 0]
    q = (request.args.get("q") or "").strip()
    if q:
        needle = q.casefold()
        where.append("(instr(casefold(p.title), ?) > 0 OR instr(casefold(p.content), ?) > 0)")
        params += [needle, needle]
    tag = (request.args.get("tag") or "").strip()
    if tag:
        where.append("EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag = ?)")
        params.append(tag)
    author = (request.args.get("author") or "").strip()
    if author:
        where.append("u.username = ?")
        params.append(author)
    clause = " WHERE " + " AND ".join(where)
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM posts p JOIN users u ON u.id = p.user_id" + clause, params
    ).fetchone()[0]
    rows = conn.execute(
        POST_SELECT + clause + " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {"items": serialize(rows), "total": total, "page": page, "page_size": page_size}


@app.post("/api/posts")
def create_post():
    user = require_user()
    title, content, tags = validate_post(json_body())
    conn = db()
    now = now_iso()
    cur = conn.execute(
        "INSERT INTO posts (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user["id"], title, content, now, now),
    )
    write_tags(conn, cur.lastrowid, tags)
    conn.commit()
    return jsonify(serialize([fetch_post(cur.lastrowid)])[0]), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id):
    return serialize([visible_post(post_id)])[0]


def own_post(post_id):
    user = require_user()
    row = visible_post(post_id)
    if row["user_id"] != user["id"]:
        raise ApiError(403, "You can only change your own posts")
    return row


@app.put("/api/posts/<int:post_id>")
def update_post(post_id):
    user = require_user()
    row = own_post(post_id)
    title, content, tags = validate_post(json_body())
    now = now_iso()
    if now <= row["updated_at"]:
        now = bump_iso(row["updated_at"])
    conn = db()
    conn.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?",
        (title, content, now, post_id, user["id"]),
    )
    write_tags(conn, post_id, tags)
    conn.commit()
    return serialize([fetch_post(post_id)])[0]


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id):
    own_post(post_id)
    conn = db()
    conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    conn.commit()
    return "", 204


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id):
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin only")
    conn = db()
    cur = conn.execute("UPDATE posts SET taken_down = 1 - taken_down WHERE id = ?", (post_id,))
    conn.commit()
    if cur.rowcount == 0:
        raise ApiError(404, "Post not found")
    return serialize([fetch_post(post_id)])[0]


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
