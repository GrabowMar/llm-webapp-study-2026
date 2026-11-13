"""Markdown notes app: JSON API and frontend host."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import bleach
import markdown
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notes.db"

app = Flask(__name__, static_folder=None)

ALLOWED_TAGS = [
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
]
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel"],
    "code": ["class"],
    "img": ["src", "alt", "title"],
    "ol": ["start"],
    "td": ["align"],
    "th": ["align"],
}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
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
            CREATE INDEX IF NOT EXISTS idx_notes_user_updated
                ON notes(user_id, updated_at DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def render_markdown(source: str) -> str:
    rendered = markdown.markdown(
        source,
        extensions=["fenced_code", "tables", "sane_lists"],
        output_format="html",
    )
    return bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        strip=True,
    )


def error(message: str, status: int):
    return jsonify({"error": message}), status


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            """
            SELECT u.* FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def note_row(note_id: int, user_id: int) -> sqlite3.Row | None:
    return (
        get_db()
        .execute(
            """
            SELECT n.*, u.username FROM notes n
            JOIN users u ON u.id = n.user_id
            WHERE n.id = ? AND n.user_id = ?
            """,
            (note_id, user_id),
        )
        .fetchone()
    )


def note_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["username"],
    }


def note_summary(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
    }


def public_note_row(note_id: int) -> sqlite3.Row | None:
    return (
        get_db()
        .execute(
            """
            SELECT n.*, u.username FROM notes n
            JOIN users u ON u.id = n.user_id
            WHERE n.id = ? AND n.published = 1
            """,
            (note_id,),
        )
        .fetchone()
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Expected a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return error("username and password are required", 400)

    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error("Username already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Expected a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)

    row = get_db().execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    conn.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer ") :].strip()
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    return "", 204


@app.get("/api/notes")
@login_required
def list_notes():
    rows = (
        get_db()
        .execute(
            """
            SELECT id, title, published, updated_at FROM notes
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
            """,
            (g.user["id"],),
        )
        .fetchall()
    )
    return jsonify({"items": [note_summary(row) for row in rows]})


@app.post("/api/notes")
@login_required
def create_note():
    data = request.get_json(silent=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return error("Expected a JSON object", 400)

    title = data.get("title", "")
    body = data.get("body", "")
    published = data.get("published", False)
    if not isinstance(title, str) or not isinstance(body, str) or not isinstance(published, bool):
        return error("Invalid note fields", 400)

    now = utcnow()
    conn = get_db()
    cursor = conn.execute(
        """
        INSERT INTO notes (user_id, title, body, published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (g.user["id"], title, body, int(published), now, now),
    )
    conn.commit()
    row = note_row(cursor.lastrowid, g.user["id"])
    return jsonify(note_json(row)), 201


@app.get("/api/notes/<int:note_id>")
@login_required
def get_note(note_id: int):
    row = note_row(note_id, g.user["id"])
    if row is None:
        return error("Note not found", 404)
    return jsonify(note_json(row))


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    row = note_row(note_id, g.user["id"])
    if row is None:
        return error("Note not found", 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Expected a JSON object", 400)

    title = data.get("title", row["title"])
    body = data.get("body", row["body"])
    published = data.get("published", bool(row["published"]))
    if not isinstance(title, str) or not isinstance(body, str) or not isinstance(published, bool):
        return error("Invalid note fields", 400)

    conn = get_db()
    conn.execute(
        """
        UPDATE notes SET title = ?, body = ?, published = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (title, body, int(published), utcnow(), note_id, g.user["id"]),
    )
    conn.commit()
    return jsonify(note_json(note_row(note_id, g.user["id"])))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    row = note_row(note_id, g.user["id"])
    if row is None:
        return error("Note not found", 404)
    conn = get_db()
    conn.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, g.user["id"]))
    conn.commit()
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
@login_required
def note_html(note_id: int):
    row = note_row(note_id, g.user["id"])
    if row is None:
        return error("Note not found", 404)
    return render_markdown(row["body"]), 200, {"Content-Type": "text/html; charset=utf-8"}


@app.post("/api/render")
@login_required
def render():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not isinstance(data.get("body", ""), str):
        return error("Invalid body", 400)
    return render_markdown(data.get("body", "")), 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/api/public/notes/<int:note_id>")
def public_note(note_id: int):
    row = public_note_row(note_id)
    if row is None:
        return error("Note not found", 404)
    return jsonify(
        {
            "id": row["id"],
            "title": row["title"],
            "published": True,
            "updated_at": row["updated_at"],
            "author": row["username"],
        }
    )


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = public_note_row(note_id)
    if row is None:
        return error("Note not found", 404)
    return render_markdown(row["body"]), 200, {"Content-Type": "text/html; charset=utf-8"}


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("Not found", 404)
    return send_index()


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error("Not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_index()


def send_index():
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
