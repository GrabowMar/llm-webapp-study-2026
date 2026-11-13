"""Tagged notes: Flask JSON API plus the built React frontend."""

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notes.db"

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def get_db():
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


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        PRAGMA journal_mode = WAL;
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
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (note_id, tag_id)
        );
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag_id);
        """
    )
    db.commit()
    db.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def later_iso(previous):
    """A timestamp strictly greater than the previous one."""
    stamp = now_iso()
    if previous and stamp <= previous:
        try:
            base = datetime.strptime(previous, "%Y-%m-%dT%H:%M:%S.%fZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            return stamp
        stamp = (base + timedelta(microseconds=1)).strftime(
            "%Y-%m-%dT%H:%M:%S.%fZ"
        )
    return stamp


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
    ).hex()
    return f"{salt}${digest}"


def verify_password(password, stored):
    try:
        salt, _ = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


# ---------------------------------------------------------------------------
# Request helpers
# ---------------------------------------------------------------------------


def error(message, status=400, field=None):
    body = {"error": message}
    if field:
        body["errors"] = {field: message}
    return jsonify(body), status


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def current_auth():
    """Return (user_row, token) or (None, None)."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None, None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None, None
    db = get_db()
    row = db.execute(
        """
        SELECT u.id, u.username FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    if row is None:
        return None, None
    return row, token


def require_user():
    user, _ = current_auth()
    return user


def note_tags(note_id):
    rows = get_db().execute(
        """
        SELECT t.name FROM tags t
        JOIN note_tags nt ON nt.tag_id = t.id
        WHERE nt.note_id = ?
        ORDER BY t.name COLLATE NOCASE
        """,
        (note_id,),
    ).fetchall()
    return [r["name"] for r in rows]


def serialize_note(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": note_tags(row["id"]),
        "pinned": bool(row["pinned"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["author"],
    }


def note_by_id(db, note_id):
    return db.execute(
        """
        SELECT n.*, u.username AS author FROM notes n
        JOIN users u ON u.id = n.author_id
        WHERE n.id = ?
        """,
        (note_id,),
    ).fetchone()


def normalize_tags(raw):
    """Validate and normalize a tag list. Returns (tags, error_message)."""
    if raw is None:
        return [], None
    if not isinstance(raw, list):
        return None, "Tags must be a list of strings."
    result = []
    seen = set()
    for item in raw:
        if not isinstance(item, str):
            return None, "Tags must be a list of strings."
        tag = item.strip()
        if not tag:
            continue
        if len(tag) > 50:
            return None, "Tags must be at most 50 characters long."
        key = tag.lower()
        if key not in seen:
            seen.add(key)
            result.append(tag)
    if len(result) > 20:
        return None, "A note may have at most 20 tags."
    return result, None


def set_tags(db, note_id, tags):
    db.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    for tag in tags:
        db.execute("INSERT OR IGNORE INTO tags(name) VALUES (?)", (tag,))
        tag_id = db.execute("SELECT id FROM tags WHERE name = ?", (tag,)).fetchone()[
            "id"
        ]
        db.execute(
            "INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES (?, ?)",
            (note_id, tag_id),
        )


def validate_note_fields(data, partial):
    """Return (fields, error_response) for create/patch payloads."""
    fields = {}

    if not partial or "title" in data:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            return None, error("Title is required.", 400, "title")
        title = title.strip()
        if len(title) > 200:
            return None, error("Title must be at most 200 characters.", 400, "title")
        fields["title"] = title

    if not partial or "content" in data:
        content = data.get("content")
        if not isinstance(content, str):
            return None, error("Content is required.", 400, "content")
        if len(content) > 100_000:
            return None, error("Content is too long.", 400, "content")
        fields["content"] = content

    if "tags" in data or not partial:
        tags, message = normalize_tags(data.get("tags"))
        if message:
            return None, error(message, 400, "tags")
        fields["tags"] = tags

    if "pinned" in data:
        pinned = data.get("pinned")
        if not isinstance(pinned, bool):
            return None, error("Pinned must be a boolean.", 400, "pinned")
        fields["pinned"] = pinned
    elif not partial:
        fields["pinned"] = False

    return fields, None


# ---------------------------------------------------------------------------
# Auth API
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("A JSON object is required.")

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required.", 400, "username")
    username = username.strip()
    if len(username) > 80:
        return error("Username must be at most 80 characters.", 400, "username")
    if not isinstance(password, str) or not password:
        return error("Password is required.", 400, "password")
    if len(password) > 500:
        return error("Password is too long.", 400, "password")

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("That username is already taken.", 409, "username")

    created = now_iso()
    cur = db.execute(
        "INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), created),
    )
    user_id = cur.lastrowid
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens(token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, created),
    )
    db.commit()
    return jsonify({"token": token, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("A JSON object is required.")

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.")

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not verify_password(password, user["password_hash"]):
        return error("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens(token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": user["username"]})


# ---------------------------------------------------------------------------
# Notes API
# ---------------------------------------------------------------------------


@app.get("/api/notes")
def list_notes():
    db = get_db()
    tag = request.args.get("tag", "").strip()
    author = request.args.get("author", "").strip()
    q = request.args.get("q", "").strip()

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        return error("page and page_size must be integers.")
    if page < 1:
        return error("page must be at least 1.")
    if page_size < 1 or page_size > 100:
        return error("page_size must be between 1 and 100.")

    where = []
    params = []
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id "
            "WHERE nt.note_id = n.id AND lower(t.name) = lower(?))"
        )
        params.append(tag)
    if author:
        where.append("lower(u.username) = lower(?)")
        params.append(author)
    if q:
        where.append("(n.title LIKE ? OR n.content LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    base = (
        "FROM notes n JOIN users u ON u.id = n.author_id" + clause
    )
    total = db.execute("SELECT COUNT(*) AS c " + base, params).fetchone()["c"]
    rows = db.execute(
        "SELECT n.*, u.username AS author "
        + base
        + " ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC "
        + " LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_note(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/notes")
def create_note():
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)

    data = json_body()
    if data is None:
        return error("A JSON object is required.")
    fields, err = validate_note_fields(data, partial=False)
    if err is not None:
        return err

    db = get_db()
    now = now_iso()
    cur = db.execute(
        "INSERT INTO notes(title, content, pinned, author_id, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            fields["content"],
            1 if fields["pinned"] else 0,
            user["id"],
            now,
            now,
        ),
    )
    note_id = cur.lastrowid
    set_tags(db, note_id, fields["tags"])
    db.commit()

    return jsonify(serialize_note(note_by_id(db, note_id))), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id):
    row = note_by_id(get_db(), note_id)
    if row is None:
        return error("Note not found.", 404)
    return jsonify(serialize_note(row))


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id):
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)

    db = get_db()
    row = note_by_id(db, note_id)
    if row is None:
        return error("Note not found.", 404)
    if row["author_id"] != user["id"]:
        return error("Only the author may edit this note.", 403)

    data = json_body()
    if data is None:
        return error("A JSON object is required.")
    fields, err = validate_note_fields(data, partial=True)
    if err is not None:
        return err

    assignments = []
    params = []
    for field in ("title", "content", "pinned"):
        if field in fields:
            value = fields[field]
            if field == "pinned":
                value = 1 if value else 0
            assignments.append(f"{field} = ?")
            params.append(value)
    assignments.append("updated_at = ?")
    params.append(later_iso(row["updated_at"]))
    params.append(note_id)
    db.execute("UPDATE notes SET " + ", ".join(assignments) + " WHERE id = ?", params)

    if "tags" in fields:
        set_tags(db, note_id, fields["tags"])
    db.commit()

    return jsonify(serialize_note(note_by_id(db, note_id)))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id):
    user = require_user()
    if user is None:
        return error("Authentication required.", 401)

    db = get_db()
    row = note_by_id(db, note_id)
    if row is None:
        return error("Note not found.", 404)
    if row["author_id"] != user["id"]:
        return error("Only the author may delete this note.", 403)

    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)"
    )
    db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Tags API
# ---------------------------------------------------------------------------


@app.get("/api/tags")
def list_tags():
    rows = get_db().execute(
        """
        SELECT t.name AS tag, COUNT(nt.note_id) AS count
        FROM tags t
        JOIN note_tags nt ON nt.tag_id = t.id
        GROUP BY t.id, t.name
        ORDER BY count DESC, t.name COLLATE NOCASE ASC
        """
    ).fetchall()
    return jsonify({"items": [{"tag": r["tag"], "count": r["count"]} for r in rows]})


# ---------------------------------------------------------------------------
# Health and frontend
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found.", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        if Path(path).suffix:
            return error("Not found.", 404)
        return send_from_directory(DIST, "index.html")
    return "Frontend build not found. Run `npm run build` in frontend/.", 503


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
