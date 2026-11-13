import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, date, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, current_app, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
PRIORITIES = ("low", "medium", "high")
TODO_FIELDS = {"title", "description", "priority", "due_date", "completed"}


def now():
    return datetime.now(UTC).isoformat()


def database():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=15)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def error(message, status=400, errors=None):
    result = {"error": message}
    if errors:
        result["errors"] = errors
    return result, status


def authenticated(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        parts = request.headers.get("Authorization", "").split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return error("Please sign in to continue.", 401)
        token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
        user = database().execute(
            "SELECT users.id, users.username FROM sessions "
            "JOIN users ON users.id = sessions.user_id "
            "WHERE token_hash = ? AND expires_at > ?",
            (token_hash, now()),
        ).fetchone()
        if user is None:
            return error("Your session has expired. Please sign in again.", 401)
        g.user = user
        g.token_hash = token_hash
        return view(*args, **kwargs)

    return wrapped


def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def credentials(body):
    errors = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not re.fullmatch(
        r"[A-Za-z0-9_.-]{3,32}", username.strip()
    ):
        errors["username"] = (
            "Use 3–32 letters, numbers, dots, hyphens, or underscores."
        )
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        errors["password"] = "Use a password between 8 and 128 characters."
    return errors


def validate_todo(body, partial=False):
    values = {}
    errors = {}
    for field in body.keys() - TODO_FIELDS:
        errors[field] = "This field cannot be changed."
    if "title" in body or not partial:
        title = body.get("title")
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 200:
            errors["title"] = "Give your task a title between 1 and 200 characters."
        else:
            values["title"] = title.strip()
    if "description" in body or not partial:
        description = body.get("description", "")
        if description is not None and (
            not isinstance(description, str) or len(description) > 5000
        ):
            errors["description"] = "Keep the description under 5,000 characters."
        else:
            values["description"] = description
    if "priority" in body or not partial:
        priority = body.get("priority", "medium")
        if not isinstance(priority, str) or priority not in PRIORITIES:
            errors["priority"] = "Choose low, medium, or high priority."
        else:
            values["priority"] = priority
    if "due_date" in body or not partial:
        due_date = body.get("due_date")
        if due_date is not None:
            try:
                if not isinstance(due_date, str) or not re.fullmatch(
                    r"\d{4}-\d{2}-\d{2}", due_date
                ):
                    raise ValueError
                date.fromisoformat(due_date)
            except ValueError:
                errors["due_date"] = "Choose a valid date in YYYY-MM-DD format."
        values["due_date"] = due_date
    if "completed" in body or not partial:
        completed = body.get("completed", False)
        if not isinstance(completed, bool):
            errors["completed"] = "Completed must be true or false."
        else:
            values["completed"] = completed
    return values, errors


def serialize(row):
    todo = dict(row)
    todo.pop("user_id", None)
    todo["completed"] = bool(todo["completed"])
    return todo


def owned_todo(todo_id):
    return database().execute(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?",
        (todo_id, g.user["id"]),
    ).fetchone()


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path(os.environ.get("DATA_DIR", "./data")) / "todos.sqlite3"),
        MAX_CONTENT_LENGTH=64 * 1024,
    )
    if config:
        app.config.update(config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db = database()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
                due_date TEXT,
                completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
                completed_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS todos_user_order
                ON todos(user_id, completed, due_date, created_at DESC);
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
            """
        )
        db.close()
        g.pop("db", None)

    @app.teardown_appcontext
    def close_database(_exception):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.errorhandler(HTTPException)
    def handle_http_error(exception):
        if request.path.startswith("/api/"):
            return error(exception.description, exception.code)
        return exception

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; script-src 'self'; style-src 'self'; "
                "img-src 'self' data:; connect-src 'self'; font-src 'self'; "
                "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
            )
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        if body is None:
            return error("Send a JSON object with your username and password.")
        errors = credentials(body)
        if errors:
            return error("Please check your account details.", errors=errors)
        db = database()
        try:
            with db:
                cursor = db.execute(
                    "INSERT INTO users (username, password_hash, created_at) "
                    "VALUES (?, ?, ?)",
                    (
                        body["username"].strip(),
                        generate_password_hash(body["password"]),
                        now(),
                    ),
                )
        except sqlite3.IntegrityError:
            return error(
                "That username is already taken.",
                409,
                {"username": "That username is already taken. Try another."},
            )
        return {"id": cursor.lastrowid, "username": body["username"].strip()}, 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        if body is None:
            return error("Send a JSON object with your username and password.")
        errors = credentials(body)
        if errors:
            return error("Please check your account details.", errors=errors)
        db = database()
        user = db.execute(
            "SELECT * FROM users WHERE username = ?", (body["username"].strip(),)
        ).fetchone()
        password_hash = user["password_hash"] if user else app.config["DUMMY_HASH"]
        valid = check_password_hash(password_hash, body["password"])
        if user is None or not valid:
            return error("The username or password is incorrect.", 401)
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (now(),))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (
                    hashlib.sha256(token.encode()).hexdigest(),
                    user["id"],
                    (datetime.now(UTC) + timedelta(days=30)).isoformat(),
                ),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return dict(g.user)

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = database()
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.get("/api/todos")
    @authenticated
    def list_todos():
        conditions = ["user_id = ?"]
        params = [g.user["id"]]
        errors = {}
        completed = request.args.get("completed")
        if completed is not None:
            if completed not in ("true", "false", "1", "0"):
                errors["completed"] = "Completed must be true or false."
            else:
                conditions.append("completed = ?")
                params.append(int(completed in ("true", "1")))
        priority = request.args.get("priority")
        if priority is not None:
            if priority not in PRIORITIES:
                errors["priority"] = "Choose low, medium, or high priority."
            else:
                conditions.append("priority = ?")
                params.append(priority)
        pagination = {}
        for field, default, maximum in (
            ("page", 1, 2147483647),
            ("page_size", 20, 100),
        ):
            raw = request.args.get(field, str(default))
            try:
                if not re.fullmatch(r"[0-9]{1,10}", raw):
                    raise ValueError
                value = int(raw)
                if not 1 <= value <= maximum:
                    raise ValueError
                pagination[field] = value
            except ValueError:
                errors[field] = f"Choose a whole number between 1 and {maximum}."
        if errors:
            return error("Please check your filters.", errors=errors)
        where = " AND ".join(conditions)
        db = database()
        page, page_size = pagination["page"], pagination["page_size"]
        offset = (page - 1) * page_size
        total = db.execute(
            f"SELECT COUNT(*) FROM todos WHERE {where}", params
        ).fetchone()[0]
        rows = db.execute(
            f"SELECT * FROM todos WHERE {where} "
            "ORDER BY completed ASC, due_date IS NULL ASC, due_date ASC, "
            "created_at DESC, id DESC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
        return {
            "items": [serialize(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(0, total - offset - len(rows)),
        }

    @app.post("/api/todos")
    @authenticated
    def add_todo():
        body = json_body()
        if body is None:
            return error("Send a JSON object with your task details.")
        values, errors = validate_todo(body)
        if errors:
            return error("Please check your task details.", errors=errors)
        timestamp = now()
        db = database()
        with db:
            cursor = db.execute(
                "INSERT INTO todos (user_id, title, description, priority, due_date, "
                "completed, completed_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    g.user["id"],
                    values["title"],
                    values["description"],
                    values["priority"],
                    values["due_date"],
                    values["completed"],
                    timestamp if values["completed"] else None,
                    timestamp,
                ),
            )
        return serialize(owned_todo(cursor.lastrowid)), 201

    @app.get("/api/todos/<int:todo_id>")
    @authenticated
    def get_todo(todo_id):
        row = owned_todo(todo_id)
        if row is None:
            return error("Task not found.", 404)
        return serialize(row)

    @app.patch("/api/todos/<int:todo_id>")
    @authenticated
    def update_todo(todo_id):
        db = database()
        with db:
            db.execute("BEGIN IMMEDIATE")
            row = owned_todo(todo_id)
            if row is None:
                return error("Task not found.", 404)
            body = json_body()
            if body is None:
                return error("Send a JSON object with your task details.")
            values, errors = validate_todo(body, partial=True)
            if errors:
                return error("Please check your task details.", errors=errors)
            if "completed" in values and values["completed"] != bool(row["completed"]):
                values["completed_at"] = now() if values["completed"] else None
            if values:
                assignments = ", ".join(f"{field} = ?" for field in values)
                db.execute(
                    f"UPDATE todos SET {assignments} WHERE id = ? AND user_id = ?",
                    [*values.values(), todo_id, g.user["id"]],
                )
            result = serialize(owned_todo(todo_id))
        return result

    @app.delete("/api/todos/<int:todo_id>")
    @authenticated
    def delete_todo(todo_id):
        db = database()
        with db:
            cursor = db.execute(
                "DELETE FROM todos WHERE id = ? AND user_id = ?",
                (todo_id, g.user["id"]),
            )
        if cursor.rowcount == 0:
            return error("Task not found.", 404)
        return "", 204

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    app.config["DUMMY_HASH"] = generate_password_hash(secrets.token_urlsafe(32))
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
