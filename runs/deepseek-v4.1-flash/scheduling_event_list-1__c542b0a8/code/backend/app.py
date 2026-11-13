"""Event calendar API and frontend host."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "calendar.db"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_time);
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def isoformat_utc(value: datetime) -> str:
    """Return an ISO-8601 representation in UTC with a trailing Z."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    value = value.astimezone(timezone.utc)
    text = value.isoformat()
    if text.endswith("+00:00"):
        text = text[:-6] + "Z"
    return text


def parse_datetime(value: object) -> datetime | None:
    """Parse an ISO date-time. Values without an offset are treated as UTC."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_range_value(value: str, end_of_day: bool = False) -> datetime | None:
    if DATE_ONLY.match(value):
        try:
            day = date.fromisoformat(value)
        except ValueError:
            return None
        at = time.max if end_of_day else time.min
        return datetime.combine(day, at, tzinfo=timezone.utc)
    return parse_datetime(value)


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_error: object) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def row_to_event(row: sqlite3.Row) -> dict:
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


def error_response(message: str, status: int = 400, errors: dict | None = None):
    payload: dict = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


PASSWORD_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_ITERATIONS
    )
    return f"pbkdf2_sha256${PASSWORD_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            int(iterations),
        )
        return secrets.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def current_username() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT username FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    return row["username"] if row else None


def require_auth() -> str | None:
    return current_username()


def credentials_from_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, None, "Username is required."
    if not isinstance(password, str) or not password:
        return None, None, "Password is required."
    return username.strip(), password, None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    username, password, problem = credentials_from_body()
    if problem:
        return error_response(problem)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), isoformat_utc(utcnow())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error_response("Username is already taken.", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, problem = credentials_from_body()
    if problem:
        return error_response(problem)
    row = get_db().execute(
        "SELECT username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error_response("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)",
        (token, username, isoformat_utc(utcnow())),
    )
    db.commit()
    return jsonify({"token": token})


def validate_event(body: object):
    """Return (data, errors). Description/location absent become None."""
    if not isinstance(body, dict):
        body = {}
    errors: dict[str, str] = {}
    data: dict = {}

    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    else:
        data["title"] = title.strip()

    for field in ("description", "location"):
        value = body.get(field)
        if value is None:
            data[field] = None
        elif not isinstance(value, str):
            errors[field] = f"{field.capitalize()} must be text."
        else:
            data[field] = value

    start_raw = body.get("start_time")
    end_raw = body.get("end_time")
    start = parse_datetime(start_raw)
    end = parse_datetime(end_raw)
    if start is None:
        errors["start_time"] = "A valid start time is required."
    if end is None:
        errors["end_time"] = "A valid end time is required."
    if start is not None and end is not None and end < start:
        errors["end_time"] = "End time must not be before the start time."
    if start is not None:
        data["start_time"] = isoformat_utc(start)
    if end is not None:
        data["end_time"] = isoformat_utc(end)
    return data, errors


@app.get("/api/events")
def list_events():
    db = get_db()
    clauses: list[str] = []
    params: list[str] = []

    start_raw = request.args.get("start_date")
    end_raw = request.args.get("end_date")
    if start_raw:
        start = parse_range_value(start_raw)
        if start is None:
            return error_response("Invalid start_date.")
        clauses.append("julianday(end_time) >= julianday(?)")
        params.append(isoformat_utc(start))
    if end_raw:
        end = parse_range_value(end_raw, end_of_day=True)
        if end is None:
            return error_response("Invalid end_date.")
        clauses.append("julianday(start_time) <= julianday(?)")
        params.append(isoformat_utc(end))

    sql = "SELECT * FROM events"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY julianday(start_time) ASC, id ASC"
    rows = db.execute(sql, params).fetchall()
    items = [row_to_event(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


@app.post("/api/events")
def create_event():
    username = require_auth()
    if username is None:
        return error_response("Authentication required.", 401)
    data, errors = validate_event(request.get_json(silent=True))
    if errors:
        return error_response("Please correct the highlighted fields.", 400, errors)
    db = get_db()
    cursor = db.execute(
        """INSERT INTO events
           (title, description, location, start_time, end_time, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            data["title"],
            data["description"],
            data["location"],
            data["start_time"],
            data["end_time"],
            isoformat_utc(utcnow()),
            username,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(row_to_event(row)), 201


def find_event(event_id: int) -> sqlite3.Row | None:
    return get_db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row = find_event(event_id)
    if row is None:
        return error_response("Event not found.", 404)
    return jsonify(row_to_event(row))


@app.put("/api/events/<int:event_id>")
def update_event(event_id: int):
    username = require_auth()
    if username is None:
        return error_response("Authentication required.", 401)
    row = find_event(event_id)
    if row is None:
        return error_response("Event not found.", 404)
    data, errors = validate_event(request.get_json(silent=True))
    if errors:
        return error_response("Please correct the highlighted fields.", 400, errors)
    db = get_db()
    db.execute(
        """UPDATE events
           SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?
           WHERE id = ?""",
        (
            data["title"],
            data["description"],
            data["location"],
            data["start_time"],
            data["end_time"],
            event_id,
        ),
    )
    db.commit()
    updated = find_event(event_id)
    return jsonify(row_to_event(updated))


@app.delete("/api/events/<int:event_id>")
def delete_event(event_id: int):
    username = require_auth()
    if username is None:
        return error_response("Authentication required.", 401)
    row = find_event(event_id)
    if row is None:
        return error_response("Event not found.", 404)
    db = get_db()
    db.execute("DELETE FROM events WHERE id = ?", (event_id,))
    db.commit()
    return "", 204


@app.errorhandler(404)
def not_found(_error: object):
    if request.path.startswith("/api/"):
        return error_response("Not found.", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
