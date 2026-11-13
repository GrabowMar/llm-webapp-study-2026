"""Flask application: private Markdown notes with a JSON API and a SPA frontend."""

import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import bleach
import markdown
from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "notes.sqlite3"

app = Flask(__name__, static_folder=None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
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
            CREATE INDEX IF NOT EXISTS idx_notes_user_updated
                ON notes(user_id, updated_at DESC);
            """
        )
        db.commit()
    finally:
        db.close()


init_db()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify({"error": error.message}), error.status


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return serve_frontend("index.html")


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    return jsonify({"error": "method not allowed"}), 405


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ApiError(400, "expected a JSON object")
    return data


def require_string(data: dict, key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str):
        raise ApiError(400, f"{key} must be a string")
    return value


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return get_db().execute(
        """SELECT u.id, u.username FROM tokens t
           JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
        (token,),
    ).fetchone()


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "authentication required")
    return user


NOTE_QUERY = """
    SELECT n.id, n.title, n.body, n.published, n.updated_at, u.username AS author
    FROM notes n JOIN users u ON u.id = n.user_id
"""


def note_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


def own_note(note_id: int, user_id: int):
    row = get_db().execute(
        NOTE_QUERY + " WHERE n.id = ? AND n.user_id = ?", (note_id, user_id)
    ).fetchone()
    if row is None:
        raise ApiError(404, "note not found")
    return row


ALLOWED_TAGS = [
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li",
    "dl", "dt", "dd", "blockquote", "pre", "code", "strong", "em", "b", "i",
    "a", "img", "del", "ins", "sup", "sub", "table", "thead", "tbody", "tfoot",
    "tr", "th", "td", "div", "span", "abbr", "kbd", "s", "q", "input",
]
ALLOWED_ATTRS = {
    "*": ["class", "id", "title"],
    "a": ["href", "title", "rel", "target"],
    "img": ["src", "alt", "title", "width", "height"],
    "th": ["align", "colspan", "rowspan", "scope"],
    "td": ["align", "colspan", "rowspan"],
    "ol": ["start"],
    "code": ["class"],
    "pre": ["class"],
    "input": ["type", "checked", "disabled"],
}


def render_markdown(body: str) -> str:
    raw = markdown.markdown(body, extensions=["extra", "sane_lists"])
    return bleach.clean(
        raw,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=["http", "https", "mailto"],
        strip=True,
    )


def html_response(html: str) -> Response:
    return Response(html, status=200, content_type="text/html; charset=utf-8")


@app.get("/api/health")
def health():
    return {"status": "ok"}


USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = require_string(data, "username").strip()
    password = require_string(data, "password")
    if not USERNAME_RE.fullmatch(username):
        raise ApiError(400, "username must be 1-64 letters, digits, _, . or -")
    if not password:
        raise ApiError(400, "password must not be empty")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError(409, "username already taken")
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utc_now()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = require_string(data, "username").strip()
    password = require_string(data, "password")
    db = get_db()
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utc_now()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer ") :].strip()
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"})


@app.post("/api/render")
def render_preview():
    data = json_body()
    body = data.get("body", "")
    if not isinstance(body, str):
        raise ApiError(400, "body must be a string")
    return html_response(render_markdown(body))


@app.get("/api/notes")
def list_notes():
    user = require_user()
    rows = get_db().execute(
        """SELECT n.id, n.title, n.published, n.updated_at
           FROM notes n WHERE n.user_id = ?
           ORDER BY n.updated_at DESC, n.id DESC""",
        (user["id"],),
    ).fetchall()
    return jsonify(
        {
            "items": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "published": bool(row["published"]),
                    "updated_at": row["updated_at"],
                }
                for row in rows
            ]
        }
    )


def note_fields_for_create(data: dict) -> tuple:
    title = data.get("title", "")
    body = data.get("body", "")
    published = data.get("published", False)
    if not isinstance(title, str):
        raise ApiError(400, "title must be a string")
    if not isinstance(body, str):
        raise ApiError(400, "body must be a string")
    if not isinstance(published, bool):
        raise ApiError(400, "published must be a boolean")
    return title, body, published


@app.post("/api/notes")
def create_note():
    user = require_user()
    title, body, published = note_fields_for_create(json_body())
    db = get_db()
    now = utc_now()
    cursor = db.execute(
        """INSERT INTO notes (user_id, title, body, published, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (user["id"], title, body, int(published), now, now),
    )
    db.commit()
    return jsonify(note_dict(own_note(cursor.lastrowid, user["id"]))), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    user = require_user()
    return jsonify(note_dict(own_note(note_id, user["id"])))


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user = require_user()
    own_note(note_id, user["id"])
    data = json_body()
    allowed = {"title", "body", "published"}
    if not any(key in data for key in allowed):
        raise ApiError(400, "no updatable fields provided")
    updates = {}
    if "title" in data:
        if not isinstance(data["title"], str):
            raise ApiError(400, "title must be a string")
        updates["title"] = data["title"]
    if "body" in data:
        if not isinstance(data["body"], str):
            raise ApiError(400, "body must be a string")
        updates["body"] = data["body"]
    if "published" in data:
        if not isinstance(data["published"], bool):
            raise ApiError(400, "published must be a boolean")
        updates["published"] = int(data["published"])
    updates["updated_at"] = utc_now()
    assignments = ", ".join(f"{key} = ?" for key in updates)
    values = list(updates.values()) + [note_id, user["id"]]
    db = get_db()
    db.execute(f"UPDATE notes SET {assignments} WHERE id = ? AND user_id = ?", values)
    db.commit()
    return jsonify(note_dict(own_note(note_id, user["id"])))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user = require_user()
    own_note(note_id, user["id"])
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"]))
    db.commit()
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
def note_html(note_id: int):
    user = require_user()
    row = own_note(note_id, user["id"])
    return html_response(render_markdown(row["body"]))


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = get_db().execute(
        NOTE_QUERY + " WHERE n.id = ? AND n.published = 1", (note_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "note not found")
    return html_response(render_markdown(row["body"]))


@app.get("/api/public/notes/<int:note_id>")
def public_note(note_id: int):
    row = get_db().execute(
        """SELECT n.id, n.title, n.published, n.updated_at, u.username AS author
           FROM notes n JOIN users u ON u.id = n.user_id
           WHERE n.id = ? AND n.published = 1""",
        (note_id,),
    ).fetchone()
    if row is None:
        raise ApiError(404, "note not found")
    return jsonify(
        {
            "id": row["id"],
            "title": row["title"],
            "published": True,
            "updated_at": row["updated_at"],
            "author": row["author"],
        }
    )


@app.route("/api/<path:_path>", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
def api_fallback(_path):
    raise ApiError(404, "not found")


def serve_frontend(path: str = "index.html"):
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "not found")
    return serve_frontend(path)
