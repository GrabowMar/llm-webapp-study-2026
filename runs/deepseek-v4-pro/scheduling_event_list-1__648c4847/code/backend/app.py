"""Shared event calendar: Flask JSON API + static frontend."""

import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "calendar.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
        _init_db(g.db)
    return g.db


def _init_db(db):
    db.executescript(
        """
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
        """
    )
    db.commit()


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_datetime(value):
    """Parse an ISO-8601 date-time, defaulting to UTC when no offset is given.

    Returns a naive-free UTC datetime. Raises ValueError on invalid input.
    """
    if value is None:
        raise ValueError("must be a date-time string")
    text = value.strip()
    if not text:
        raise ValueError("must not be empty")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        raise ValueError("must be an ISO-8601 date-time") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt


def serialize_datetime(dt) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def event_to_dict(row) -> dict:
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


def get_current_user():
    """Return the username for a valid bearer token, or None."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT username FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    return row["username"] if row else None


def require_user():
    user = get_current_user()
    if user is None:
        return None
    return user


def json_error(message, status=400, errors=None):
    body = {}
    if errors is not None:
        body["errors"] = errors
    else:
        body["error"] = message
    return jsonify(body), status


# --------------------------------------------------------------------------- #
# Health + frontend
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    candidate = DIST / path
    if candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


def validate_credentials(data):
    if not isinstance(data, dict):
        return None, "request body must be a JSON object"
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, "username is required"
    if not isinstance(password, str) or not password:
        return None, "password is required"
    return (username.strip(), password), None


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    creds, err = validate_credentials(data)
    if err:
        return json_error(err)
    username, password = creds
    db = get_db()
    existing = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return json_error("username is already taken", status=409)
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_utc()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    creds, err = validate_credentials(data)
    if err:
        return json_error(err)
    username, password = creds
    db = get_db()
    row = db.execute(
        "SELECT password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return json_error("invalid username or password", status=401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)",
        (token, username, now_utc()),
    )
    db.commit()
    return jsonify({"token": token, "username": username})


# --------------------------------------------------------------------------- #
# Events
# --------------------------------------------------------------------------- #


def parse_event_body(data):
    """Validate an event body, returning (fields, error_dict_or_None)."""
    if not isinstance(data, dict):
        return None, {"body": "request body must be a JSON object"}

    errors = {}
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "title is required"

    fields = {}
    try:
        fields["start_time"] = serialize_datetime(parse_datetime(data.get("start_time")))
    except ValueError as exc:
        errors["start_time"] = str(exc)
    try:
        fields["end_time"] = serialize_datetime(parse_datetime(data.get("end_time")))
    except ValueError as exc:
        errors["end_time"] = str(exc)

    if "start_time" not in errors and "end_time" not in errors:
        start = parse_datetime(data.get("start_time"))
        end = parse_datetime(data.get("end_time"))
        if end <= start:
            errors["end_time"] = "end_time must be after start_time"

    fields["title"] = title.strip() if isinstance(title, str) else None
    fields["description"] = data.get("description")
    fields["location"] = data.get("location")
    for key in ("description", "location"):
        val = data.get(key)
        if val is None:
            fields[key] = None
        elif isinstance(val, str):
            fields[key] = val
        else:
            errors[key] = f"{key} must be a string"

    if errors:
        return None, errors
    return fields, None


@app.get("/api/events")
def list_events():
    db = get_db()
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    clauses = []
    params = []
    if start_date:
        try:
            start = parse_datetime(start_date)
        except ValueError:
            return json_error("start_date must be a valid date-time", status=400)
        clauses.append("start_time >= ?")
        params.append(serialize_datetime(start))
    if end_date:
        try:
            end = parse_datetime(end_date)
        except ValueError:
            return json_error("end_date must be a valid date-time", status=400)
        # Include the full end day when only a date is supplied.
        if len(end_date.strip()) <= 10:
            end = end + timedelta(days=1)
        clauses.append("start_time < ?")
        params.append(serialize_datetime(end))

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    query = f"SELECT * FROM events {where} ORDER BY start_time ASC, id ASC"
    rows = db.execute(query, params).fetchall()
    items = [event_to_dict(r) for r in rows]
    return jsonify({"items": items, "total": len(items)})


@app.post("/api/events")
def create_event():
    user = require_user()
    if user is None:
        return json_error("authentication required", status=401)
    fields, errors = parse_event_body(request.get_json(silent=True))
    if errors:
        return jsonify({"errors": errors}), 400
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO events
            (title, description, location, start_time, end_time, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            now_utc(),
            user,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(event_to_dict(row)), 201


@app.get("/api/events/<int:event_id>")
def get_event(event_id):
    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return json_error("event not found", status=404)
    return jsonify(event_to_dict(row))


@app.put("/api/events/<int:event_id>")
def update_event(event_id):
    user = require_user()
    if user is None:
        return json_error("authentication required", status=401)
    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return json_error("event not found", status=404)
    fields, errors = parse_event_body(request.get_json(silent=True))
    if errors:
        return jsonify({"errors": errors}), 400
    db.execute(
        """
        UPDATE events
        SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?
        WHERE id = ?
        """,
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
    row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return jsonify(event_to_dict(row))


@app.delete("/api/events/<int:event_id>")
def delete_event(event_id):
    user = require_user()
    if user is None:
        return json_error("authentication required", status=401)
    db = get_db()
    row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return json_error("event not found", status=404)
    db.execute("DELETE FROM events WHERE id = ?", (event_id,))
    db.commit()
    return jsonify({"deleted": True})
