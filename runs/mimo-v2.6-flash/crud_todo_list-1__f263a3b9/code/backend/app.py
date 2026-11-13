"""Flask entry point: the /api JSON API plus the built frontend."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or BASE_DIR / "data")
DB_PATH = DATA_DIR / "todos.db"

PRIORITIES = ("low", "medium", "high")
TODO_FIELDS = frozenset({"title", "description", "priority", "due_date", "completed"})
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
MAX_TITLE_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 5000
MAX_USERNAME_LENGTH = 50
MAX_PASSWORD_LENGTH = 128
PBKDF2_ITERATIONS = 200_000

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos (user_id);
"""


class ApiError(Exception):
    """An error rendered as a JSON body with the given status."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------- database


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# ---------------------------------------------------------------- helpers


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            algorithm.removeprefix("pbkdf2_"),
            password.encode(),
            bytes.fromhex(salt),
            int(iterations),
        )
    except (ValueError, TypeError, KeyError):
        return False
    return hmac.compare_digest(digest.hex(), expected)


def get_json_object() -> dict[str, Any]:
    data = request.get_json(silent=True, force=True)
    if data is None:
        if request.get_data():
            raise ApiError("invalid JSON body")
        return {}
    if not isinstance(data, dict):
        raise ApiError("request body must be a JSON object")
    return data


def signed_in_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM sessions s"
            " JOIN users u ON u.id = s.user_id WHERE s.token = ?",
            (token,),
        )
        .fetchone()
    )
    return row


def require_auth(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = signed_in_user()
        if user is None:
            raise ApiError("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def account_fields(data: dict[str, Any]) -> tuple[str, str]:
    username = data.get("username")
    password = data.get("password")
    if username is None or (isinstance(username, str) and not username.strip()):
        raise ApiError("username is required")
    if not isinstance(username, str):
        raise ApiError("username must be a string")
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        raise ApiError(f"username must be at most {MAX_USERNAME_LENGTH} characters")
    if password is None or (isinstance(password, str) and not password.strip()):
        raise ApiError("password is required")
    if not isinstance(password, str):
        raise ApiError("password must be a string")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ApiError(f"password must be at most {MAX_PASSWORD_LENGTH} characters")
    return username, password


def validate_title(value: Any) -> str:
    if value is None:
        raise ApiError("title is required")
    if not isinstance(value, str):
        raise ApiError("title must be a string")
    title = value.strip()
    if not title:
        raise ApiError("title is required")
    if len(title) > MAX_TITLE_LENGTH:
        raise ApiError(f"title must be at most {MAX_TITLE_LENGTH} characters")
    return title


def validate_description(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError("description must be a string")
    if len(value) > MAX_DESCRIPTION_LENGTH:
        raise ApiError(
            f"description must be at most {MAX_DESCRIPTION_LENGTH} characters"
        )
    return value.strip() or None


def normalize_priority(value: Any) -> str:
    if isinstance(value, bool):
        raise ApiError("priority must be one of: low, medium, high")
    if isinstance(value, int):
        value = str(value)
    if isinstance(value, str):
        candidate = value.strip().lower()
        if candidate in PRIORITIES:
            return candidate
        if candidate in ("1", "2", "3"):
            return PRIORITIES[int(candidate) - 1]
    raise ApiError("priority must be one of: low, medium, high")


def validate_due_date(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError("due_date must be a string in YYYY-MM-DD format")
    candidate = value.strip()
    if not candidate:
        return None
    try:
        return datetime.fromisoformat(candidate.replace("Z", "+00:00")).date().isoformat()
    except ValueError:
        raise ApiError("due_date must be a valid date in YYYY-MM-DD format") from None


def validate_completed(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ApiError("completed must be a boolean")


def validate_todo_fields(data: dict[str, Any], creating: bool) -> dict[str, Any]:
    for key in data:
        if key not in TODO_FIELDS:
            raise ApiError(f"unknown field: {key}")
    fields: dict[str, Any] = {}
    if creating:
        if "title" not in data:
            raise ApiError("title is required")
        fields["title"] = validate_title(data["title"])
    elif "title" in data:
        fields["title"] = validate_title(data["title"])
    if "description" in data:
        fields["description"] = validate_description(data["description"])
    if "priority" in data:
        fields["priority"] = normalize_priority(data["priority"])
    if "due_date" in data:
        fields["due_date"] = validate_due_date(data["due_date"])
    if "completed" in data:
        fields["completed"] = validate_completed(data["completed"])
    return fields


def todo_json(row: sqlite3.Row) -> dict[str, Any]:
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


def find_own_todo(todo_id: int) -> sqlite3.Row:
    row = (
        get_db()
        .execute(
            "SELECT * FROM todos WHERE id = ? AND user_id = ?",
            (todo_id, g.user["id"]),
        )
        .fetchone()
    )
    if row is None:
        raise ApiError("todo not found", 404)
    return row


def query_int(name: str, default: int, minimum: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(f"{name} must be an integer") from None
    if value < minimum:
        raise ApiError(f"{name} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise ApiError(f"{name} must be at most {maximum}")
    return value


# ---------------------------------------------------------------- errors


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError) -> tuple[Any, int]:
    return jsonify({"error": error.message}), error.status


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException) -> Any:
    if request.path.startswith("/api"):
        return jsonify({"error": error.description or "error"}), error.code
    if error.code == 404 and (DIST_DIR / "index.html").is_file():
        return send_from_directory(DIST_DIR, "index.html")
    return error


@app.errorhandler(Exception)
def handle_unexpected(error: Exception) -> Any:
    app.logger.exception("unhandled error: %s", error)
    if request.path.startswith("/api"):
        return jsonify({"error": "internal server error"}), 500
    if isinstance(error, HTTPException):
        return error
    return "Internal Server Error", 500


# ---------------------------------------------------------------- auth


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register() -> tuple[Any, int]:
    data = get_json_object()
    username, password = account_fields(data)
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), utc_now()),
        )
    except sqlite3.IntegrityError:
        raise ApiError("username is already taken", 409) from None
    db.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login() -> tuple[Any, int]:
    data = get_json_object()
    username, password = account_fields(data)
    row = (
        get_db()
        .execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username,),
        )
        .fetchone()
    )
    if row is None or not check_password(password, row["password_hash"]):
        raise ApiError("invalid username or password", 401)
    db = get_db()
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utc_now()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- todos


@app.get("/api/todos")
@require_auth
def list_todos() -> Any:
    clauses = ["user_id = ?"]
    params: list[Any] = [g.user["id"]]

    completed = request.args.get("completed")
    if completed is not None and completed != "":
        lowered = completed.strip().lower()
        if lowered in ("true", "1"):
            clauses.append("completed = 1")
        elif lowered in ("false", "0"):
            clauses.append("completed = 0")
        else:
            raise ApiError("completed must be true or false")

    priority = request.args.get("priority")
    if priority is not None and priority != "":
        clauses.append("priority = ?")
        params.append(normalize_priority(priority))

    page = query_int("page", 1, minimum=1)
    page_size = query_int("page_size", DEFAULT_PAGE_SIZE, minimum=1, maximum=MAX_PAGE_SIZE)

    where = " AND ".join(clauses)
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM todos WHERE {where}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM todos WHERE {where}"
        " ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC,"
        " created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    items = [todo_json(row) for row in rows]
    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(total - offset - len(items), 0),
        }
    )


@app.post("/api/todos")
@require_auth
def create_todo() -> tuple[Any, int]:
    data = get_json_object()
    fields = validate_todo_fields(data, creating=True)
    completed = fields.get("completed", False)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO todos (user_id, title, description, priority, due_date,"
        " completed, completed_at, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            fields["title"],
            fields.get("description"),
            fields.get("priority", "medium"),
            fields.get("due_date"),
            int(completed),
            utc_now() if completed else None,
            utc_now(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(todo_json(row)), 201


@app.get("/api/todos/<int:todo_id>")
@require_auth
def get_todo(todo_id: int) -> Any:
    return jsonify(todo_json(find_own_todo(todo_id)))


@app.patch("/api/todos/<int:todo_id>")
@require_auth
def update_todo(todo_id: int) -> Any:
    data = get_json_object()
    existing = find_own_todo(todo_id)
    fields = validate_todo_fields(data, creating=False)
    if not fields:
        return jsonify(todo_json(existing))

    assignments: list[str] = []
    values: list[Any] = []
    for key, value in fields.items():
        if key == "completed":
            completed_at = existing["completed_at"]
            if value and not existing["completed"]:
                completed_at = utc_now()
            elif not value:
                completed_at = None
            assignments.append("completed = ?")
            values.append(int(value))
            assignments.append("completed_at = ?")
            values.append(completed_at)
        else:
            assignments.append(f"{key} = ?")
            values.append(value)

    db = get_db()
    db.execute(
        f"UPDATE todos SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
        [*values, todo_id, g.user["id"]],
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    return jsonify(todo_json(row))


@app.delete("/api/todos/<int:todo_id>")
@require_auth
def delete_todo(todo_id: int) -> Any:
    find_own_todo(todo_id)
    db = get_db()
    db.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"]))
    db.commit()
    return jsonify({"deleted": True})


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html") -> Any:
    if path == "api" or path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if path != "index.html" and (DIST_DIR / path).is_file():
        return send_from_directory(DIST_DIR, path)
    if (DIST_DIR / "index.html").is_file():
        return send_from_directory(DIST_DIR, "index.html")
    return "frontend build not found", 404


init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000)
