"""Shared event calendar: JSON API under /api plus frontend serving."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import date, datetime, time, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DIST_DIR = BASE_DIR / "frontend" / "dist"
DB_PATH = DATA_DIR / "calendar.db"

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message, "message": err.message}), err.status


def error(message: str, status: int) -> ApiError:
    return ApiError(message, status)


# --------------------------------------------------------------------------
# database


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
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
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                location TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


# --------------------------------------------------------------------------
# date-time handling


def format_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_dt_string(value, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise error(f"{field} must be a date-time string", 400)
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        raise error(f"{field} must be a valid date-time", 400)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_range_bound(value: str, field: str, *, end: bool) -> datetime:
    """Parse a query date/date-time; bare dates span the whole day."""
    if not isinstance(value, str) or not value.strip():
        raise error(f"{field} must be a date or date-time", 400)
    text = value.strip()
    try:
        day = date.fromisoformat(text)
    except ValueError:
        return parse_dt_string(text, field)
    boundary = time.max if end else time.min
    return datetime.combine(day, boundary, tzinfo=timezone.utc)


# --------------------------------------------------------------------------
# auth


def get_token_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id AS id, u.username AS username"
            " FROM tokens t JOIN users u ON u.id = t.user_id"
            " WHERE t.token = ?",
            (token.strip(),),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_token_user()
        if user is None:
            raise error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise error("request body must be a JSON object", 400)
    return data


def required_string(data: dict, field: str) -> str:
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        raise error(f"{field} is required", 400)
    return value.strip()


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = required_string(data, "username")
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise error("password is required", 400)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), format_dt(datetime.now(timezone.utc))),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise error("username already taken", 409)
    return {"username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise error("username and password are required", 400)
    row = (
        get_db()
        .execute("SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),))
        .fetchone()
    )
    if row is None or not check_password_hash(row["password_hash"], password):
        raise error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], format_dt(datetime.now(timezone.utc))),
    )
    db.commit()
    return {"token": token}


# --------------------------------------------------------------------------
# events


def parse_event_payload(data: dict) -> dict:
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        raise error("title is required", 400)
    if "start_time" not in data or data.get("start_time") is None:
        raise error("start_time is required", 400)
    start = parse_dt_string(data.get("start_time"), "start_time")

    end = None
    if "end_time" in data and data.get("end_time") is not None:
        end = parse_dt_string(data.get("end_time"), "end_time")
        if end < start:
            raise error("end_time must not be before start_time", 400)

    def optional(field: str):
        value = data.get(field, None)
        if value is None:
            return None
        if not isinstance(value, str):
            raise error(f"{field} must be a string", 400)
        return value.strip()

    return {
        "title": title.strip(),
        "description": optional("description"),
        "location": optional("location"),
        "start_time": format_dt(start),
        "end_time": format_dt(end) if end is not None else None,
    }


def event_dict(row: sqlite3.Row) -> dict:
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


@app.get("/api/events")
def list_events():
    conditions = []
    params: list[str] = []

    start_param = request.args.get("start_date")
    end_param = request.args.get("end_date")
    if start_param is not None:
        bound = parse_range_bound(start_param, "start_date", end=False)
        conditions.append("COALESCE(end_time, start_time) >= ?")
        params.append(format_dt(bound))
    if end_param is not None:
        bound = parse_range_bound(end_param, "end_date", end=True)
        conditions.append("start_time <= ?")
        params.append(format_dt(bound))

    sql = "SELECT * FROM events"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY start_time ASC, id ASC"

    rows = get_db().execute(sql, params).fetchall()
    items = [event_dict(row) for row in rows]
    return {"items": items, "total": len(items)}


@app.post("/api/events")
@login_required
def create_event():
    fields = parse_event_payload(json_body())
    created_at = format_dt(datetime.now(timezone.utc))
    db = get_db()
    cursor = db.execute(
        "INSERT INTO events (title, description, location, start_time, end_time, created_at, created_by)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            created_at,
            g.user["username"],
        ),
    )
    db.commit()
    row = get_db().execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return event_dict(row), 201


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row = get_db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise error("event not found", 404)
    return event_dict(row)


@app.put("/api/events/<int:event_id>")
@login_required
def update_event(event_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone() is None:
        raise error("event not found", 404)
    fields = parse_event_payload(json_body())
    db.execute(
        "UPDATE events SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?"
        " WHERE id = ?",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            event_id,
        ),
    )
    db.commit()
    row = get_db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return event_dict(row)


@app.delete("/api/events/<int:event_id>")
@login_required
def delete_event(event_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM events WHERE id = ?", (event_id,)).fetchone() is None:
        raise error("event not found", 404)
    db.execute("DELETE FROM events WHERE id = ?", (event_id,))
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------
# health + frontend


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise error("not found", 404)
    if (DIST_DIR / path).is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")
