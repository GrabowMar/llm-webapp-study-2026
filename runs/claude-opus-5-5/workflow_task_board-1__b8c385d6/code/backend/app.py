"""Flask entry point."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")
TITLE_MAX = 200
DESCRIPTION_MAX = 5000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128

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
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        if conn.in_transaction:
            conn.rollback()
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


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


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error."}), 500


def validation_error(errors: dict) -> ApiError:
    return ApiError(400, "Validation failed.", errors)


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    return db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required.")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, now_iso()),
    )
    return token


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    else:
        username = username.strip()
        if not USERNAME_RE.match(username):
            errors["username"] = (
                "Username must be 3-32 characters using letters, digits, '_', '.' or '-'."
            )
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters."
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters."
    if errors:
        raise validation_error(errors)

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
        if exists:
            raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        user_id = cur.lastrowid
        token = issue_token(user_id)
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        raise validation_error(errors)
    conn = db()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    conn.execute("BEGIN IMMEDIATE")
    try:
        token = issue_token(user["id"])
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return jsonify({"token": token, "username": user["username"], "id": user["id"]})


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    return "", 204


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def validate_fields(data: dict, partial: bool) -> tuple[dict, dict]:
    values, errors = {}, {}

    if "title" in data or not partial:
        title = data.get("title")
        if title is not None and not isinstance(title, str):
            errors["title"] = "Title must be a string."
        elif not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required."
        elif len(title.strip()) > TITLE_MAX:
            errors["title"] = f"Title must be at most {TITLE_MAX} characters."
        else:
            values["title"] = title.strip()

    if "description" in data:
        description = data.get("description")
        if description is None:
            values["description"] = ""
        elif not isinstance(description, str):
            errors["description"] = "Description must be a string."
        elif len(description) > DESCRIPTION_MAX:
            errors["description"] = f"Description must be at most {DESCRIPTION_MAX} characters."
        else:
            values["description"] = description

    if "status" in data:
        status = data.get("status")
        if status not in STATUSES:
            errors["status"] = f"Status must be one of: {', '.join(STATUSES)}."
        else:
            values["status"] = status

    if "priority" in data:
        priority = data.get("priority")
        if priority not in PRIORITIES:
            errors["priority"] = f"Priority must be one of: {', '.join(PRIORITIES)}."
        else:
            values["priority"] = priority

    if partial and "position" in data:
        position = data.get("position")
        if isinstance(position, bool) or not isinstance(position, int) or position < 1:
            errors["position"] = "Position must be a positive integer."
        else:
            values["position"] = position

    return values, errors


def get_task_or_404(task_id: int) -> sqlite3.Row:
    row = db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Task not found.")
    return row


def column_count(conn: sqlite3.Connection, status: str) -> int:
    return conn.execute("SELECT COUNT(*) FROM tasks WHERE status = ?", (status,)).fetchone()[0]


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    priority = request.args.get("priority")
    errors = {}
    if status is not None and status not in STATUSES:
        errors["status"] = f"Status must be one of: {', '.join(STATUSES)}."
    if priority is not None and priority not in PRIORITIES:
        errors["priority"] = f"Priority must be one of: {', '.join(PRIORITIES)}."
    if errors:
        raise validation_error(errors)

    clauses, params = [], []
    if status is not None:
        clauses.append("status = ?")
        params.append(status)
    if priority is not None:
        clauses.append("priority = ?")
        params.append(priority)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db().execute(
        f"""SELECT * FROM tasks {where}
            ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                     position, id""",
        params,
    ).fetchall()
    items = [serialize(r) for r in rows]
    counts = {s: 0 for s in STATUSES}
    for item in items:
        counts[item["status"]] += 1
    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.post("/api/tasks")
@login_required
def create_task():
    data = json_body()
    values, errors = validate_fields(data, partial=False)
    if errors:
        raise validation_error(errors)
    status = values.get("status", "todo")
    priority = values.get("priority", "medium")
    description = values.get("description", "")
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        position = column_count(conn, status) + 1
        ts = now_iso()
        cur = conn.execute(
            """INSERT INTO tasks (title, description, status, priority, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (values["title"], description, status, priority, position, ts, ts),
        )
        task_id = cur.lastrowid
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return jsonify(serialize(get_task_or_404(task_id))), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    return jsonify(serialize(get_task_or_404(task_id)))


@app.patch("/api/tasks/<int:task_id>")
@login_required
def update_task(task_id: int):
    data = json_body()
    values, errors = validate_fields(data, partial=True)
    if errors:
        raise validation_error(errors)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        task = get_task_or_404(task_id)
        old_status, old_pos = task["status"], task["position"]
        new_status = values.get("status", old_status)

        if new_status == old_status:
            n = column_count(conn, old_status)
            new_pos = min(values.get("position", old_pos), n)
            if new_pos < old_pos:
                conn.execute(
                    "UPDATE tasks SET position = position + 1 WHERE status = ? AND position >= ? AND position < ?",
                    (old_status, new_pos, old_pos),
                )
            elif new_pos > old_pos:
                conn.execute(
                    "UPDATE tasks SET position = position - 1 WHERE status = ? AND position > ? AND position <= ?",
                    (old_status, old_pos, new_pos),
                )
        else:
            conn.execute(
                "UPDATE tasks SET position = position - 1 WHERE status = ? AND position > ?",
                (old_status, old_pos),
            )
            n = column_count(conn, new_status)
            new_pos = min(values.get("position", n + 1), n + 1)
            conn.execute(
                "UPDATE tasks SET position = position + 1 WHERE status = ? AND position >= ?",
                (new_status, new_pos),
            )

        conn.execute(
            """UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?, position = ?, updated_at = ?
               WHERE id = ?""",
            (
                values.get("title", task["title"]),
                values.get("description", task["description"]),
                new_status,
                values.get("priority", task["priority"]),
                new_pos,
                now_iso(),
                task_id,
            ),
        )
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return jsonify(serialize(get_task_or_404(task_id)))


@app.delete("/api/tasks/<int:task_id>")
@login_required
def delete_task(task_id: int):
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        task = get_task_or_404(task_id)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.execute(
            "UPDATE tasks SET position = position - 1 WHERE status = ? AND position > ?",
            (task["status"], task["position"]),
        )
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "Frontend not built."}), 404
    return send_from_directory(DIST, "index.html")
