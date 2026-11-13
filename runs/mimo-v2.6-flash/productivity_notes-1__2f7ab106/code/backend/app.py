"""Flask entry point: notes API plus static frontend hosting."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data")
DB_PATH = DATA_DIR / "notes.db"

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
MAX_TITLE = 200
MAX_CONTENT = 100_000
MAX_TAG = 50
MAX_TAGS_PER_NOTE = 30

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    """Raised to answer a request with a JSON error body."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return jsonify({"error": exc.message}), exc.status


# ---------------------------------------------------------------- database


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = _connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = _connect()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
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
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE COLLATE NOCASE
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
                PRIMARY KEY (note_id, tag_id)
            );
            CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
            CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
            CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
            """
        )
        db.commit()
    finally:
        db.close()


# ---------------------------------------------------------------- helpers


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def error(message: str, status: int):
    return jsonify({"error": message}), status


def get_json() -> Any:
    return request.get_json(silent=True)


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def author_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        note = get_db().execute(
            "SELECT * FROM notes WHERE id = ?", (kwargs.get("note_id"),)
        ).fetchone()
        if note is None:
            return error("Note not found.", 404)
        g.note = note
        if note["author_id"] != g.user["id"]:
            return error("Only the author may change this note.", 403)
        return view(*args, **kwargs)

    return wrapper


def validate_credentials(body: Any) -> tuple[str, str]:
    if not isinstance(body, dict):
        raise ApiError("Request body must be a JSON object.")
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError("Username is required.")
    if not isinstance(password, str) or not password:
        raise ApiError("Password is required.")
    username = username.strip()
    if len(username) > 64:
        raise ApiError("Username must be 64 characters or fewer.")
    if len(password) > 256:
        raise ApiError("Password must be 256 characters or fewer.")
    return username, password


def validate_title(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError("Title is required.")
    if len(value.strip()) > MAX_TITLE:
        raise ApiError(f"Title must be {MAX_TITLE} characters or fewer.")
    return value.strip()


def validate_content(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError("Content is required.")
    if len(value) > MAX_CONTENT:
        raise ApiError(f"Content must be {MAX_CONTENT} characters or fewer.")
    return value


def validate_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise ApiError("Tags must be a list.")
    if len(value) > MAX_TAGS_PER_NOTE:
        raise ApiError(f"A note may have at most {MAX_TAGS_PER_NOTE} tags.")
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            raise ApiError("Each tag must be a string.")
        tag = item.strip()
        if not tag:
            raise ApiError("Tags must not be empty.")
        if len(tag) > MAX_TAG:
            raise ApiError(f"Tags must be {MAX_TAG} characters or fewer.")
        key = tag.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(tag)
    return cleaned


def validate_pinned(value: Any) -> bool:
    if not isinstance(value, bool):
        raise ApiError("Pinned must be a boolean.")
    return value


def note_json(db: sqlite3.Connection, note: sqlite3.Row) -> dict[str, Any]:
    tags = [
        row["name"]
        for row in db.execute(
            """
            SELECT t.name
            FROM note_tags nt
            JOIN tags t ON t.id = nt.tag_id
            WHERE nt.note_id = ?
            ORDER BY t.name COLLATE NOCASE
            """,
            (note["id"],),
        )
    ]
    author = db.execute(
        "SELECT username FROM users WHERE id = ?", (note["author_id"],)
    ).fetchone()
    return {
        "id": note["id"],
        "title": note["title"],
        "content": note["content"],
        "tags": tags,
        "pinned": bool(note["pinned"]),
        "created_at": note["created_at"],
        "updated_at": note["updated_at"],
        "author": author["username"] if author else "",
    }


def replace_tags(db: sqlite3.Connection, note_id: int, tags: list[str]) -> None:
    db.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    for tag in tags:
        db.execute("INSERT INTO tags(name) VALUES (?) ON CONFLICT(name) DO NOTHING", (tag,))
        row = db.execute("SELECT id FROM tags WHERE name = ?", (tag,)).fetchone()
        db.execute(
            "INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES (?, ?)",
            (note_id, row["id"]),
        )


def like_param(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def parse_int(value: str | None, default: int, low: int, high: int) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    username, password = validate_credentials(get_json())
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("Username is already taken.", 409)
    row = db.execute("SELECT id, username FROM users WHERE username = ?", (username,)).fetchone()
    return jsonify({"id": row["id"], "username": row["username"]}), 201


@app.post("/api/auth/login")
def login():
    username, password = validate_credentials(get_json())
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens(token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- notes


@app.get("/api/notes")
def list_notes():
    db = get_db()
    where: list[str] = []
    params: list[Any] = []

    tag = (request.args.get("tag") or "").strip()
    if tag:
        where.append(
            """EXISTS (
                SELECT 1 FROM note_tags nt
                JOIN tags t ON t.id = nt.tag_id
                WHERE nt.note_id = notes.id AND t.name = ?
            )"""
        )
        params.append(tag)

    author = (request.args.get("author") or "").strip()
    if author:
        where.append("notes.author_id = (SELECT id FROM users WHERE username = ?)")
        params.append(author)

    q = (request.args.get("q") or "").strip()
    if q:
        pattern = like_param(q)
        where.append(
            "(notes.title LIKE ? ESCAPE '\\' OR notes.content LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern])

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    total = db.execute(f"SELECT COUNT(*) AS n FROM notes{clause}", params).fetchone()["n"]

    page = parse_int(request.args.get("page"), 1, 1, 1_000_000)
    page_size = parse_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    offset = (page - 1) * page_size

    rows = db.execute(
        f"""
        SELECT notes.* FROM notes
        {clause}
        ORDER BY notes.pinned DESC, notes.updated_at DESC, notes.id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()

    return jsonify(
        {
            "items": [note_json(db, row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/notes")
@login_required
def create_note():
    body = get_json()
    if not isinstance(body, dict):
        return error("Request body must be a JSON object.", 400)

    title = validate_title(body.get("title"))
    content = validate_content(body.get("content"))
    tags = validate_tags(body.get("tags", []))
    pinned = validate_pinned(body.get("pinned", False))

    db = get_db()
    timestamp = now_iso()
    cursor = db.execute(
        """
        INSERT INTO notes(author_id, title, content, pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (g.user["id"], title, content, int(pinned), timestamp, timestamp),
    )
    replace_tags(db, cursor.lastrowid, tags)
    db.commit()
    note = db.execute("SELECT * FROM notes WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(note_json(db, note)), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    db = get_db()
    note = db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if note is None:
        return error("Note not found.", 404)
    return jsonify(note_json(db, note))


@app.patch("/api/notes/<int:note_id>")
@login_required
@author_required
def update_note(note_id: int):
    body = get_json()
    if not isinstance(body, dict):
        return error("Request body must be a JSON object.", 400)

    fields: dict[str, Any] = {}
    if "title" in body:
        fields["title"] = validate_title(body.get("title"))
    if "content" in body:
        fields["content"] = validate_content(body.get("content"))
    if "pinned" in body:
        fields["pinned"] = int(validate_pinned(body.get("pinned")))
    if "tags" in body:
        fields["tags"] = validate_tags(body.get("tags"))

    if not fields:
        return error("No fields to update.", 400)

    db = get_db()
    if "tags" in fields:
        replace_tags(db, note_id, fields.pop("tags"))

    if fields:
        assignments = ", ".join(f"{name} = ?" for name in fields)
        db.execute(
            f"UPDATE notes SET {assignments}, updated_at = ? WHERE id = ?",
            [*fields.values(), now_iso(), note_id],
        )
    else:
        db.execute("UPDATE notes SET updated_at = ? WHERE id = ?", (now_iso(), note_id))
    db.commit()

    note = db.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return jsonify(note_json(db, note))


@app.delete("/api/notes/<int:note_id>")
@login_required
@author_required
def delete_note(note_id: int):
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return jsonify({"status": "deleted"}), 200


# ---------------------------------------------------------------- tags


@app.get("/api/tags")
def list_tags():
    db = get_db()
    rows = db.execute(
        """
        SELECT t.name AS tag, COUNT(nt.note_id) AS count
        FROM tags t
        JOIN note_tags nt ON nt.tag_id = t.id
        GROUP BY t.id
        HAVING count > 0
        ORDER BY count DESC, t.name COLLATE NOCASE
        """
    ).fetchall()
    return jsonify({"items": [{"tag": row["tag"], "count": row["count"]} for row in rows]})


# ------------------------------------------------------- api not found


@app.get("/api/notes/<note_id>")
@app.patch("/api/notes/<note_id>")
@app.delete("/api/notes/<note_id>")
def api_notes_fallback(note_id: str):
    """JSON 404 for note ids that are not integers."""
    return error("Note not found.", 404)


@app.get("/api/<path:rest>")
def api_fallback(rest: str):
    return error("Not found.", 404)


# ---------------------------------------------------------------- frontend


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
