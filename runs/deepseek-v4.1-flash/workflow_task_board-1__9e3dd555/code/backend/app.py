"""Flask entry point for the shared kanban board."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "kanban.db"

STATUSES = ("todo", "in_progress", "done")

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

CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'medium',
    position INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_column
    ON tasks(status, position);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = connect()
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_error=None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


init_db()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def task_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def renumber(connection: sqlite3.Connection, status: str) -> None:
    rows = connection.execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    for index, row in enumerate(rows, start=1):
        connection.execute(
            "UPDATE tasks SET position = ? WHERE id = ?", (index, row["id"])
        )


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    return get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens
        JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def validate_title(value):
    if not isinstance(value, str) or not value.strip():
        return None, "Title is required"
    title = value.strip()
    if len(title) > 500:
        return None, "Title must be 500 characters or fewer"
    return title, None


def validate_description(value):
    if value is None:
        return "", None
    if not isinstance(value, str):
        return None, "Description must be text"
    return value, None


def validate_priority(value):
    if not isinstance(value, str) or not value.strip():
        return None, "Priority is required"
    priority = value.strip()
    if len(priority) > 50:
        return None, "Priority must be 50 characters or fewer"
    return priority, None


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("A JSON body is required")

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required")
    username = username.strip()
    if len(username) > 100:
        return error("Username must be 100 characters or fewer")
    if not isinstance(password, str) or not password:
        return error("Password is required")
    if len(password) > 1000:
        return error("Password is too long")

    connection = get_db()
    try:
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        connection.commit()
    except sqlite3.IntegrityError:
        connection.rollback()
        return error("Username is already taken", 409)

    user_id = cursor.lastrowid
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, utcnow()),
    )
    connection.commit()
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("A JSON body is required")

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required")
    if not isinstance(password, str) or not password:
        return error("Password is required")

    connection = get_db()
    row = connection.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    connection.commit()
    return jsonify({"token": token})


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    priority = request.args.get("priority")

    if status is not None and status != "" and status not in STATUSES:
        return error("Invalid status filter")

    connection = get_db()
    clauses = []
    params = []
    if status:
        clauses.append("status = ?")
        params.append(status)
    if priority:
        clauses.append("priority = ?")
        params.append(priority)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = connection.execute(
        f"""
        SELECT * FROM tasks
        {where}
        ORDER BY CASE status
            WHEN 'todo' THEN 0
            WHEN 'in_progress' THEN 1
            WHEN 'done' THEN 2
            ELSE 3
        END, position, id
        """,
        params,
    ).fetchall()

    counts = {name: 0 for name in STATUSES}
    for row in rows:
        if row["status"] in counts:
            counts[row["status"]] += 1

    return jsonify(
        {
            "items": [task_json(row) for row in rows],
            "total": len(rows),
            "counts": counts,
        }
    )


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    row = get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return error("Task not found", 404)
    return jsonify(task_json(row))


@app.post("/api/tasks")
@login_required
def create_task():
    data = json_body()
    if data is None:
        return error("A JSON body is required")

    title, message = validate_title(data.get("title"))
    if message:
        return error(message)
    description, message = validate_description(data.get("description", ""))
    if message:
        return error(message)
    priority, message = validate_priority(data.get("priority", "medium"))
    if message:
        return error(message)
    status = data.get("status", "todo")
    if status not in STATUSES:
        return error("Invalid status")

    connection = get_db()
    now = utcnow()
    position = connection.execute(
        "SELECT COALESCE(MAX(position), 0) + 1 FROM tasks WHERE status = ?",
        (status,),
    ).fetchone()[0]
    cursor = connection.execute(
        """
        INSERT INTO tasks
            (title, description, status, priority, position, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (title, description, status, priority, position, now, now),
    )
    connection.commit()
    row = connection.execute(
        "SELECT * FROM tasks WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(task_json(row)), 201


@app.patch("/api/tasks/<int:task_id>")
@login_required
def update_task(task_id: int):
    data = json_body()
    if data is None:
        return error("A JSON body is required")

    connection = get_db()
    existing = connection.execute(
        "SELECT * FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if existing is None:
        return error("Task not found", 404)

    updates = {}

    if "title" in data:
        title, message = validate_title(data["title"])
        if message:
            return error(message)
        updates["title"] = title

    if "description" in data:
        description, message = validate_description(data["description"])
        if message:
            return error(message)
        updates["description"] = description

    if "priority" in data:
        priority, message = validate_priority(data["priority"])
        if message:
            return error(message)
        updates["priority"] = priority

    new_status = existing["status"]
    if "status" in data:
        if data["status"] not in STATUSES:
            return error("Invalid status")
        new_status = data["status"]

    requested_position = None
    if "position" in data:
        position = data["position"]
        if isinstance(position, bool) or not isinstance(position, int):
            return error("Position must be an integer")
        requested_position = position

    relocate = new_status != existing["status"] or requested_position is not None

    if relocate:
        target_rows = connection.execute(
            """
            SELECT id FROM tasks
            WHERE status = ? AND id <> ?
            ORDER BY position, id
            """,
            (new_status, task_id),
        ).fetchall()
        target_ids = [row["id"] for row in target_rows]

        if requested_position is None:
            insert_index = len(target_ids)
        else:
            insert_index = max(1, min(requested_position, len(target_ids) + 1)) - 1

        if new_status != existing["status"]:
            source_rows = connection.execute(
                """
                SELECT id FROM tasks
                WHERE status = ? AND id <> ?
                ORDER BY position, id
                """,
                (existing["status"], task_id),
            ).fetchall()
            for index, row in enumerate(source_rows, start=1):
                connection.execute(
                    "UPDATE tasks SET position = ? WHERE id = ?",
                    (index, row["id"]),
                )

        target_ids.insert(insert_index, task_id)
        for index, target_id in enumerate(target_ids, start=1):
            connection.execute(
                "UPDATE tasks SET position = ? WHERE id = ?",
                (index, target_id),
            )

        updates["status"] = new_status
        updates["position"] = insert_index + 1

    if updates:
        updates["updated_at"] = utcnow()
        assignments = ", ".join(f"{column} = ?" for column in updates)
        connection.execute(
            f"UPDATE tasks SET {assignments} WHERE id = ?",
            (*updates.values(), task_id),
        )
        connection.commit()

    row = connection.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    return jsonify(task_json(row))


@app.delete("/api/tasks/<int:task_id>")
@login_required
def delete_task(task_id: int):
    connection = get_db()
    row = connection.execute(
        "SELECT status FROM tasks WHERE id = ?", (task_id,)
    ).fetchone()
    if row is None:
        return error("Task not found", 404)

    connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    renumber(connection, row["status"])
    connection.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found", 404)
    target = (DIST / path).resolve()
    try:
        target.relative_to(DIST.resolve())
    except ValueError:
        return error("Not found", 404)
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
