"""Flask entry point for the tagged-notes app."""

import hashlib
import hmac
import json
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "notes.db"
SECRET_PATH = DATA_DIR / "secret_key"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")
TAG_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$")
MAX_TITLE = 200
MAX_CONTENT = 20_000
MAX_TAGS = 20

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def db() -> sqlite3.Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g._db = conn
    return conn


@app.teardown_appcontext
def close_db(exc):
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            salt TEXT NOT NULL,
            hash TEXT NOT NULL,
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
            author_name TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS note_tags (
            note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
            tag TEXT NOT NULL,
            PRIMARY KEY (note_id, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_note_tags_tag ON note_tags(tag);
        CREATE INDEX IF NOT EXISTS idx_notes_author ON notes(author_id);
        """
    )
    conn.commit()
    conn.close()


def read_secret() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        secret = SECRET_PATH.read_text().strip()
        if secret:
            return secret
        secret = secrets.token_hex(32)
        try:
            with open(SECRET_PATH, "x") as f:
                f.write(secret)
        except FileExistsError:
            existing = SECRET_PATH.read_text().strip()
            if existing:
                return existing
            SECRET_PATH.write_text(secret)
        return secret
    except FileNotFoundError:
        secret = secrets.token_hex(32)
        try:
            with open(SECRET_PATH, "x") as f:
                f.write(secret)
        except FileExistsError:
            secret = SECRET_PATH.read_text().strip() or secret
        return secret


def hash_password(password: str, salt: str, secret: str) -> str:
    dk = hmac.new(
        (secret + salt).encode(), password.encode(), hashlib.sha256
    ).digest()
    return dk.hex()


def respond(errors: dict, status: int = 422):
    return jsonify({"errors": errors}), status


# ---------------------------------------------------------------- auth helpers


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_auth():
    user = current_user()
    if user is None:
        return None, (jsonify({"error": "authentication required"}), 401)
    return user, None


# ------------------------------------------------------------------- API routes


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    errors = {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not USERNAME_RE.match(username):
        errors["username"] = "3-64 characters, letters, digits, _ . - only"
    if len(password) < 8:
        errors["password"] = "must be at least 8 characters"
    if errors:
        return respond(errors)
    conn = db()
    existing = conn.execute(
        "SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing:
        return respond({"username": "already taken"})
    secret = read_secret()
    salt = secrets.token_hex(16)
    conn.execute(
        "INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)",
        (username, salt, hash_password(password, salt, secret), utcnow()),
    )
    conn.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    row = db().execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if not row or not hmac.compare_digest(
        row["hash"], hash_password(password, row["salt"], read_secret())
    ):
        return jsonify({"error": "invalid username or password"}), 401
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer ") :].strip()
        conn = db()
        conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
        conn.commit()
    return "", 204


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return jsonify({"error": "authentication required"}), 401
    return jsonify({"username": user["username"]}), 200


def note_rows_to_json(rows, tags_by_note):
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "title": r["title"],
                "content": r["content"],
                "tags": tags_by_note.get(r["id"], []),
                "pinned": bool(r["pinned"]),
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "author": r["author_name"],
            }
        )
    return out


def load_tags(note_ids):
    tags_by_note = {}
    if not note_ids:
        return tags_by_note
    marks = ",".join("?" * len(note_ids))
    for row in db().execute(
        f"SELECT note_id, tag FROM note_tags WHERE note_id IN ({marks}) ORDER BY tag",
        note_ids,
    ):
        tags_by_note.setdefault(row["note_id"], []).append(row["tag"])
    return tags_by_note


@app.get("/api/notes")
def list_notes():
    tag = (request.args.get("tag") or "").strip().lower()
    author = (request.args.get("author") or "").strip().lower()
    q = (request.args.get("q") or "").strip()
    try:
        page = max(int(request.args.get("page", 1)), 1)
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except ValueError:
        page_size = 10
    page_size = min(max(page_size, 1), 100)

    where, params = [], []
    if tag:
        where.append(
            "EXISTS (SELECT 1 FROM note_tags nt WHERE nt.note_id = n.id AND nt.tag = ?)"
        )
        params.append(tag)
    if author:
        where.append("LOWER(n.author_name) = ?")
        params.append(author)
    if q:
        where.append("(LOWER(n.title) LIKE ? OR LOWER(n.content) LIKE ?)")
        like = f"%{q.lower()}%"
        params.extend([like, like])
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""

    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM notes n {where_sql}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT n.* FROM notes n {where_sql}"
        " ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC"
        " LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = note_rows_to_json(rows, load_tags([r["id"] for r in rows]))
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


def validate_note(data: dict, partial: bool):
    errors = {}
    fields = {}
    title = data.get("title")
    if title is not None or not partial:
        title = (title or "").strip()
        if not title:
            errors["title"] = "is required"
        elif len(title) > MAX_TITLE:
            errors["title"] = f"must be at most {MAX_TITLE} characters"
        else:
            fields["title"] = title
    content = data.get("content")
    if content is not None or not partial:
        content = content if isinstance(content, str) else ""
        if not content.strip():
            errors["content"] = "is required"
        elif len(content) > MAX_CONTENT:
            errors["content"] = f"must be at most {MAX_CONTENT} characters"
        else:
            fields["content"] = content
    tags = data.get("tags")
    if tags is not None or not partial:
        if tags is None:
            tags = []
        if not isinstance(tags, list):
            errors["tags"] = "must be a list of strings"
        else:
            cleaned, seen = [], set()
            for t in tags:
                t = (t or "").strip().lower() if isinstance(t, str) else ""
                if not t:
                    continue
                if not TAG_RE.match(t):
                    errors.setdefault("tags", []).append(
                        f"'{t}' must be 1-32 characters: letters, digits, space, _ or -"
                    )
                    continue
                if t not in seen:
                    seen.add(t)
                    cleaned.append(t)
            if len(cleaned) > MAX_TAGS:
                errors["tags"] = f"at most {MAX_TAGS} tags allowed"
            if not errors.get("tags"):
                fields["tags"] = cleaned
    pinned = data.get("pinned")
    if pinned is not None:
        fields["pinned"] = bool(pinned)
    return errors, fields


@app.post("/api/notes")
def create_note():
    user, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    errors, fields = validate_note(data, partial=False)
    if errors:
        return respond(errors)
    now = utcnow()
    conn = db()
    cur = conn.execute(
        "INSERT INTO notes (title, content, pinned, author_id, author_name, created_at, updated_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (fields["title"], fields["content"], int(fields.get("pinned", False)),
         user["id"], user["username"], now, now),
    )
    note_id = cur.lastrowid
    for tag in fields.get("tags", []):
        conn.execute("INSERT INTO note_tags (note_id, tag) VALUES (?, ?)", (note_id, tag))
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return jsonify(note_rows_to_json([row], load_tags([note_id]))[0]), 201


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    row = db().execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(note_rows_to_json([row], load_tags([note_id]))[0])


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user, err = require_auth()
    if err:
        return err
    conn = db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    if row["author_id"] != user["id"]:
        return jsonify({"error": "forbidden"}), 403
    data = request.get_json(silent=True) or {}
    errors, fields = validate_note(data, partial=True)
    if errors:
        return respond(errors)
    if not fields:
        return jsonify({"error": "no fields to update"}), 400
    sets, params = [], []
    for col in ("title", "content"):
        if col in fields:
            sets.append(f"{col} = ?")
            params.append(fields[col])
    if "pinned" in fields:
        sets.append("pinned = ?")
        params.append(int(fields["pinned"]))
    sets.append("updated_at = ?")
    params.append(utcnow())
    conn.execute(f"UPDATE notes SET {', '.join(sets)} WHERE id = ?", [*params, note_id])
    if "tags" in fields:
        conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
        for tag in fields["tags"]:
            conn.execute("INSERT INTO note_tags (note_id, tag) VALUES (?, ?)", (note_id, tag))
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    return jsonify(note_rows_to_json([row], load_tags([note_id]))[0])


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user, err = require_auth()
    if err:
        return err
    conn = db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    if row["author_id"] != user["id"]:
        return jsonify({"error": "forbidden"}), 403
    conn.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    conn.commit()
    return "", 204


@app.get("/api/tags")
def list_tags():
    rows = db().execute(
        "SELECT tag, COUNT(*) AS count FROM note_tags GROUP BY tag"
        " ORDER BY count DESC, tag ASC"
    ).fetchall()
    return jsonify({"items": [{"tag": r["tag"], "count": r["count"]} for r in rows]})


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ------------------------------------------------------------- frontend serving


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    target = (DIST / path).resolve()
    if path and target.is_file() and str(target).startswith(str(DIST.resolve())):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
