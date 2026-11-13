"""Sensor dashboard: JSON API under /api plus the built frontend."""

import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_readings_sensor_id ON readings (sensor_id, id);
"""


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
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def sensor_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
        "owner": row["username"],
    }


def reading_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": row["value"],
        "recorded_at": row["recorded_at"],
    }


SENSOR_SELECT = """
SELECT s.*, u.username AS username
FROM sensors s JOIN users u ON u.id = s.owner_id
"""


def get_sensor(sensor_id: int):
    row = get_db().execute(SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)).fetchone()
    return row


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def require_str(data: dict, field: str, required: bool = True):
    value = data.get(field)
    if value is None:
        if required:
            return None
        return ""
    if not isinstance(value, str) or (required and not value.strip()):
        return None
    return value


def current_user():
    """Return the user row for the Bearer token, or None."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return (
        get_db()
        .execute(
            "SELECT u.* FROM users u JOIN tokens t ON t.user_id = u.id"
            " WHERE t.token_hash = ?",
            (token_hash,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------- accounts

@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)
    username = require_str(data, "username")
    password = require_str(data, "password")
    if username is None or password is None:
        return error("username and password are required", 400)
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 400)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)
    username = require_str(data, "username")
    password = require_str(data, "password")
    if username is None or password is None:
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token_hash, user_id) VALUES (?, ?)",
        (hashlib.sha256(token.encode("utf-8")).hexdigest(), row["id"]),
    )
    db.commit()
    return jsonify({"token": token})


# ---------------------------------------------------------------- sensors

@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(SENSOR_SELECT + " ORDER BY s.name").fetchall()
    return jsonify({"items": [sensor_dict(r) for r in rows]})


@app.post("/api/sensors")
@login_required
def create_sensor():
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)
    name = require_str(data, "name")
    if name is None:
        return error("name is required", 400)
    unit = require_str(data, "unit", required=False)
    location = require_str(data, "location", required=False)
    if unit is None or location is None:
        return error("unit and location must be strings", 400)
    db = get_db()
    cur = db.execute(
        "INSERT INTO sensors (name, unit, location, owner_id) VALUES (?, ?, ?, ?)",
        (name, unit, location, g.user["id"]),
    )
    db.commit()
    row = get_sensor(cur.lastrowid)
    return jsonify(sensor_dict(row)), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor_route(sensor_id: int):
    row = get_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    return jsonify(sensor_dict(row))


@app.delete("/api/sensors/<int:sensor_id>")
@login_required
def delete_sensor(sensor_id: int):
    row = get_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("you do not own this sensor", 403)
    db = get_db()
    db.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
    db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    db.commit()
    return "", 204


# ---------------------------------------------------------------- readings

@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    if get_sensor(sensor_id) is None:
        return error("sensor not found", 404)
    limit_raw = request.args.get("limit")
    limit = None
    if limit_raw is not None:
        try:
            limit = int(limit_raw)
        except ValueError:
            return error("limit must be an integer", 400)
        if limit < 0:
            return error("limit must be non-negative", 400)
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()["n"]
    sql = "SELECT * FROM readings WHERE sensor_id = ? ORDER BY recorded_at DESC, id DESC"
    params = [sensor_id]
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    rows = db.execute(sql, params).fetchall()
    return jsonify({"items": [reading_dict(r) for r in rows], "total": total})


@app.post("/api/sensors/<int:sensor_id>/readings")
@login_required
def create_reading(sensor_id: int):
    row = get_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("you do not own this sensor", 403)
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)
    value = data.get("value")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return error("value must be a number", 400)
    recorded_at = now_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, float(value), recorded_at),
    )
    db.execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (float(value), recorded_at, sensor_id),
    )
    db.commit()
    reading = db.execute(
        "SELECT * FROM readings WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(reading_dict(reading)), 201


# ---------------------------------------------------------------- frontend

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
