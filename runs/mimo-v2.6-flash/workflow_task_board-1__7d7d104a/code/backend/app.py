"""Kanban board Flask application: JSON API plus the frontend build."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path.cwd() / "data"
DB_PATH = DATA_DIR / "kanban.db"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")
STATUS_ORDER = {status: index for index, status in enumerate(STATUSES)}

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = connect_db()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
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
            CREATE INDEX IF NOT EXISTS idx_tasks_status_position
                ON tasks (status, position);
            """
        )
        db.commit()
    finally:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------
# Errors and helpers
# --------------------------------------------------------------------------


def error_response(message: str, status: int, messages: list[str] | None = None):
    payload: dict = {"error": message}
    if messages:
        payload["errors"] = messages
    response = jsonify(payload)
    response.status_code = status
    return response


def validation_error(messages: list[str]):
    return error_response(messages[0], 400, messages)


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


def fetch_task(task_id: int) -> sqlite3.Row | None:
    return get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def column_ids(status: str) -> list[int]:
    rows = get_db().execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    return [row["id"] for row in rows]


def write_column_positions(status: str, ids: list[int]) -> None:
    db = get_db()
    for index, task_id in enumerate(ids, start=1):
        db.execute(
            "UPDATE tasks SET position = ? WHERE id = ? AND position <> ?",
            (index, task_id, index),
        )


def validate_username_password(data: dict) -> list[str]:
    messages: list[str] = []
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        messages.append("Username is required")
    if not isinstance(password, str) or not password:
        messages.append("Password is required")
    return messages


def validate_task_fields(data: dict, partial: bool) -> list[str]:
    """Return validation messages for the given task payload."""
    messages: list[str] = []

    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            messages.append("Title is required")
        elif len(title) > 200:
            messages.append("Title must be 200 characters or fewer")

    if "description" in data:
        description = data.get("description")
        if description is None:
            pass
        elif not isinstance(description, str):
            messages.append("Description must be a string")
        elif len(description) > 5000:
            messages.append("Description must be 5000 characters or fewer")

    if "status" in data:
        status = data.get("status")
        if status not in STATUSES:
            messages.append(
                "Status must be one of: " + ", ".join(STATUSES)
            )

    if "priority" in data:
        priority = data.get("priority")
        if priority not in PRIORITIES:
            messages.append(
                "Priority must be one of: " + ", ".join(PRIORITIES)
            )

    if "position" in data:
        position = data.get("position")
        if isinstance(position, bool) or not isinstance(position, int) or position < 1:
            messages.append("Position must be a positive integer")

    return messages


# --------------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------------


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens
        JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            response = jsonify({"error": "Authentication required"})
            response.status_code = 401
            response.headers["WWW-Authenticate"] = "Bearer"
            return response
        g.user = user
        return view(*args, **kwargs)

    return wrapper


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return validation_error(["Username is required", "Password is required"])
    messages = validate_username_password(data)
    if messages:
        return validation_error(messages)

    username = data["username"].strip()
    password = data["password"]
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error_response("Username already exists", 409)

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return validation_error(["Username is required", "Password is required"])
    messages = validate_username_password(data)
    if messages:
        return validation_error(messages)

    username = data["username"].strip()
    password = data["password"]
    user = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error_response("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        response = jsonify({"error": "Authentication required"})
        response.status_code = 401
        response.headers["WWW-Authenticate"] = "Bearer"
        return response
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer ") :].strip()
        if token:
            db = get_db()
            db.execute("DELETE FROM tokens WHERE token = ?", (token,))
            db.commit()
    return jsonify({"ok": True})


# --------------------------------------------------------------------------
# Tasks
# --------------------------------------------------------------------------


@app.get("/api/tasks")
def list_tasks():
    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")

    if status_filter is not None and status_filter not in STATUSES:
        return validation_error(
            ["Status must be one of: " + ", ".join(STATUSES)]
        )
    if priority_filter is not None and priority_filter not in PRIORITIES:
        return validation_error(
            ["Priority must be one of: " + ", ".join(PRIORITIES)]
        )

    clauses: list[str] = []
    params: list[str] = []
    if status_filter is not None:
        clauses.append("status = ?")
        params.append(status_filter)
    if priority_filter is not None:
        clauses.append("priority = ?")
        params.append(priority_filter)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    rows = get_db().execute(
        f"SELECT * FROM tasks{where} ORDER BY status, position, id", params
    ).fetchall()
    rows = sorted(
        rows,
        key=lambda row: (STATUS_ORDER[row["status"]], row["position"], row["id"]),
    )

    counts = {status: 0 for status in STATUSES}
    items = []
    for row in rows:
        counts[row["status"]] += 1
        items.append(task_dict(row))

    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    row = fetch_task(task_id)
    if row is None:
        return error_response("Task not found", 404)
    return jsonify(task_dict(row))


@app.post("/api/tasks")
@login_required
def create_task():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return validation_error(["Title is required"])

    messages = validate_task_fields(data, partial=False)
    if messages:
        return validation_error(messages)

    status = data.get("status", "todo")
    priority = data.get("priority", "medium")
    position = len(column_ids(status)) + 1
    updated_at = now_iso()

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO tasks (title, description, status, priority, position, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data["title"].strip(),
            data.get("description") or "",
            status,
            priority,
            position,
            updated_at,
        ),
    )
    db.commit()
    row = fetch_task(cursor.lastrowid)
    return jsonify(task_dict(row)), 201


@app.patch("/api/tasks/<int:task_id>")
@login_required
def update_task(task_id: int):
    row = fetch_task(task_id)
    if row is None:
        return error_response("Task not found", 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return validation_error(["Request body must be a JSON object"])

    messages = validate_task_fields(data, partial=True)
    if messages:
        return validation_error(messages)

    db = get_db()
    new_status = data.get("status", row["status"])
    if "position" in data:
        new_position: int | None = data["position"]
    elif new_status != row["status"]:
        new_position = None  # append to the end of the target column
    else:
        new_position = row["position"]

    if "title" in data:
        db.execute(
            "UPDATE tasks SET title = ? WHERE id = ?",
            (data["title"].strip(), task_id),
        )
    if "description" in data:
        db.execute(
            "UPDATE tasks SET description = ? WHERE id = ?",
            (data["description"] or "", task_id),
        )
    if "priority" in data:
        db.execute(
            "UPDATE tasks SET priority = ? WHERE id = ?",
            (data["priority"], task_id),
        )

    if new_status != row["status"] or "position" in data:
        source_ids = column_ids(row["status"])
        source_ids.remove(task_id)
        write_column_positions(row["status"], source_ids)

        if new_status == row["status"]:
            target_ids = source_ids
        else:
            target_ids = column_ids(new_status)

        if new_position is None:
            index = len(target_ids)
        else:
            index = min(max(new_position - 1, 0), len(target_ids))
        target_ids.insert(index, task_id)
        write_column_positions(new_status, target_ids)
        if new_status != row["status"]:
            db.execute(
                "UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id)
            )

    db.execute(
        "UPDATE tasks SET updated_at = ? WHERE id = ?", (now_iso(), task_id)
    )
    db.commit()
    return jsonify(task_dict(fetch_task(task_id)))


@app.delete("/api/tasks/<int:task_id>")
@login_required
def delete_task(task_id: int):
    row = fetch_task(task_id)
    if row is None:
        return error_response("Task not found", 404)

    db = get_db()
    db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    ids = column_ids(row["status"])
    write_column_positions(row["status"], ids)
    db.commit()
    return jsonify({"ok": True, "id": task_id})


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("Not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
