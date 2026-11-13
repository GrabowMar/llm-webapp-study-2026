"""Flask entry point: JSON API under /api and the built web frontend."""

from __future__ import annotations

import os
import re
import secrets
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from db import close_db, get_db, init_db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_TITLE_LENGTH = 300
MAX_CONTENT_LENGTH = 100_000
MAX_TAG_LENGTH = 40
MAX_TAGS = 20
MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 256
ADMIN_USERNAME = "admin"

POST_SELECT = """
SELECT p.id, p.title, p.content, p.hidden, p.author_id, p.created_at, p.updated_at,
       u.username AS author
FROM posts p
JOIN users u ON u.id = p.author_id
"""


class ApiError(Exception):
    """An error that is rendered as a JSON response."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def error_response(message: str, status: int):
    """Build the JSON body used for every error."""
    return jsonify({"error": message, "message": message}), status


def serve_index():
    """Serve the single page application entry point."""
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return "Frontend build missing. Run `npm run build` inside frontend/.", 503


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def next_timestamp(previous: str | None) -> str:
    """Return a timestamp that is strictly newer than ``previous``."""
    now = utc_now()
    old = parse_iso(previous)
    if old is not None and now <= old:
        now = old + timedelta(microseconds=1)
    return to_iso(now)


def make_excerpt(content: str) -> str:
    """First 200 characters of the content with line breaks turned into spaces."""
    text = content.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]*\n[ \t\n]*", " ", text)
    return text[:200]


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def hash_password(password: str) -> str:
    return generate_password_hash(password, method="pbkdf2:sha256:100000")


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except ValueError:
        return False


def body_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object.")
    return data


def parse_int_arg(name: str, default: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except (TypeError, ValueError):
        raise ApiError(f"Invalid {name} parameter.") from None
    if value < 1:
        raise ApiError(f"Invalid {name} parameter.")
    if maximum is not None and value > maximum:
        value = maximum
    return value


def normalize_tags(raw) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = raw.split(",")
    if not isinstance(raw, list):
        raise ApiError("Tags must be a list of strings.")
    tags: list[str] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, str):
            raise ApiError("Tags must be a list of strings.")
        name = item.strip()
        if not name:
            continue
        if len(name) > MAX_TAG_LENGTH:
            raise ApiError(f"Tags must be at most {MAX_TAG_LENGTH} characters long.")
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        tags.append(name)
    if len(tags) > MAX_TAGS:
        raise ApiError(f"A post can have at most {MAX_TAGS} tags.")
    return tags


def current_user():
    """Return the user owning the bearer token, or ``None``."""
    if "current_user" in g:
        return g.current_user
    token = ""
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[len("bearer ") :].strip()
    user = None
    if token:
        user = get_db().execute(
            "SELECT u.id, u.username, u.is_admin FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        ).fetchone()
    g.current_user = user
    return user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError("Authentication required.", 401)
    return user


def require_admin():
    user = require_user()
    if not user["is_admin"]:
        raise ApiError("Administrator privileges required.", 403)
    return user


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, to_iso(utc_now())),
    )
    get_db().commit()
    return token


def user_payload(user) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
    }


def fetch_post(post_id: int):
    return get_db().execute(POST_SELECT + " WHERE p.id = ?", (post_id,)).fetchone()


def tags_for(post_ids: list[int]) -> dict[int, list[str]]:
    grouped: dict[int, list[str]] = {post_id: [] for post_id in post_ids}
    if not post_ids:
        return grouped
    placeholders = ",".join("?" for _ in post_ids)
    rows = get_db().execute(
        "SELECT pt.post_id AS post_id, t.name AS name FROM post_tags pt "
        "JOIN tags t ON t.id = pt.tag_id "
        f"WHERE pt.post_id IN ({placeholders}) ORDER BY pt.post_id, pt.position",
        post_ids,
    ).fetchall()
    for row in rows:
        grouped[row["post_id"]].append(row["name"])
    return grouped


def serialize_post(row, tags: list[str]) -> dict:
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


def serialize_posts(rows) -> list[dict]:
    post_ids = [row["id"] for row in rows]
    grouped = tags_for(post_ids)
    return [serialize_post(row, grouped[row["id"]]) for row in rows]


def set_tags(post_id: int, tags: list[str]) -> None:
    connection = get_db()
    connection.execute("DELETE FROM post_tags WHERE post_id = ?", (post_id,))
    for position, name in enumerate(tags):
        connection.execute("INSERT INTO tags (name) VALUES (?) ON CONFLICT(name) DO NOTHING", (name,))
        tag_id = connection.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()["id"]
        connection.execute(
            "INSERT INTO post_tags (post_id, tag_id, position) VALUES (?, ?, ?) "
            "ON CONFLICT(post_id, tag_id) DO UPDATE SET position = excluded.position",
            (post_id, tag_id, position),
        )


def validate_post_payload(data: dict) -> tuple[str, str, list[str]]:
    title = data.get("title")
    content = data.get("content")
    if title is None:
        raise ApiError("Title is required.")
    if not isinstance(title, str):
        raise ApiError("Title must be a string.")
    title = title.strip()
    if not title:
        raise ApiError("Title is required.")
    if len(title) > MAX_TITLE_LENGTH:
        raise ApiError(f"Title must be at most {MAX_TITLE_LENGTH} characters long.")
    if content is None:
        raise ApiError("Content is required.")
    if not isinstance(content, str):
        raise ApiError("Content must be a string.")
    if not content.strip():
        raise ApiError("Content is required.")
    if len(content) > MAX_CONTENT_LENGTH:
        raise ApiError(f"Content must be at most {MAX_CONTENT_LENGTH} characters long.")
    tags = normalize_tags(data.get("tags"))
    return title, content, tags


def ensure_admin_account() -> None:
    """Create or refresh the admin account from ``ADMIN_PASSWORD``."""
    connection = get_db()
    password = os.environ.get("ADMIN_PASSWORD") or ""
    if password.strip():
        password_hash = hash_password(password)
        row = connection.execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            connection.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                (ADMIN_USERNAME, password_hash, to_iso(utc_now())),
            )
        else:
            connection.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (password_hash, row["id"]),
            )
        app.config["ADMIN_ENABLED"] = True
    else:
        connection.execute(
            "UPDATE users SET is_admin = 0, password_hash = ? WHERE username = ?",
            (hash_password(secrets.token_urlsafe(32)), ADMIN_USERNAME),
        )
        app.config["ADMIN_ENABLED"] = False
    connection.commit()


app = Flask(__name__, static_folder=None)
app.config["ADMIN_ENABLED"] = False
app.teardown_appcontext(close_db)


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return error_response(error.message, error.status)


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return error_response("Not found.", 404)
    return serve_index()


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return error_response("Method not allowed.", 405)
    return serve_index()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError("Username is required.")
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        raise ApiError(f"Username must be at most {MAX_USERNAME_LENGTH} characters long.")
    if not isinstance(password, str) or not password:
        raise ApiError("Password is required.")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ApiError(f"Password must be at most {MAX_PASSWORD_LENGTH} characters long.")
    if username.lower() == ADMIN_USERNAME:
        raise ApiError("That username is reserved.", 409)

    connection = get_db()
    existing = connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError("That username is already taken.", 409)

    cursor = connection.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
        (username, hash_password(password), to_iso(utc_now())),
    )
    connection.commit()
    user_id = cursor.lastrowid
    token = issue_token(user_id)
    payload = {
        "id": user_id,
        "username": username,
        "is_admin": False,
        "user": {"id": user_id, "username": username, "is_admin": False},
        "token": token,
    }
    return jsonify(payload), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError("Username and password are required.")

    connection = get_db()
    user = connection.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not verify_password(user["password_hash"], password):
        raise ApiError("Invalid username or password.", 401)
    if user["is_admin"] and not app.config.get("ADMIN_ENABLED"):
        raise ApiError("Admin sign-in is disabled.", 401)
    return jsonify({"token": issue_token(user["id"])}), 200


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify(user_payload(user))


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[len("bearer ") :].strip()
        if token:
            connection = get_db()
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
            connection.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/posts")
def list_posts():
    connection = get_db()
    query = request.args.get("q", "").strip()
    tag = request.args.get("tag", "").strip()
    author = request.args.get("author", "").strip()
    page = parse_int_arg("page", 1)
    page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, maximum=MAX_PAGE_SIZE)

    clauses = ["p.hidden = 0"]
    params: list = []
    if query:
        pattern = f"%{escape_like(query)}%"
        clauses.append("(p.title LIKE ? ESCAPE '\\' OR p.content LIKE ? ESCAPE '\\')")
        params.extend([pattern, pattern])
    if tag:
        clauses.append(
            "EXISTS (SELECT 1 FROM post_tags pt JOIN tags t ON t.id = pt.tag_id "
            "WHERE pt.post_id = p.id AND t.name = ?)"
        )
        params.append(tag)
    if author:
        clauses.append("u.username = ?")
        params.append(author)
    where = " AND ".join(clauses)

    total = connection.execute(
        f"SELECT COUNT(*) AS count FROM posts p JOIN users u ON u.id = p.author_id WHERE {where}",
        params,
    ).fetchone()["count"]
    rows = connection.execute(
        POST_SELECT + f" WHERE {where} ORDER BY p.created_at DESC, p.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": serialize_posts(rows),
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/posts")
def create_post():
    user = require_user()
    data = body_json()
    title, content, tags = validate_post_payload(data)

    connection = get_db()
    timestamp = to_iso(utc_now())
    cursor = connection.execute(
        "INSERT INTO posts (title, content, author_id, hidden, created_at, updated_at) "
        "VALUES (?, ?, ?, 0, ?, ?)",
        (title, content, user["id"], timestamp, timestamp),
    )
    post_id = cursor.lastrowid
    set_tags(post_id, tags)
    connection.commit()
    return jsonify(serialize_post(fetch_post(post_id), tags)), 201


@app.get("/api/posts/<int:post_id>")
def get_post(post_id: int):
    row = fetch_post(post_id)
    if row is None:
        raise ApiError("Post not found.", 404)
    if row["hidden"]:
        user = current_user()
        if user is None or not user["is_admin"]:
            raise ApiError("Post not found.", 404)
    return jsonify(serialize_post(row, tags_for([row["id"]])[row["id"]]))


@app.put("/api/posts/<int:post_id>")
def update_post(post_id: int):
    user = require_user()
    row = fetch_post(post_id)
    if row is None:
        raise ApiError("Post not found.", 404)
    if row["hidden"]:
        if not user["is_admin"]:
            raise ApiError("Post not found.", 404)
        if row["author_id"] != user["id"]:
            raise ApiError("You can only change your own posts.", 403)
    elif row["author_id"] != user["id"]:
        raise ApiError("You can only change your own posts.", 403)

    data = body_json()
    title, content, tags = validate_post_payload(data)
    connection = get_db()
    updated_at = next_timestamp(row["updated_at"])
    connection.execute(
        "UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?",
        (title, content, updated_at, post_id),
    )
    set_tags(post_id, tags)
    connection.commit()
    return jsonify(serialize_post(fetch_post(post_id), tags))


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id: int):
    user = require_user()
    row = fetch_post(post_id)
    if row is None:
        raise ApiError("Post not found.", 404)
    if row["hidden"] and not user["is_admin"]:
        raise ApiError("Post not found.", 404)
    if row["author_id"] != user["id"]:
        raise ApiError("You can only delete your own posts.", 403)
    connection = get_db()
    connection.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    connection.commit()
    return "", 204


@app.get("/api/admin/posts")
def admin_list_hidden_posts():
    require_admin()
    rows = get_db().execute(
        POST_SELECT + " WHERE p.hidden = 1 ORDER BY p.updated_at DESC, p.id DESC"
    ).fetchall()
    items = serialize_posts(rows)
    return jsonify({"items": items, "total": len(items)})


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id: int):
    require_admin()
    row = fetch_post(post_id)
    if row is None:
        raise ApiError("Post not found.", 404)
    hidden = 0 if row["hidden"] else 1
    connection = get_db()
    connection.execute(
        "UPDATE posts SET hidden = ?, updated_at = ? WHERE id = ?",
        (hidden, next_timestamp(row["updated_at"]), post_id),
    )
    connection.commit()
    updated = fetch_post(post_id)
    return jsonify(
        {
            "ok": True,
            "hidden": bool(hidden),
            "post": serialize_post(updated, tags_for([updated["id"]])[updated["id"]]),
        }
    )


@app.get("/api/tags")
def list_tags():
    rows = get_db().execute(
        "SELECT t.name AS name FROM tags t JOIN post_tags pt ON pt.tag_id = t.id "
        "JOIN posts p ON p.id = pt.post_id WHERE p.hidden = 0 "
        "GROUP BY t.name ORDER BY t.name COLLATE NOCASE"
    ).fetchall()
    names = [row["name"] for row in rows]
    return jsonify({"items": names, "total": len(names)})


@app.get("/api/authors")
def list_authors():
    rows = get_db().execute(
        "SELECT DISTINCT u.username AS username FROM users u JOIN posts p ON p.author_id = u.id "
        "WHERE p.hidden = 0 ORDER BY u.username COLLATE NOCASE"
    ).fetchall()
    names = [row["username"] for row in rows]
    return jsonify({"items": names, "total": len(names)})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error_response("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return serve_index()


with app.app_context():
    init_db()
    ensure_admin_account()
