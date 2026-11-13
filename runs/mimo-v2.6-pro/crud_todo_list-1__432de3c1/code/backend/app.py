"""Flask entry point: todo list JSON API + frontend serving."""

import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
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
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "todos.db"

PRIORITIES = ("low", "medium", "high")
DEFAULT_PRIORITY = "medium"
DEFAULT_PAGE_SIZE = 10
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}")

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------


class ApiError(Exception):
    def __init__(self, message, status=400, fields=None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.fields = fields or {}


@app.errorhandler(ApiError)
def handle_api_error(err):
    return json_error(err.message, err.status, err.fields)


def json_error(message, status, fields=None):
    body = {"error": message}
    if fields:
        body["fields"] = fields
    return jsonify(body), status


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

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
CREATE INDEX IF NOT EXISTS idx_todos_user ON todos (user_id);
"""


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


def get_current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    row = get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token.strip(),),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return json_error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return json_error("A JSON object body is required", 400)

    fields = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "Username is required"
    elif len(username.strip()) > 64:
        fields["username"] = "Username must be at most 64 characters"
    if not isinstance(password, str) or not password:
        fields["password"] = "Password is required"
    elif len(password) > 256:
        fields["password"] = "Password must be at most 256 characters"
    if fields:
        return json_error("Please provide a valid username and password", 400, fields)

    username = username.strip()
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return json_error("Username already taken", 409, {"username": "Username already taken"})

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return json_error("A JSON object body is required", 400)

    fields = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "Username is required"
    if not isinstance(password, str) or not password:
        fields["password"] = "Password is required"
    if fields:
        return json_error("Please provide a valid username and password", 400, fields)

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


# --------------------------------------------------------------------------
# Validation helpers
# --------------------------------------------------------------------------


def normalize_due_date(value):
    """Validate and normalize a due date value. Returns YYYY-MM-DD or None."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError("Due date must be a date in YYYY-MM-DD format", 400, {"due_date": "Due date must be a date in YYYY-MM-DD format"})
    raw = value.strip()
    if raw == "":
        return None
    if not DATE_RE.match(raw):
        raise ApiError("Due date must be a date in YYYY-MM-DD format", 400, {"due_date": "Due date must be a date in YYYY-MM-DD format"})
    try:
        parsed = date.fromisoformat(raw[:10])
    except ValueError:
        raise ApiError("Due date must be a date in YYYY-MM-DD format", 400, {"due_date": "Due date must be a date in YYYY-MM-DD format"}) from None
    return parsed.isoformat()


def validate_todo_body(body, partial):
    """Validate a create/update payload.

    Returns a dict with the (normalized) fields present in the payload. When
    ``partial`` is False the required fields must be given. Raises ApiError on
    the first structural problem; per-field problems are collected and raised
    together.
    """
    if not isinstance(body, dict):
        raise ApiError("A JSON object body is required", 400)

    values = {}
    fields = {}

    if (not partial) or ("title" in body):
        raw = body.get("title")
        if not isinstance(raw, str) or not raw.strip():
            fields["title"] = "Title is required"
        elif len(raw.strip()) > 500:
            fields["title"] = "Title must be at most 500 characters"
        else:
            values["title"] = raw.strip()

    if "description" in body:
        raw = body.get("description")
        if raw is None:
            values["description"] = None
        elif not isinstance(raw, str):
            fields["description"] = "Description must be a string"
        elif len(raw) > 5000:
            fields["description"] = "Description must be at most 5000 characters"
        elif raw.strip() == "":
            values["description"] = None
        else:
            values["description"] = raw

    if "priority" in body:
        raw = body.get("priority")
        if not isinstance(raw, str) or raw.strip().lower() not in PRIORITIES:
            fields["priority"] = "Priority must be one of: low, medium, high"
        else:
            values["priority"] = raw.strip().lower()
    elif not partial:
        values["priority"] = DEFAULT_PRIORITY

    if "due_date" in body:
        try:
            values["due_date"] = normalize_due_date(body.get("due_date"))
        except ApiError as err:
            fields["due_date"] = err.fields.get("due_date", err.message)

    if "completed" in body:
        raw = body.get("completed")
        if isinstance(raw, bool):
            values["completed"] = raw
        elif raw in (0, 1):
            values["completed"] = bool(raw)
        else:
            fields["completed"] = "completed must be true or false"

    if fields:
        raise ApiError("Please fix the highlighted fields", 400, fields)
    return values


# --------------------------------------------------------------------------
# Todos
# --------------------------------------------------------------------------


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


def get_own_todo(todo_id):
    row = get_db().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"])
    ).fetchone()
    if row is None:
        raise ApiError("Todo not found", 404)
    return row


def parse_bool_param(raw, name):
    val = str(raw).strip().lower()
    if val in ("true", "1"):
        return True
    if val in ("false", "0"):
        return False
    raise ApiError(f"{name} must be true or false")


def parse_positive_int_param(raw, name, default):
    if raw is None:
        return default
    val = str(raw).strip()
    if not val.isdigit() or int(val) < 1:
        raise ApiError(f"{name} must be a positive integer")
    return int(val)


@app.get("/api/todos")
@login_required
def list_todos():
    where = ["user_id = ?"]
    args = [g.user["id"]]

    if "completed" in request.args:
        where.append("completed = ?")
        args.append(int(parse_bool_param(request.args.get("completed"), "completed")))
    if "priority" in request.args:
        priority = request.args.get("priority", "").strip().lower()
        if priority not in PRIORITIES:
            raise ApiError("priority must be one of: low, medium, high")
        where.append("priority = ?")
        args.append(priority)

    page = parse_positive_int_param(request.args.get("page"), "page", 1)
    page_size = parse_positive_int_param(request.args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE)

    db = get_db()
    where_sql = " AND ".join(where)
    total = db.execute(f"SELECT COUNT(*) FROM todos WHERE {where_sql}", args).fetchone()[0]
    rows = db.execute(
        f"""SELECT * FROM todos WHERE {where_sql}
            ORDER BY completed ASC, (due_date IS NULL) ASC, due_date ASC,
                     created_at DESC, id DESC
            LIMIT ? OFFSET ?""",
        [*args, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [todo_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(0, total - page * page_size),
        }
    )


@app.post("/api/todos")
@login_required
def create_todo():
    values = validate_todo_body(request.get_json(silent=True), partial=False)
    now = now_iso()
    completed = values.get("completed", False)
    db = get_db()
    cursor = db.execute(
        """INSERT INTO todos
           (user_id, title, description, priority, due_date, completed, completed_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            g.user["id"],
            values["title"],
            values.get("description"),
            values["priority"],
            values.get("due_date"),
            int(completed),
            now if completed else None,
            now,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(todo_to_dict(row)), 201


@app.get("/api/todos/<int:todo_id>")
@login_required
def get_todo(todo_id):
    return jsonify(todo_to_dict(get_own_todo(todo_id)))


@app.patch("/api/todos/<int:todo_id>")
@login_required
def update_todo(todo_id):
    row = get_own_todo(todo_id)
    values = validate_todo_body(request.get_json(silent=True), partial=True)

    columns = []
    args = []
    for field in ("title", "description", "priority", "due_date"):
        if field in values:
            columns.append(f"{field} = ?")
            args.append(values[field])

    if "completed" in values:
        new_completed = values["completed"]
        old_completed = bool(row["completed"])
        columns.append("completed = ?")
        args.append(int(new_completed))
        if new_completed and not old_completed:
            columns.append("completed_at = ?")
            args.append(now_iso())
        elif not new_completed and old_completed:
            columns.append("completed_at = NULL")

    if columns:
        db = get_db()
        db.execute(f"UPDATE todos SET {', '.join(columns)} WHERE id = ?", [*args, todo_id])
        db.commit()
        row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()

    return jsonify(todo_to_dict(row))


@app.delete("/api/todos/<int:todo_id>")
@login_required
def delete_todo(todo_id):
    get_own_todo(todo_id)
    db = get_db()
    db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    db.commit()
    return "", 204


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return json_error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
