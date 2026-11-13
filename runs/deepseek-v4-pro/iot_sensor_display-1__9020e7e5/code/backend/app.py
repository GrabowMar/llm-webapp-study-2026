"""Flask entry point for the sensor dashboard."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value REAL NOT NULL,
    recorded_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensors_owner ON sensors(owner_id);
CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings(sensor_id);
"""


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    db.commit()
    db.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    row = get_db().execute(
        "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def sensor_payload(row, owner_username):
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "owner": owner_username,
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
    }


SENSOR_SELECT = """
SELECT s.id, s.name, s.unit, s.location, u.username AS owner,
       (SELECT r.value FROM readings r WHERE r.sensor_id = s.id
        ORDER BY r.id DESC LIMIT 1) AS last_value,
       (SELECT r.recorded_at FROM readings r WHERE r.sensor_id = s.id
        ORDER BY r.id DESC LIMIT 1) AS last_updated
FROM sensors s
JOIN users u ON u.id = s.owner_id
"""


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return jsonify({"error": "username already taken"}), 409

    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return {"username": username}, 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, row["id"])
    )
    db.commit()
    return {"token": token, "username": row["username"]}


@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(SENSOR_SELECT + " ORDER BY s.name").fetchall()
    return {"items": [sensor_payload(r, r["owner"]) for r in rows]}


@app.post("/api/sensors")
@require_user
def create_sensor():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    unit = (data.get("unit") or "").strip()
    location = (data.get("location") or "").strip()

    if not name:
        return jsonify({"error": "name is required"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO sensors (owner_id, name, unit, location) VALUES (?, ?, ?, ?)",
        (g.user["id"], name, unit, location),
    )
    db.commit()
    sensor_id = cur.lastrowid
    row = db.execute(
        SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)
    ).fetchone()
    return jsonify(sensor_payload(row, row["owner"])), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id):
    row = get_db().execute(
        SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "sensor not found"}), 404
    return jsonify(sensor_payload(row, row["owner"]))


@app.delete("/api/sensors/<int:sensor_id>")
@require_user
def delete_sensor(sensor_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM sensors WHERE id = ? AND owner_id = ?",
        (sensor_id, g.user["id"]),
    ).fetchone()
    if row is None:
        return jsonify({"error": "sensor not found"}), 404
    db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    db.commit()
    return "", 204


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id):
    db = get_db()
    sensor = db.execute(
        "SELECT id FROM sensors WHERE id = ?", (sensor_id,)
    ).fetchone()
    if sensor is None:
        return jsonify({"error": "sensor not found"}), 404

    try:
        limit = int(request.args.get("limit", 100))
    except (TypeError, ValueError):
        limit = 100
    limit = max(1, min(limit, 1000))

    total = db.execute(
        "SELECT COUNT(*) AS c FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()["c"]

    rows = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings "
        "WHERE sensor_id = ? ORDER BY id DESC LIMIT ?",
        (sensor_id, limit),
    ).fetchall()

    items = [
        {
            "id": r["id"],
            "sensor_id": r["sensor_id"],
            "value": r["value"],
            "recorded_at": r["recorded_at"],
        }
        for r in rows
    ]
    return {"items": items, "total": total}


@app.post("/api/sensors/<int:sensor_id>/readings")
@require_user
def create_reading(sensor_id):
    db = get_db()
    sensor = db.execute(
        "SELECT id FROM sensors WHERE id = ? AND owner_id = ?",
        (sensor_id, g.user["id"]),
    ).fetchone()
    if sensor is None:
        return jsonify({"error": "sensor not found"}), 404

    data = request.get_json(silent=True) or {}
    value = data.get("value")
    if value is None:
        return jsonify({"error": "value is required"}), 400
    try:
        value = float(value)
    except (TypeError, ValueError):
        return jsonify({"error": "value must be a number"}), 400

    cur = db.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, now_iso()),
    )
    db.commit()
    reading_id = cur.lastrowid

    row = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE id = ?",
        (reading_id,),
    ).fetchone()
    return (
        jsonify(
            {
                "id": row["id"],
                "sensor_id": row["sensor_id"],
                "value": row["value"],
                "recorded_at": row["recorded_at"],
            }
        ),
        201,
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
