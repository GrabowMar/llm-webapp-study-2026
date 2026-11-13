"""Kanban board Flask application.

Serves a JSON API under /api and the built frontend from /.
Data is persisted in a SQLite database under ./data.
"""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "kanban.db"
DIST = BASE_DIR / "frontend" / "dist"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH, timeout=30)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        g.db.execute("PRAGMA busy_timeout = 30000")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                priority TEXT NOT NULL DEFAULT 'medium',
                position INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def api_error(message: str, status: int, **extra):
    payload = {"error": message}
    payload.update(extra)
    return jsonify(payload), status


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = db().execute(
        """SELECT u.id, u.username FROM tokens t
           JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?""",
        (token_hash(token),),
    ).fetchone()
    return dict(row) if row else None


def require_user():
    user = current_user()
    if user is None:
        return None, api_error("Authentication required.", 401)
    return user, None


def task_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


FIELDS = {
    "title": "title",
    "description": "description",
    "status": "status",
    "priority": "priority",
    "position": "position",
}


def validate_string(data: dict, key: str, required: bool, *, allow_empty: bool, max_len: int, errors: dict):
    if key not in data:
        if required:
            errors[key] = "This field is required."
        return None
    value = data[key]
    if not isinstance(value, str):
        errors[key] = "Must be a string."
        return None
    value = value.strip() if key == "title" else value
    if not allow_empty and not value:
        errors[key] = "Must not be empty."
    elif len(value) > max_len:
        errors[key] = f"Must be at most {max_len} characters."
    return value


def validate_choice(data: dict, key: str, choices, errors: dict):
    if key not in data:
        return None
    value = data[key]
    if not isinstance(value, str) or value not in choices:
        errors[key] = f"Must be one of: {', '.join(choices)}."
        return None
    return value


def validate_position(data: dict, errors: dict):
    if "position" not in data:
        return None
    value = data["position"]
    if isinstance(value, bool) or not isinstance(value, int):
        errors["position"] = "Must be a positive integer."
        return None
    if value < 1:
        errors["position"] = "Must be a positive integer."
    return value


def unknown_fields(data: dict, allowed: set, errors: dict):
    for key in data:
        if key not in allowed:
            errors[key] = "Unknown field."


def synced(conn: sqlite3.Connection, status: str) -> None:
    """Recompute positions 1..n for a column after a structural change."""
    rows = conn.execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    for index, row in enumerate(rows, start=1):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (index, row["id"]))


def place(conn: sqlite3.Connection, task_id: int, status: str, position: int) -> int:
    """Move a task to a 1-based position in a column, shifting others as needed.

    The target task is temporarily parked at position 0 so that shifting can
    never collide with it. Returns the final clamped position.
    """
    others = [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM tasks WHERE status = ? AND id != ? ORDER BY position, id",
            (status, task_id),
        ).fetchall()
    ]
    count = len(others) + 1
    final = min(max(position, 1), count)
    conn.execute("UPDATE tasks SET position = 0, status = ? WHERE id = ?", (status, task_id))
    ordered = others[: final - 1] + [task_id] + others[final - 1 :]
    for index, tid in enumerate(ordered, start=1):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (index, tid))
    return final


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    errors = {}
    unknown_fields(data, {"username", "password"}, errors)
    username = validate_string(data, "username", True, allow_empty=False, max_len=80, errors=errors)
    password = validate_string(data, "password", True, allow_empty=False, max_len=200, errors=errors)
    if password is not None and not errors.get("password") and len(password) < 6:
        errors["password"] = "Must be at least 6 characters."
    if errors:
        return api_error("Validation failed.", 400, errors=errors)
    conn = db()
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return api_error("Validation failed.", 409, errors={"username": "This username is already taken."})
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now()),
    )
    conn.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    errors = {}
    unknown_fields(data, {"username", "password"}, errors)
    username = validate_string(data, "username", True, allow_empty=False, max_len=80, errors=errors)
    password = validate_string(data, "password", True, allow_empty=False, max_len=200, errors=errors)
    if errors:
        return api_error("Validation failed.", 400, errors=errors)
    row = db().execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_hash(token), row["id"], now()),
    )
    db().commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
def logout():
    user, error = require_user()
    if error:
        return error
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (token_hash(request.headers["Authorization"][7:].strip()),))
    db().commit()
    return jsonify({"ok": True})


@app.get("/api/auth/me")
def me():
    user, error = require_user()
    if error:
        return error
    return jsonify({"username": user["username"]})


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    priority = request.args.get("priority")
    errors = {}
    if status is not None and status not in STATUSES:
        errors["status"] = f"Must be one of: {', '.join(STATUSES)}."
    if priority is not None and priority not in PRIORITIES:
        errors["priority"] = f"Must be one of: {', '.join(PRIORITIES)}."
    if errors:
        return api_error("Validation failed.", 400, errors=errors)
    query = "SELECT * FROM tasks WHERE 1=1"
    params: list = []
    if status:
        query += " AND status = ?"
        params.append(status)
    if priority:
        query += " AND priority = ?"
        params.append(priority)
    query += " ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, position, id"
    items = [task_dict(r) for r in db().execute(query, params).fetchall()]
    counts = {
        s: db().execute("SELECT COUNT(*) FROM tasks WHERE status = ?", (s,)).fetchone()[0]
        for s in STATUSES
    }
    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.post("/api/tasks")
def create_task():
    user, error = require_user()
    if error:
        return error
    data = body()
    errors = {}
    unknown_fields(data, set(FIELDS), errors)
    title = validate_string(data, "title", True, allow_empty=False, max_len=200, errors=errors)
    description = validate_string(data, "description", False, allow_empty=True, max_len=5000, errors=errors)
    status = validate_choice(data, "status", STATUSES, errors)
    priority = validate_choice(data, "priority", PRIORITIES, errors)
    if errors:
        return api_error("Validation failed.", 400, errors=errors)
    status = status or "todo"
    priority = priority or "medium"
    conn = db()
    next_position = conn.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE status = ?", (status,)
    ).fetchone()[0]
    cursor = conn.execute(
        """INSERT INTO tasks (title, description, status, priority, position, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (title, description or "", status, priority, next_position, now()),
    )
    synced(conn, status)
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(task_dict(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    row = db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return api_error("Task not found.", 404)
    return jsonify(task_dict(row))


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id: int):
    user, error = require_user()
    if error:
        return error
    conn = db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return api_error("Task not found.", 404)
    data = body()
    errors = {}
    unknown_fields(data, set(FIELDS), errors)
    title = validate_string(data, "title", False, allow_empty=False, max_len=200, errors=errors)
    description = validate_string(data, "description", False, allow_empty=True, max_len=5000, errors=errors)
    status = validate_choice(data, "status", STATUSES, errors)
    priority = validate_choice(data, "priority", PRIORITIES, errors)
    position = validate_position(data, errors)
    if errors:
        return api_error("Validation failed.", 400, errors=errors)
    if not data:
        return jsonify(task_dict(row))
    new_status = status if status is not None else row["status"]
    values = {
        "title": title if title is not None else row["title"],
        "description": description if description is not None else row["description"],
        "priority": priority if priority is not None else row["priority"],
    }
    conn.execute(
        "UPDATE tasks SET title = ?, description = ?, priority = ?, updated_at = ? WHERE id = ?",
        (values["title"], values["description"], values["priority"], now(), task_id),
    )
    moved = new_status != row["status"]
    if moved:
        conn.execute("UPDATE tasks SET status = ?, position = 0 WHERE id = ?", (new_status, task_id))
        synced(conn, row["status"])
    if position is not None or moved:
        target = position if position is not None else conn.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE status = ?", (new_status,)
        ).fetchone()[0]
        place(conn, task_id, new_status, target)
    if not moved:
        synced(conn, new_status)
    conn.commit()
    updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(task_dict(updated))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id: int):
    user, error = require_user()
    if error:
        return error
    conn = db()
    row = conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return api_error("Task not found.", 404)
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    synced(conn, row["status"])
    conn.commit()
    return jsonify({"ok": True})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
