"""Flask entry point."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any

import nh3
from flask import Flask, Response, g, jsonify, request, send_from_directory
from markdown import markdown
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("NOTES_DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notes.db"

MARKDOWN_EXTENSIONS = ["fenced_code", "tables"]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
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
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
"""

app = Flask(__name__, static_folder=None)


_last_timestamp: datetime | None = None


def utcnow() -> str:
    global _last_timestamp
    now = datetime.now(timezone.utc)
    if _last_timestamp is not None and now <= _last_timestamp:
        now = _last_timestamp + timedelta(microseconds=1)
    _last_timestamp = now
    return now.isoformat(timespec="microseconds").replace("+00:00", "Z")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.executescript(SCHEMA)
        db.commit()
    finally:
        db.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=5000")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def current_user() -> dict[str, Any] | None:
    if "user" in g:
        return g.user
    user: dict[str, Any] | None = None
    header = request.headers.get("Authorization", "")
    if header[:7].lower() == "bearer ":
        token = header[7:].strip()
        if token:
            row = get_db().execute(
                "SELECT u.id AS id, u.username AS username"
                " FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (token,),
            ).fetchone()
            if row is not None:
                user = {"id": row["id"], "username": row["username"]}
    g.user = user
    return user


def auth_required(view):
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return jsonify({"error": "authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped


def request_json() -> dict[str, Any] | None:
    if not request.data:
        return {}
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return None


def error(message: str, status: int):
    return jsonify({"error": message}), status


def as_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return None


def full_note(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


def list_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
    }


def owned_note(note_id: int) -> sqlite3.Row | None:
    user = current_user()
    if user is None:
        return None
    row = get_db().execute(
        "SELECT n.id, n.title, n.body, n.published, n.updated_at, n.user_id,"
        " u.username AS author"
        " FROM notes n JOIN users u ON u.id = n.user_id WHERE n.id = ?",
        (note_id,),
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return None
    return row


def published_note(note_id: int) -> sqlite3.Row | None:
    row = get_db().execute(
        "SELECT n.id, n.title, n.body, n.published, n.updated_at,"
        " u.username AS author"
        " FROM notes n JOIN users u ON u.id = n.user_id"
        " WHERE n.id = ? AND n.published = 1",
        (note_id,),
    ).fetchone()
    return row


def render_markdown(body: str) -> str:
    html = markdown(body, extensions=MARKDOWN_EXTENSIONS)
    return nh3.clean(html)


@app.after_request
def set_headers(response: Response) -> Response:
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.errorhandler(404)
def not_found(_exception: Any):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return "frontend build not found", 404


@app.errorhandler(405)
def method_not_allowed(_exception: Any):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return jsonify({"error": "method not allowed"}), 405


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request_json()
    if data is None:
        return error("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already exists", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request_json()
    if data is None:
        return error("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.get("/api/notes")
@auth_required
def list_notes():
    rows = get_db().execute(
        "SELECT id, title, published, updated_at FROM notes WHERE user_id = ?"
        " ORDER BY updated_at DESC, id DESC",
        (current_user()["id"],),
    ).fetchall()
    return jsonify({"items": [list_item(row) for row in rows]})


@app.post("/api/notes")
@auth_required
def create_note():
    data = request_json()
    if data is None:
        return error("invalid JSON body", 400)
    title = data.get("title", "")
    body = data.get("body", "")
    if not isinstance(title, str) or not isinstance(body, str):
        return error("title and body must be strings", 400)
    published = False
    if "published" in data:
        published = as_bool(data.get("published"))
        if published is None:
            return error("published must be a boolean", 400)
    timestamp = utcnow()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO notes (user_id, title, body, published, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (current_user()["id"], title, body, int(published), timestamp, timestamp),
    )
    db.commit()
    row = db.execute(
        "SELECT n.id, n.title, n.body, n.published, n.updated_at, u.username AS author"
        " FROM notes n JOIN users u ON u.id = n.user_id WHERE n.id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(full_note(row)), 201


@app.get("/api/notes/<int:note_id>")
@auth_required
def get_note(note_id: int):
    row = owned_note(note_id)
    if row is None:
        return error("note not found", 404)
    return jsonify(full_note(row))


@app.patch("/api/notes/<int:note_id>")
@auth_required
def update_note(note_id: int):
    row = owned_note(note_id)
    if row is None:
        return error("note not found", 404)
    data = request_json()
    if data is None:
        return error("invalid JSON body", 400)
    fields: list[str] = []
    values: list[Any] = []
    if "title" in data:
        if not isinstance(data["title"], str):
            return error("title must be a string", 400)
        fields.append("title = ?")
        values.append(data["title"])
    if "body" in data:
        if not isinstance(data["body"], str):
            return error("body must be a string", 400)
        fields.append("body = ?")
        values.append(data["body"])
    if "published" in data:
        published = as_bool(data.get("published"))
        if published is None:
            return error("published must be a boolean", 400)
        fields.append("published = ?")
        values.append(int(published))
    if fields:
        fields.append("updated_at = ?")
        values.append(utcnow())
        db = get_db()
        db.execute(f"UPDATE notes SET {', '.join(fields)} WHERE id = ?", (*values, row["id"]))
        db.commit()
        row = owned_note(note_id)
    return jsonify(full_note(row))


@app.delete("/api/notes/<int:note_id>")
@auth_required
def delete_note(note_id: int):
    row = owned_note(note_id)
    if row is None:
        return error("note not found", 404)
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (row["id"],))
    db.commit()
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
@auth_required
def note_html(note_id: int):
    row = owned_note(note_id)
    if row is None:
        return error("note not found", 404)
    return Response(render_markdown(row["body"]), mimetype="text/html")


@app.get("/api/public/notes/<int:note_id>")
def public_note(note_id: int):
    row = published_note(note_id)
    if row is None:
        return error("note not found", 404)
    return jsonify(full_note(row))


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = published_note(note_id)
    if row is None:
        return error("note not found", 404)
    return Response(render_markdown(row["body"]), mimetype="text/html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    target = (DIST / path).resolve()
    if target.is_relative_to(DIST.resolve()) and target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
