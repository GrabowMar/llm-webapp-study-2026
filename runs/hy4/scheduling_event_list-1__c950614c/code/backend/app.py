"""Shared event calendar: Flask API + static frontend."""

from __future__ import annotations

import functools
import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "calendar.db"

app = Flask(__name__, static_folder=None)
app.url_map.strict_slashes = False
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or {}

    def payload(self) -> dict:
        body: dict = {"message": self.message}
        if self.errors:
            body["errors"] = self.errors
        return body


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return jsonify(exc.payload()), exc.status


@app.errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        return jsonify({"message": "Not found."}), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_exc):
    return jsonify({"message": "Method not allowed."}), 405


@app.after_request
def add_cors(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    return response


def db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                username TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                start_ts INTEGER NOT NULL,
                end_ts INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_events_start_ts ON events(start_ts);
            """
        )
        conn.commit()
    finally:
        conn.close()


def to_micros(moment: datetime) -> int:
    delta = moment.astimezone(timezone.utc) - EPOCH
    return (delta.days * 86400 + delta.seconds) * 1_000_000 + delta.microseconds


def format_utc(moment: datetime) -> str:
    moment = moment.astimezone(timezone.utc)
    text = moment.strftime("%Y-%m-%dT%H:%M:%S")
    if moment.microsecond:
        text += f".{moment.microsecond:06d}".rstrip("0")
    return text + "Z"


def parse_datetime(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, "Invalid event data.", {field: f"{field} is required."})
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(text)
    except ValueError:
        raise ApiError(
            400, "Invalid event data.", {field: f"{field} must be a valid ISO 8601 date-time."}
        )
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def parse_bound(value: str, field: str, is_end: bool) -> int:
    try:
        day = date.fromisoformat(value.strip())
    except ValueError:
        return to_micros(parse_datetime(value, field))
    moment = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
    if is_end:
        moment = moment.replace(hour=23, minute=59, second=59, microsecond=999999)
    return to_micros(moment)


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


def body_object() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "A JSON object is required.")
    return body


def optional_text(body: dict, field: str) -> str:
    value = body.get(field)
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ApiError(400, "Invalid event data.", {field: f"{field} must be a string."})
    return value


def require_auth(view):
    @functools.wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1]:
            raise ApiError(401, "Authentication required.")
        row = db().execute(
            "SELECT user_id, username FROM tokens WHERE token = ?", (parts[1],)
        ).fetchone()
        if row is None:
            raise ApiError(401, "Invalid or expired token.")
        g.username = row["username"]
        g.user_id = row["user_id"]
        return view(*args, **kwargs)

    return wrapped


def validate_credentials(body: dict) -> tuple[str, str]:
    errors: dict = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) > 150:
        errors["username"] = "Username must be 150 characters or fewer."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        raise ApiError(400, "Invalid account data.", errors)
    return username.strip(), password


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = body_object()
    username, password = validate_credentials(body)
    conn = db()
    if conn.execute(
        "SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone():
        raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
    cur = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, username) VALUES (?, ?, ?)",
        (token, cur.lastrowid, username),
    )
    conn.commit()
    return jsonify({"username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    body = body_object()
    username, password = validate_credentials(body)
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, username) VALUES (?, ?, ?)",
        (token, row["id"], row["username"]),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"username": g.username})


@app.post("/api/auth/logout")
@require_auth
def logout():
    token = request.headers.get("Authorization", "").split()[1]
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
    conn.commit()
    return jsonify({"message": "Signed out."})


@app.get("/api/events")
def list_events():
    clauses: list[str] = []
    params: list = []
    if request.args.get("start_date"):
        start_bound = parse_bound(request.args["start_date"], "start_date", False)
        clauses.append("end_ts >= ?")
        params.append(start_bound)
    if request.args.get("end_date"):
        end_bound = parse_bound(request.args["end_date"], "end_date", True)
        clauses.append("start_ts <= ?")
        params.append(end_bound)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    conn = db()
    rows = conn.execute(
        f"SELECT * FROM events{where} ORDER BY start_ts ASC, id ASC", params
    ).fetchall()
    items = [event_dict(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row = db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Event not found.")
    return jsonify(event_dict(row))


def event_fields(body: dict) -> dict:
    errors: dict = {}

    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title) > 255:
        errors["title"] = "Title must be 255 characters or fewer."

    start = end = None
    try:
        start = parse_datetime(body.get("start_time"), "start_time")
    except ApiError as exc:
        errors.update(exc.errors)
    try:
        end = parse_datetime(body.get("end_time"), "end_time")
    except ApiError as exc:
        errors.update(exc.errors)

    description = ""
    location = ""
    try:
        description = optional_text(body, "description")
    except ApiError as exc:
        errors.update(exc.errors)
    try:
        location = optional_text(body, "location")
    except ApiError as exc:
        errors.update(exc.errors)

    if errors:
        raise ApiError(400, "Invalid event data.", errors)
    if end < start:
        raise ApiError(
            400, "Invalid event data.", {"end_time": "End time must not be before start time."}
        )
    return {
        "title": title.strip(),
        "description": description,
        "location": location,
        "start_time": format_utc(start),
        "end_time": format_utc(end),
        "start_ts": to_micros(start),
        "end_ts": to_micros(end),
    }


@app.post("/api/events")
@require_auth
def create_event():
    fields = event_fields(body_object())
    conn = db()
    cur = conn.execute(
        """INSERT INTO events
           (title, description, location, start_time, end_time, start_ts, end_ts, created_at, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            fields["start_ts"],
            fields["end_ts"],
            format_utc(datetime.now(timezone.utc)),
            g.username,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(event_dict(row)), 201


@app.put("/api/events/<int:event_id>")
@require_auth
def update_event(event_id: int):
    conn = db()
    existing = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if existing is None:
        raise ApiError(404, "Event not found.")
    fields = event_fields(body_object())
    conn.execute(
        """UPDATE events SET title = ?, description = ?, location = ?,
           start_time = ?, end_time = ?, start_ts = ?, end_ts = ? WHERE id = ?""",
        (
            fields["title"],
            fields["description"],
            fields["location"],
            fields["start_time"],
            fields["end_time"],
            fields["start_ts"],
            fields["end_ts"],
            event_id,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return jsonify(event_dict(row))


@app.delete("/api/events/<int:event_id>")
@require_auth
def delete_event(event_id: int):
    conn = db()
    cur = conn.execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn.commit()
    if cur.rowcount == 0:
        raise ApiError(404, "Event not found.")
    return "", 204


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def api_not_found(_path: str):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
