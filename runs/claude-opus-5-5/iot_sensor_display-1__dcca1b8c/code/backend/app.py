"""Flask entry point."""

import math
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "app.db"

MAX_LIMIT = 10000

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_value REAL,
    last_updated TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings(sensor_id, id);
CREATE INDEX IF NOT EXISTS idx_sensors_name ON sensors(name);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


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


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


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


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if row is not None:
            g.user = row
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


def sensor_json(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
        "owner": row["owner"],
    }


def reading_json(row) -> dict:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": row["value"],
        "recorded_at": row["recorded_at"],
    }


SENSOR_SELECT = (
    "SELECT s.id, s.name, s.unit, s.location, s.last_value, s.last_updated, "
    "s.owner_id, u.username AS owner FROM sensors s JOIN users u ON u.id = s.owner_id"
)


def get_sensor_or_404(sensor_id: int):
    row = db().execute(SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Sensor not found")
    return row


def require_owner(sensor) -> None:
    if sensor["owner_id"] != current_user()["id"]:
        raise ApiError(403, "You do not own this sensor")


def text_field(data: dict, key: str, *, required: bool, max_len: int) -> str:
    value = data.get(key)
    if value is None:
        if required:
            raise ApiError(400, f"'{key}' is required")
        return ""
    if not isinstance(value, str):
        raise ApiError(400, f"'{key}' must be a string")
    value = value.strip()
    if required and not value:
        raise ApiError(400, f"'{key}' must not be empty")
    if len(value) > max_len:
        raise ApiError(400, f"'{key}' must be at most {max_len} characters")
    return value


@app.get("/api/health")
def health():
    return {"status": "ok"}


def credentials() -> tuple[str, str]:
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError(400, "'username' is required")
    if not isinstance(password, str) or not password:
        raise ApiError(400, "'password' is required")
    return username.strip(), password


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    if len(username) > 64:
        raise ApiError(400, "'username' must be at most 64 characters")
    if len(password) > 1024:
        raise ApiError(400, "'password' is too long")
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token = ?", (token.strip(),))
    conn.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return {"id": user["id"], "username": user["username"]}


@app.get("/api/sensors")
def list_sensors():
    rows = db().execute(SENSOR_SELECT + " ORDER BY s.name, s.id").fetchall()
    return {"items": [sensor_json(r) for r in rows]}


@app.post("/api/sensors")
@login_required
def create_sensor():
    data = json_body()
    name = text_field(data, "name", required=True, max_len=100)
    unit = text_field(data, "unit", required=False, max_len=32)
    location = text_field(data, "location", required=False, max_len=100)
    conn = db()
    cur = conn.execute(
        "INSERT INTO sensors (name, unit, location, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, unit, location, current_user()["id"], now_iso()),
    )
    conn.commit()
    return jsonify(sensor_json(get_sensor_or_404(cur.lastrowid))), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    return sensor_json(get_sensor_or_404(sensor_id))


@app.delete("/api/sensors/<int:sensor_id>")
@login_required
def delete_sensor(sensor_id: int):
    sensor = get_sensor_or_404(sensor_id)
    require_owner(sensor)
    conn = db()
    conn.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
    conn.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    conn.commit()
    return "", 204


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    get_sensor_or_404(sensor_id)
    raw = request.args.get("limit")
    limit = -1
    if raw is not None and raw != "":
        try:
            limit = int(raw)
        except ValueError:
            raise ApiError(400, "'limit' must be an integer")
        if limit < 0:
            raise ApiError(400, "'limit' must not be negative")
        limit = min(limit, MAX_LIMIT)
    conn = db()
    rows = conn.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE sensor_id = ? "
        "ORDER BY id DESC LIMIT ?",
        (sensor_id, limit),
    ).fetchall()
    total = conn.execute(
        "SELECT COUNT(*) FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()[0]
    return {"items": [reading_json(r) for r in rows], "total": total}


@app.post("/api/sensors/<int:sensor_id>/readings")
@login_required
def create_reading(sensor_id: int):
    sensor = get_sensor_or_404(sensor_id)
    require_owner(sensor)
    data = json_body()
    value = data.get("value")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(400, "'value' must be a number")
    value = float(value)
    if not math.isfinite(value):
        raise ApiError(400, "'value' must be a finite number")
    recorded_at = now_iso()
    conn = db()
    cur = conn.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, recorded_at),
    )
    conn.execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (value, recorded_at, sensor_id),
    )
    conn.commit()
    return jsonify(
        {"id": cur.lastrowid, "sensor_id": sensor_id, "value": value, "recorded_at": recorded_at}
    ), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")
