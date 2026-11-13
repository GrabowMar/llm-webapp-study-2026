"""Todo list app: Flask JSON API + SQLite storage + static frontend."""

import os
import re
import secrets
import sqlite3
from datetime import datetime
from datetime import date
from datetime import timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.sqlite3"

PRIORITIES = ("low", "medium", "high")
DEFAULT_PRIORITY = "medium"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
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
            password_hash TEXT NOT NULL,
            token TEXT UNIQUE
        );

        CREATE TABLE IF NOT EXISTS todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'medium',
            due_date TEXT,
            completed INTEGER NOT NULL DEFAULT 0,
            completed_at TEXT,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def error(message, status):
    return jsonify({"error": message}), status


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT * FROM users WHERE token = ?", (token,)
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if value in (True, 1, "1", "true", "True", "yes", "on"):
        return True
    if value in (False, 0, "0", "false", "False", "no", "off", ""):
        return False
    return None


def validate_due_date(value):
    if value is None:
        return None, None
    if value == "":
        return None, None
    if not isinstance(value, str):
        return None, "due_date must be a date string (YYYY-MM-DD)"
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None, "due_date must be a date string (YYYY-MM-DD)"
    try:
        date.fromisoformat(value)
    except ValueError:
        return None, "due_date must be a valid date (YYYY-MM-DD)"
    return value, None


def validate_priority(value):
    if value is None:
        return None, None
    if value not in PRIORITIES:
        return None, f"priority must be one of: {', '.join(PRIORITIES)}"
    return value, None


def todo_to_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "due_date": row["due_date"],
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
    }


def get_todo_or_none(todo_id):
    return get_db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?",
        (todo_id, g.user["id"]),
    ).fetchone()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Request body must be a JSON object", 400)

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    username = username.strip()

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("Username already taken", 409)

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO users (username, password_hash, token) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), token),
    )
    db.commit()
    return jsonify({"id": db.execute("SELECT last_insert_rowid() AS id").fetchone()["id"], "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Request body must be a JSON object", 400)

    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_hex(32)
    db.execute("UPDATE users SET token = ? WHERE id = ?", (token, row["id"]))
    db.commit()
    return jsonify({"token": token})


@app.get("/api/todos")
@login_required
def list_todos():
    db = get_db()
    where = ["user_id = ?"]
    params = [g.user["id"]]

    completed = parse_bool(request.args.get("completed"))
    if completed is not None:
        where.append("completed = ?")
        params.append(1 if completed else 0)

    priority = request.args.get("priority")
    if priority:
        where.append("priority = ?")
        params.append(priority)

    where_sql = " AND ".join(where)

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM todos WHERE {where_sql}", params
    ).fetchone()["c"]

    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    if page < 1:
        page = 1

    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        page_size = DEFAULT_PAGE_SIZE
    if page_size < 1:
        page_size = 1
    if page_size > MAX_PAGE_SIZE:
        page_size = MAX_PAGE_SIZE

    offset = (page - 1) * page_size

    rows = db.execute(
        f"""
        SELECT * FROM todos
        WHERE {where_sql}
        ORDER BY completed ASC,
                 CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                 due_date ASC,
                 id DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    remaining = max(0, total - page * page_size)

    return jsonify(
        {
            "items": [todo_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": remaining,
        }
    )


@app.post("/api/todos")
@login_required
def create_todo():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Request body must be a JSON object", 400)

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return error("title is required", 400)
    title = title.strip()

    description = data.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        return error("description must be a string", 400)

    priority = data.get("priority", DEFAULT_PRIORITY)
    if priority is None or priority == "":
        priority = DEFAULT_PRIORITY
    priority, err = validate_priority(priority)
    if err:
        return error(err, 400)

    due_date, err = validate_due_date(data.get("due_date"))
    if err:
        return error(err, 400)

    completed = data.get("completed", False)
    if not isinstance(completed, bool):
        return error("completed must be a boolean", 400)

    completed_at = now_iso() if completed else None

    db = get_db()
    db.execute(
        """
        INSERT INTO todos
            (user_id, title, description, priority, due_date, completed, completed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            g.user["id"],
            title,
            description,
            priority,
            due_date,
            1 if completed else 0,
            completed_at,
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM todos WHERE id = last_insert_rowid()"
    ).fetchone()
    return jsonify(todo_to_dict(row)), 201


@app.get("/api/todos/<int:todo_id>")
@login_required
def get_todo(todo_id):
    row = get_todo_or_none(todo_id)
    if row is None:
        return error("Todo not found", 404)
    return jsonify(todo_to_dict(row))


@app.patch("/api/todos/<int:todo_id>")
@login_required
def update_todo(todo_id):
    row = get_todo_or_none(todo_id)
    if row is None:
        return error("Todo not found", 404)

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Request body must be a JSON object", 400)

    fields = {}
    if "title" in data:
        title = data["title"]
        if not isinstance(title, str) or not title.strip():
            return error("title is required", 400)
        fields["title"] = title.strip()

    if "description" in data:
        description = data["description"]
        if description is None:
            description = ""
        if not isinstance(description, str):
            return error("description must be a string", 400)
        fields["description"] = description

    if "priority" in data:
        priority = data["priority"]
        if priority is None or priority == "":
            priority = DEFAULT_PRIORITY
        priority, err = validate_priority(priority)
        if err:
            return error(err, 400)
        fields["priority"] = priority

    if "due_date" in data:
        due_date, err = validate_due_date(data["due_date"])
        if err:
            return error(err, 400)
        fields["due_date"] = due_date

    if "completed" in data:
        completed = data["completed"]
        if not isinstance(completed, bool):
            return error("completed must be a boolean", 400)
        fields["completed"] = 1 if completed else 0

    if not fields:
        return jsonify(todo_to_dict(row))

    db = get_db()
    assignments = []
    values = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        values.append(value)

    if "completed" in fields:
        if fields["completed"]:
            assignments.append("completed_at = ?")
            values.append(now_iso())
        else:
            assignments.append("completed_at = ?")
            values.append(None)

    values.append(todo_id)
    values.append(g.user["id"])
    db.execute(
        f"UPDATE todos SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
        values,
    )
    db.commit()

    row = get_todo_or_none(todo_id)
    return jsonify(todo_to_dict(row))


@app.delete("/api/todos/<int:todo_id>")
@login_required
def delete_todo(todo_id):
    row = get_todo_or_none(todo_id)
    if row is None:
        return error("Todo not found", 404)
    db = get_db()
    db.execute(
        "DELETE FROM todos WHERE id = ? AND user_id = ?",
        (todo_id, g.user["id"]),
    )
    db.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
