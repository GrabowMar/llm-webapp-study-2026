"""Tagged notes API."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "notes.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
MAX_TITLE = 200
MAX_CONTENT = 100_000
MAX_TAG = 50
MAX_TAGS = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def timestamp(moment: datetime | None = None) -> str:
    moment = moment or datetime.now(timezone.utc)
    return moment.isoformat(timespec="microseconds").replace("+00:00", "Z")


def next_timestamp(previous: str) -> str:
    moment = datetime.now(timezone.utc)
    try:
        before = datetime.fromisoformat(previous.replace("Z", "+00:00"))
        if moment <= before:
            moment = before + timedelta(microseconds=1)
    except (ValueError, AttributeError):
        pass
    return timestamp(moment)


def db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_error):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(
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
                title TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                PRIMARY KEY (note_id, tag)
            );
            CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
            """
        )
        connection.commit()
    finally:
        connection.close()


with app.app_context():
    init_db()


def fail(message: str, status: int, fields: dict | None = None):
    payload = {"error": message}
    if fields:
        payload["errors"] = fields
    return jsonify(payload), status


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    token = header.strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    if not token:
        return None
    return db().execute(
        """SELECT u.id, u.username FROM tokens t
           JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
        (token,),
    ).fetchone()


def require_user():
    user = current_user()
    if user is None:
        return None, fail("Authentication required.", 401)
    return user, None


def text_field(data: dict, name: str, *, required: bool, max_length: int,
               allow_empty: bool, errors: dict) -> str | None:
    if name not in data:
        if required:
            errors[name] = f"{name.capitalize()} is required."
        return None
    value = data[name]
    if not isinstance(value, str):
        errors[name] = f"{name.capitalize()} must be a string."
        return None
    if not allow_empty and not value.strip():
        errors[name] = f"{name.capitalize()} must not be empty."
        return None
    if len(value) > max_length:
        errors[name] = f"{name.capitalize()} must be at most {max_length} characters."
        return None
    return value


def tags_field(value, errors: dict) -> list[str] | None:
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        errors["tags"] = "Tags must be a list of strings."
        return None
    result: list[str] = []
    for item in value:
        if not isinstance(item, str):
            errors["tags"] = "Each tag must be a string."
            return None
        tag = " ".join(item.split())
        if not tag:
            continue
        if len(tag) > MAX_TAG:
            errors["tags"] = f"Each tag must be at most {MAX_TAG} characters."
            return None
        if tag not in result:
            result.append(tag)
    if len(result) > MAX_TAGS:
        errors["tags"] = f"A note can have at most {MAX_TAGS} tags."
        return None
    return result


def pinned_field(value, errors: dict) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    errors["pinned"] = "Pinned must be a boolean."
    return None


def note_dict(connection: sqlite3.Connection, row: sqlite3.Row) -> dict:
    tags = [
        item["tag"]
        for item in connection.execute(
            "SELECT tag FROM note_tags WHERE note_id = ? ORDER BY rowid", (row["id"],)
        )
    ]
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


NOTE_SELECT = """
    SELECT n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at,
           u.username AS author
    FROM notes n JOIN users u ON u.id = n.author_id
"""


def find_note(connection: sqlite3.Connection, note_id: int) -> sqlite3.Row | None:
    return connection.execute(NOTE_SELECT + " WHERE n.id = ?", (note_id,)).fetchone()


def replace_tags(connection: sqlite3.Connection, note_id: int, tags: list[str]) -> None:
    connection.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    connection.executemany(
        "INSERT INTO note_tags (note_id, tag) VALUES (?, ?)",
        [(note_id, tag) for tag in tags],
    )


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options(_path):
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    errors: dict = {}
    username = text_field(data, "username", required=True, max_length=32,
                          allow_empty=False, errors=errors)
    password = text_field(data, "password", required=True, max_length=200,
                          allow_empty=False, errors=errors)
    if username is not None:
        if len(username.strip()) < 3 or not USERNAME_RE.fullmatch(username.strip()):
            errors["username"] = (
                "Username must be 3-32 characters and contain only letters, "
                "digits, '.', '_' or '-'."
            )
        else:
            username = username.strip()
    if errors:
        return fail("Please correct the highlighted fields.", 400, errors)
    connection = db()
    if connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone():
        return fail("That username is already taken.", 409, {"username": "That username is already taken."})
    cursor = connection.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), timestamp()),
    )
    connection.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return fail("Username and password are required.", 400)
    user = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return fail("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], timestamp()),
    )
    db().commit()
    return jsonify({"token": token})


def positive_int(name: str, default: int, maximum: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, fail(f"{name} must be an integer.", 400)
    if value < 1:
        return None, fail(f"{name} must be a positive integer.", 400)
    return min(value, maximum), None


@app.get("/api/notes")
def list_notes():
    page, error = positive_int("page", 1, 1_000_000)
    if error:
        return error
    page_size, error = positive_int("page_size", 10, MAX_PAGE_SIZE)
    if error:
        return error
    q = request.args.get("q", "").strip()
    author = request.args.get("author", "").strip()
    tag = request.args.get("tag", "").strip()

    conditions = ["1 = 1"]
    params: dict = {}
    if q:
        escaped = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        conditions.append(
            "(lower(n.title) LIKE :q ESCAPE '\\' OR lower(n.content) LIKE :q ESCAPE '\\')"
        )
        params["q"] = f"%{escaped}%"
    if author:
        conditions.append("u.username = :author COLLATE NOCASE")
        params["author"] = author
    if tag:
        conditions.append(
            "EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id "
            "AND t.tag = :tag COLLATE NOCASE)"
        )
        params["tag"] = tag
    where = " WHERE " + " AND ".join(conditions)

    connection = db()
    total = connection.execute(
        "SELECT COUNT(*) AS n FROM notes n JOIN users u ON u.id = n.author_id" + where,
        params,
    ).fetchone()["n"]
    rows = connection.execute(
        NOTE_SELECT + where
        + " ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC LIMIT :limit OFFSET :offset",
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    ).fetchall()
    return jsonify({
        "items": [note_dict(connection, row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/notes")
def create_note():
    user, error = require_user()
    if error:
        return error
    data = body()
    errors: dict = {}
    title = text_field(data, "title", required=True, max_length=MAX_TITLE,
                       allow_empty=False, errors=errors)
    content = text_field(data, "content", required=False, max_length=MAX_CONTENT,
                         allow_empty=True, errors=errors)
    if content is None and "content" not in errors:
        content = ""
    tags = tags_field(data.get("tags"), errors)
    pinned = pinned_field(data.get("pinned"), errors)
    if errors:
        return fail("Please correct the highlighted fields.", 400, errors)

    connection = db()
    moment = timestamp()
    cursor = connection.execute(
        """INSERT INTO notes (title, content, pinned, created_at, updated_at, author_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (title.strip(), content, int(pinned), moment, moment, user["id"]),
    )
    replace_tags(connection, cursor.lastrowid, tags)
    connection.commit()
    row = find_note(connection, cursor.lastrowid)
    return jsonify(note_dict(connection, row)), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    connection = db()
    row = find_note(connection, note_id)
    if row is None:
        return fail("Note not found.", 404)
    return jsonify(note_dict(connection, row))


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user, error = require_user()
    if error:
        return error
    connection = db()
    row = find_note(connection, note_id)
    if row is None:
        return fail("Note not found.", 404)
    if row["author"] != user["username"]:
        return fail("Only the author may edit this note.", 403)

    data = body()
    errors: dict = {}
    updates: dict = {}
    if "title" in data:
        value = text_field(data, "title", required=True, max_length=MAX_TITLE,
                           allow_empty=False, errors=errors)
        if value is not None:
            updates["title"] = value.strip()
    if "content" in data:
        value = text_field(data, "content", required=True, max_length=MAX_CONTENT,
                           allow_empty=True, errors=errors)
        if value is not None:
            updates["content"] = value
    if "pinned" in data:
        value = pinned_field(data["pinned"], errors)
        if value is not None:
            updates["pinned"] = int(value)
    new_tags = None
    if "tags" in data:
        new_tags = tags_field(data["tags"], errors)
    if errors:
        return fail("Please correct the highlighted fields.", 400, errors)

    updates["updated_at"] = next_timestamp(row["updated_at"])
    assignments = ", ".join(f"{column} = :{column}" for column in updates)
    connection.execute(
        f"UPDATE notes SET {assignments} WHERE id = :note_id",
        {**updates, "note_id": note_id},
    )
    if new_tags is not None:
        replace_tags(connection, note_id, new_tags)
    connection.commit()
    return jsonify(note_dict(connection, find_note(connection, note_id)))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user, error = require_user()
    if error:
        return error
    connection = db()
    row = find_note(connection, note_id)
    if row is None:
        return fail("Note not found.", 404)
    if row["author"] != user["username"]:
        return fail("Only the author may delete this note.", 403)
    connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    connection.commit()
    return "", 204


@app.get("/api/tags")
def list_tags():
    rows = db().execute(
        """SELECT tag, COUNT(DISTINCT note_id) AS count FROM note_tags
           GROUP BY tag ORDER BY count DESC, tag COLLATE NOCASE ASC"""
    ).fetchall()
    return jsonify({"items": [{"tag": row["tag"], "count": row["count"]} for row in rows]})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return fail("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return fail("Frontend build not found.", 404)
