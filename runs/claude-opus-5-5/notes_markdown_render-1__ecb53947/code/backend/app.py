"""Flask entry point: Markdown notes API and frontend host."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

import nh3
from flask import Flask, Response, g, jsonify, request, send_from_directory
from markdown_it import MarkdownIt
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
MAX_USERNAME = 64
MAX_PASSWORD = 1024
MAX_TITLE = 200
MAX_BODY = 200_000

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
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS tokens_user ON tokens(user_id);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_user_updated ON notes(user_id, updated_at DESC, id DESC);
"""


# ---------------------------------------------------------------- database


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


# ---------------------------------------------------------------- markdown

_md = MarkdownIt("commonmark", {"html": False, "linkify": False, "typographer": False}).enable(
    ["table", "strikethrough"]
)

_ALLOWED_TAGS = {
    "a", "abbr", "b", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5",
    "h6", "hr", "i", "img", "li", "ol", "p", "pre", "s", "strong", "sub", "sup", "table",
    "tbody", "td", "th", "thead", "tr", "ul",
}
_ALLOWED_ATTRS = {
    "a": {"href", "title"},
    "img": {"src", "alt", "title"},
    "code": {"class"},
    "ol": {"start"},
    "td": {"style"},
    "th": {"style"},
}


def render_markdown(text: str) -> str:
    html = _md.render(text or "")
    return nh3.clean(
        html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes={"http", "https", "mailto"},
        link_rel="noopener noreferrer nofollow",
        filter_style_properties={"text-align"},
    )


def html_response(html: str) -> Response:
    resp = Response(html, status=200, mimetype="text/html")
    resp.headers["Content-Security-Policy"] = (
        "default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; sandbox"
    )
    resp.headers["Cache-Control"] = "no-store"
    return resp


# ---------------------------------------------------------------- helpers


def error(status: int, message: str):
    resp = jsonify({"error": message})
    resp.status_code = status
    if status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at, t.token_hash FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    if row["expires_at"] <= now_iso():
        db().execute("DELETE FROM tokens WHERE token_hash = ?", (row["token_hash"],))
        return None
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "authentication required")
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def note_json(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


NOTE_SELECT = (
    "SELECT n.id, n.title, n.body, n.published, n.updated_at, n.user_id, u.username AS author "
    "FROM notes n JOIN users u ON u.id = n.user_id"
)


def own_note(note_id: int):
    return db().execute(
        f"{NOTE_SELECT} WHERE n.id = ? AND n.user_id = ?", (note_id, g.user["id"])
    ).fetchone()


def public_note(note_id: int):
    return db().execute(
        f"{NOTE_SELECT} WHERE n.id = ? AND n.published = 1", (note_id,)
    ).fetchone()


def validate_note_fields(data: dict, partial: bool):
    """Return (fields, error_message)."""
    fields = {}
    if "title" in data:
        title = data["title"]
        if not isinstance(title, str):
            return None, "title must be a string"
        title = title.strip()
        if len(title) > MAX_TITLE:
            return None, f"title must be at most {MAX_TITLE} characters"
        fields["title"] = title
    elif not partial:
        fields["title"] = ""
    if "body" in data:
        body = data["body"]
        if not isinstance(body, str):
            return None, "body must be a string"
        if len(body) > MAX_BODY:
            return None, f"body must be at most {MAX_BODY} characters"
        fields["body"] = body
    elif not partial:
        fields["body"] = ""
    if "published" in data:
        published = data["published"]
        if not isinstance(published, bool):
            return None, "published must be a boolean"
        fields["published"] = 1 if published else 0
    elif not partial:
        fields["published"] = 0
    return fields, None


# ---------------------------------------------------------------- errors & headers


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    if isinstance(exc, HTTPException):
        return handle_http_error(exc)
    app.logger.exception("unhandled error")
    return error(500, "internal server error")


@app.after_request
def security_headers(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ---------------------------------------------------------------- routes: misc


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- routes: auth


def read_credentials():
    data = json_body()
    if data is None:
        return None, None, "expected a JSON object"
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None, "username and password are required"
    return username.strip(), password, None


@app.post("/api/auth/register")
def register():
    username, password, err = read_credentials()
    if err:
        return error(400, err)
    if not username or len(username) > MAX_USERNAME:
        return error(400, f"username must be 1-{MAX_USERNAME} characters")
    if any(not ch.isprintable() for ch in username):
        return error(400, "username contains invalid characters")
    if not password or len(password) > MAX_PASSWORD:
        return error(400, f"password must be 1-{MAX_PASSWORD} characters")
    try:
        cur = db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        return error(409, "username already taken")
    return {"id": cur.lastrowid, "username": username}, 201


_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))


@app.post("/api/auth/login")
def login():
    username, password, err = read_credentials()
    if err:
        return error(400, err)
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password)
        return error(401, "invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        return error(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db().execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            hash_token(token),
            row["id"],
            now_iso(),
            (now + TOKEN_TTL).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        ),
    )
    return {"token": token, "username": row["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (g.user["token_hash"],))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


# ---------------------------------------------------------------- routes: notes


@app.get("/api/notes")
@login_required
def list_notes():
    rows = db().execute(
        "SELECT id, title, published, updated_at FROM notes WHERE user_id = ? "
        "ORDER BY updated_at DESC, id DESC",
        (g.user["id"],),
    ).fetchall()
    return {
        "items": [
            {
                "id": r["id"],
                "title": r["title"],
                "published": bool(r["published"]),
                "updated_at": r["updated_at"],
            }
            for r in rows
        ]
    }


@app.post("/api/notes")
@login_required
def create_note():
    data = json_body()
    if data is None:
        return error(400, "expected a JSON object")
    fields, err = validate_note_fields(data, partial=False)
    if err:
        return error(400, err)
    ts = now_iso()
    cur = db().execute(
        "INSERT INTO notes (user_id, title, body, published, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (g.user["id"], fields["title"], fields["body"], fields["published"], ts, ts),
    )
    return note_json(own_note(cur.lastrowid)), 201


@app.get("/api/notes/<int:note_id>")
@login_required
def get_note(note_id: int):
    row = own_note(note_id)
    if row is None:
        return error(404, "note not found")
    return note_json(row)


@app.patch("/api/notes/<int:note_id>")
@login_required
def update_note(note_id: int):
    data = json_body()
    if data is None:
        return error(400, "expected a JSON object")
    if own_note(note_id) is None:
        return error(404, "note not found")
    fields, err = validate_note_fields(data, partial=True)
    if err:
        return error(400, err)
    if fields:
        fields["updated_at"] = now_iso()
        assignments = ", ".join(f"{k} = ?" for k in fields)
        db().execute(
            f"UPDATE notes SET {assignments} WHERE id = ? AND user_id = ?",
            (*fields.values(), note_id, g.user["id"]),
        )
    return note_json(own_note(note_id))


@app.delete("/api/notes/<int:note_id>")
@login_required
def delete_note(note_id: int):
    cur = db().execute(
        "DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, g.user["id"])
    )
    if cur.rowcount == 0:
        return error(404, "note not found")
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
@login_required
def note_html(note_id: int):
    row = own_note(note_id)
    if row is None:
        return error(404, "note not found")
    return html_response(render_markdown(row["body"]))


# ---------------------------------------------------------------- routes: public


@app.get("/api/public/notes/<int:note_id>")
def public_note_json(note_id: int):
    row = public_note(note_id)
    if row is None:
        return error(404, "note not found")
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "updated_at": row["updated_at"],
        "html": render_markdown(row["body"]),
    }


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = public_note(note_id)
    if row is None:
        return error(404, "note not found")
    return html_response(render_markdown(row["body"]))


# ---------------------------------------------------------------- frontend


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    return error(404, "not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


init_db()
