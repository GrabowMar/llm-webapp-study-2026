"""Todo list API and frontend server."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "todos.db"

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 1000


def utcnow() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    try:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT NOT NULL DEFAULT 'medium',
                due_date TEXT,
                completed INTEGER NOT NULL DEFAULT 0,
                completed_at TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            """
        )
        connection.commit()
    finally:
        connection.close()


app = Flask(__name__, static_folder=None)
init_db()


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, fields: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.fields = fields or {}


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    payload: dict[str, Any] = {"error": error.message}
    if error.fields:
        payload["errors"] = error.fields
    return jsonify(payload), error.status


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ApiError("Request body must be a JSON object.")
    return data


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    row = get_db().execute(
        """
        SELECT users.* FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token = ?
        """,
        (token.strip(),),
    ).fetchone()
    return row


def require_auth(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            raise ApiError("Authentication required.", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def serialize_todo(row: sqlite3.Row) -> dict[str, Any]:
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


def serialize_user(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "created_at": row["created_at"],
    }


def parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes"):
            return True
        if lowered in ("false", "0", "no"):
            return False
    raise ApiError(
        "Completed must be true or false.", fields={"completed": "Completed must be true or false."}
    )


def parse_priority(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(
            "Priority is required.", fields={"priority": "Priority is required."}
        )
    return value.strip()


def parse_due_date(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        message = "Due date must be a valid date (YYYY-MM-DD)."
        raise ApiError(message, fields={"due_date": message})
    text = value.strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        pass
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.date().isoformat()
    except ValueError:
        message = "Due date must be a valid date (YYYY-MM-DD)."
        raise ApiError(message, fields={"due_date": message})


def parse_description(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        message = "Description must be a string."
        raise ApiError(message, fields={"description": message})
    text = value.strip()
    return text or None


def parse_title(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        message = "Title is required."
        raise ApiError(message, fields={"title": message})
    return value.strip()


def collect_validation_errors(errors: list[ApiError]) -> None:
    if not errors:
        return
    fields: dict[str, str] = {}
    for error in errors:
        fields.update(error.fields)
    raise ApiError(errors[0].message, fields=fields)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")

    errors: list[ApiError] = []
    if not isinstance(username, str) or not username.strip():
        message = "Username is required."
        errors.append(ApiError(message, fields={"username": message}))
    elif len(username.strip()) > 80:
        message = "Username must be at most 80 characters."
        errors.append(ApiError(message, fields={"username": message}))
    if not isinstance(password, str) or not password:
        message = "Password is required."
        errors.append(ApiError(message, fields={"password": message}))
    collect_validation_errors(errors)

    username = username.strip()
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError(
            "That username is already taken.",
            409,
            {"username": "That username is already taken."},
        )

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utcnow()),
    )
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize_user(user)), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        message = "Username is required."
        raise ApiError(message, fields={"username": message})
    if not isinstance(password, str) or not password:
        message = "Password is required."
        raise ApiError(message, fields={"password": message})

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@require_auth
def auth_me():
    return jsonify(serialize_user(g.user))


@app.post("/api/auth/logout")
@require_auth
def logout():
    header = request.headers.get("Authorization", "")
    _, _, token = header.partition(" ")
    get_db().execute("DELETE FROM sessions WHERE token = ?", (token.strip(),))
    get_db().commit()
    return "", 204


@app.get("/api/todos")
@require_auth
def list_todos():
    completed_param = request.args.get("completed")
    completed: int | None = None
    if completed_param is not None and completed_param.strip() != "":
        lowered = completed_param.strip().lower()
        if lowered in ("true", "1", "yes"):
            completed = 1
        elif lowered in ("false", "0", "no"):
            completed = 0
        else:
            message = "Invalid completed filter."
            raise ApiError(message, fields={"completed": message})

    priority_param = request.args.get("priority")
    priority = priority_param.strip() if priority_param is not None else None
    if priority == "":
        priority = None

    try:
        page = int(request.args.get("page", "1"))
    except (TypeError, ValueError):
        message = "Page must be a positive integer."
        raise ApiError(message, fields={"page": message})
    if page < 1:
        message = "Page must be a positive integer."
        raise ApiError(message, fields={"page": message})

    try:
        page_size = int(request.args.get("page_size", str(DEFAULT_PAGE_SIZE)))
    except (TypeError, ValueError):
        message = "Page size must be a positive integer."
        raise ApiError(message, fields={"page_size": message})
    if page_size < 1:
        message = "Page size must be a positive integer."
        raise ApiError(message, fields={"page_size": message})
    page_size = min(page_size, MAX_PAGE_SIZE)

    filters = ["user_id = ?"]
    params: list[Any] = [g.user["id"]]
    if completed is not None:
        filters.append("completed = ?")
        params.append(completed)
    if priority is not None:
        filters.append("LOWER(priority) = LOWER(?)")
        params.append(priority)
    where = " AND ".join(filters)

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS count FROM todos WHERE {where}", params
    ).fetchone()["count"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"""
        SELECT * FROM todos
        WHERE {where}
        ORDER BY
            completed ASC,
            CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
            due_date ASC,
            created_at DESC,
            id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, offset],
    ).fetchall()

    remaining = max(total - offset - len(rows), 0)
    return jsonify(
        {
            "items": [serialize_todo(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": remaining,
        }
    )


@app.post("/api/todos")
@require_auth
def create_todo():
    data = json_body()
    errors: list[ApiError] = []

    title = None
    description = None
    priority = "medium"
    due_date = None
    completed = False

    try:
        title = parse_title(data.get("title"))
    except ApiError as error:
        errors.append(error)

    if "description" in data:
        try:
            description = parse_description(data.get("description"))
        except ApiError as error:
            errors.append(error)

    if "priority" in data:
        try:
            priority = parse_priority(data.get("priority"))
        except ApiError as error:
            errors.append(error)

    if "due_date" in data:
        try:
            due_date = parse_due_date(data.get("due_date"))
        except ApiError as error:
            errors.append(error)

    if "completed" in data:
        try:
            completed = parse_bool(data.get("completed"))
        except ApiError as error:
            errors.append(error)

    collect_validation_errors(errors)

    completed_at = utcnow() if completed else None
    created_at = utcnow()
    db = get_db()
    cursor = db.execute(
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
            int(completed),
            completed_at,
            created_at,
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM todos WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_todo(row)), 201


def get_own_todo(todo_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?",
        (todo_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError("Todo not found.", 404)
    return row


@app.get("/api/todos/<int:todo_id>")
@require_auth
def get_todo(todo_id: int):
    return jsonify(serialize_todo(get_own_todo(todo_id)))


@app.patch("/api/todos/<int:todo_id>")
@require_auth
def update_todo(todo_id: int):
    todo = get_own_todo(todo_id)
    data = json_body()

    updates: dict[str, Any] = {}
    errors: list[ApiError] = []

    if "title" in data:
        try:
            updates["title"] = parse_title(data.get("title"))
        except ApiError as error:
            errors.append(error)

    if "description" in data:
        try:
            updates["description"] = parse_description(data.get("description"))
        except ApiError as error:
            errors.append(error)

    if "priority" in data:
        try:
            updates["priority"] = parse_priority(data.get("priority"))
        except ApiError as error:
            errors.append(error)

    if "due_date" in data:
        try:
            updates["due_date"] = parse_due_date(data.get("due_date"))
        except ApiError as error:
            errors.append(error)

    if "completed" in data:
        try:
            completed = parse_bool(data.get("completed"))
        except ApiError as error:
            errors.append(error)
        else:
            updates["completed"] = int(completed)
            if completed and not todo["completed"]:
                updates["completed_at"] = utcnow()
            elif not completed:
                updates["completed_at"] = None

    collect_validation_errors(errors)

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        get_db().execute(
            f"UPDATE todos SET {assignments} WHERE id = ? AND user_id = ?",
            [*updates.values(), todo_id, g.user["id"]],
        )
        get_db().commit()

    row = get_own_todo(todo_id)
    return jsonify(serialize_todo(row))


@app.delete("/api/todos/<int:todo_id>")
@require_auth
def delete_todo(todo_id: int):
    get_own_todo(todo_id)
    get_db().execute(
        "DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"])
    )
    get_db().commit()
    return "", 204


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return jsonify({"error": "Not found."}), 404
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Not found."}), 404


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return jsonify({"error": "Method not allowed."}), 405
    return jsonify({"error": "Method not allowed."}), 405


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    candidate = DIST / path
    if path != "index.html" and candidate.is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Frontend build not found."}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
