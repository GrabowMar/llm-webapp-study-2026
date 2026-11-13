"""Flask entry point for the tagged notes app.

Serves the JSON API under ``/api`` and the built frontend from ``frontend/dist``.
Data lives in a SQLite database under ``./data`` (relative to the working
directory, which is ``/app`` in the container).
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
DB_PATH = DATA_DIR / "notes.db"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_TITLE_LENGTH = 200
MAX_CONTENT_LENGTH = 100_000
MAX_TAG_LENGTH = 50
MAX_TAGS = 25

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------- #
# database
# --------------------------------------------------------------------------- #

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    pinned     INTEGER NOT NULL DEFAULT 0,
    author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(pinned DESC, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


def now_iso() -> str:
    """Current UTC time as a sortable ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )


def get_db() -> sqlite3.Connection:
    """Connection for the current request (one per request, closed afterwards)."""
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: object) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def error(status: int, message: str):
    """Error response carrying a human readable message."""
    payload = {"error": message, "message": message}
    return jsonify(payload), status


def body() -> dict:
    """Parsed JSON body of the current request (empty dict when absent)."""
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def normalize_tags(raw) -> list[str]:
    """Normalise a tag input into a list of lowercase, unique tag names."""
    if raw is None:
        return []
    if isinstance(raw, str):
        raw = [part for part in raw.replace("\n", ",").split(",")]
    if not isinstance(raw, (list, tuple)):
        return []
    seen: list[str] = []
    for item in raw:
        if not isinstance(item, str):
            continue
        name = item.strip().lstrip("#").strip().lower()
        if not name or name in seen:
            continue
        seen.append(name)
    return seen[:MAX_TAGS]


def current_user():
    """User bound to the request token, or None."""
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        """
        SELECT u.id, u.username, u.created_at
          FROM sessions s
          JOIN users u ON u.id = s.user_id
         WHERE s.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def require_user():
    """Return the signed-in user row or None."""
    return current_user()


def serialize_note(row: sqlite3.Row, tags: list[str]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "pinned": bool(row["pinned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author_name"] if "author_name" in row.keys() else None,
    }


def tags_for_note(note_id: int) -> list[str]:
    rows = get_db().execute(
        """
        SELECT t.name
          FROM note_tags nt
          JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = ?
         ORDER BY t.name
        """,
        (note_id,),
    ).fetchall()
    return [r["name"] for r in rows]


def fetch_note(note_id: int):
    return get_db().execute(
        """
        SELECT n.*, u.username AS author_name
          FROM notes n
          JOIN users u ON u.id = n.author_id
         WHERE n.id = ?
        """,
        (note_id,),
    ).fetchone()


def note_payload(note_id: int) -> dict:
    row = fetch_note(note_id)
    return serialize_note(row, tags_for_note(note_id))


def set_tags(note_id: int, tags: list[str]) -> None:
    conn = get_db()
    conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    for name in tags:
        conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?)", (name,))
        tag_row = conn.execute("SELECT id FROM tags WHERE name = ?", (name,)).fetchone()
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)",
            (note_id, tag_row["id"]),
        )
    conn.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)"
    )


# --------------------------------------------------------------------------- #
# health
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# accounts
# --------------------------------------------------------------------------- #


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error(400, "Username is required")
    username = username.strip()
    if len(username) > 64:
        return error(400, "Username must be 64 characters or fewer")
    if not isinstance(password, str) or not password:
        return error(400, "Password is required")

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error(409, "That username is already taken")

    cur = conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    conn.commit()
    user_id = cur.lastrowid

    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    conn.commit()

    return (
        jsonify(
            {
                "token": token,
                "user": {"id": user_id, "username": username},
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "Username and password are required")

    conn = get_db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error(401, "Incorrect username or password")

    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    conn.commit()
    return jsonify({"token": token, "user": {"id": row["id"], "username": row["username"]}})


@app.get("/api/auth/me")
def whoami():
    user = require_user()
    if user is None:
        return error(401, "Sign in to continue")
    return {"user": {"id": user["id"], "username": user["username"]}}


# --------------------------------------------------------------------------- #
# notes
# --------------------------------------------------------------------------- #


@app.get("/api/notes")
def list_notes():
    conn = get_db()

    where: list[str] = []
    params: list = []

    tag = request.args.get("tag")
    if tag is not None and tag.strip():
        where.append(
            "n.id IN (SELECT nt.note_id FROM note_tags nt "
            "JOIN tags t ON t.id = nt.tag_id WHERE t.name = ?)"
        )
        params.append(tag.strip().lstrip("#").lower())

    author = request.args.get("author")
    if author is not None and author.strip():
        where.append("LOWER(u.username) = ?")
        params.append(author.strip().lower())

    query = request.args.get("q")
    if query is not None and query.strip():
        needle = f"%{query.strip().lower()}%"
        where.append("(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ?)")
        params.extend([needle, needle])

    clause = f"WHERE {' AND '.join(where)}" if where else ""

    total = conn.execute(
        f"""
        SELECT COUNT(*) AS n
          FROM notes n
          JOIN users u ON u.id = n.author_id
          {clause}
        """,
        params,
    ).fetchone()["n"]

    page = _positive_int(request.args.get("page"), 1)
    page_size = _positive_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    rows = conn.execute(
        f"""
        SELECT n.*, u.username AS author_name
          FROM notes n
          JOIN users u ON u.id = n.author_id
          {clause}
         ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC
         LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    items = [serialize_note(row, tags_for_note(row["id"])) for row in rows]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def _positive_int(raw, default: int) -> int:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if value < 1:
        return default
    return value


@app.post("/api/notes")
def create_note():
    user = require_user()
    if user is None:
        return error(401, "Sign in to write notes")

    data = body()
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return error(400, "Title is required")
    title = title.strip()
    if len(title) > MAX_TITLE_LENGTH:
        return error(400, f"Title must be {MAX_TITLE_LENGTH} characters or fewer")

    content = data.get("content", "")
    if content is None:
        content = ""
    if not isinstance(content, str):
        return error(400, "Content must be text")
    if len(content) > MAX_CONTENT_LENGTH:
        return error(400, "Content is too long")

    pinned = data.get("pinned", False)
    if pinned is None:
        pinned = False
    if not isinstance(pinned, bool):
        return error(400, "Pinned must be true or false")

    tags = normalize_tags(data.get("tags"))
    if len(tags) > MAX_TAGS:
        return error(400, f"At most {MAX_TAGS} tags are allowed")

    conn = get_db()
    stamp = now_iso()
    cur = conn.execute(
        """
        INSERT INTO notes (title, content, pinned, author_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (title, content, 1 if pinned else 0, user["id"], stamp, stamp),
    )
    conn.commit()
    note_id = cur.lastrowid
    set_tags(note_id, tags)
    conn.commit()
    return jsonify(note_payload(note_id)), 201


@app.get("/api/notes/<int:note_id>")
def read_note(note_id: int):
    row = fetch_note(note_id)
    if row is None:
        return error(404, "Note not found")
    return jsonify(note_payload(note_id))


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user = require_user()
    if user is None:
        return error(401, "Sign in to change notes")

    row = fetch_note(note_id)
    if row is None:
        return error(404, "Note not found")
    if row["author_id"] != user["id"]:
        return error(403, "Only the author can change this note")

    data = body()
    updates: list[str] = []
    params: list = []

    if "title" in data:
        title = data["title"]
        if not isinstance(title, str) or not title.strip():
            return error(400, "Title is required")
        title = title.strip()
        if len(title) > MAX_TITLE_LENGTH:
            return error(
                400, f"Title must be {MAX_TITLE_LENGTH} characters or fewer"
            )
        updates.append("title = ?")
        params.append(title)

    if "content" in data:
        content = data["content"]
        if content is None:
            content = ""
        if not isinstance(content, str):
            return error(400, "Content must be text")
        if len(content) > MAX_CONTENT_LENGTH:
            return error(400, "Content is too long")
        updates.append("content = ?")
        params.append(content)

    if "pinned" in data:
        pinned = data["pinned"]
        if not isinstance(pinned, bool):
            return error(400, "Pinned must be true or false")
        updates.append("pinned = ?")
        params.append(1 if pinned else 0)

    new_tags = None
    if "tags" in data:
        new_tags = normalize_tags(data["tags"])
        if len(new_tags) > MAX_TAGS:
            return error(400, f"At most {MAX_TAGS} tags are allowed")

    if updates:
        updates.append("updated_at = ?")
        params.append(now_iso())
        params.append(note_id)
        get_db().execute(
            f"UPDATE notes SET {', '.join(updates)} WHERE id = ?", params
        )
    elif new_tags is None:
        # Nothing to change, but every update refreshes updated_at.
        get_db().execute(
            "UPDATE notes SET updated_at = ? WHERE id = ?", (now_iso(), note_id)
        )
    get_db().commit()

    if new_tags is not None:
        set_tags(note_id, new_tags)
        get_db().execute(
            "UPDATE notes SET updated_at = ? WHERE id = ?", (now_iso(), note_id)
        )
        get_db().commit()

    return jsonify(note_payload(note_id))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user = require_user()
    if user is None:
        return error(401, "Sign in to delete notes")

    row = fetch_note(note_id)
    if row is None:
        return error(404, "Note not found")
    if row["author_id"] != user["id"]:
        return error(403, "Only the author can delete this note")

    conn = get_db()
    conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.execute("DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)")
    conn.commit()
    return jsonify({"deleted": True, "id": note_id})


@app.get("/api/authors")
def list_authors():
    rows = get_db().execute(
        """
        SELECT u.username AS author, COUNT(n.id) AS count
          FROM users u
          JOIN notes n ON n.author_id = u.id
         GROUP BY u.id
         ORDER BY count DESC, author ASC
        """
    ).fetchall()
    return {"items": [{"author": r["author"], "count": r["count"]} for r in rows]}


@app.get("/api/tags")
def list_tags():
    rows = get_db().execute(
        """
        SELECT t.name AS tag, COUNT(nt.note_id) AS count
          FROM tags t
          JOIN note_tags nt ON nt.tag_id = t.id
         GROUP BY t.id
         ORDER BY count DESC, tag ASC
        """
    ).fetchall()
    return {"items": [{"tag": r["tag"], "count": r["count"]} for r in rows]}


# --------------------------------------------------------------------------- #
# frontend
# --------------------------------------------------------------------------- #


@app.errorhandler(404)
def handle_404(_error):
    if request.path.startswith("/api/"):
        return error(404, "Not found")
    if DIST.is_dir():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Frontend build not found"}), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "Frontend build not found"}), 404
    return send_from_directory(DIST, "index.html")
