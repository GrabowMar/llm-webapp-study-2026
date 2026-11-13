"""Flask entry point for the shared kanban board.

Serves the JSON API under ``/api`` and the built frontend from
``frontend/dist`` at every other path.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DIST = PROJECT_DIR / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "kanban.sqlite3"
SECRET_PATH = DATA_DIR / "secret.key"

STATUSES: tuple[str, ...] = ("todo", "in_progress", "done")
STATUS_LABELS = {"todo": "To Do", "in_progress": "In Progress", "done": "Done"}
PRIORITIES: tuple[str, ...] = ("low", "medium", "high")
EXTRA_PRIORITIES: tuple[str, ...] = ("urgent", "critical", "normal")
TOKEN_MAX_AGE = 60 * 60 * 24 * 30
MAX_TITLE = 200
MAX_DESCRIPTION = 5000
MAX_USERNAME = 64
MAX_PASSWORD = 200

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def normalise_status(value: Any) -> str | None:
    """Map user supplied status spellings onto a canonical status."""
    if not isinstance(value, str):
        return None
    key = value.strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "todo": "todo",
        "to_do": "todo",
        "open": "todo",
        "backlog": "todo",
        "in_progress": "in_progress",
        "inprogress": "in_progress",
        "doing": "in_progress",
        "started": "in_progress",
        "done": "done",
        "complete": "done",
        "completed": "done",
        "finished": "done",
    }
    return aliases.get(key)


def normalise_priority(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    key = value.strip().lower()
    if key in PRIORITIES or key in EXTRA_PRIORITIES:
        return key
    return None


def fail(message: str, status: int = 400, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                priority TEXT NOT NULL DEFAULT 'medium',
                position INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tasks_status_position
                ON tasks (status, position);
            """
        )
        conn.commit()
    finally:
        conn.close()


def load_secret() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        secret = SECRET_PATH.read_text(encoding="utf-8").strip()
        if secret:
            return secret
    secret = secrets.token_hex(32)
    SECRET_PATH.write_text(secret, encoding="utf-8")
    try:
        os.chmod(SECRET_PATH, 0o600)
    except OSError:  # pragma: no cover - best effort on exotic filesystems
        pass
    return secret


SECRET_KEY = load_secret()
token_serializer = URLSafeTimedSerializer(SECRET_KEY, salt="kanban-auth")


def issue_token(user_id: int, username: str) -> str:
    return token_serializer.dumps({"uid": user_id, "username": username})


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    try:
        payload = token_serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(payload, dict):
        return None
    user = get_db().execute(
        "SELECT id, username FROM users WHERE id = ?", (payload.get("uid"),)
    ).fetchone()
    return user


def require_auth(view: Callable[..., Any]):
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return fail("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def json_body() -> dict[str, Any] | None:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return None


def task_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"] or "",
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def column_ids(conn: sqlite3.Connection, status: str, exclude: int | None = None) -> list[int]:
    if exclude is None:
        rows = conn.execute(
            "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id FROM tasks WHERE status = ? AND id <> ? ORDER BY position, id",
            (status, exclude),
        ).fetchall()
    return [row["id"] for row in rows]


def write_positions(conn: sqlite3.Connection, status: str, ids: list[int]) -> None:
    for index, task_id in enumerate(ids, start=1):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (index, task_id))


def place_task(
    conn: sqlite3.Connection, task_id: int, old_status: str, new_status: str, position: int
) -> None:
    """Move a task into ``new_status`` at ``position`` keeping 1..n positions."""
    if old_status == new_status:
        ids = column_ids(conn, old_status, exclude=task_id)
        index = max(0, min(position - 1, len(ids)))
        ids.insert(index, task_id)
        write_positions(conn, old_status, ids)
        return

    source = column_ids(conn, old_status, exclude=task_id)
    write_positions(conn, old_status, source)

    target = column_ids(conn, new_status)
    index = max(0, min(position - 1, len(target)))
    target.insert(index, task_id)
    write_positions(conn, new_status, target)
    conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id))


# --------------------------------------------------------------------------- #
# auth
# --------------------------------------------------------------------------- #
@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return fail("A JSON body with username and password is required", 400)

    username = body.get("username")
    password = body.get("password")
    errors: dict[str, str] = {}

    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) > MAX_PASSWORD:
        errors["password"] = f"Password must be at most {MAX_PASSWORD} characters"
    if errors:
        return fail("; ".join(errors.values()), 400, errors)

    username = username.strip()
    conn = get_db()
    if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return fail("Username is already taken", 409, {"username": "Username is already taken"})

    stamp = now_iso()
    try:
        with conn:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), stamp),
            )
    except sqlite3.IntegrityError:
        return fail("Username is already taken", 409, {"username": "Username is already taken"})

    user_id = cursor.lastrowid
    return (
        jsonify(
            {
                "user": {"id": user_id, "username": username},
                "token": issue_token(user_id, username),
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return fail("A JSON body with username and password is required", 400)

    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return fail("Username and password are required", 400)

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return fail("Invalid username or password", 401)

    return jsonify(
        {
            "token": issue_token(row["id"], row["username"]),
            "user": {"id": row["id"], "username": row["username"]},
        }
    )


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"user": {"id": g.user["id"], "username": g.user["username"]}})


# --------------------------------------------------------------------------- #
# tasks
# --------------------------------------------------------------------------- #
@app.get("/api/tasks")
def list_tasks():
    conn = get_db()

    status_filter = request.args.get("status")
    priority_filter = request.args.get("priority")

    where: list[str] = []
    params: list[Any] = []

    if status_filter is not None and status_filter.strip() != "":
        status = normalise_status(status_filter)
        if status is None:
            return fail(
                "Unknown status filter. Valid statuses: todo, in_progress, done", 400
            )
        where.append("status = ?")
        params.append(status)

    if priority_filter is not None and priority_filter.strip() != "":
        priority = normalise_priority(priority_filter)
        if priority is None:
            return fail(
                "Unknown priority filter. Valid priorities: " + ", ".join(PRIORITIES), 400
            )
        where.append("priority = ?")
        params.append(priority)

    query = (
        "SELECT * FROM tasks"
        + (f" WHERE {' AND '.join(where)}" if where else "")
        + " ORDER BY CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1"
        " WHEN 'done' THEN 2 ELSE 3 END, position, id"
    )
    rows = conn.execute(query, params).fetchall()
    items = [task_json(row) for row in rows]

    counts = {status: 0 for status in STATUSES}
    for item in items:
        if item["status"] in counts:
            counts[item["status"]] += 1

    return jsonify({"items": items, "total": len(items), "counts": counts})


@app.post("/api/tasks")
@require_auth
def create_task():
    body = json_body()
    if body is None:
        return fail("A JSON body is required", 400)

    errors: dict[str, str] = {}

    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > MAX_TITLE:
        errors["title"] = f"Title must be at most {MAX_TITLE} characters"

    description = body.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        errors["description"] = "Description must be a string"
    elif len(description) > MAX_DESCRIPTION:
        errors["description"] = f"Description must be at most {MAX_DESCRIPTION} characters"

    status = "todo"
    if body.get("status") is not None:
        parsed = normalise_status(body.get("status"))
        if parsed is None:
            errors["status"] = "Status must be one of: todo, in_progress, done"
        else:
            status = parsed

    priority = "medium"
    if body.get("priority") is not None:
        parsed = normalise_priority(body.get("priority"))
        if parsed is None:
            errors["priority"] = "Priority must be one of: " + ", ".join(PRIORITIES)
        else:
            priority = parsed

    if errors:
        return fail("; ".join(errors.values()), 400, errors)

    title = title.strip()
    description = description.strip()
    stamp = now_iso()
    conn = get_db()

    with conn:
        position = len(column_ids(conn, status)) + 1
        cursor = conn.execute(
            "INSERT INTO tasks (title, description, status, priority, position,"
            " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, description, status, priority, position, stamp, stamp),
        )
        task_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()

    return jsonify(task_json(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id: int):
    row = get_db().execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return fail("Task not found", 404)
    return jsonify(task_json(row))


@app.patch("/api/tasks/<int:task_id>")
@app.put("/api/tasks/<int:task_id>")
@require_auth
def update_task(task_id: int):
    body = json_body()
    if body is None:
        return fail("A JSON body is required", 400)

    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return fail("Task not found", 404)

    errors: dict[str, str] = {}

    updates: dict[str, Any] = {}

    if "title" in body:
        title = body.get("title")
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required"
        elif len(title.strip()) > MAX_TITLE:
            errors["title"] = f"Title must be at most {MAX_TITLE} characters"
        else:
            updates["title"] = title.strip()

    if "description" in body:
        description = body.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            errors["description"] = "Description must be a string"
        elif len(description) > MAX_DESCRIPTION:
            errors["description"] = f"Description must be at most {MAX_DESCRIPTION} characters"
        else:
            updates["description"] = description

    status = row["status"]
    if "status" in body and body.get("status") is not None:
        parsed = normalise_status(body.get("status"))
        if parsed is None:
            errors["status"] = "Status must be one of: todo, in_progress, done"
        else:
            status = parsed

    if "priority" in body and body.get("priority") is not None:
        parsed = normalise_priority(body.get("priority"))
        if parsed is None:
            errors["priority"] = "Priority must be one of: " + ", ".join(PRIORITIES)
        else:
            updates["priority"] = parsed

    position: int | None = None
    if "position" in body and body.get("position") is not None:
        raw = body.get("position")
        try:
            position = int(raw)
        except (TypeError, ValueError):
            errors["position"] = "Position must be an integer"
        else:
            if position < 1:
                errors["position"] = "Position must be 1 or greater"

    if errors:
        return fail("; ".join(errors.values()), 400, errors)

    stamp = now_iso()
    with conn:
        if status != row["status"]:
            place_task(conn, task_id, row["status"], status, position or 10**6)
        elif position is not None:
            place_task(conn, task_id, row["status"], status, position)

        if updates:
            assignments = ", ".join(f"{key} = ?" for key in updates)
            conn.execute(
                f"UPDATE tasks SET {assignments}, updated_at = ? WHERE id = ?",
                (*updates.values(), stamp, task_id),
            )
        elif status != row["status"] or position is not None:
            conn.execute("UPDATE tasks SET updated_at = ? WHERE id = ?", (stamp, task_id))

        fresh = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()

    return jsonify(task_json(fresh))


@app.delete("/api/tasks/<int:task_id>")
@require_auth
def delete_task(task_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row is None:
        return fail("Task not found", 404)

    with conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        remaining = column_ids(conn, row["status"])
        write_positions(conn, row["status"], remaining)

    return jsonify({"id": task_id, "deleted": True})


# --------------------------------------------------------------------------- #
# misc
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.errorhandler(404)
def handle_404(error):
    if request.path.startswith("/api/"):
        return fail("Not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(error):
    if request.path.startswith("/api/"):
        return fail("Method not allowed", 405)
    return send_from_directory(DIST, "index.html")


@app.after_request
def add_headers(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
    return response


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return fail("Not found", 404)
    candidate = DIST / path
    if candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
