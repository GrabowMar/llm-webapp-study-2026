"""Flask entry point: JSON API for the event calendar plus the frontend host."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request
from flask import send_from_directory

import db
from auth import hash_password, issue_token, read_token, verify_password

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

MAX_TITLE = 200
MAX_TEXT = 2000
MAX_LOCATION = 200

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ValidationError(Exception):
    """Raised when a request payload fails validation."""

    def __init__(self, message: str, errors: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


# --------------------------------------------------------------------------- #
# storage
# --------------------------------------------------------------------------- #

db.init_db()
SECRET = db.get_secret()


def get_db():
    if "db" not in g:
        g.db = db.connect()
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def error_response(status: int, message: str, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if body is None:
        raise ValidationError("A JSON object body is required.")
    if not isinstance(body, dict):
        raise ValidationError("A JSON object body is required.")
    return body


def parse_datetime(value: Any, field: str) -> datetime:
    """Parse an ISO-8601 date-time; values without an offset are treated as UTC."""
    label = field.replace("_", " ")
    if value is None:
        raise ValidationError(f"{label} is required.", {field: f"{label} is required."})
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(
            f"{label} is required.", {field: f"{label} is required."}
        )
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise ValidationError(
            f"{label} must be a valid ISO-8601 date-time (for example 2024-05-04T10:00:00Z).",
            {field: f"{label} must be a valid ISO-8601 date-time."},
        )
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_datetime(value: datetime) -> str:
    """Render a date-time as UTC with a trailing Z."""
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_iso() -> str:
    return format_datetime(datetime.now(timezone.utc))


def parse_boundary(value: str, field: str, end_of_day: bool) -> datetime:
    """Parse a date or date-time query parameter."""
    text = value.strip()
    if not text:
        raise ValidationError(f"{field} must be a valid ISO date.")
    try:
        if len(text) == 10:
            day = datetime.strptime(text, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if end_of_day:
                day = day.replace(hour=23, minute=59, second=59)
            return day
        return parse_datetime(text, field)
    except ValueError:
        raise ValidationError(f"{field} must be a valid ISO date or date-time.")


def parse_event_payload(body: dict[str, Any]) -> dict[str, Any]:
    """Validate and normalise the fields of an event."""
    errors: dict[str, str] = {}
    values: dict[str, Any] = {}

    title = body.get("title")
    if title is None or (isinstance(title, str) and not title.strip()):
        errors["title"] = "Title is required."
    elif not isinstance(title, str):
        errors["title"] = "Title must be text."
    elif len(title.strip()) > MAX_TITLE:
        errors["title"] = f"Title must be {MAX_TITLE} characters or fewer."
    else:
        values["title"] = title.strip()

    for field in ("start_time", "end_time"):
        try:
            values[field] = parse_datetime(body.get(field), field)
        except ValidationError as error:
            errors[field] = error.errors.get(field, error.message)

    for field in ("description", "location"):
        item = body.get(field)
        label = field.replace("_", " ")
        if item is None:
            values[field] = None
        elif not isinstance(item, str):
            errors[field] = f"{label.capitalize()} must be text."
        elif len(item) > MAX_TEXT:
            errors[field] = f"{label.capitalize()} must be {MAX_TEXT} characters or fewer."
        else:
            values[field] = item.strip() or None

    if "start_time" in values and "end_time" in values:
        if values["end_time"] < values["start_time"]:
            errors["end_time"] = "End time must not be earlier than the start time."

    if errors:
        raise ValidationError("Please correct the highlighted fields.", errors)
    return values


def serialize_event(row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "created_at": row["created_at"],
        "created_by": row["created_by"],
    }


# --------------------------------------------------------------------------- #
# authentication
# --------------------------------------------------------------------------- #


def find_user(username: str):
    if not username:
        return None
    return get_db().execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()


def current_user() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    username = read_token(token, SECRET)
    if username is None:
        return None
    user = find_user(username)
    if user is None:
        return None
    return user["username"]


def require_user(view: Callable):
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        username = current_user()
        if username is None:
            return error_response(401, "A valid bearer token is required.")
        g.username = username
        return view(*args, **kwargs)

    return wrapper


@app.after_request
def add_cors_headers(response):
    if request.path.startswith("/api/"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Content-Type, Authorization"
        )
        response.headers.setdefault(
            "Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS"
        )
    return response


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    try:
        body = json_body()
    except ValidationError as error:
        return error_response(400, error.message, error.errors)

    errors: dict[str, str] = {}
    username = body.get("username")
    password = body.get("password")

    if username is None or (isinstance(username, str) and not username.strip()):
        errors["username"] = "Username is required."
    elif not isinstance(username, str):
        errors["username"] = "Username must be text."
    elif len(username.strip()) > 64:
        errors["username"] = "Username must be 64 characters or fewer."
    else:
        username = username.strip()

    if password is None or (isinstance(password, str) and not password):
        errors["password"] = "Password is required."
    elif not isinstance(password, str):
        errors["password"] = "Password must be text."
    elif len(password) > 512:
        errors["password"] = "Password must be 512 characters or fewer."

    if errors:
        return error_response(400, "Please correct the highlighted fields.", errors)

    if find_user(username) is not None:
        return error_response(409, "That username is already taken.", {"username": "That username is already taken."})

    connection = get_db()
    connection.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), now_iso()),
    )
    return jsonify({"token": issue_token(username, SECRET), "username": username}), 201


@app.post("/api/auth/login")
def login():
    try:
        body = json_body()
    except ValidationError as error:
        return error_response(400, error.message, error.errors)

    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return error_response(400, "Username and password are required.")

    user = find_user(username)
    if user is None or not verify_password(password, user["password_hash"]):
        return error_response(401, "Invalid username or password.")

    return jsonify({"token": issue_token(user["username"], SECRET)})


@app.get("/api/auth/me")
@require_user
def me():
    return jsonify({"username": g.username})


@app.get("/api/events")
def list_events():
    clauses: list[str] = []
    params: list[Any] = []

    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    try:
        if start_date:
            start = parse_boundary(start_date, "start_date", end_of_day=False)
            clauses.append("start_time >= ?")
            params.append(format_datetime(start))
        if end_date:
            end = parse_boundary(end_date, "end_date", end_of_day=True)
            clauses.append("start_time <= ?")
            params.append(format_datetime(end))
    except ValidationError as error:
        return error_response(400, error.message, error.errors)

    query = "SELECT * FROM events"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY start_time ASC, id ASC"

    rows = get_db().execute(query, params).fetchall()
    items = [serialize_event(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


@app.post("/api/events")
@require_user
def create_event():
    try:
        body = json_body()
        values = parse_event_payload(body)
    except ValidationError as error:
        return error_response(400, error.message, error.errors)

    connection = get_db()
    cursor = connection.execute(
        """
        INSERT INTO events (title, description, location, start_time, end_time, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            values["title"],
            values["description"],
            values["location"],
            format_datetime(values["start_time"]),
            format_datetime(values["end_time"]),
            now_iso(),
            g.username,
        ),
    )
    row = connection.execute(
        "SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_event(row)), 201


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row = get_db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return error_response(404, "Event not found.")
    return jsonify(serialize_event(row))


@app.put("/api/events/<int:event_id>")
@require_user
def update_event(event_id: int):
    connection = get_db()
    row = connection.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return error_response(404, "Event not found.")

    try:
        body = json_body()
        values = parse_event_payload(body)
    except ValidationError as error:
        return error_response(400, error.message, error.errors)

    connection.execute(
        """
        UPDATE events
           SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?
         WHERE id = ?
        """,
        (
            values["title"],
            values["description"],
            values["location"],
            format_datetime(values["start_time"]),
            format_datetime(values["end_time"]),
            event_id,
        ),
    )
    updated = connection.execute(
        "SELECT * FROM events WHERE id = ?", (event_id,)
    ).fetchone()
    return jsonify(serialize_event(updated))


@app.delete("/api/events/<int:event_id>")
@require_user
def delete_event(event_id: int):
    connection = get_db()
    row = connection.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return error_response(404, "Event not found.")
    connection.execute("DELETE FROM events WHERE id = ?", (event_id,))
    return jsonify({"ok": True, "id": event_id})


def serve_index():
    """Serve the built single page application."""
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return (
        "The frontend has not been built yet. Run `npm run build` in frontend/.",
        500,
    )


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return error_response(404, "Not found.")
    return serve_index()


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return error_response(405, "Method not allowed.")
    return serve_index()


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response(404, "Not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return serve_index()
