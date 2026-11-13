"""Flask entry point: JSON API under /api plus the built frontend."""

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "app.db"

MIN_PASSWORD = 8
MAX_PASSWORD = 128
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PRIORITIES = ("low", "medium", "high")

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_salt TEXT NOT NULL,
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
        CREATE INDEX IF NOT EXISTS idx_todos_user ON todos(user_id);
        """
    )
    db.commit()
    db.close()


init_db()


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000
    ).hex()


def error(status: int, message: str):
    return jsonify({"error": message}), status


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_user():
    user = current_user()
    if user is None:
        return None, error(401, "Authentication required. Please sign in.")
    return user, None


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


@app.errorhandler(404)
def not_found(exc):
    return error(404, "Not found.")


@app.errorhandler(405)
def method_not_allowed(exc):
    return error(405, "Method not allowed.")


@app.errorhandler(500)
def internal_error(exc):
    return error(500, "Internal server error.")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body with 'username' and 'password' is required.")
    username = (data.get("username") or "").strip() if isinstance(data.get("username"), str) else ""
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not USERNAME_RE.match(username):
        return error(
            400,
            "Username must be 3-32 characters and use only letters, digits, '_', '.' or '-'.",
        )
    if not password or not isinstance(password, str):
        return error(400, "Password is required.")
    if len(password) < MIN_PASSWORD:
        return error(400, f"Password must be at least {MIN_PASSWORD} characters long.")
    if len(password) > MAX_PASSWORD:
        return error(400, f"Password must be at most {MAX_PASSWORD} characters long.")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error(409, "That username is already taken.")
    salt = secrets.token_hex(16)
    db.execute(
        "INSERT INTO users (username, password_salt, password_hash, created_at)"
        " VALUES (?, ?, ?, ?)",
        (username, salt, hash_password(password, salt), utcnow()),
    )
    db.commit()
    return jsonify({"message": "Account created."}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body with 'username' and 'password' is required.")
    username = data.get("username") if isinstance(data.get("username"), str) else ""
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    db = get_db()
    row = db.execute(
        "SELECT id, password_salt, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if not row or not secrets.compare_digest(
        row["password_hash"], hash_password(password, row["password_salt"])
    ):
        return error(401, "Invalid username or password.")
    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer ") :].strip()
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token = ?", (token,))
        db.commit()
    return jsonify({"message": "Signed out."}), 200


def validate_todo_fields(data: dict, partial: bool):
    """Return (errors, fields) where errors is a list of messages."""
    errors = []
    fields = {}

    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            errors.append("Title is required and must be a non-empty string.")
        elif len(title.strip()) > 200:
            errors.append("Title must be 200 characters or fewer.")
        else:
            fields["title"] = title.strip()

    if "description" in data:
        description = data["description"]
        if description is None:
            fields["description"] = None
        elif not isinstance(description, str):
            errors.append("Description must be a string or null.")
        elif len(description) > 2000:
            errors.append("Description must be 2000 characters or fewer.")
        else:
            fields["description"] = description.strip() or None

    if "priority" in data:
        priority = data["priority"]
        if not isinstance(priority, str) or priority.lower() not in PRIORITIES:
            errors.append(f"Priority must be one of: {', '.join(PRIORITIES)}.")
        else:
            fields["priority"] = priority.lower()

    if "due_date" in data:
        due_date = data["due_date"]
        if due_date is None:
            fields["due_date"] = None
        elif not isinstance(due_date, str) or not DATE_RE.match(due_date):
            errors.append("Due date must be null or a date in YYYY-MM-DD format.")
        else:
            try:
                datetime.strptime(due_date, "%Y-%m-%d")
            except ValueError:
                return errors + ["Due date must be a valid calendar date."], fields
            fields["due_date"] = due_date

    if "completed" in data:
        completed = data["completed"]
        if not isinstance(completed, bool):
            errors.append("Completed must be true or false.")
        else:
            fields["completed"] = completed

    return errors, fields


@app.get("/api/todos")
def list_todos():
    user, err = require_user()
    if err:
        return err

    completed_param = request.args.get("completed")
    priority = request.args.get("priority")
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        return error(400, "Page and page_size must be integers.")
    if page < 1:
        return error(400, "Page must be 1 or greater.")
    if page_size < 1 or page_size > 100:
        return error(400, "Page size must be between 1 and 100.")

    where = ["user_id = ?"]
    params: list = [user["id"]]
    if completed_param is not None:
        if completed_param.lower() in ("true", "1"):
            where.append("completed = 1")
        elif completed_param.lower() in ("false", "0"):
            where.append("completed = 0")
        else:
            return error(400, "Completed filter must be true or false.")
    if priority is not None:
        if priority.lower() not in PRIORITIES:
            return error(400, f"Priority must be one of: {', '.join(PRIORITIES)}.")
        where.append("priority = ?")
        params.append(priority.lower())

    where_sql = " AND ".join(where)
    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM todos WHERE {where_sql}", params
    ).fetchone()[0]
    rows = db.execute(
        f"""
        SELECT * FROM todos WHERE {where_sql}
        ORDER BY completed ASC,
                 (due_date IS NULL) ASC,
                 due_date ASC,
                 created_at DESC,
                 id DESC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [todo_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(total - page * page_size, 0),
        }
    )


@app.post("/api/todos")
def create_todo():
    user, err = require_user()
    if err:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body is required.")
    extra = set(data) - {"title", "description", "priority", "due_date", "completed"}
    if extra:
        return error(400, f"Unknown fields: {', '.join(sorted(extra))}.")
    data.setdefault("priority", "medium")
    data.setdefault("completed", False)
    errors, fields = validate_todo_fields(data, partial=False)
    if errors:
        return error(400, " ".join(errors))

    now = utcnow()
    completed = fields.get("completed", False)
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO todos (user_id, title, description, priority, due_date,
                           completed, completed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user["id"],
            fields["title"],
            fields.get("description"),
            fields["priority"],
            fields.get("due_date"),
            1 if completed else 0,
            now if completed else None,
            now,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(todo_json(row)), 201


def get_owned_todo(db, user_id: int, todo_id: int):
    return db.execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?", (todo_id, user_id)
    ).fetchone()


@app.get("/api/todos/<int:todo_id>")
def get_todo(todo_id: int):
    user, err = require_user()
    if err:
        return err
    row = get_owned_todo(get_db(), user["id"], todo_id)
    if row is None:
        return error(404, "Todo not found.")
    return jsonify(todo_json(row))


@app.patch("/api/todos/<int:todo_id>")
def patch_todo(todo_id: int):
    user, err = require_user()
    if err:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body is required.")
    extra = set(data) - {"title", "description", "priority", "due_date", "completed"}
    if extra:
        return error(400, f"Unknown fields: {', '.join(sorted(extra))}.")
    if not data:
        return error(400, "No fields to update were provided.")

    db = get_db()
    row = get_owned_todo(db, user["id"], todo_id)
    if row is None:
        return error(404, "Todo not found.")

    errors, fields = validate_todo_fields(data, partial=True)
    if errors:
        return error(400, " ".join(errors))

    sets = []
    params: list = []
    for key in ("title", "description", "priority", "due_date"):
        if key in fields:
            sets.append(f"{key} = ?")
            params.append(fields[key])
    if "completed" in fields:
        was_completed = bool(row["completed"])
        is_completed = fields["completed"]
        sets.append("completed = ?")
        params.append(1 if is_completed else 0)
        sets.append("completed_at = ?")
        if is_completed and not was_completed:
            params.append(utcnow())
        elif is_completed:
            params.append(row["completed_at"] or utcnow())
        else:
            params.append(None)
    params.extend([todo_id, user["id"]])
    db.execute(
        f"UPDATE todos SET {', '.join(sets)} WHERE id = ? AND user_id = ?", params
    )
    db.commit()
    row = get_owned_todo(db, user["id"], todo_id)
    return jsonify(todo_json(row))


@app.delete("/api/todos/<int:todo_id>")
def delete_todo(todo_id: int):
    user, err = require_user()
    if err:
        return err
    db = get_db()
    row = get_owned_todo(db, user["id"], todo_id)
    if row is None:
        return error(404, "Todo not found.")
    db.execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, user["id"]))
    db.commit()
    return "", 204


@app.get("/api/<path:_rest>")
def api_not_found(_rest: str):
    return error(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    candidate = (DIST / path).resolve()
    if path and candidate.is_file() and candidate.is_relative_to(DIST.resolve()):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
