"""Flask entry point."""

from __future__ import annotations

import hashlib
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
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,64}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 256
TITLE_MAX = 200
CONTENT_MAX = 20000
TAG_MAX_LEN = 50
TAGS_MAX = 20
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False

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
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(pinned DESC, updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (note_id, tag)
);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
"""


def _lower(value):
    return value.lower() if isinstance(value, str) else value


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.create_function("py_lower", 1, _lower, deterministic=True)
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


# ---------------------------------------------------------------- helpers


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


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
    if request.path.startswith("/api"):
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        if err.code == 405 and hasattr(err, "valid_methods") and err.valid_methods:
            resp.headers["Allow"] = ", ".join(err.valid_methods)
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    if isinstance(err, HTTPException):
        return handle_http_error(err)
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def later_than(previous: str) -> str:
    current = now_iso()
    if current > previous:
        return current
    try:
        prev = datetime.fromisoformat(previous.replace("Z", "+00:00"))
    except ValueError:
        return current
    bumped = prev + timedelta(microseconds=1)
    return bumped.isoformat(timespec="microseconds").replace("+00:00", "Z")


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row:
            g.user = {"id": row["id"], "username": row["username"]}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------- health


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- auth


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO sessions (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, now_iso()),
    )
    return token


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
                "Username must be 3-64 characters: letters, digits, '_', '.', '@' or '-'."
            )
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    elif len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters."
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters."
    if errors:
        raise ApiError(400, "Validation failed", errors)

    conn = db()
    created = now_iso()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), created),
        )
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "Username is already taken", {"username": "Username is already taken."}
        )
    user_id = cur.lastrowid
    token = issue_token(user_id)
    return (
        jsonify({"id": user_id, "username": username, "created_at": created, "token": token}),
        201,
    )


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    if errors:
        raise ApiError(400, "Validation failed", errors)
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = issue_token(row["id"])
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    return "", 204


# ---------------------------------------------------------------- notes


def normalize_tags(value, errors: dict):
    if not isinstance(value, list):
        errors["tags"] = "Tags must be a list of strings."
        return None
    tags: list[str] = []
    for item in value:
        if not isinstance(item, str):
            errors["tags"] = "Tags must be a list of strings."
            return None
        tag = " ".join(item.split())
        if not tag:
            errors["tags"] = "Tags must not be empty."
            return None
        if len(tag) > TAG_MAX_LEN:
            errors["tags"] = f"Each tag must be at most {TAG_MAX_LEN} characters."
            return None
        if "," in tag:
            errors["tags"] = "Tags must not contain commas."
            return None
        if tag not in tags:
            tags.append(tag)
    if len(tags) > TAGS_MAX:
        errors["tags"] = f"A note can have at most {TAGS_MAX} tags."
        return None
    return tags


def validate_note(data: dict, partial: bool) -> dict:
    errors: dict[str, str] = {}
    out: dict = {}

    if "title" in data:
        title = data["title"]
        if not isinstance(title, str):
            errors["title"] = "Title must be a string."
        else:
            title = title.strip()
            if not title:
                errors["title"] = "Title is required."
            elif len(title) > TITLE_MAX:
                errors["title"] = f"Title must be at most {TITLE_MAX} characters."
            else:
                out["title"] = title
    elif not partial:
        errors["title"] = "Title is required."

    if "content" in data:
        content = data["content"]
        if not isinstance(content, str):
            errors["content"] = "Content must be a string."
        elif len(content) > CONTENT_MAX:
            errors["content"] = f"Content must be at most {CONTENT_MAX} characters."
        else:
            out["content"] = content.replace("\r\n", "\n")
    elif not partial:
        out["content"] = ""

    if "tags" in data:
        tags = normalize_tags(data["tags"], errors)
        if tags is not None:
            out["tags"] = tags
    elif not partial:
        out["tags"] = []

    if "pinned" in data:
        pinned = data["pinned"]
        if not isinstance(pinned, bool):
            errors["pinned"] = "Pinned must be true or false."
        else:
            out["pinned"] = pinned
    elif not partial:
        out["pinned"] = False

    if errors:
        raise ApiError(400, "Validation failed", errors)
    return out


def tags_for(note_ids: list[int]) -> dict[int, list[str]]:
    result: dict[int, list[str]] = {nid: [] for nid in note_ids}
    if not note_ids:
        return result
    placeholders = ",".join("?" * len(note_ids))
    rows = db().execute(
        f"SELECT note_id, tag FROM note_tags WHERE note_id IN ({placeholders}) "
        "ORDER BY note_id, position",
        note_ids,
    ).fetchall()
    for row in rows:
        result[row["note_id"]].append(row["tag"])
    return result


def serialize(row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "pinned": bool(row["pinned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


NOTE_SELECT = (
    "SELECT n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at, "
    "n.author_id, u.username AS author FROM notes n JOIN users u ON u.id = n.author_id"
)


def fetch_note(note_id: int):
    return db().execute(f"{NOTE_SELECT} WHERE n.id = ?", (note_id,)).fetchone()


def note_json(note_id: int) -> dict:
    row = fetch_note(note_id)
    return serialize(row, tags_for([note_id])[note_id])


def set_tags(note_id: int, tags: list[str]) -> None:
    conn = db()
    conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    conn.executemany(
        "INSERT INTO note_tags (note_id, tag, position) VALUES (?, ?, ?)",
        [(note_id, tag, i) for i, tag in enumerate(tags)],
    )


def int_param(name: str, default: int, minimum: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"'{name}' must be an integer", {name: "Must be an integer."})
    if value < minimum:
        raise ApiError(
            400, f"'{name}' must be at least {minimum}", {name: f"Must be at least {minimum}."}
        )
    if maximum is not None and value > maximum:
        value = maximum
    return value


@app.get("/api/notes")
def list_notes():
    page = int_param("page", 1, 1)
    page_size = int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    where: list[str] = []
    params: list = []

    for raw_tag in request.args.getlist("tag"):
        tag = " ".join(raw_tag.split())
        if not tag:
            continue
        where.append("EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id AND t.tag = ?)")
        params.append(tag)

    author = (request.args.get("author") or "").strip()
    if author:
        where.append("u.username = ?")
        params.append(author)

    q = (request.args.get("q") or "").strip()
    if q:
        where.append(
            "(instr(py_lower(n.title), ?) > 0 OR instr(py_lower(n.content), ?) > 0 "
            "OR EXISTS (SELECT 1 FROM note_tags t2 WHERE t2.note_id = n.id AND py_lower(t2.tag) = ?))"
        )
        params.extend([q.lower(), q.lower(), q.lower()])

    where_sql = f" WHERE {' AND '.join(where)}" if where else ""
    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM notes n JOIN users u ON u.id = n.author_id{where_sql}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"{NOTE_SELECT}{where_sql} ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC "
        "LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    tag_map = tags_for([r["id"] for r in rows])
    return jsonify(
        {
            "items": [serialize(r, tag_map[r["id"]]) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/notes")
@login_required
def create_note():
    fields = validate_note(json_body(), partial=False)
    user = current_user()
    conn = db()
    ts = now_iso()
    conn.execute("BEGIN IMMEDIATE")
    try:
        cur = conn.execute(
            "INSERT INTO notes (author_id, title, content, pinned, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (user["id"], fields["title"], fields["content"], int(fields["pinned"]), ts, ts),
        )
        note_id = cur.lastrowid
        set_tags(note_id, fields["tags"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    resp = jsonify(note_json(note_id))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/notes/{note_id}"
    return resp


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    if fetch_note(note_id) is None:
        raise ApiError(404, "Note not found")
    return jsonify(note_json(note_id))


def owned_note(note_id: int):
    row = fetch_note(note_id)
    if row is None:
        raise ApiError(404, "Note not found")
    if row["author_id"] != current_user()["id"]:
        raise ApiError(403, "Only the author may change this note")
    return row


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    row = owned_note(note_id)
    data = json_body()
    fields = validate_note(data, partial=True)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        current = conn.execute(
            "SELECT updated_at FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
        if current is None:
            raise ApiError(404, "Note not found")
        sets = ["updated_at = ?"]
        params: list = [later_than(current["updated_at"])]
        for key in ("title", "content"):
            if key in fields:
                sets.append(f"{key} = ?")
                params.append(fields[key])
        if "pinned" in fields:
            sets.append("pinned = ?")
            params.append(int(fields["pinned"]))
        conn.execute(f"UPDATE notes SET {', '.join(sets)} WHERE id = ?", [*params, row["id"]])
        if "tags" in fields:
            set_tags(note_id, fields["tags"])
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return jsonify(note_json(note_id))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    owned_note(note_id)
    db().execute("DELETE FROM notes WHERE id = ?", (note_id,))
    return "", 204


# ---------------------------------------------------------------- tags


@app.get("/api/tags")
def list_tags():
    rows = db().execute(
        "SELECT tag, COUNT(*) AS count FROM note_tags GROUP BY tag ORDER BY count DESC, tag ASC"
    ).fetchall()
    return jsonify({"items": [{"tag": r["tag"], "count": r["count"]} for r in rows]})


# ---------------------------------------------------------------- frontend


@app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp
