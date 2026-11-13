"""Markdown notes app — Flask backend."""

import hmac
import os
import secrets
import sqlite3
from pathlib import Path

import mistune
from flask import Flask, Response, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
APP_DIR = BASE_DIR.parent
DATA_DIR = Path(
    os.environ.get("DATA_DIR", "/app/data" if Path("/app").exists() else APP_DIR / "data")
)
DB_PATH = DATA_DIR / "notes.db"
DIST = APP_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
renderer = mistune.create_markdown(escape=False)

TOKEN_BYTES = 32


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                published INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        db.commit()
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hmac.new(salt.encode(), password.encode(), "sha256").hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(
        digest, hmac.new(salt.encode(), password.encode(), "sha256").hexdigest()
    )


def hash_token(token: str) -> str:
    return hmac.new(b"", token.encode(), "sha256").hexdigest()


def note_dict(row: sqlite3.Row, with_body: bool = True) -> dict:
    data = {
        "id": row["id"],
        "title": row["title"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["username"],
    }
    if with_body:
        data["body"] = row["body"]
    return data


def require_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        """
        SELECT u.id, u.username
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
        """,
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"]}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_urlsafe(TOKEN_BYTES)
    db.execute(
        "INSERT INTO tokens (token_hash, user_id) VALUES (?, ?)",
        (hash_token(token), row["id"]),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/notes")
def list_notes():
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    db = get_db()
    rows = db.execute(
        "SELECT * FROM notes WHERE author_id = ? ORDER BY updated_at DESC, id DESC",
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
    return jsonify({"items": items})


@app.post("/api/notes")
def create_note():
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    data = request.get_json(silent=True) or {}
    title = data.get("title")
    body = data.get("body")
    if title is None:
        title = ""
    if body is None:
        body = ""
    if not isinstance(title, str) or not isinstance(body, str):
        return jsonify({"error": "title and body must be strings"}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO notes (author_id, title, body) VALUES (?, ?, ?)",
        (user["id"], title, body),
    )
    db.commit()
    row = db.execute(
        """
        SELECT n.*, u.username
        FROM notes n JOIN users u ON u.id = n.author_id
        WHERE n.id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(note_dict(row)), 201


def _get_note(db, note_id: int, user_id: int | None):
    row = db.execute(
        """
        SELECT n.*, u.username
        FROM notes n JOIN users u ON u.id = n.author_id
        WHERE n.id = ?
        """,
        (note_id,),
    ).fetchone()
    if row is None:
        return None
    if user_id is None or row["author_id"] != user_id:
        return None
    return row


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    row = _get_note(get_db(), note_id, user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(note_dict(row))


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    db = get_db()
    row = _get_note(db, note_id, user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(silent=True) or {}
    fields = {}
    if "title" in data:
        if not isinstance(data["title"], str):
            return jsonify({"error": "title must be a string"}), 400
        fields["title"] = data["title"]
    if "body" in data:
        if not isinstance(data["body"], str):
            return jsonify({"error": "body must be a string"}), 400
        fields["body"] = data["body"]
    if "published" in data:
        if not isinstance(data["published"], bool):
            return jsonify({"error": "published must be a boolean"}), 400
        fields["published"] = 1 if data["published"] else 0
    if fields:
        assignments = ", ".join(f"{k} = ?" for k in fields)
        params = list(fields.values()) + [note_id]
        db.execute(
            f"UPDATE notes SET {assignments}, updated_at = datetime('now') WHERE id = ?",
            params,
        )
        db.commit()
    row = db.execute(
        """
        SELECT n.*, u.username
        FROM notes n JOIN users u ON u.id = n.author_id
        WHERE n.id = ?
        """,
        (note_id,),
    ).fetchone()
    return jsonify(note_dict(row))


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    db = get_db()
    row = _get_note(db, note_id, user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return "", 204


@app.get("/api/notes/<int:note_id>/html")
def note_html(note_id: int):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    row = _get_note(get_db(), note_id, user["id"])
    if row is None:
        return jsonify({"error": "not found"}), 404
    return _render_html(row)


@app.get("/api/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    db = get_db()
    row = db.execute(
        """
        SELECT n.*, u.username
        FROM notes n JOIN users u ON u.id = n.author_id
        WHERE n.id = ? AND n.published = 1
        """,
        (note_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    return _render_html(row)


@app.get("/api/public/notes/<int:note_id>")
def public_note_meta(note_id: int):
    db = get_db()
    row = db.execute(
        """
        SELECT n.id, n.title, n.updated_at, u.username
        FROM notes n JOIN users u ON u.id = n.author_id
        WHERE n.id = ? AND n.published = 1
        """,
        (note_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(
        {
            "id": row["id"],
            "title": row["title"],
            "updated_at": row["updated_at"],
            "author": row["username"],
        }
    )


def _render_html(row: sqlite3.Row):
    html = renderer(row["body"])
    return Response(html, mimetype="text/html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
