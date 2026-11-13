"""Flask entry point."""

import hashlib
import os
import secrets
import sqlite3
from datetime import UTC, date, datetime
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

PRIORITIES = ("low", "medium", "high")
DEFAULT_PRIORITY = "medium"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
TITLE_MAX = 200
DESCRIPTION_MAX = 5000
USERNAME_MIN, USERNAME_MAX = 3, 50
PASSWORD_MIN, PASSWORD_MAX = 6, 200

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    priority TEXT NOT NULL,
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, completed, due_date);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def validation_error(errors: dict) -> ApiError:
    return ApiError(400, " ".join(errors.values()), errors)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def current_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        token = current_token()
        row = None
        if token:
            row = db().execute(
                "SELECT users.id, users.username FROM tokens "
                "JOIN users ON users.id = tokens.user_id WHERE tokens.token_hash = ?",
                (hash_token(token),),
            ).fetchone()
        if row is None:
            raise ApiError(401, "Authentication required.")
        g.user = {"id": row["id"], "username": row["username"]}
        return view(*args, **kwargs)

    return wrapper


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- auth ----------


def read_credentials(data: dict) -> tuple[str, str]:
    errors = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    else:
        username = username.strip()
        if not USERNAME_MIN <= len(username) <= USERNAME_MAX:
            errors["username"] = (
                f"Username must be between {USERNAME_MIN} and {USERNAME_MAX} characters."
            )
        elif any(ch.isspace() for ch in username):
            errors["username"] = "Username must not contain spaces."
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    elif not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        errors["password"] = (
            f"Password must be between {PASSWORD_MIN} and {PASSWORD_MAX} characters."
        )
    if errors:
        raise validation_error(errors)
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = read_credentials(json_body())
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "Username is already taken.", {"username": "Username is already taken."}
        )
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    if errors:
        raise validation_error(errors)
    conn = db()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user["id"], now_iso()),
    )
    conn.commit()
    return {"token": token}


@app.get("/api/auth/me")
@login_required
def me():
    return g.user


@app.post("/api/auth/logout")
@login_required
def logout():
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(current_token()),))
    conn.commit()
    return "", 204


# ---------- todos ----------


def serialize(row: sqlite3.Row) -> dict:
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


def parse_due_date(value):
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if text == "":
            return None
        if len(text) == 10:
            try:
                return date.fromisoformat(text).isoformat()
            except ValueError:
                pass
    raise ValueError


def validate_todo(data: dict, partial: bool) -> dict:
    errors = {}
    clean = {}

    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required."
        elif len(title.strip()) > TITLE_MAX:
            errors["title"] = f"Title must be at most {TITLE_MAX} characters."
        else:
            clean["title"] = title.strip()

    if "description" in data:
        description = data["description"]
        if description is None:
            clean["description"] = None
        elif not isinstance(description, str):
            errors["description"] = "Description must be a string."
        elif len(description) > DESCRIPTION_MAX:
            errors["description"] = (
                f"Description must be at most {DESCRIPTION_MAX} characters."
            )
        else:
            clean["description"] = description
    elif not partial:
        clean["description"] = None

    if "priority" in data or not partial:
        priority = data.get("priority", DEFAULT_PRIORITY)
        if not isinstance(priority, str) or priority not in PRIORITIES:
            errors["priority"] = "Priority must be one of: low, medium, high."
        else:
            clean["priority"] = priority

    if "due_date" in data or not partial:
        try:
            clean["due_date"] = parse_due_date(data.get("due_date"))
        except ValueError:
            errors["due_date"] = "Due date must be a valid date in YYYY-MM-DD format."

    if "completed" in data or not partial:
        completed = data.get("completed", False)
        if not isinstance(completed, bool):
            errors["completed"] = "Completed must be true or false."
        else:
            clean["completed"] = completed

    if errors:
        raise validation_error(errors)
    return clean


def parse_bool_param(name: str):
    value = request.args.get(name)
    if value is None or value == "":
        return None
    lowered = value.strip().lower()
    if lowered in ("true", "1", "yes"):
        return True
    if lowered in ("false", "0", "no"):
        return False
    raise validation_error({name: f"{name} must be true or false."})


def parse_int_param(name: str, default: int, minimum: int, maximum: int | None = None):
    value = request.args.get(name)
    if value is None or value == "":
        return default
    try:
        number = int(value)
    except ValueError:
        raise validation_error({name: f"{name} must be an integer."})
    if number < minimum or (maximum is not None and number > maximum):
        if maximum is None:
            message = f"{name} must be at least {minimum}."
        else:
            message = f"{name} must be between {minimum} and {maximum}."
        raise validation_error({name: message})
    return number


def get_owned_todo(todo_id: int) -> sqlite3.Row:
    row = db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Todo not found.")
    return row


@app.get("/api/todos")
@login_required
def list_todos():
    completed = parse_bool_param("completed")
    priority = request.args.get("priority") or None
    if priority is not None and priority not in PRIORITIES:
        raise validation_error({"priority": "Priority must be one of: low, medium, high."})
    page = parse_int_param("page", 1, 1)
    page_size = parse_int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    where = ["user_id = ?"]
    params: list = [g.user["id"]]
    if completed is not None:
        where.append("completed = ?")
        params.append(int(completed))
    if priority is not None:
        where.append("priority = ?")
        params.append(priority)
    clause = " AND ".join(where)

    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM todos WHERE {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM todos WHERE {clause} "
        "ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, "
        "created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    remaining = conn.execute(
        "SELECT COUNT(*) FROM todos WHERE user_id = ? AND completed = 0", (g.user["id"],)
    ).fetchone()[0]
    return {
        "items": [serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "remaining": remaining,
    }


@app.post("/api/todos")
@login_required
def create_todo():
    data = validate_todo(json_body(), partial=False)
    created_at = now_iso()
    conn = db()
    cur = conn.execute(
        "INSERT INTO todos (user_id, title, description, priority, due_date, completed, "
        "completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            data["title"],
            data["description"],
            data["priority"],
            data["due_date"],
            int(data["completed"]),
            created_at if data["completed"] else None,
            created_at,
        ),
    )
    conn.commit()
    return serialize(get_owned_todo(cur.lastrowid)), 201


@app.get("/api/todos/<int:todo_id>")
@login_required
def get_todo(todo_id: int):
    return serialize(get_owned_todo(todo_id))


@app.patch("/api/todos/<int:todo_id>")
@login_required
def update_todo(todo_id: int):
    row = get_owned_todo(todo_id)
    data = validate_todo(json_body(), partial=True)
    if not data:
        return serialize(row)
    updates = dict(data)
    if "completed" in data:
        was_completed = bool(row["completed"])
        updates["completed"] = int(data["completed"])
        if data["completed"] and not was_completed:
            updates["completed_at"] = now_iso()
        elif not data["completed"]:
            updates["completed_at"] = None
    assignments = ", ".join(f"{column} = ?" for column in updates)
    conn = db()
    conn.execute(
        f"UPDATE todos SET {assignments} WHERE id = ? AND user_id = ?",
        [*updates.values(), todo_id, g.user["id"]],
    )
    conn.commit()
    return serialize(get_owned_todo(todo_id))


@app.delete("/api/todos/<int:todo_id>")
@login_required
def delete_todo(todo_id: int):
    get_owned_todo(todo_id)
    conn = db()
    conn.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"]))
    conn.commit()
    return "", 204


# ---------- frontend ----------


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str = ""):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
