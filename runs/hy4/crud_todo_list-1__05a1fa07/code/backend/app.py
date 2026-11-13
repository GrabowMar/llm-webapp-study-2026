"""Flask entry point: JSON API for a private per-user todo list."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DB_PATH = Path(os.environ.get("TODO_DB_PATH", str(ROOT / "data" / "todos.db")))

PRIORITIES = ("low", "medium", "high")
PRIORITY_ALIASES = {"1": "low", "2": "medium", "3": "high"}
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(str(DB_PATH), timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 5000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS todos (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title        TEXT NOT NULL,
                description  TEXT,
                priority     TEXT NOT NULL DEFAULT 'medium',
                due_date     TEXT,
                completed    INTEGER NOT NULL DEFAULT 0,
                completed_at TEXT,
                created_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


# --------------------------------------------------------------------------- #
# Errors and helpers
# --------------------------------------------------------------------------- #

@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    body = {"error": exc.message, "message": exc.message}
    if exc.errors:
        body["errors"] = exc.errors
    return jsonify(body), exc.status


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": exc.description or exc.name}), exc.code
    if exc.code == 404:
        return send_from_directory(DIST, "index.html")
    return exc


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def require_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    match = re.fullmatch(r"Bearer\s+(\S+)", header.strip(), flags=re.IGNORECASE)
    if not match:
        raise ApiError(401, "Authentication required.")
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (match.group(1),),
    ).fetchone()
    if row is None:
        raise ApiError(401, "Invalid or expired token.")
    return row


def todo_dict(row: sqlite3.Row) -> dict:
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


def get_owned_todo(todo_id: int, user_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, user_id)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Todo not found.")
    return row


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def parse_bool(value, field: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str) and value.strip().lower() in ("true", "false", "1", "0"):
        return value.strip().lower() in ("true", "1")
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ValueError(f"{field} must be a boolean.")


def parse_priority(value) -> str:
    text = str(value).strip().lower()
    text = PRIORITY_ALIASES.get(text, text)
    if text not in PRIORITIES:
        raise ValueError("priority must be one of: low, medium, high.")
    return text


def parse_due_date(value):
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise ValueError("due_date must be an ISO date (YYYY-MM-DD) or null.")
    text = value.strip()
    try:
        date.fromisoformat(text)
        return text
    except ValueError:
        try:
            datetime.fromisoformat(text.replace("Z", "+00:00"))
            return text
        except ValueError:
            raise ValueError("due_date must be an ISO date (YYYY-MM-DD) or null.") from None


def parse_text(value, field: str, *, max_length: int):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string.")
    text = value.strip()
    if not text:
        raise ValueError(f"{field} must not be empty.")
    if len(text) > max_length:
        raise ValueError(f"{field} must be at most {max_length} characters.")
    return text


TODO_FIELDS = ("title", "description", "priority", "due_date", "completed")


def validate_todo_payload(data: dict, *, partial: bool) -> dict:
    values: dict = {}
    errors: dict = {}

    if not partial and "title" not in data:
        errors["title"] = "title is required."
    elif "title" in data:
        try:
            values["title"] = parse_text(data["title"], "title", max_length=255)
        except ValueError as exc:
            errors["title"] = str(exc)

    if "description" in data:
        value = data["description"]
        if value is None:
            values["description"] = None
        elif not isinstance(value, str):
            errors["description"] = "description must be a string or null."
        elif len(value.strip()) > 2000:
            errors["description"] = "description must be at most 2000 characters."
        else:
            values["description"] = value.strip() or None
    if "priority" in data:
        try:
            values["priority"] = parse_priority(data["priority"])
        except ValueError as exc:
            errors["priority"] = str(exc)
    if "due_date" in data:
        try:
            values["due_date"] = parse_due_date(data["due_date"])
        except ValueError as exc:
            errors["due_date"] = str(exc)
    if "completed" in data:
        try:
            values["completed"] = parse_bool(data["completed"], "completed")
        except ValueError as exc:
            errors["completed"] = str(exc)

    unknown = set(data) - set(TODO_FIELDS)
    if unknown:
        errors["_body"] = f"Unknown field(s): {', '.join(sorted(unknown))}."

    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return values


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

@app.post("/api/auth/register")
def register():
    data = json_body()
    errors = {}
    try:
        username = parse_text(data.get("username"), "username", max_length=80)
    except ValueError as exc:
        errors["username"] = str(exc)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required."
    elif len(password) > 200:
        errors["password"] = "password must be at most 200 characters."
    if errors:
        raise ApiError(400, "Validation failed.", errors)

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError(409, "That username is already taken.", {"username": "This username is already taken."})
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(401, "Invalid username or password.")
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# --------------------------------------------------------------------------- #
# Todos
# --------------------------------------------------------------------------- #

@app.get("/api/todos")
def list_todos():
    user = require_user()
    clauses = ["user_id = ?"]
    params: list = [user["id"]]

    completed = request.args.get("completed")
    if completed is not None and completed.strip().lower() in ("true", "false", "1", "0"):
        clauses.append("completed = ?")
        params.append(1 if completed.strip().lower() in ("true", "1") else 0)

    priority = request.args.get("priority")
    if priority is not None and priority.strip():
        clauses.append("priority = ?")
        params.append(PRIORITY_ALIASES.get(priority.strip().lower(), priority.strip().lower()))

    where = " AND ".join(clauses)
    db = get_db()

    def as_int(name: str, default: int, low: int, high: int) -> int:
        raw = request.args.get(name)
        try:
            value = int(raw) if raw is not None else default
        except (TypeError, ValueError):
            return default
        return max(low, min(high, value))

    page = as_int("page", 1, 1, 1_000_000)
    page_size = as_int("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    total = db.execute(f"SELECT COUNT(*) FROM todos WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"""SELECT * FROM todos WHERE {where}
            ORDER BY completed ASC,
                     CASE WHEN due_date IS NULL OR due_date = '' THEN 1 ELSE 0 END ASC,
                     due_date ASC,
                     created_at DESC,
                     id DESC
            LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify({
        "items": [todo_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "remaining": max(0, total - page * page_size),
    })


@app.post("/api/todos")
def create_todo():
    user = require_user()
    values = validate_todo_payload(json_body(), partial=False)
    title = values["title"]
    description = values.get("description")
    priority = values.get("priority", "medium")
    due_date = values.get("due_date")
    completed = values.get("completed", False)
    completed_at = now_iso() if completed else None
    db = get_db()
    cursor = db.execute(
        """INSERT INTO todos
           (user_id, title, description, priority, due_date, completed, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (user["id"], title, description, priority, due_date, int(completed), completed_at, now_iso()),
    )
    db.commit()
    return jsonify(todo_dict(get_owned_todo(cursor.lastrowid, user["id"]))), 201


@app.get("/api/todos/<int:todo_id>")
def get_todo(todo_id: int):
    user = require_user()
    return jsonify(todo_dict(get_owned_todo(todo_id, user["id"])))


@app.patch("/api/todos/<int:todo_id>")
def update_todo(todo_id: int):
    user = require_user()
    existing = get_owned_todo(todo_id, user["id"])
    values = validate_todo_payload(json_body(), partial=True)

    if "completed" in values:
        wanted = values["completed"]
        was = bool(existing["completed"])
        if wanted and not was:
            values["completed_at"] = now_iso()
        elif not wanted and was:
            values["completed_at"] = None

    if not values:
        return jsonify(todo_dict(existing))

    assignments = []
    params = []
    for field, value in values.items():
        assignments.append(f"{field} = ?")
        params.append(int(value) if field == "completed" else value)
    db = get_db()
    db.execute(
        f"UPDATE todos SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
        [*params, todo_id, user["id"]],
    )
    db.commit()
    return jsonify(todo_dict(get_owned_todo(todo_id, user["id"])))


@app.delete("/api/todos/<int:todo_id>")
def delete_todo(todo_id: int):
    user = require_user()
    get_owned_todo(todo_id, user["id"])
    db = get_db()
    db.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, user["id"]))
    db.commit()
    return "", 204


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


# --------------------------------------------------------------------------- #
# Frontend (built by Vite, served by this same process)
# --------------------------------------------------------------------------- #

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError(404, "Not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
