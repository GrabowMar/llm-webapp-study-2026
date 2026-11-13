"""Tagged notes: Flask API + frontend server."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "notes.db"

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False

_SCHEMA = """
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
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
"""

_PEPPER = os.environ.get("APP_PEPPER", "tagged-notes-pepper")


def now() -> str:
    import datetime

    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(_SCHEMA)
    db.commit()
    db.close()


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1
    )
    return f"{salt}${digest.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt.encode("utf-8"), n=16384, r=8, p=1
    )
    return hmac.compare_digest(digest.hex(), expected)


def _issue_token(db: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now()),
    )
    db.commit()
    return token


def _current_user() -> sqlite3.Row | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT u.id, u.username FROM users u "
        "JOIN tokens t ON t.user_id = u.id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = _current_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def _json_body() -> dict | None:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def _note_to_dict(row: sqlite3.Row) -> dict:
    tags = json.loads(row["tags"]) if row["tags"] else []
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


def _normalize_tags(tags) -> list[str] | None:
    if tags is None:
        return None
    if not isinstance(tags, list):
        raise ValueError("tags must be a list")
    normalized: list[str] = []
    for tag in tags:
        if not isinstance(tag, str):
            raise ValueError("tags must be strings")
        t = tag.strip().lower()
        if t and t not in normalized:
            normalized.append(t)
    return normalized


def _title_error(title) -> str | None:
    if title is None:
        return "title is required"
    if not isinstance(title, str):
        return "title must be a string"
    if not title.strip():
        return "title must not be empty"
    return None


def _content_error(content) -> str | None:
    if content is None:
        return "content is required"
    if not isinstance(content, str):
        return "content must be a string"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = _json_body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username is required"}), 400
    username = username.strip()
    if not isinstance(password, str) or not password:
        return jsonify({"error": "password is required"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing:
        return jsonify({"error": "username is already taken"}), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, _hash_password(password), now()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = _json_body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid credentials"}), 401

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if row is None or not _verify_password(password, row["password_hash"]):
        return jsonify({"error": "Invalid credentials"}), 401

    token = _issue_token(db, row["id"])
    return jsonify({"token": token}), 200


@app.get("/api/notes")
def list_notes():
    tag = request.args.get("tag")
    author = request.args.get("author")
    q = request.args.get("q")

    try:
        page = max(1, int(request.args.get("page", "1")))
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", "10"))
    except ValueError:
        page_size = 10
    page_size = min(max(1, page_size), 100)

    db = get_db()

    where = []
    params: list = []
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM json_each(n.tags) je "
            "WHERE lower(je.value) = lower(?))"
        )
        params.append(tag.strip())
    if author:
        where.append("u.username = ? COLLATE NOCASE")
        params.append(author.strip())
    if q:
        where.append("(n.title LIKE ? OR n.content LIKE ?)")
        like = f"%{q}%"
        params.append(like)
        params.append(like)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM notes n JOIN users u ON u.id = n.author_id {where_sql}",
        params,
    ).fetchone()[0]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"""
        SELECT n.id, n.title, n.content, n.tags, n.pinned,
               n.created_at, n.updated_at, u.username AS author
        FROM notes n JOIN users u ON u.id = n.author_id
        {where_sql}
        ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    items = [_note_to_dict(r) for r in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/notes")
@login_required
def create_note():
    data = _json_body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400

    title = data.get("title")
    content = data.get("content")

    err = _title_error(title) or _content_error(content)
    if err:
        return jsonify({"error": err}), 400

    try:
        tags = _normalize_tags(data.get("tags", []))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    pinned = data.get("pinned", False)
    if not isinstance(pinned, bool):
        return jsonify({"error": "pinned must be a boolean"}), 400

    ts = now()
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes (title, content, tags, pinned, author_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            title,
            content,
            json.dumps(tags),
            1 if pinned else 0,
            g.user["id"],
            ts,
            ts,
        ),
    )
    db.commit()

    row = db.execute(
        "SELECT n.id, n.title, n.content, n.tags, n.pinned, "
        "n.created_at, n.updated_at, u.username AS author "
        "FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(_note_to_dict(row)), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    db = get_db()
    row = db.execute(
        "SELECT n.id, n.title, n.content, n.tags, n.pinned, "
        "n.created_at, n.updated_at, u.username AS author "
        "FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?",
        (note_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "Note not found"}), 404
    return jsonify(_note_to_dict(row))


def _load_note(db, note_id: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT n.id, n.title, n.content, n.tags, n.pinned, "
        "n.created_at, n.updated_at, n.author_id, u.username AS author "
        "FROM notes n JOIN users u ON u.id = n.author_id WHERE n.id = ?",
        (note_id,),
    ).fetchone()


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    db = get_db()
    row = _load_note(db, note_id)
    if row is None:
        return jsonify({"error": "Note not found"}), 404
    if row["author_id"] != g.user["id"]:
        return jsonify({"error": "Only the author may edit this note"}), 403

    data = _json_body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    if not data:
        return jsonify({"error": "No fields to update"}), 400

    allowed = {"title", "content", "tags", "pinned"}
    unknown = set(data) - allowed
    if unknown:
        return jsonify({"error": f"Unknown fields: {', '.join(sorted(unknown))}"}), 400

    updates = []
    params: list = []

    if "title" in data:
        err = _title_error(data["title"])
        if err:
            return jsonify({"error": err}), 400
        updates.append("title = ?")
        params.append(data["title"])

    if "content" in data:
        err = _content_error(data["content"])
        if err:
            return jsonify({"error": err}), 400
        updates.append("content = ?")
        params.append(data["content"])

    if "tags" in data:
        try:
            tags = _normalize_tags(data["tags"])
        except ValueError as e:
            return jsonify({"error": str(e)}), 400
        updates.append("tags = ?")
        params.append(json.dumps(tags))

    if "pinned" in data:
        if not isinstance(data["pinned"], bool):
            return jsonify({"error": "pinned must be a boolean"}), 400
        updates.append("pinned = ?")
        params.append(1 if data["pinned"] else 0)

    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400

    updates.append("updated_at = ?")
    params.append(now())
    params.append(note_id)

    db.execute(
        f"UPDATE notes SET {', '.join(updates)} WHERE id = ?", params
    )
    db.commit()

    updated = _load_note(db, note_id)
    return jsonify(_note_to_dict(updated))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    db = get_db()
    row = _load_note(db, note_id)
    if row is None:
        return jsonify({"error": "Note not found"}), 404
    if row["author_id"] != g.user["id"]:
        return jsonify({"error": "Only the author may delete this note"}), 403

    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return "", 204


@app.get("/api/tags")
def list_tags():
    db = get_db()
    rows = db.execute(
        "SELECT je.value AS tag, COUNT(*) AS count "
        "FROM notes n, json_each(n.tags) je "
        "GROUP BY lower(je.value) "
        "ORDER BY count DESC, lower(je.value) ASC"
    ).fetchall()
    items = [{"tag": r["tag"], "count": r["count"]} for r in rows]
    return jsonify({"items": items})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
