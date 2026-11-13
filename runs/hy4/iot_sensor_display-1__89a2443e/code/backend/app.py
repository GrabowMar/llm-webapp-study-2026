"""Flask entry point for the sensor dashboard."""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "sensors.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_value REAL,
    last_updated TEXT
);

CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS readings_sensor_idx
    ON readings(sensor_id, recorded_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS sensors_name_idx ON sensors(name);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    conn = connect()
    try:
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
def close_db(_error):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def clean_text(value, default: str = "") -> str:
    if value is None:
        return default
    return str(value).strip()


SENSOR_QUERY = """
SELECT s.id, s.name, s.unit, s.location, s.last_value, s.last_updated,
       u.username AS owner, s.owner_id
FROM sensors s JOIN users u ON u.id = s.owner_id
"""


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


def get_sensor(sensor_id: int):
    return db().execute(SENSOR_QUERY + " WHERE s.id = ?", (sensor_id,)).fetchone()


def parse_value(value):
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(number):
        return None
    return number


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    if data is None:
        return error("expected a JSON object", 400)
    username = clean_text(data.get("username"))
    password = data.get("password")
    if not username:
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    if db().execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)
    cur = db().execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db().commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    if data is None:
        return error("expected a JSON object", 400)
    username = clean_text(data.get("username"))
    password = data.get("password")
    if not username or not isinstance(password, str):
        return error("invalid username or password", 401)
    user = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db().execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    db().commit()
    return jsonify({"token": token, "username": user["username"]}), 200


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]})


@app.get("/api/sensors")
def list_sensors():
    rows = db().execute(SENSOR_QUERY + " ORDER BY s.name COLLATE NOCASE, s.id").fetchall()
    return jsonify({"items": [sensor_json(row) for row in rows]})


@app.post("/api/sensors")
@require_auth
def create_sensor():
    data = body()
    if data is None:
        return error("expected a JSON object", 400)
    name = clean_text(data.get("name"))
    if not name:
        return error("name is required", 400)
    unit = clean_text(data.get("unit"))
    location = clean_text(data.get("location"))
    cur = db().execute(
        "INSERT INTO sensors (name, unit, location, owner_id) VALUES (?, ?, ?, ?)",
        (name, unit, location, g.user["id"]),
    )
    db().commit()
    return jsonify(sensor_json(get_sensor(cur.lastrowid))), 201


@app.get("/api/sensors/<int:sensor_id>")
def read_sensor(sensor_id: int):
    row = get_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    return jsonify(sensor_json(row))


@app.delete("/api/sensors/<int:sensor_id>")
@require_auth
def delete_sensor(sensor_id: int):
    row = get_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("only the owner can delete this sensor", 403)
    db().execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    db().commit()
    return "", 204


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    if get_sensor(sensor_id) is None:
        return error("sensor not found", 404)
    raw = request.args.get("limit")
    if raw is None:
        limit = None
    else:
        try:
            limit = int(raw)
        except ValueError:
            return error("limit must be an integer", 400)
        if limit < 0:
            return error("limit must not be negative", 400)
        limit = min(limit, 100000)
    total = db().execute(
        "SELECT COUNT(*) FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()[0]
    sql = (
        "SELECT id, sensor_id, value, recorded_at FROM readings "
        "WHERE sensor_id = ? ORDER BY recorded_at DESC, id DESC"
    )
    if limit is not None:
        rows = db().execute(sql + " LIMIT ?", (sensor_id, limit)).fetchall()
    else:
        rows = db().execute(sql, (sensor_id,)).fetchall()
    return jsonify({"items": [reading_json(row) for row in rows], "total": total})


@app.post("/api/sensors/<int:sensor_id>/readings")
@require_auth
def create_reading(sensor_id: int):
    sensor = get_sensor(sensor_id)
    if sensor is None:
        return error("sensor not found", 404)
    if sensor["owner_id"] != g.user["id"]:
        return error("only the owner can post readings", 403)
    data = body()
    if data is None:
        return error("expected a JSON object", 400)
    value = parse_value(data.get("value"))
    if value is None:
        return error("value must be a number", 400)
    recorded_at = now()
    cur = db().execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, recorded_at),
    )
    db().execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (value, recorded_at, sensor_id),
    )
    db().commit()
    row = db().execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(reading_json(row)), 201


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return error("not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return error("method not allowed", 405)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
