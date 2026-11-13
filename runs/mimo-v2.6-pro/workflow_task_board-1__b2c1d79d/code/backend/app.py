"""Kanban board: JSON API and static frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ["DATA_DIR"]) if os.environ.get("DATA_DIR") else BASE_DIR / "data"
DB_PATH = DATA_DIR / "kanban.db"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")

app = Flask(__name__, static_folder=None)

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    position INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks (status, position);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def error(message: str, status: int = 400, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def validation_error(errors: dict):
    message = next(iter(errors.values())) if len(errors) == 1 else "Validation failed"
    return error(message, 400, errors)


def parse_body():
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        return None, error("Request body must be a JSON object", 400)
    return data, None


def task_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def get_current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token.strip(),),
    ).fetchone()
    return row


def require_user():
    user = get_current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def validate_username(value):
    if not isinstance(value, str):
        return None, "username must be a string"
    value = value.strip()
    if not value:
        return None, "username is required"
    if len(value) > 100:
        return None, "username must be at most 100 characters"
    return value, None


def validate_password(value):
    if not isinstance(value, str):
        return None, "password must be a string"
    if not value:
        return None, "password is required"
    if len(value) > 256:
        return None, "password must be at most 256 characters"
    return value, None


def validate_title(value):
    if not isinstance(value, str):
        return None, "title must be a string"
    value = value.strip()
    if not value:
        return None, "title is required"
    if len(value) > 200:
        return None, "title must be at most 200 characters"
    return value, None


def validate_description(value):
    if not isinstance(value, str):
        return None, "description must be a string"
    if len(value) > 5000:
        return None, "description must be at most 5000 characters"
    return value, None


def validate_status(value):
    if not isinstance(value, str) or value not in STATUSES:
        return None, f"status must be one of: {', '.join(STATUSES)}"
    return value, None


def validate_priority(value):
    if not isinstance(value, str) or value not in PRIORITIES:
        return None, f"priority must be one of: {', '.join(PRIORITIES)}"
    return value, None


def validate_position(value):
    if isinstance(value, bool):
        return None, "position must be a positive integer"
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if not isinstance(value, int):
        return None, "position must be a positive integer"
    if value < 1:
        return None, "position must be a positive integer"
    return value, None


def column_task_ids(conn: sqlite3.Connection, status: str) -> list[int]:
    rows = conn.execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    return [row["id"] for row in rows]


def write_column_order(conn: sqlite3.Connection, status: str, ordered_ids: list[int]) -> None:
    for index, task_id in enumerate(ordered_ids, start=1):
        conn.execute(
            "UPDATE tasks SET position = ?, status = ? WHERE id = ?",
            (index, status, task_id),
        )


def move_task(conn: sqlite3.Connection, task: sqlite3.Row, new_status: str, new_position: int | None) -> None:
    old_status = task["status"]
    order = [task_id for task_id in column_task_ids(conn, new_status) if task_id != task["id"]]
    if new_position is None:
        new_position = task["position"]
    new_position = max(1, min(new_position, len(order) + 1))
    order.insert(new_position - 1, task["id"])
    write_column_order(conn, new_status, order)
    if old_status != new_status:
        write_column_order(conn, old_status, column_task_ids(conn, old_status))


@app.post("/api/auth/register")
def register():
    data, err = parse_body()
    if err:
        return err
    errors = {}
    username, username_err = validate_username(data.get("username"))
    if username_err:
        errors["username"] = username_err
    password, password_err = validate_password(data.get("password"))
    if password_err:
        errors["password"] = password_err
    if errors:
        return validation_error(errors)

    conn = get_db()
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error("username already taken", 409, {"username": "username already taken"})

    created_at = now_iso()
    with conn:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), created_at),
        )
        user_id = cur.lastrowid
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, created_at),
        )
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data, err = parse_body()
    if err:
        return err
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    row = get_db().execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    conn = get_db()
    token = secrets.token_urlsafe(32)
    with conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], now_iso()),
        )
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    user, err = require_user()
    if err:
        return err
    return jsonify({"id": user["id"], "username": user["username"]})


@app.get("/api/tasks")
def list_tasks():
    errors = {}
    status_filter = request.args.get("status") or None
    priority_filter = request.args.get("priority") or None
    if status_filter is not None:
        status_filter, err = validate_status(status_filter)
        if err:
            errors["status"] = err
    if priority_filter is not None:
        priority_filter, err = validate_priority(priority_filter)
        if err:
            errors["priority"] = err
    if errors:
        return validation_error(errors)

    clauses = []
    params = []
    if status_filter is not None:
        clauses.append("status = ?")
        params.append(status_filter)
    if priority_filter is not None:
        clauses.append("priority = ?")
        params.append(priority_filter)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    rows = get_db().execute(
        f"""
        SELECT * FROM tasks {where}
        ORDER BY CASE status
            WHEN 'todo' THEN 1
            WHEN 'in_progress' THEN 2
            ELSE 3
        END, position, id
        """,
        params,
    ).fetchall()

    counts = {status: 0 for status in STATUSES}
    items = []
    for row in rows:
        counts[row["status"]] += 1
        items.append(task_to_dict(row))
    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.post("/api/tasks")
def create_task():
    _user, err = require_user()
    if err:
        return err
    data, err = parse_body()
    if err:
        return err

    errors = {}
    title, title_err = validate_title(data.get("title"))
    if title_err:
        errors["title"] = title_err
    description, description_err = validate_description(data.get("description", ""))
    if description_err:
        errors["description"] = description_err
    status, status_err = validate_status(data.get("status", "todo"))
    if status_err:
        errors["status"] = status_err
    priority, priority_err = validate_priority(data.get("priority", "medium"))
    if priority_err:
        errors["priority"] = priority_err
    has_position = "position" in data and data["position"] is not None
    position = None
    if has_position:
        position, position_err = validate_position(data["position"])
        if position_err:
            errors["position"] = position_err
    if errors:
        return validation_error(errors)

    conn = get_db()
    updated_at = now_iso()
    with conn:
        order = column_task_ids(conn, status)
        insert_at = position if position is not None else len(order) + 1
        insert_at = max(1, min(insert_at, len(order) + 1))
        cur = conn.execute(
            "INSERT INTO tasks (title, description, status, priority, position, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (title, description, status, priority, insert_at, updated_at),
        )
        task_id = cur.lastrowid
        order.insert(insert_at - 1, task_id)
        write_column_order(conn, status, order)
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(task_to_dict(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    row = get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return error("Task not found", 404)
    return jsonify(task_to_dict(row))


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id: int):
    _user, err = require_user()
    if err:
        return err
    data, err = parse_body()
    if err:
        return err

    conn = get_db()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if task is None:
        return error("Task not found", 404)

    fields = {}
    errors = {}
    if "title" in data:
        value, err = validate_title(data["title"])
        if err:
            errors["title"] = err
        else:
            fields["title"] = value
    if "description" in data:
        value, err = validate_description(data["description"])
        if err:
            errors["description"] = err
        else:
            fields["description"] = value
    if "status" in data:
        value, err = validate_status(data["status"])
        if err:
            errors["status"] = err
        else:
            fields["status"] = value
    if "priority" in data:
        value, err = validate_priority(data["priority"])
        if err:
            errors["priority"] = err
        else:
            fields["priority"] = value
    has_position = "position" in data and data["position"] is not None
    if has_position:
        value, err = validate_position(data["position"])
        if err:
            errors["position"] = err
        else:
            fields["position"] = value
    if errors:
        return validation_error(errors)

    new_status = fields.get("status", task["status"])
    with conn:
        for name, value in fields.items():
            if name != "position":
                conn.execute(f"UPDATE tasks SET {name} = ? WHERE id = ?", (value, task_id))
        if "status" in fields or "position" in fields:
            move_task(conn, task, new_status, fields.get("position"))
        if fields:
            conn.execute(
                "UPDATE tasks SET updated_at = ? WHERE id = ?", (now_iso(), task_id)
            )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(task_to_dict(row))


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id: int):
    _user, err = require_user()
    if err:
        return err
    conn = get_db()
    task = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if task is None:
        return error("Task not found", 404)
    with conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        write_column_order(conn, task["status"], column_task_ids(conn, task["status"]))
    return jsonify({"ok": True})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    if (DIST_DIR / path).is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


init_db()
