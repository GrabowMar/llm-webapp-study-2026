"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or "data")
DB_FILE = DATA_DIR / "calendar.db"
UTC = timezone.utc

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time REAL NOT NULL,
    end_time REAL NOT NULL,
    created_at REAL NOT NULL,
    created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events (start_time);
"""

app = Flask(__name__, static_folder=None)


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


@app.teardown_appcontext
def _close_db(_exc) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def api_error(message: str, status: int, field: str | None = None):
    payload: dict = {"error": message}
    if field is not None:
        payload["field"] = field
    return jsonify(payload), status


def _body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        raw = request.get_data(as_text=True).strip()
        if raw:
            try:
                parsed = json.loads(raw)
            except ValueError:
                parsed = None
            if isinstance(parsed, dict):
                data = parsed
    return data if isinstance(data, dict) else {}


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now_epoch() -> float:
    return float(int(datetime.now(UTC).timestamp()))


def parse_datetime(value, field: str):
    """Parse an incoming date-time; naive values are taken as UTC."""
    if not isinstance(value, str) or not value.strip():
        return None, api_error(f"{field} is required", 400, field)
    text = value.strip()
    if text.endswith("z"):
        text = text[:-1] + "Z"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None, api_error(
            f"{field} must be a valid ISO 8601 date-time", 400, field
        )
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC), None


def parse_date_bound(value, field: str):
    """Parse a start_date/end_date query value.

    Returns ``(epoch, is_date_only, error_response)``.
    """
    if not isinstance(value, str) or not value.strip():
        return None, False, api_error(f"{field} is required", 400, field)
    text = value.strip()
    date_only = "T" not in text and " " not in text
    dt, err = parse_datetime(text, field)
    if err is not None:
        return None, False, err
    return dt.timestamp(), date_only, None


def validate_event(data: dict):
    """Validate an event payload.

    Returns ``(fields, error_response)``; ``fields`` is ``None`` on error.
    """
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return None, api_error("title is required", 400, "title")

    start, err = parse_datetime(data.get("start_time"), "start_time")
    if err is not None:
        return None, err
    end, err = parse_datetime(data.get("end_time"), "end_time")
    if err is not None:
        return None, err
    if end < start:
        return None, api_error(
            "end_time must not be before start_time", 400, "end_time"
        )

    description = data.get("description")
    if description is not None and not isinstance(description, str):
        return None, api_error("description must be a string", 400, "description")
    location = data.get("location")
    if location is not None and not isinstance(location, str):
        return None, api_error("location must be a string", 400, "location")

    return {
        "title": title,
        "description": description,
        "location": location,
        "start_time": start.timestamp(),
        "end_time": end.timestamp(),
    }, None


def event_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "start_time": _iso(row["start_time"]),
        "end_time": _iso(row["end_time"]),
        "created_at": _iso(row["created_at"]),
        "created_by": row["created_by"],
    }


def current_user() -> str | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = db().execute(
        "SELECT username FROM tokens WHERE token = ?", (token,)
    ).fetchone()
    return row["username"] if row is not None else None


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        username = current_user()
        if username is None:
            return api_error("authentication required", 401)
        g.username = username
        return view(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = _body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return api_error("username is required", 400, "username")
    if not isinstance(password, str) or password == "":
        return api_error("password is required", 400, "password")
    username = username.strip()
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, created_at)"
            " VALUES (?, ?, ?)",
            (username, generate_password_hash(password), _iso(_now_epoch())),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return api_error("username already taken", 409, "username")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = _body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return api_error("username is required", 400, "username")
    if not isinstance(password, str) or password == "":
        return api_error("password is required", 400, "password")
    username = username.strip()
    row = db().execute(
        "SELECT password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token, username, created_at) VALUES (?, ?, ?)",
        (token, username, _iso(_now_epoch())),
    )
    db().commit()
    return jsonify({"token": token})


# ---------------------------------------------------------------------------
# events
# ---------------------------------------------------------------------------


@app.get("/api/events")
def list_events():
    clauses: list[str] = []
    params: list[float] = []

    start_date = request.args.get("start_date")
    if start_date is not None:
        lower, _date_only, err = parse_date_bound(start_date, "start_date")
        if err is not None:
            return err
        clauses.append("end_time >= ?")
        params.append(lower)

    end_date = request.args.get("end_date")
    if end_date is not None:
        upper, date_only, err = parse_date_bound(end_date, "end_date")
        if err is not None:
            return err
        if date_only:
            # a plain date covers the whole day
            upper += 86400
        clauses.append("start_time < ?")
        params.append(upper)

    sql = "SELECT * FROM events"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY start_time ASC, id ASC"
    rows = db().execute(sql, params).fetchall()
    items = [event_json(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row = db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return api_error("event not found", 404)
    return jsonify(event_json(row))


@app.post("/api/events")
@login_required
def create_event():
    fields, err = validate_event(_body())
    if err is not None:
        return err
    cursor = db().execute(
        "INSERT INTO events (title, description, location, start_time, end_time,"
        " created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            _now_epoch(),
            g.username,
        ),
    )
    db().commit()
    row = db().execute(
        "SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(event_json(row)), 201


@app.put("/api/events/<int:event_id>")
@login_required
def update_event(event_id: int):
    row = db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return api_error("event not found", 404)
    fields, err = validate_event(_body())
    if err is not None:
        return err
    db().execute(
        "UPDATE events SET title = ?, description = ?, location = ?,"
        " start_time = ?, end_time = ? WHERE id = ?",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            event_id,
        ),
    )
    db().commit()
    updated = db().execute(
        "SELECT * FROM events WHERE id = ?", (event_id,)
    ).fetchone()
    return jsonify(event_json(updated))


@app.delete("/api/events/<int:event_id>")
@login_required
def delete_event(event_id: int):
    row = db().execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return api_error("event not found", 404)
    db().execute("DELETE FROM events WHERE id = ?", (event_id,))
    db().commit()
    return "", 204


# ---------------------------------------------------------------------------
# health + frontend
# ---------------------------------------------------------------------------


@app.after_request
def _cors(response):
    if request.path.startswith("/api/"):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = (
            "GET, POST, PUT, DELETE, OPTIONS"
        )
        response.headers["Access-Control-Allow-Headers"] = (
            "Authorization, Content-Type"
        )
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


def _wants_json() -> bool:
    return request.path.startswith("/api/")


@app.errorhandler(404)
def not_found(_error):
    if _wants_json():
        return api_error("not found", 404)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return api_error("frontend build not found", 404)


@app.errorhandler(405)
def method_not_allowed(_error):
    if _wants_json():
        return api_error("method not allowed", 405)
    return api_error("method not allowed", 405)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("not found", 404)
    target = DIST / path
    if path != "index.html" and target.is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return api_error("frontend build not found", 404)
