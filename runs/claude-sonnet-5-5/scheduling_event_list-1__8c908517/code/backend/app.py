"""Event calendar: Flask JSON API under /api plus the built frontend."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "calendar.db"

TOKEN_TTL = timedelta(days=30)
MAX_USERNAME = 64
MIN_PASSWORD = 6
MAX_PASSWORD = 256
MAX_TITLE = 200
MAX_LOCATION = 200
MAX_DESCRIPTION = 5000

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False

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
    expires_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS events_start ON events(start_time);
"""

DUMMY_HASH = generate_password_hash("dummy-password")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(e: ApiError):
    body = {"error": e.message}
    if e.errors:
        body["errors"] = e.errors
    return jsonify(body), e.status


@app.errorhandler(HTTPException)
def handle_http_error(e: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": e.description or e.name}), e.code
    return e


@app.errorhandler(Exception)
def handle_unexpected(e: Exception):
    app.logger.exception("unhandled error")
    return jsonify({"error": "Internal server error"}), 500


# ---------- time helpers ----------

MIN_DT = datetime(1, 1, 2, tzinfo=UTC)
MAX_DT = datetime(9999, 12, 30, tzinfo=UTC)


def parse_dt(value) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("must be an ISO 8601 date-time string")
    text = value.strip()
    if text[-1] in "zZ":
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        raise ValueError("must be an ISO 8601 date-time, e.g. 2025-01-31T14:30:00Z") from None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    try:
        dt = dt.astimezone(UTC)
    except (OverflowError, ValueError):
        raise ValueError("is out of range") from None
    if not (MIN_DT <= dt <= MAX_DT):
        raise ValueError("is out of range")
    return dt


def to_db(dt: datetime) -> str:
    return f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt:%H:%M:%S}.{dt.microsecond:06d}Z"


def to_api(stored: str | None) -> str | None:
    if stored is None:
        return None
    head, frac = stored[:-1].split(".")
    frac = frac.rstrip("0")
    return f"{head}.{frac}Z" if frac else f"{head}Z"


def now_utc() -> datetime:
    return datetime.now(UTC)


# ---------- auth ----------


def hash_token(token: str) -> str:
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
    if row is None or row["expires_at"] <= to_db(now_utc()):
        return None
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def credentials() -> tuple[str, str]:
    data = json_body()
    username, password = data.get("username"), data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    username = username.strip()
    errors = {}
    if len(username) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters"
    if len(password) < MIN_PASSWORD:
        errors["password"] = f"Password must be at least {MIN_PASSWORD} characters"
    elif len(password) > MAX_PASSWORD:
        errors["password"] = f"Password must be at most {MAX_PASSWORD} characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), to_db(now_utc())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "Username already taken", {"username": "Username already taken"}
        ) from None
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
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
    now = now_utc()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (to_db(now),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], to_db(now + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"username": g.user["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers["Authorization"].split(None, 1)[1].strip()
    db().execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    db().commit()
    return "", 204


# ---------- events ----------


def event_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "start_time": to_api(row["start_time"]),
        "end_time": to_api(row["end_time"]),
        "created_at": to_api(row["created_at"]),
        "created_by": row["created_by"],
    }


def optional_text(data: dict, field: str, label: str, limit: int, errors: dict):
    value = data.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        errors[field] = f"{label} must be a string"
        return None
    if len(value) > limit:
        errors[field] = f"{label} must be at most {limit} characters"
        return None
    return value


def validate_event(data: dict) -> dict:
    errors: dict[str, str] = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
        title = None
    elif len(title) > MAX_TITLE:
        errors["title"] = f"Title must be at most {MAX_TITLE} characters"
        title = None

    description = optional_text(data, "description", "Description", MAX_DESCRIPTION, errors)
    location = optional_text(data, "location", "Location", MAX_LOCATION, errors)

    start = end = None
    if data.get("start_time") is None:
        errors["start_time"] = "Start time is required"
    else:
        try:
            start = parse_dt(data["start_time"])
        except ValueError as e:
            errors["start_time"] = f"Start time {e}"
    if data.get("end_time") is not None:
        try:
            end = parse_dt(data["end_time"])
        except ValueError as e:
            errors["end_time"] = f"End time {e}"
    if start and end and end < start:
        errors["end_time"] = "End time must not be before start time"

    if errors:
        raise ApiError(400, "Validation failed", errors)
    return {
        "title": title,
        "description": description,
        "location": location,
        "start_time": to_db(start),
        "end_time": to_db(end) if end else None,
    }


DATE_ONLY = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_range_param(name: str, upper: bool) -> str | None:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None
    try:
        dt = parse_dt(raw)
        if DATE_ONLY.match(raw.strip()) and upper:
            dt = dt + timedelta(days=1) - timedelta(microseconds=1)
    except (ValueError, OverflowError):
        raise ApiError(
            400, "Validation failed", {name: f"{name} must be an ISO 8601 date or date-time"}
        ) from None
    return to_db(dt)


@app.get("/api/events")
def list_events():
    lo = parse_range_param("start_date", upper=False)
    hi = parse_range_param("end_date", upper=True)
    if lo and hi and hi < lo:
        raise ApiError(400, "Validation failed", {"end_date": "end_date must not be before start_date"})
    where, params = [], []
    if lo:
        where.append("COALESCE(end_time, start_time) >= ?")
        params.append(lo)
    if hi:
        where.append("start_time <= ?")
        params.append(hi)
    sql = "SELECT * FROM events"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY start_time, id"
    rows = db().execute(sql, params).fetchall()
    items = [event_json(r) for r in rows]
    return jsonify({"items": items, "total": len(items)})


def get_event_row(event_id: int) -> sqlite3.Row:
    row = db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Event not found")
    return row


@app.post("/api/events")
@login_required
def create_event():
    fields = validate_event(json_body())
    conn = db()
    cur = conn.execute(
        "INSERT INTO events (title, description, location, start_time, end_time, created_at, created_by) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            to_db(now_utc()),
            g.user["username"],
        ),
    )
    conn.commit()
    return jsonify(event_json(get_event_row(cur.lastrowid))), 201


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    return jsonify(event_json(get_event_row(event_id)))


@app.put("/api/events/<int:event_id>")
@login_required
def update_event(event_id: int):
    get_event_row(event_id)
    fields = validate_event(json_body())
    conn = db()
    conn.execute(
        "UPDATE events SET title = ?, description = ?, location = ?, start_time = ?, end_time = ? "
        "WHERE id = ?",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            event_id,
        ),
    )
    conn.commit()
    return jsonify(event_json(get_event_row(event_id)))


@app.delete("/api/events/<int:event_id>")
@login_required
def delete_event(event_id: int):
    get_event_row(event_id)
    db().execute("DELETE FROM events WHERE id = ?", (event_id,))
    db().commit()
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- frontend ----------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        resp = send_from_directory(DIST, path)
    else:
        resp = send_from_directory(DIST, "index.html")
    if resp.mimetype == "text/html":
        resp.headers["Cache-Control"] = "no-cache"
    return resp


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
