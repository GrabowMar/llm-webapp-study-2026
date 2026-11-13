"""Markdown notes: Flask API and static frontend."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from markdown_it import MarkdownIt
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notes.db"

MAX_USERNAME = 64
MAX_PASSWORD = 256
MAX_TITLE = 300
MAX_BODY = 1_000_000
TOKEN_TTL = timedelta(days=30)

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

md = MarkdownIt("commonmark", {"html": False, "breaks": False}).enable(
    ["table", "strikethrough"]
)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_user_updated ON notes (user_id, updated_at DESC);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify(error=err.message), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return jsonify(error=err.name), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("unhandled error", exc_info=err)
    return jsonify(error="Internal Server Error"), 500


@app.after_request
def security_headers(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
        if resp.mimetype == "text/html":
            resp.headers.setdefault(
                "Content-Security-Policy", "default-src 'none'; img-src * data:; style-src 'unsafe-inline'"
            )
    return resp


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Authentication required")
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= iso(now()):
        raise ApiError(401, "Authentication required")
    return row


DUMMY_HASH = generate_password_hash("dummy-password")


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    if not username or len(username) > MAX_USERNAME:
        raise ApiError(400, f"username must be 1-{MAX_USERNAME} characters")
    if not password or len(password) > MAX_PASSWORD:
        raise ApiError(400, f"password must be 1-{MAX_PASSWORD} characters")
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify(username=username), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    conn = db()
    user = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    stored = user["password_hash"] if user else DUMMY_HASH
    ok = check_password_hash(stored, password)
    if user is None or not ok:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (iso(now()),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user["id"], iso(now() + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify(token=token)


NOTE_SELECT = (
    "SELECT n.id, n.title, n.body, n.published, n.updated_at, n.user_id, u.username AS author "
    "FROM notes n JOIN users u ON u.id = n.user_id "
)


def note_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


def parse_id(raw: str) -> int:
    if not raw.isascii() or not raw.isdigit() or len(raw) > 18:
        raise ApiError(404, "Note not found")
    return int(raw)


def own_note(note_id: str) -> sqlite3.Row:
    user = current_user()
    row = db().execute(
        NOTE_SELECT + "WHERE n.id = ? AND n.user_id = ?", (parse_id(note_id), user["id"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Note not found")
    return row


def render(markdown: str) -> Response:
    return Response(md.render(markdown), mimetype="text/html")


def validate_text(data: dict, key: str, limit: int):
    value = data[key]
    if not isinstance(value, str):
        raise ApiError(400, f"{key} must be a string")
    if len(value) > limit:
        raise ApiError(400, f"{key} must be at most {limit} characters")
    return value


@app.get("/api/notes")
def list_notes():
    user = current_user()
    rows = db().execute(
        "SELECT id, title, published, updated_at FROM notes WHERE user_id = ? "
        "ORDER BY updated_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "published": bool(r["published"]),
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]
    return jsonify(items=items)


@app.post("/api/notes")
def create_note():
    user = current_user()
    data = json_body()
    title = validate_text(data, "title", MAX_TITLE) if "title" in data else ""
    body = validate_text(data, "body", MAX_BODY) if "body" in data else ""
    published = data.get("published", False)
    if not isinstance(published, bool):
        raise ApiError(400, "published must be a boolean")
    conn = db()
    cur = conn.execute(
        "INSERT INTO notes (user_id, title, body, published, updated_at) VALUES (?, ?, ?, ?, ?)",
        (user["id"], title, body, int(published), iso(now())),
    )
    conn.commit()
    row = conn.execute(NOTE_SELECT + "WHERE n.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(note_json(row)), 201


@app.get("/api/notes/<note_id>")
def get_note(note_id: str):
    return jsonify(note_json(own_note(note_id)))


@app.patch("/api/notes/<note_id>")
def update_note(note_id: str):
    row = own_note(note_id)
    data = json_body()
    fields = {}
    if "title" in data:
        fields["title"] = validate_text(data, "title", MAX_TITLE)
    if "body" in data:
        fields["body"] = validate_text(data, "body", MAX_BODY)
    if "published" in data:
        if not isinstance(data["published"], bool):
            raise ApiError(400, "published must be a boolean")
        fields["published"] = int(data["published"])
    conn = db()
    if fields:
        fields["updated_at"] = iso(now())
        assignments = ", ".join(f"{k} = ?" for k in fields)
        conn.execute(
            f"UPDATE notes SET {assignments} WHERE id = ?", (*fields.values(), row["id"])
        )
        conn.commit()
    updated = conn.execute(NOTE_SELECT + "WHERE n.id = ?", (row["id"],)).fetchone()
    return jsonify(note_json(updated))


@app.delete("/api/notes/<note_id>")
def delete_note(note_id: str):
    row = own_note(note_id)
    conn = db()
    conn.execute("DELETE FROM notes WHERE id = ?", (row["id"],))
    conn.commit()
    return "", 204


@app.get("/api/notes/<note_id>/html")
def note_html(note_id: str):
    return render(own_note(note_id)["body"])


def published_note(note_id: str) -> sqlite3.Row:
    row = db().execute(
        NOTE_SELECT + "WHERE n.id = ? AND n.published = 1", (parse_id(note_id),)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Note not found")
    return row


@app.get("/api/public/notes/<note_id>")
def public_note(note_id: str):
    row = published_note(note_id)
    return jsonify(
        id=row["id"],
        title=row["title"],
        author=row["author"],
        updated_at=row["updated_at"],
        html=md.render(row["body"]),
    )


@app.get("/api/public/notes/<note_id>/html")
def public_note_html(note_id: str):
    return render(published_note(note_id)["body"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>")
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    try:
        return send_from_directory(DIST, path)
    except HTTPException:
        return send_from_directory(DIST, "index.html")
