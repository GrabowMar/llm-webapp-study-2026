"""Flask entry point."""

import hashlib
import os
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)

MAX_USERNAME = 64
MAX_PASSWORD = 256
MAX_TITLE = 200
MAX_LOCATION = 200
MAX_DESCRIPTION = 5000

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    created_by TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_end ON events(end_time);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# ---------------------------------------------------------------- time helpers


def to_micros(dt: datetime) -> int:
    delta = dt - EPOCH
    return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds


def from_micros(value: int) -> datetime:
    return EPOCH + timedelta(microseconds=value)


def format_dt(value: int) -> str:
    dt = from_micros(value)
    text = f"{dt.year:04d}-{dt.month:02d}-{dt.day:02d}T{dt.hour:02d}:{dt.minute:02d}:{dt.second:02d}"
    if dt.microsecond:
        text += f".{dt.microsecond:06d}".rstrip("0")
    return text + "Z"


def now_micros() -> int:
    return to_micros(datetime.now(timezone.utc))


def parse_datetime(value: str) -> datetime:
    """Parse an ISO 8601 date-time; values without an offset are UTC."""
    text = value.strip()
    if not text:
        raise ValueError("empty")
    if text[-1] in "zZ":
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def is_date_only(value: str) -> bool:
    try:
        date.fromisoformat(value.strip())
    except ValueError:
        return False
    return "T" not in value and " " not in value.strip()


# ---------------------------------------------------------------- errors


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    if isinstance(err, HTTPException):
        return handle_http_error(err)
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def validation_error(errors: dict) -> ApiError:
    first = next(iter(errors.values()))
    return ApiError(400, first, errors)


def json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


# ---------------------------------------------------------------- auth


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = ? AND t.expires_at > ?",
            (hash_token(token), now_micros()),
        ).fetchone()
        if row is not None:
            g.user = {"id": row["id"], "username": row["username"]}
    return g.user


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return view(*args, **kwargs)

    return wrapper


def read_credentials() -> tuple[str, str]:
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters"
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required"
    elif len(password) > MAX_PASSWORD:
        errors["password"] = f"Password must be at most {MAX_PASSWORD} characters"
    if errors:
        raise validation_error(errors)
    return username.strip(), password


@app.post("/api/auth/register")
def register():
    username, password = read_credentials()
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_micros()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = read_credentials()
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = now_micros()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (now,))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], now, now + to_micros(EPOCH + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header.partition(" ")[2].strip()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    conn.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


# ---------------------------------------------------------------- events


def serialize_event(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "start_time": format_dt(row["start_time"]),
        "end_time": format_dt(row["end_time"]),
        "created_at": format_dt(row["created_at"]),
        "created_by": row["created_by"],
        "updated_at": format_dt(row["updated_at"]),
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
    value = value.strip()
    return value or None


def required_datetime(data: dict, field: str, label: str, errors: dict):
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        errors[field] = f"{label} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{label} must be an ISO 8601 date-time string"
        return None
    try:
        return to_micros(parse_datetime(value))
    except (ValueError, OverflowError):
        errors[field] = f"{label} must be a valid ISO 8601 date-time"
        return None


def validate_event(data: dict) -> dict:
    errors: dict[str, str] = {}

    title = data.get("title")
    if title is None or (isinstance(title, str) and not title.strip()):
        errors["title"] = "Title is required"
    elif not isinstance(title, str):
        errors["title"] = "Title must be a string"
    elif len(title.strip()) > MAX_TITLE:
        errors["title"] = f"Title must be at most {MAX_TITLE} characters"

    description = optional_text(data, "description", "Description", MAX_DESCRIPTION, errors)
    location = optional_text(data, "location", "Location", MAX_LOCATION, errors)
    start = required_datetime(data, "start_time", "Start time", errors)
    end = required_datetime(data, "end_time", "End time", errors)

    if start is not None and end is not None and end < start:
        errors["end_time"] = "End time must not be before start time"

    if errors:
        raise validation_error(errors)

    return {
        "title": title.strip(),
        "description": description,
        "location": location,
        "start_time": start,
        "end_time": end,
    }


def get_event_row(event_id: int) -> sqlite3.Row:
    row = db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Event not found")
    return row


def parse_range_bound(name: str, is_end: bool):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        dt = parse_datetime(raw)
    except (ValueError, OverflowError):
        raise ApiError(
            400,
            f"{name} must be a valid ISO 8601 date or date-time",
            {name: f"{name} must be a valid ISO 8601 date or date-time"},
        )
    value = to_micros(dt)
    if is_end and is_date_only(raw):
        # A date-only end bound includes the whole day.
        return value + to_micros(EPOCH + timedelta(days=1)), True
    return value, False


def parse_int_arg(name: str, minimum: int, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be an integer", {name: f"{name} must be an integer"})
    if value < minimum or (maximum is not None and value > maximum):
        message = f"{name} must be at least {minimum}" + (
            f" and at most {maximum}" if maximum is not None else ""
        )
        raise ApiError(400, message, {name: message})
    return value


@app.get("/api/events")
def list_events():
    start = parse_range_bound("start_date", is_end=False)
    end = parse_range_bound("end_date", is_end=True)
    limit = parse_int_arg("limit", 1, 1000)
    offset = parse_int_arg("offset", 0) or 0

    clauses: list[str] = []
    params: list = []
    if start is not None:
        start_value = start[0]
        clauses.append("(end_time > ? OR start_time >= ?)")
        params += [start_value, start_value]
    if end is not None:
        end_value, exclusive = end
        clauses.append("start_time < ?" if exclusive else "start_time <= ?")
        params.append(end_value)
    if start is not None and end is not None:
        end_value, exclusive = end
        if end_value < start[0] or (exclusive and end_value == start[0]):
            raise ApiError(
                400,
                "end_date must not be before start_date",
                {"end_date": "end_date must not be before start_date"},
            )

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM events{where}", params).fetchone()[0]
    sql = f"SELECT * FROM events{where} ORDER BY start_time, end_time, id"
    query_params = list(params)
    if limit is not None or offset:
        sql += " LIMIT ? OFFSET ?"
        query_params += [limit if limit is not None else -1, offset]
    rows = conn.execute(sql, query_params).fetchall()
    return jsonify({"items": [serialize_event(r) for r in rows], "total": total})


@app.post("/api/events")
@login_required
def create_event():
    fields = validate_event(json_body())
    now = now_micros()
    conn = db()
    cur = conn.execute(
        "INSERT INTO events (title, description, location, start_time, end_time, "
        "created_at, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            now,
            current_user()["username"],
            now,
        ),
    )
    conn.commit()
    return jsonify(serialize_event(get_event_row(cur.lastrowid))), 201


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    return jsonify(serialize_event(get_event_row(event_id)))


@app.put("/api/events/<int:event_id>")
@login_required
def update_event(event_id: int):
    get_event_row(event_id)
    fields = validate_event(json_body())
    conn = db()
    conn.execute(
        "UPDATE events SET title = ?, description = ?, location = ?, start_time = ?, "
        "end_time = ?, updated_at = ? WHERE id = ?",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            now_micros(),
            event_id,
        ),
    )
    conn.commit()
    return jsonify(serialize_event(get_event_row(event_id)))


@app.delete("/api/events/<int:event_id>")
@login_required
def delete_event(event_id: int):
    get_event_row(event_id)
    conn = db()
    conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    return "", 204


# ---------------------------------------------------------------- misc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")
