"""Flask entry point for the multi-author blog."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "blog.db"

ADMIN_USERNAME = "admin"
TOKEN_TTL = timedelta(days=30)

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128
TITLE_MAX = 200
CONTENT_MAX = 50_000
TAGS_MAX = 10
TAG_MAX = 32
EXCERPT_LEN = 200
PAGE_SIZE_DEFAULT = 10
PAGE_SIZE_MAX = 100

LINE_BREAKS_RE = re.compile(r"[\r\n\u2028\u2029]+")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False

_DUMMY_HASH = generate_password_hash("dummy-password-for-timing")


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


# --------------------------------------------------------------------------- db


def _casefold(value):
    return value.casefold() if isinstance(value, str) else value


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.create_function("casefold", 1, _casefold, deterministic=True)
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    taken_down INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id);
CREATE TABLE IF NOT EXISTS post_tags (
    post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    tag TEXT NOT NULL,
    tag_key TEXT NOT NULL,
    PRIMARY KEY (post_id, tag_key)
);
CREATE INDEX IF NOT EXISTS post_tags_key ON post_tags(tag_key);
"""


def now() -> datetime:
    return datetime.now(timezone.utc)


def fmt_time(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_time(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.isolation_level = None
        conn.execute("BEGIN IMMEDIATE")
        try:
            sync_admin(conn)
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    finally:
        conn.close()


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD") or ""


def sync_admin(conn: sqlite3.Connection) -> None:
    password = admin_password()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if not password:
        if row is not None:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        return
    if row is None:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (ADMIN_USERNAME, generate_password_hash(password), fmt_time(now())),
        )
    elif not check_password_hash(row["password_hash"], password):
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(password), row["id"]),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))


# ------------------------------------------------------------------------- auth


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_admin_name(username: str) -> bool:
    return username.casefold() == ADMIN_USERNAME


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username, s.expires_at FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or parse_time(row["expires_at"]) <= now():
        return None
    admin = is_admin_name(row["username"])
    if admin and not admin_password():
        return None
    g.user = {"id": row["id"], "username": row["username"], "is_admin": admin}
    return g.user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        require_user()
        return fn(*args, **kwargs)

    return wrapper


def json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def user_json(user) -> dict:
    return {"username": user["username"], "is_admin": user["is_admin"]}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    else:
        username = username.strip()
        if not USERNAME_RE.match(username):
            errors["username"] = (
                "Username must be 3-64 characters: letters, digits, '_', '.' or '-'."
            )
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters."
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters."
    if errors:
        raise ApiError(400, "Validation failed", errors)
    if is_admin_name(username):
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken."})
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), fmt_time(now())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken."})
    return jsonify({"id": cur.lastrowid, "username": username, "is_admin": False}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "Username and password are required")
    username = username.strip()
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    admin = row is not None and is_admin_name(row["username"])
    ok = check_password_hash(row["password_hash"] if row else _DUMMY_HASH, password)
    if row is None or not ok or (admin and not admin_password()):
        raise ApiError(401, "Invalid username or password")
    if admin and not hmac.compare_digest(password.encode(), admin_password().encode()):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    created = now()
    db.execute("DELETE FROM sessions WHERE expires_at <= ?", (fmt_time(created),))
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], fmt_time(created), fmt_time(created + TOKEN_TTL)),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"], "is_admin": admin})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    db.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify(user_json(current_user()))


# ------------------------------------------------------------------------ posts


def make_excerpt(content: str) -> str:
    return LINE_BREAKS_RE.sub(" ", content[:EXCERPT_LEN])


def load_tags(post_ids: list[int]) -> dict[int, list[str]]:
    tags: dict[int, list[str]] = {pid: [] for pid in post_ids}
    if not post_ids:
        return tags
    marks = ",".join("?" * len(post_ids))
    rows = get_db().execute(
        f"SELECT post_id, tag FROM post_tags WHERE post_id IN ({marks}) "
        "ORDER BY post_id, position",
        post_ids,
    ).fetchall()
    for r in rows:
        tags[r["post_id"]].append(r["tag"])
    return tags


POST_SELECT = (
    "SELECT p.id, p.title, p.content, p.created_at, p.updated_at, p.taken_down, "
    "p.author_id, u.username AS author FROM posts p JOIN users u ON u.id = p.author_id"
)


def post_json(row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
        "excerpt": make_excerpt(row["content"]),
        "taken_down": bool(row["taken_down"]),
    }


def fetch_post_row(post_id: int):
    return get_db().execute(POST_SELECT + " WHERE p.id = ?", (post_id,)).fetchone()


def visible_post_row(post_id: int):
    row = fetch_post_row(post_id)
    if row is None:
        raise ApiError(404, "Post not found")
    if row["taken_down"]:
        user = current_user()
        if not (user and user["is_admin"]):
            raise ApiError(404, "Post not found")
    return row


def serialize(post_id: int) -> dict:
    row = fetch_post_row(post_id)
    return post_json(row, load_tags([post_id])[post_id])


def validate_post(data: dict) -> tuple[str, str, list[str]]:
    errors = {}
    title = data.get("title")
    content = data.get("content")
    tags = data.get("tags")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    else:
        title = title.strip()
        if len(title) > TITLE_MAX:
            errors["title"] = f"Title must be at most {TITLE_MAX} characters."
    if not isinstance(content, str) or not content.strip():
        errors["content"] = "Content is required."
    elif len(content) > CONTENT_MAX:
        errors["content"] = f"Content must be at most {CONTENT_MAX} characters."
    clean: list[str] = []
    if tags is not None:
        if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
            errors["tags"] = "Tags must be a list of strings."
        else:
            seen = set()
            for t in tags:
                t = " ".join(t.split())
                if not t:
                    continue
                if len(t) > TAG_MAX:
                    errors["tags"] = f"Each tag must be at most {TAG_MAX} characters."
                    break
                key = t.casefold()
                if key not in seen:
                    seen.add(key)
                    clean.append(t)
            if "tags" not in errors and len(clean) > TAGS_MAX:
                errors["tags"] = f"A post can have at most {TAGS_MAX} tags."
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return title, content, clean


def save_tags(db: sqlite3.Connection, post_id: int, tags: list[str]) -> None:
    db.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    db.executemany(
        "INSERT INTO post_tags (post_id, position, tag, tag_key) VALUES (?, ?, ?, ?)",
        [(post_id, i, t, t.casefold()) for i, t in enumerate(tags)],
    )


def int_param(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"'{name}' must be a positive integer", {name: "Must be a positive integer."})
    if value < 1:
        raise ApiError(400, f"'{name}' must be a positive integer", {name: "Must be a positive integer."})
    return value


def like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/posts")
def list_posts():
    page = int_param("page", 1)
    page_size = min(int_param("page_size", PAGE_SIZE_DEFAULT), PAGE_SIZE_MAX)
    q = (request.args.get("q") or "").strip()
    tag = " ".join((request.args.get("tag") or "").split())
    author = (request.args.get("author") or "").strip()

    where, params = [], []
    user = current_user()
    show_hidden = (
        user is not None
        and user["is_admin"]
        and request.args.get("include_taken_down", "").lower() in ("1", "true", "yes")
    )
    if not show_hidden:
        where.append("p.taken_down = 0")
    if q:
        pattern = "%" + like_escape(q.casefold()) + "%"
        where.append(
            "(casefold(p.title) LIKE ? ESCAPE '\\' OR casefold(p.content) LIKE ? ESCAPE '\\' "
            "OR EXISTS (SELECT 1 FROM post_tags qt WHERE qt.post_id = p.id AND qt.tag_key LIKE ? ESCAPE '\\'))"
        )
        params += [pattern, pattern, pattern]
    if tag:
        where.append("EXISTS (SELECT 1 FROM post_tags t WHERE t.post_id = p.id AND t.tag_key = ?)")
        params.append(tag.casefold())
    if author:
        where.append("u.username = ?")
        params.append(author)
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM posts p JOIN users u ON u.id = p.author_id" + clause, params
    ).fetchone()[0]
    rows = db.execute(
        POST_SELECT + clause + " ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    tags = load_tags([r["id"] for r in rows])
    return jsonify(
        {
            "items": [post_json(r, tags[r["id"]]) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/posts")
@login_required
def create_post():
    user = current_user()
    title, content, tags = validate_post(json_body())
    ts = fmt_time(now())
    db = get_db()
    cur = db.execute(
        "INSERT INTO posts (author_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user["id"], title, content, ts, ts),
    )
    save_tags(db, cur.lastrowid, tags)
    db.commit()
    return jsonify(serialize(cur.lastrowid)), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id: int):
    row = visible_post_row(post_id)
    return jsonify(post_json(row, load_tags([post_id])[post_id]))


def owned_post_row(post_id: int):
    user = require_user()
    row = visible_post_row(post_id)
    if row["author_id"] != user["id"]:
        raise ApiError(403, "You can only change your own posts")
    return row


@app.put("/api/posts/<int:post_id>")
def update_post(post_id: int):
    row = owned_post_row(post_id)
    title, content, tags = validate_post(json_body())
    updated = now()
    previous = parse_time(row["updated_at"])
    if updated <= previous:
        updated = previous + timedelta(microseconds=1)
    db = get_db()
    db.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
        (title, content, fmt_time(updated), post_id),
    )
    save_tags(db, post_id, tags)
    db.commit()
    return jsonify(serialize(post_id))


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id: int):
    owned_post_row(post_id)
    db = get_db()
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return "", 204


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id: int):
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin only")
    row = fetch_post_row(post_id)
    if row is None:
        raise ApiError(404, "Post not found")
    db = get_db()
    db.execute(
        "UPDATE posts SET taken_down = ? WHERE id = ?",
        (0 if row["taken_down"] else 1, post_id),
    )
    db.commit()
    return jsonify(serialize(post_id))


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ----------------------------------------------------------------------- errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    resp = jsonify(body)
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        if err.code == 405 and err.valid_methods:
            resp.headers["Allow"] = ", ".join(err.valid_methods)
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error"}), 500
    return "Internal server error", 500


# --------------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        resp = send_from_directory(DIST, path)
        if path.startswith("assets/"):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


init_db()
