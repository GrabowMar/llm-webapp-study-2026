"""Flask entry point for the multi-author blog."""

import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "blog.db"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder=None)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
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
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            taken_down INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (author_id) REFERENCES users (id)
        );
        """
    )
    conn.execute(
        "INSERT OR IGNORE INTO users (username, password_hash, is_admin, created_at) "
        "VALUES ('admin', NULL, 1, ?)",
        (now_iso(),),
    )
    if ADMIN_PASSWORD:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = 'admin'",
            (generate_password_hash(ADMIN_PASSWORD),),
        )
    else:
        conn.execute(
            "UPDATE users SET password_hash = NULL WHERE username = 'admin'",
        )
    conn.commit()
    conn.close()


def make_excerpt(content: str) -> str:
    text = re.sub(r"\r\n|\r|\n", " ", content)
    return text[:200]


def post_to_dict(row) -> dict:
    tags = []
    if row["tags"]:
        try:
            tags = json.loads(row["tags"])
        except (json.JSONDecodeError, TypeError):
            tags = []
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "tags": tags,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "author": row["username"],
        "excerpt": make_excerpt(row["content"]),
        "taken_down": bool(row["taken_down"]),
    }


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT u.id, u.username, u.is_admin FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def require_user():
    user = current_user()
    if user is None:
        return None
    return user


def error(message, status):
    return jsonify({"error": message}), status


def body_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_json()
    if data is None:
        return error("Invalid JSON body", 400)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username:
        return error("Username is required", 400)
    if not password:
        return error("Password is required", 400)
    if username == "admin":
        return error("Username is taken", 409)
    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return error("Username is taken", 409)
    db.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) "
        "VALUES (?, ?, 0, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    if data is None:
        return error("Invalid JSON body", 400)
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if user is None or not user["password_hash"]:
        return error("Invalid username or password", 401)
    if not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return error("Authentication required", 401)
    return jsonify({"username": user["username"], "is_admin": user["is_admin"]})


@app.post("/api/auth/logout")
def logout():
    user = current_user()
    if user is not None:
        auth = request.headers.get("Authorization", "")
        token = auth[7:].strip()
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"}), 200


@app.get("/api/posts")
def list_posts():
    user = current_user()
    is_admin = bool(user and user["is_admin"])
    q = request.args.get("q", "").strip()
    tag = request.args.get("tag", "").strip()
    author = request.args.get("author", "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = max(1, min(100, int(request.args.get("page_size", 10))))
    except ValueError:
        page_size = 10

    db = get_db()
    clauses = []
    params = []
    if not is_admin:
        clauses.append("p.taken_down = 0")
    if q:
        clauses.append("(p.title LIKE ? OR p.content LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    if author:
        clauses.append("u.username = ?")
        params.append(author)
    where = ""
    if clauses:
        where = "WHERE " + " AND ".join(clauses)

    rows = db.execute(
        f"SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.author_id "
        f"{where} ORDER BY p.created_at DESC, p.id DESC",
        params,
    ).fetchall()

    items = [post_to_dict(r) for r in rows]
    if tag:
        items = [p for p in items if tag in p["tags"]]

    total = len(items)
    start = (page - 1) * page_size
    page_items = items[start : start + page_size]

    return jsonify(
        {
            "items": page_items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/posts")
def create_post():
    user = require_user()
    if user is None:
        return error("Authentication required", 401)
    data = body_json()
    if data is None:
        return error("Invalid JSON body", 400)
    title = (data.get("title") or "").strip()
    content = data.get("content") or ""
    if not title:
        return error("Title is required", 400)
    if not content:
        return error("Content is required", 400)
    tags = data.get("tags", [])
    if tags is None:
        tags = []
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        return error("Tags must be a list of strings", 400)
    tags = [t.strip() for t in tags if t.strip()]

    ts = now_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO posts (author_id, title, content, tags, taken_down, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, 0, ?, ?)",
        (user["id"], title, content, json.dumps(tags), ts, ts),
    )
    db.commit()
    row = db.execute(
        "SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(post_to_dict(row)), 201


def get_post_or_404(db, post_id, is_admin):
    row = db.execute(
        "SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()
    if row is None:
        return None
    if row["taken_down"] and not is_admin:
        return None
    return row


@app.get("/api/posts/<int:post_id>")
def get_post(post_id):
    user = current_user()
    is_admin = bool(user and user["is_admin"])
    row = get_post_or_404(get_db(), post_id, is_admin)
    if row is None:
        return error("Not found", 404)
    return jsonify(post_to_dict(row))


@app.put("/api/posts/<int:post_id>")
def update_post(post_id):
    user = require_user()
    if user is None:
        return error("Authentication required", 401)
    data = body_json()
    if data is None:
        return error("Invalid JSON body", 400)
    db = get_db()
    row = db.execute(
        "SELECT * FROM posts WHERE id = ?", (post_id,)
    ).fetchone()
    if row is None:
        return error("Not found", 404)
    if row["author_id"] != user["id"]:
        return error("Forbidden", 403)
    title = (data.get("title") or "").strip()
    content = data.get("content") or ""
    if not title:
        return error("Title is required", 400)
    if not content:
        return error("Content is required", 400)
    tags = data.get("tags", [])
    if tags is None:
        tags = []
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        return error("Tags must be a list of strings", 400)
    tags = [t.strip() for t in tags if t.strip()]

    ts = now_iso()
    db.execute(
        "UPDATE posts SET title = ?, content = ?, tags = ?, updated_at = ? WHERE id = ?",
        (title, content, json.dumps(tags), ts, post_id),
    )
    db.commit()
    updated = db.execute(
        "SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()
    return jsonify(post_to_dict(updated))


@app.delete("/api/posts/<int:post_id>")
def delete_post(post_id):
    user = require_user()
    if user is None:
        return error("Authentication required", 401)
    db = get_db()
    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is None:
        return error("Not found", 404)
    if row["author_id"] != user["id"]:
        return error("Forbidden", 403)
    db.execute("DELETE FROM posts WHERE id = ?", (post_id,))
    db.commit()
    return jsonify({"status": "ok"})


@app.post("/api/admin/posts/<int:post_id>/toggle")
def toggle_post(post_id):
    user = require_user()
    if user is None:
        return error("Authentication required", 401)
    if not user["is_admin"]:
        return error("Forbidden", 403)
    db = get_db()
    row = db.execute("SELECT * FROM posts WHERE id = ?", (post_id,)).fetchone()
    if row is None:
        return error("Not found", 404)
    new_state = 0 if row["taken_down"] else 1
    db.execute(
        "UPDATE posts SET taken_down = ?, updated_at = ? WHERE id = ?",
        (new_state, now_iso(), post_id),
    )
    db.commit()
    updated = db.execute(
        "SELECT p.*, u.username FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?",
        (post_id,),
    ).fetchone()
    return jsonify(post_to_dict(updated))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
