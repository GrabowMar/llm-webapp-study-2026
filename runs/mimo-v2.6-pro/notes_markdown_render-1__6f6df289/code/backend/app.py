"""Markdown notes: JSON API under /api plus the built frontend."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import markdown as markdown_lib
import nh3
from flask import Flask
from flask import Response
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "notes.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    published INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
"""

app = Flask(__name__, static_folder=None)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(SCHEMA)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def render_markdown(text: str) -> str:
    html = markdown_lib.markdown(text or "", extensions=["extra", "sane_lists"])
    return nh3.clean(html, link_rel="noopener noreferrer")


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def note_json(row: sqlite3.Row, include_body: bool = True) -> dict:
    data = {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }
    if include_body:
        data["body"] = row["body"]
    return data


def find_note(note_id: int, user_id: int | None = None) -> sqlite3.Row | None:
    sql = (
        "SELECT n.*, u.username AS author FROM notes n"
        " JOIN users u ON u.id = n.user_id WHERE n.id = ?"
    )
    params: list = [note_id]
    if user_id is not None:
        sql += " AND n.user_id = ?"
        params.append(user_id)
    return get_db().execute(sql, params).fetchone()


def check_string_fields(payload: dict) -> str | None:
    for field in ("title", "body"):
        if field in payload and not isinstance(payload[field], str):
            return f"{field} must be a string"
    if "published" in payload and not isinstance(payload["published"], bool):
        return "published must be a boolean"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "a JSON body is required"}), 400
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password must be strings"}), 400
    username = username.strip()
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "a JSON body is required"}), 400
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password must be strings"}), 400
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, row["id"]))
    db.commit()
    return jsonify({"token": token})


@app.get("/api/notes")
@login_required
def list_notes():
    rows = get_db().execute(
        "SELECT id, title, published, updated_at FROM notes WHERE user_id = ?"
        " ORDER BY updated_at DESC, id DESC",
        (g.user["id"],),
    ).fetchall()
    items = [
        {
            "id": row["id"],
            "title": row["title"],
            "published": bool(row["published"]),
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]
    return jsonify({"items": items})


@app.post("/api/notes")
@login_required
def create_note():
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return jsonify({"error": "a JSON object body is required"}), 400
    problem = check_string_fields(payload)
    if problem:
        return jsonify({"error": problem}), 400
    title = payload.get("title", "")
    body = payload.get("body", "")
    published = payload.get("published", False)
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes (user_id, title, body, published, updated_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (g.user["id"], title, body, int(published), now_iso()),
    )
    db.commit()
    row = find_note(cur.lastrowid)
    return jsonify(note_json(row)), 201


@app.get("/api/notes/<int:note_id>")
@login_required
def get_note(note_id: int):
    row = find_note(note_id, g.user["id"])
    if row is None:
        return jsonify({"error": "note not found"}), 404
    return jsonify(note_json(row))


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    row = find_note(note_id, g.user["id"])
    if row is None:
        return jsonify({"error": "note not found"}), 404
    payload = request.get_json(silent=True)
    if payload is None:
        payload = {}
    if not isinstance(payload, dict):
        return jsonify({"error": "a JSON object body is required"}), 400
    problem = check_string_fields(payload)
    if problem:
        return jsonify({"error": problem}), 400
    updates = {}
    if "title" in payload:
        updates["title"] = payload["title"]
    if "body" in payload:
        updates["body"] = payload["body"]
    if "published" in payload:
        updates["published"] = int(payload["published"])
    if updates:
        updates["updated_at"] = now_iso()
        assignments = ", ".join(f"{field} = ?" for field in updates)
        db = get_db()
        db.execute(
            f"UPDATE notes SET {assignments} WHERE id = ?",  # noqa: S608
            [*updates.values(), note_id],
        )
        db.commit()
    row = find_note(note_id, g.user["id"])
    return jsonify(note_json(row))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    db = get_db()
    cur = db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, g.user["id"]))
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "note not found"}), 404
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
@login_required
def note_html(note_id: int):
    row = find_note(note_id, g.user["id"])
    if row is None:
        return jsonify({"error": "note not found"}), 404
    return Response(render_markdown(row["body"]), mimetype="text/html")


def public_note_or_404(note_id: int):
    row = find_note(note_id)
    if row is None or not row["published"]:
        return None, (jsonify({"error": "note not found"}), 404)
    return row, None


@app.get("/api/public/notes/<int:note_id>")
def public_note(note_id: int):
    row, error = public_note_or_404(note_id)
    if error:
        return error
    return jsonify(note_json(row, include_body=False))


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row, error = public_note_or_404(note_id)
    if error:
        return error
    return Response(render_markdown(row["body"]), mimetype="text/html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
