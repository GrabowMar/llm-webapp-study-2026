"""Kanban board: Flask API and frontend server."""

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "kanban.db"

STATUSES = ("todo", "in_progress", "done")
PRIORITIES = ("low", "medium", "high")
TOKEN_TTL = timedelta(days=30)
USERNAME_RE = re.compile(r"^\S(.{0,62}\S)?$")
TITLE_MAX = 200
DESCRIPTION_MAX = 5000
PASSWORD_MIN = 4
PASSWORD_MAX = 128

DUMMY_HASH = generate_password_hash("dummy-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


class ApiError(Exception):
    def __init__(self, status, message, fields=None):
        self.status = status
        self.message = message
        self.fields = fields


def error_response(status, message, fields=None):
    body = {"error": message}
    if fields:
        body["fields"] = fields
    return jsonify(body), status


@app.errorhandler(ApiError)
def handle_api_error(e):
    return error_response(e.status, e.message, e.fields)


@app.errorhandler(HTTPException)
def handle_http_error(e):
    if request.path.startswith("/api"):
        return error_response(e.code or 500, e.description or e.name)
    return e


@app.errorhandler(Exception)
def handle_unexpected(e):
    app.logger.exception("unhandled error")
    return error_response(500, "Internal server error")


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
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
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL CHECK (status IN ('todo','in_progress','done')),
                priority TEXT NOT NULL CHECK (priority IN ('low','medium','high')),
                position INTEGER NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position);
            """
        )
    finally:
        conn.close()


init_db()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        return None
    return row


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    fields = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "Username is required"
    else:
        username = username.strip()
        if not USERNAME_RE.match(username):
            fields["username"] = (
                "Username must be 1-64 characters"
            )
    if not isinstance(password, str) or not password:
        fields["password"] = "Password is required"
    elif len(password) < PASSWORD_MIN:
        fields["password"] = f"Password must be at least {PASSWORD_MIN} characters"
    elif len(password) > PASSWORD_MAX:
        fields["password"] = f"Password must be at most {PASSWORD_MAX} characters"
    if fields:
        raise ApiError(400, "Validation failed", fields)
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "Username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now_iso(),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], expires),
    )
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return {"username": user["username"]}


@app.post("/api/auth/logout")
def logout():
    require_user()
    header = request.headers.get("Authorization", "")
    token = header.split(None, 1)[1].strip()
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    return "", 204


def task_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def validate_title(value, fields):
    if not isinstance(value, str) or not value.strip():
        fields["title"] = "Title is required"
        return None
    value = value.strip()
    if len(value) > TITLE_MAX:
        fields["title"] = f"Title must be at most {TITLE_MAX} characters"
        return None
    return value


def validate_description(value, fields):
    if not isinstance(value, str):
        fields["description"] = "Description must be a string"
        return None
    if len(value) > DESCRIPTION_MAX:
        fields["description"] = f"Description must be at most {DESCRIPTION_MAX} characters"
        return None
    return value


def validate_choice(name, label, value, choices, fields):
    if not isinstance(value, str) or value not in choices:
        fields[name] = f"{label} must be one of: {', '.join(choices)}"
        return None
    return value


def validate_position(value, fields):
    if not is_int(value) or value < 1:
        fields["position"] = "Position must be an integer of at least 1"
        return None
    return value


def column_ids(conn, status):
    rows = conn.execute(
        "SELECT id FROM tasks WHERE status = ? ORDER BY position, id", (status,)
    ).fetchall()
    return [r["id"] for r in rows]


def renumber(conn, status, ids):
    for pos, task_id in enumerate(ids, start=1):
        conn.execute(
            "UPDATE tasks SET position = ? WHERE id = ? AND position != ?",
            (pos, task_id, pos),
        )


def fetch_task(conn, task_id):
    return conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()


def get_or_404(conn, task_id):
    row = fetch_task(conn, task_id)
    if row is None:
        raise ApiError(404, "Task not found")
    return row


@app.get("/api/tasks")
def list_tasks():
    status = request.args.get("status")
    priority = request.args.get("priority")
    fields = {}
    if status is not None and status not in STATUSES:
        fields["status"] = f"Status must be one of: {', '.join(STATUSES)}"
    if priority is not None and priority not in PRIORITIES:
        fields["priority"] = f"Priority must be one of: {', '.join(PRIORITIES)}"
    if fields:
        raise ApiError(400, "Validation failed", fields)
    where, params = [], []
    if status is not None:
        where.append("status = ?")
        params.append(status)
    if priority is not None:
        where.append("priority = ?")
        params.append(priority)
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    conn = db()
    rows = conn.execute(
        f"SELECT * FROM tasks {clause} ORDER BY "
        "CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, "
        "position, id",
        params,
    ).fetchall()
    counts = {s: 0 for s in STATUSES}
    for r in rows:
        counts[r["status"]] += 1
    return {"items": [task_dict(r) for r in rows], "total": len(rows), "counts": counts}


@app.post("/api/tasks")
def create_task():
    require_user()
    data = json_body()
    fields = {}
    title = validate_title(data.get("title"), fields)
    description = ""
    if data.get("description") is not None:
        description = validate_description(data["description"], fields)
    status = "todo"
    if "status" in data:
        status = validate_choice("status", "Status", data["status"], STATUSES, fields)
    priority = "medium"
    if "priority" in data:
        priority = validate_choice("priority", "Priority", data["priority"], PRIORITIES, fields)
    position = None
    if data.get("position") is not None:
        position = validate_position(data["position"], fields)
    if fields:
        raise ApiError(400, "Validation failed", fields)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        ids = column_ids(conn, status)
        index = len(ids) if position is None else min(position - 1, len(ids))
        cur = conn.execute(
            "INSERT INTO tasks (title, description, status, priority, position, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (title, description, status, priority, index + 1, now_iso()),
        )
        ids.insert(index, cur.lastrowid)
        renumber(conn, status, ids)
        row = fetch_task(conn, cur.lastrowid)
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return jsonify(task_dict(row)), 201


@app.get("/api/tasks/<int:task_id>")
def get_task(task_id):
    return task_dict(get_or_404(db(), task_id))


@app.patch("/api/tasks/<int:task_id>")
def update_task(task_id):
    require_user()
    data = json_body()
    fields = {}
    changes = {}
    if "title" in data:
        v = validate_title(data["title"], fields)
        if v is not None:
            changes["title"] = v
    if "description" in data:
        v = validate_description(data["description"], fields)
        if v is not None:
            changes["description"] = v
    if "status" in data:
        v = validate_choice("status", "Status", data["status"], STATUSES, fields)
        if v is not None:
            changes["status"] = v
    if "priority" in data:
        v = validate_choice("priority", "Priority", data["priority"], PRIORITIES, fields)
        if v is not None:
            changes["priority"] = v
    if "position" in data:
        v = validate_position(data["position"], fields)
        if v is not None:
            changes["position"] = v
    if fields:
        raise ApiError(400, "Validation failed", fields)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = get_or_404(conn, task_id)
        old_status = row["status"]
        new_status = changes.get("status", old_status)
        if new_status != old_status or "position" in changes:
            old_ids = column_ids(conn, old_status)
            old_ids.remove(task_id)
            if new_status == old_status:
                target_ids = old_ids
            else:
                target_ids = column_ids(conn, new_status)
            if "position" in changes:
                index = min(changes["position"] - 1, len(target_ids))
            else:
                index = len(target_ids)
            target_ids.insert(index, task_id)
            if new_status != old_status:
                conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id))
                renumber(conn, old_status, old_ids)
            renumber(conn, new_status, target_ids)
        sets = ["updated_at = ?"]
        params = [now_iso()]
        for key in ("title", "description", "priority"):
            if key in changes:
                sets.append(f"{key} = ?")
                params.append(changes[key])
        params.append(task_id)
        conn.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", params)
        row = fetch_task(conn, task_id)
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return task_dict(row)


@app.delete("/api/tasks/<int:task_id>")
def delete_task(task_id):
    require_user()
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = get_or_404(conn, task_id)
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        renumber(conn, row["status"], column_ids(conn, row["status"]))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return "", 204


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
