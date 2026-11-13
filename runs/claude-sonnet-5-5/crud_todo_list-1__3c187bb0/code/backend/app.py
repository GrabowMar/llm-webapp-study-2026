"""Flask entry point: JSON API under /api and the frontend build."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "todos.db"

PRIORITIES = ("low", "medium", "high")
TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

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
    expires_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id, completed, due_date);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

DUMMY_HASH = generate_password_hash("dummy-password")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


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


def error(message: str, status: int, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user_id() -> int | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = db().execute(
        "SELECT user_id, expires_at FROM tokens WHERE token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        return None
    return row["user_id"]


def auth_required(fn):
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = current_user_id()
        if user_id is None:
            return error("Authentication required", 401)
        g.user_id = user_id
        return fn(*args, **kwargs)

    return wrapper


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
        return error("Request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    else:
        username = username.strip()
        if len(username) < 3 or len(username) > 50:
            errors["username"] = "Username must be 3 to 50 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters"
    elif len(password) > 200:
        errors["password"] = "Password must be at most 200 characters"
    if errors:
        return error("Validation failed", 400, errors)
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), now_iso()),
            )
    except sqlite3.IntegrityError:
        return error("Validation failed", 409, {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Invalid username or password", 401)
    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return error("Invalid username or password", 401)
    if not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    with db() as conn:
        conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now_iso(),))
        conn.execute(
            "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_token(token), row["id"], expires),
        )
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@auth_required
def me():
    row = db().execute("SELECT username FROM users WHERE id = ?", (g.user_id,)).fetchone()
    return jsonify({"username": row["username"]})


@app.post("/api/auth/logout")
@auth_required
def logout():
    header = request.headers.get("Authorization", "").split(None, 1)
    with db() as conn:
        conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(header[1].strip()),))
    return "", 204


def todo_json(row: sqlite3.Row) -> dict:
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


def validate_todo(data: dict, partial: bool) -> tuple[dict, dict]:
    values: dict = {}
    errors: dict = {}

    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required"
        elif len(title.strip()) > 200:
            errors["title"] = "Title must be at most 200 characters"
        else:
            values["title"] = title.strip()

    if "description" in data:
        desc = data["description"]
        if desc is None:
            values["description"] = None
        elif not isinstance(desc, str):
            errors["description"] = "Description must be a string"
        elif len(desc) > 2000:
            errors["description"] = "Description must be at most 2000 characters"
        else:
            values["description"] = desc if desc.strip() else None

    if "priority" in data:
        prio = data["priority"]
        if not isinstance(prio, str) or prio not in PRIORITIES:
            errors["priority"] = "Priority must be one of: " + ", ".join(PRIORITIES)
        else:
            values["priority"] = prio

    if "due_date" in data:
        due = data["due_date"]
        if due is None or due == "":
            values["due_date"] = None
        else:
            ok = isinstance(due, str) and DATE_RE.match(due)
            if ok:
                try:
                    date.fromisoformat(due)
                except ValueError:
                    ok = False
            if ok:
                values["due_date"] = due
            else:
                errors["due_date"] = "Due date must be a valid date in YYYY-MM-DD format"

    if "completed" in data:
        comp = data["completed"]
        if not isinstance(comp, bool):
            errors["completed"] = "Completed must be true or false"
        else:
            values["completed"] = comp

    return values, errors


def get_owned(todo_id: int) -> sqlite3.Row | None:
    return db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
    ).fetchone()


def parse_int_param(name: str, default: int, errors: dict, minimum=1, maximum=None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        val = int(raw)
    except ValueError:
        errors[name] = f"{name} must be an integer"
        return default
    if val < minimum or (maximum is not None and val > maximum):
        rng = f"between {minimum} and {maximum}" if maximum else f"at least {minimum}"
        errors[name] = f"{name} must be {rng}"
        return default
    return val


@app.get("/api/todos")
@auth_required
def list_todos():
    errors: dict = {}
    page = parse_int_param("page", 1, errors)
    page_size = parse_int_param("page_size", DEFAULT_PAGE_SIZE, errors, 1, MAX_PAGE_SIZE)

    where = ["user_id = ?"]
    params: list = [g.user_id]

    completed = request.args.get("completed")
    if completed not in (None, ""):
        low = completed.lower()
        if low in ("true", "1"):
            where.append("completed = 1")
        elif low in ("false", "0"):
            where.append("completed = 0")
        else:
            errors["completed"] = "completed must be true or false"

    priority = request.args.get("priority")
    if priority not in (None, ""):
        if priority in PRIORITIES:
            where.append("priority = ?")
            params.append(priority)
        else:
            errors["priority"] = "Priority must be one of: " + ", ".join(PRIORITIES)

    if errors:
        return error("Validation failed", 400, errors)

    clause = " AND ".join(where)
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM todos WHERE {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM todos WHERE {clause} "
        "ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, "
        "created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [todo_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(0, total - page * page_size),
        }
    )


@app.post("/api/todos")
@auth_required
def create_todo():
    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)
    values, errors = validate_todo(data, partial=False)
    if errors:
        return error("Validation failed", 400, errors)
    completed = values.get("completed", False)
    created = now_iso()
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO todos (user_id, title, description, priority, due_date, "
            "completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                g.user_id,
                values["title"],
                values.get("description"),
                values.get("priority", "medium"),
                values.get("due_date"),
                int(completed),
                created if completed else None,
                created,
            ),
        )
        todo_id = cur.lastrowid
    return jsonify(todo_json(get_owned(todo_id))), 201


@app.get("/api/todos/<int:todo_id>")
@auth_required
def get_todo(todo_id: int):
    row = get_owned(todo_id)
    if row is None:
        return error("Todo not found", 404)
    return jsonify(todo_json(row))


@app.patch("/api/todos/<int:todo_id>")
@auth_required
def update_todo(todo_id: int):
    data = json_body()
    if data is None:
        return error("Request body must be a JSON object", 400)
    row = get_owned(todo_id)
    if row is None:
        return error("Todo not found", 404)
    values, errors = validate_todo(data, partial=True)
    if errors:
        return error("Validation failed", 400, errors)
    if "completed" in values:
        completed = values.pop("completed")
        if completed != bool(row["completed"]):
            values["completed"] = int(completed)
            values["completed_at"] = now_iso() if completed else None
    if values:
        assignments = ", ".join(f"{k} = ?" for k in values)
        with db() as conn:
            conn.execute(
                f"UPDATE todos SET {assignments} WHERE id = ? AND user_id = ?",
                [*values.values(), todo_id, g.user_id],
            )
    return jsonify(todo_json(get_owned(todo_id)))


@app.delete("/api/todos/<int:todo_id>")
@auth_required
def delete_todo(todo_id: int):
    with db() as conn:
        cur = conn.execute(
            "DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user_id)
        )
    if cur.rowcount == 0:
        return error("Todo not found", 404)
    return "", 204


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.description or exc.name, exc.code or 500)
    return exc


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
