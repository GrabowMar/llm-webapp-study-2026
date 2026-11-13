"""Kanban board Flask application."""

import hmac
import os
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "kanban.db"
DIST = BASE_DIR / "frontend" / "dist"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")

app = Flask(__name__, static_folder=None)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = get_db()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'todo',
            priority TEXT NOT NULL DEFAULT 'medium',
            position INTEGER NOT NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hmac.new(salt, password.encode(), "sha256").digest()
    return salt.hex() + ":" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    salt_hex, digest_hex = stored.split(":", 1)
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    return hmac.compare_digest(
        hmac.new(salt, password.encode(), "sha256").digest(), expected
    )


def new_token() -> str:
    return os.urandom(32).hex()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):]
    conn = get_db()
    row = conn.execute(
        "SELECT u.id, u.username FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    conn.close()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def task_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def normalize_positions(conn, status: str):
    rows = conn.execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    for index, row in enumerate(rows, start=1):
        conn.execute(
            "UPDATE tasks SET position = ? WHERE id = ?", (index, row["id"])
        )


def move_to_position(conn, task_id: int, status: str, position: int):
    """Place task at the given 1-based position within a column."""
    rows = conn.execute(
        "SELECT id FROM tasks WHERE status = ? AND id != ? ORDER BY position, id",
        (status, task_id),
    ).fetchall()
    ids = [r["id"] for r in rows]
    position = max(1, min(position, len(ids) + 1))
    ids.insert(position - 1, task_id)
    for index, tid in enumerate(ids, start=1):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (index, tid))
    conn.execute(
        "UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?",
        (status, task_id),
    )


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    username = username.strip()
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    conn = get_db()
    existing = conn.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return error("username is already taken", 409)
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password)),
    )
    conn.commit()
    conn.close()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    username = username.strip()
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        conn.close()
        return error("invalid username or password", 401)

    token = new_token()
    conn.execute(
        "INSERT INTO sessions (token, user_id) VALUES (?, ?)",
        (token, row["id"]),
    )
    conn.commit()
    conn.close()
    return jsonify({"token": token, "username": username})


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    priority = request.args.get("priority")

    if status is not None and status not in STATUSES:
        return error("invalid status", 400)
    if priority is not None and priority not in PRIORITIES:
        return error("invalid priority", 400)

    clauses = []
    params = []
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if priority is not None:
        clauses.append("priority = ?")
        params.append(priority)
    where = "WHERE " + " AND ".join(clauses) if clauses else ""

    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM tasks "
        + where
        + " ORDER BY CASE status WHEN 'todo' THEN 0 "
        "WHEN 'in_progress' THEN 1 ELSE 2 END, position, id",
        params,
    ).fetchall()

    counts = {s: 0 for s in STATUSES}
    for c in conn.execute(
        "SELECT status, COUNT(*) AS n FROM tasks GROUP BY status"
    ).fetchall():
        counts[c["status"]] = c["n"]

    items = [task_to_dict(r) for r in rows]
    conn.close()
    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.post("/api/tasks")
def create_task():
    user, err = require_user()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    title = data.get("title")
    description = data.get("description")
    status = data.get("status")
    priority = data.get("priority")

    if not isinstance(title, str) or not title.strip():
        return error("title is required", 400)
    title = title.strip()

    if description is None:
        description = ""
    if not isinstance(description, str):
        return error("description must be a string", 400)

    if status is None:
        status = "todo"
    if status not in STATUSES:
        return error("status must be one of todo, in_progress, done", 400)

    if priority is None:
        priority = "medium"
    if priority not in PRIORITIES:
        return error("priority must be one of low, medium, high", 400)

    conn = get_db()
    max_pos = conn.execute(
        "SELECT COALESCE(MAX(position), 0) AS m FROM tasks WHERE status = ?",
        (status,),
    ).fetchone()["m"]
    cursor = conn.execute(
        "INSERT INTO tasks (title, description, status, priority, position) "
        "VALUES (?, ?, ?, ?, ?)",
        (title, description, status, priority, max_pos + 1),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    conn.close()
    return jsonify(task_to_dict(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    if row is None:
        return error("task not found", 404)
    return jsonify(task_to_dict(row))


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id: int):
    user, err = require_user()
    if err:
        return err

    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return error("invalid request body", 400)

    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        conn.close()
        return error("task not found", 404)

    allowed = {"title", "description", "status", "priority", "position"}
    unknown = set(data) - allowed
    if unknown:
        conn.close()
        return error("unknown fields: " + ", ".join(sorted(unknown)), 400)

    title = row["title"]
    description = row["description"]
    status = row["status"]
    priority = row["priority"]
    position = row["position"]

    if "title" in data:
        if not isinstance(data["title"], str) or not data["title"].strip():
            conn.close()
            return error("title is required", 400)
        title = data["title"].strip()
    if "description" in data:
        if not isinstance(data["description"], str):
            conn.close()
            return error("description must be a string", 400)
        description = data["description"]
    if "status" in data:
        if data["status"] not in STATUSES:
            conn.close()
            return error("status must be one of todo, in_progress, done", 400)
        status = data["status"]
    if "priority" in data:
        if data["priority"] not in PRIORITIES:
            conn.close()
            return error("priority must be one of low, medium, high", 400)
        priority = data["priority"]
    if "position" in data:
        p = data["position"]
        if not isinstance(p, int) or isinstance(p, bool) or p < 1:
            conn.close()
            return error("position must be a positive integer", 400)
        position = p

    moving = status != row["status"] or (
        "position" in data and position != row["position"]
    )
    if "position" in data or status != row["status"]:
        move_to_position(conn, task_id, status, position)

    if title != row["title"] or description != row["description"] or (
        priority != row["priority"]
    ):
        conn.execute(
            "UPDATE tasks SET title = ?, description = ?, priority = ?, "
            "updated_at = datetime('now') WHERE id = ?",
            (title, description, priority, task_id),
        )

    conn.commit()
    updated = conn.execute(
        "SELECT * FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    conn.close()
    return jsonify(task_to_dict(updated))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id: int):
    user, err = require_user()
    if err:
        return err

    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        conn.close()
        return error("task not found", 404)

    status = row["status"]
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    normalize_positions(conn, status)
    conn.commit()
    conn.close()
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
