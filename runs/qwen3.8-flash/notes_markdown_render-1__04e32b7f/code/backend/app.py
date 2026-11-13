"""Flask entry point for the Markdown notes app."""

import json
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import markdown as md
from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "notes.db"

MARKDOWN_EXTENSIONS = ["extra", "sane_lists", "nl2br"]

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024


# --------------------------------------------------------------------------- db


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT    NOT NULL,
            created_at    TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_tokens (
            token      TEXT    PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title      TEXT    NOT NULL DEFAULT '',
            body       TEXT    NOT NULL DEFAULT '',
            published  INTEGER NOT NULL DEFAULT 0,
            created_at TEXT    NOT NULL,
            updated_at TEXT    NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notes_user_updated
            ON notes (user_id, updated_at DESC);
        """
    )
    conn.commit()
    conn.close()


init_db()


# ----------------------------------------------------------------- auth helpers


def json_error(message: str, status: int) -> Response:
    return Response(
        json.dumps({"error": message}), status=status, content_type="application/json"
    )


def body_json() -> dict:
    if not request.is_json:
        return {}
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    row = get_db().execute(
        "SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token.strip(),),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return json_error("authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return token


# ------------------------------------------------------------------ serialising


NOTE_SELECT = (
    "SELECT n.id, n.title, n.body, n.published, n.created_at, n.updated_at, "
    "u.username AS author FROM notes n JOIN users u ON u.id = n.user_id "
)


def note_fields(row, with_body: bool) -> dict:
    data = {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }
    if with_body:
        data["body"] = row["body"]
    return data


def note_item(row) -> dict:
    """Shape for GET /api/notes: no body, no author."""
    return {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
    }


def get_owned_note(note_id: int):
    row = get_db().execute(
        NOTE_SELECT + "WHERE n.id = ? AND n.user_id = ?",
        (note_id, g.user["id"]),
    ).fetchone()
    return row


def render_markdown(text: str) -> str:
    return md.markdown(text or "", extensions=MARKDOWN_EXTENSIONS)


def html_fragment(text: str) -> Response:
    return Response(render_markdown(text), content_type="text/html; charset=utf-8")


# ------------------------------------------------------------------- auth routes


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not (username := username.strip()):
        return json_error("username is required", 400)
    if len(username) > 64:
        return json_error("username is too long", 400)
    if not isinstance(password, str) or not password:
        return json_error("password is required", 400)
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return json_error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"token": issue_token(cur.lastrowid)}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("username and password are required", 400)
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return json_error("invalid username or password", 401)
    return jsonify({"token": issue_token(row["id"])}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    _, _, token = header.partition(" ")
    db = get_db()
    db.execute("DELETE FROM auth_tokens WHERE token = ?", (token.strip(),))
    db.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"username": g.user["username"]}), 200


# ------------------------------------------------------------------ note routes


@app.get("/api/notes")
@login_required
def list_notes():
    rows = get_db().execute(
        NOTE_SELECT + "WHERE n.user_id = ? ORDER BY n.updated_at DESC, n.id DESC",
        (g.user["id"],),
    ).fetchall()
    return jsonify({"items": [note_item(r) for r in rows]}), 200


@app.post("/api/notes")
@login_required
def create_note():
    data = body_json()
    title = data.get("title", "")
    body = data.get("body", "")
    published = bool(data.get("published", False))
    if not isinstance(title, str) or not isinstance(body, str):
        return json_error("title and body must be strings", 400)
    stamp = now_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes (user_id, title, body, published, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (g.user["id"], title, body, int(published), stamp, stamp),
    )
    db.commit()
    row = get_db().execute(NOTE_SELECT + "WHERE n.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(note_fields(row, with_body=True)), 201


def get_note_or_404(note_id: int):
    row = get_owned_note(note_id)
    if row is None:
        return json_error("note not found", 404)
    return row


@app.get("/api/notes/<int:note_id>")
@login_required
def get_note(note_id: int):
    row = get_note_or_404(note_id)
    if isinstance(row, Response):
        return row
    return jsonify(note_fields(row, with_body=True)), 200


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    row = get_note_or_404(note_id)
    if isinstance(row, Response):
        return row
    data = body_json()
    title = row["title"]
    body = row["body"]
    published = bool(row["published"])
    if "title" in data:
        if not isinstance(data["title"], str):
            return json_error("title must be a string", 400)
        title = data["title"]
    if "body" in data:
        if not isinstance(data["body"], str):
            return json_error("body must be a string", 400)
        body = data["body"]
    if "published" in data:
        published = bool(data["published"])
    db = get_db()
    db.execute(
        "UPDATE notes SET title = ?, body = ?, published = ?, updated_at = ? "
        "WHERE id = ?",
        (title, body, int(published), now_iso(), note_id),
    )
    db.commit()
    row = get_db().execute(NOTE_SELECT + "WHERE n.id = ?", (note_id,)).fetchone()
    return jsonify(note_fields(row, with_body=True)), 200


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    row = get_note_or_404(note_id)
    if isinstance(row, Response):
        return row
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return Response(status=204)


@app.get("/api/notes/<int:note_id>/html")
@login_required
def note_html(note_id: int):
    row = get_note_or_404(note_id)
    if isinstance(row, Response):
        return row
    return html_fragment(row["body"])


@app.post("/api/render")
@login_required
def render_preview():
    data = body_json()
    body = data.get("body", "")
    if not isinstance(body, str):
        return json_error("body must be a string", 400)
    return html_fragment(body)


# ---------------------------------------------------------------- public routes


def get_published_note(note_id: int):
    row = get_db().execute(
        NOTE_SELECT + "WHERE n.id = ? AND n.published = 1", (note_id,)
    ).fetchone()
    if row is None:
        return json_error("note not found", 404)
    return row


@app.get("/api/public/notes/<int:note_id>")
def public_note(note_id: int):
    row = get_published_note(note_id)
    if isinstance(row, Response):
        return row
    return jsonify(note_fields(row, with_body=False)), 200


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = get_published_note(note_id)
    if isinstance(row, Response):
        return row
    return html_fragment(row["body"])


# ------------------------------------------------------------------- misc / spa


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
