"""Sensor dashboard: Flask API and static frontend."""

import hashlib
import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "sensors.db"

TOKEN_TTL = timedelta(days=30)
MAX_USERNAME = 64
MAX_PASSWORD = 256
MIN_PASSWORD = 1
MAX_NAME = 100
MAX_UNIT = 32
MAX_LOCATION = 100
DEFAULT_LIMIT = 100
MAX_LIMIT = 1000

DUMMY_HASH = generate_password_hash("dummy-password")

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    last_value REAL,
    last_updated TEXT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings(sensor_id, id);
CREATE INDEX IF NOT EXISTS idx_sensors_name ON sensors(name, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def error(status: int, message: str):
    return jsonify({"error": message}), status


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
    if row is None or row["expires_at"] <= now_iso():
        return None
    return row


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


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


def fetch_sensor(sensor_id: int):
    return db().execute(SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)).fetchone()


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.code or 500, exc.name)
    return exc


@app.errorhandler(Exception)
def unhandled(exc: Exception):
    app.logger.exception("unhandled error")
    return error(500, "Internal Server Error")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "JSON object body required")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "username and password are required strings")
    username = username.strip()
    if not username or len(username) > MAX_USERNAME:
        return error(400, f"username must be 1-{MAX_USERNAME} characters")
    if len(password) < MIN_PASSWORD or len(password) > MAX_PASSWORD:
        return error(400, f"password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters")
    conn = db()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
    except sqlite3.IntegrityError:
        return error(409, "username already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error(400, "JSON object body required")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "username and password are required strings")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return error(401, "invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        return error(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    expires = (now + TOKEN_TTL).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    with conn:
        conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (now_iso(),))
        conn.execute(
            "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_token(token), row["id"], expires),
        )
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return error(401, "authentication required")
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
def logout():
    user = current_user()
    if user is None:
        return error(401, "authentication required")
    token = request.headers["Authorization"].split(None, 1)[1].strip()
    with db() as conn:
        conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    return "", 204


@app.get("/api/sensors")
def list_sensors():
    rows = db().execute(SENSOR_SELECT + " ORDER BY s.name, s.id").fetchall()
    return jsonify({"items": [sensor_json(r) for r in rows]})


def optional_text(data: dict, key: str, limit: int):
    value = data.get(key)
    if value is None:
        return "", None
    if not isinstance(value, str):
        return None, f"{key} must be a string"
    value = value.strip()
    if len(value) > limit:
        return None, f"{key} must be at most {limit} characters"
    return value, None


@app.post("/api/sensors")
def create_sensor():
    user = current_user()
    if user is None:
        return error(401, "authentication required")
    data = json_body()
    if data is None:
        return error(400, "JSON object body required")
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return error(400, "name is required")
    name = name.strip()
    if len(name) > MAX_NAME:
        return error(400, f"name must be at most {MAX_NAME} characters")
    unit, err = optional_text(data, "unit", MAX_UNIT)
    if err:
        return error(400, err)
    location, err = optional_text(data, "location", MAX_LOCATION)
    if err:
        return error(400, err)
    conn = db()
    with conn:
        cur = conn.execute(
            "INSERT INTO sensors (name, unit, location, owner_id) VALUES (?, ?, ?, ?)",
            (name, unit, location, user["id"]),
        )
    return jsonify(sensor_json(fetch_sensor(cur.lastrowid))), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    row = fetch_sensor(sensor_id)
    if row is None:
        return error(404, "sensor not found")
    return jsonify(sensor_json(row))


@app.delete("/api/sensors/<int:sensor_id>")
def delete_sensor(sensor_id: int):
    user = current_user()
    if user is None:
        return error(401, "authentication required")
    row = fetch_sensor(sensor_id)
    if row is None:
        return error(404, "sensor not found")
    if row["owner_id"] != user["id"]:
        return error(403, "not the owner of this sensor")
    conn = db()
    with conn:
        conn.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
        conn.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    return "", 204


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    if fetch_sensor(sensor_id) is None:
        return error(404, "sensor not found")
    limit = DEFAULT_LIMIT
    raw = request.args.get("limit")
    if raw is not None:
        try:
            limit = int(raw)
        except ValueError:
            return error(400, "limit must be an integer")
        if limit < 1:
            return error(400, "limit must be at least 1")
        limit = min(limit, MAX_LIMIT)
    conn = db()
    rows = conn.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings "
        "WHERE sensor_id = ? ORDER BY id DESC LIMIT ?",
        (sensor_id, limit),
    ).fetchall()
    total = conn.execute(
        "SELECT COUNT(*) FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()[0]
    return jsonify({"items": [reading_json(r) for r in rows], "total": total})


@app.post("/api/sensors/<int:sensor_id>/readings")
def create_reading(sensor_id: int):
    user = current_user()
    if user is None:
        return error(401, "authentication required")
    sensor = fetch_sensor(sensor_id)
    if sensor is None:
        return error(404, "sensor not found")
    if sensor["owner_id"] != user["id"]:
        return error(403, "not the owner of this sensor")
    data = json_body()
    if data is None:
        return error(400, "JSON object body required")
    value = data.get("value")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return error(400, "value must be a number")
    value = float(value)
    if not math.isfinite(value):
        return error(400, "value must be a finite number")
    recorded_at = now_iso()
    conn = db()
    with conn:
        cur = conn.execute(
            "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
            (sensor_id, value, recorded_at),
        )
        conn.execute(
            "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
            (value, recorded_at, sensor_id),
        )
    return (
        jsonify(
            {
                "id": cur.lastrowid,
                "sensor_id": sensor_id,
                "value": value,
                "recorded_at": recorded_at,
            }
        ),
        201,
    )


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>")
def api_not_found(path: str):
    return error(404, "not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
