"""Flask entry point for the sensor dashboard."""

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
DB_PATH = DATA_DIR / "dashboard.db"

app = Flask(__name__, static_folder=None)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
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

            CREATE INDEX IF NOT EXISTS idx_readings_sensor
                ON readings(sensor_id, recorded_at DESC, id DESC);

            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            """
        )
        conn.commit()
    finally:
        conn.close()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    return token or None


def current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if token is None:
        return None
    return get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def sensor_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
        "owner": row["owner"],
    }


def reading_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": row["value"],
        "recorded_at": row["recorded_at"],
    }


SENSOR_SELECT = """
    SELECT sensors.*, users.username AS owner
    FROM sensors JOIN users ON users.id = sensors.owner_id
"""


def fetch_sensor(sensor_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        SENSOR_SELECT + " WHERE sensors.id = ?", (sensor_id,)
    ).fetchone()


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return error("username and password are required", 400)

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()

    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(
        SENSOR_SELECT + " ORDER BY sensors.name ASC, sensors.id ASC"
    ).fetchall()
    return jsonify({"items": [sensor_json(row) for row in rows]})


@app.post("/api/sensors")
@login_required
def create_sensor():
    data = json_body()
    name = data.get("name")
    unit = data.get("unit", "")
    location = data.get("location", "")
    if not isinstance(name, str) or not name.strip():
        return error("name is required", 400)
    if not isinstance(unit, str) or not isinstance(location, str):
        return error("unit and location must be strings", 400)

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO sensors (name, unit, location, owner_id, last_value, last_updated, created_at)
        VALUES (?, ?, ?, ?, NULL, NULL, ?)
        """,
        (name.strip(), unit, location, g.user["id"], utcnow()),
    )
    db.commit()
    return jsonify(sensor_json(fetch_sensor(cursor.lastrowid))), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    row = fetch_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    return jsonify(sensor_json(row))


@app.delete("/api/sensors/<int:sensor_id>")
@login_required
def delete_sensor(sensor_id: int):
    row = fetch_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("not allowed", 403)

    db = get_db()
    db.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
    db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    if fetch_sensor(sensor_id) is None:
        return error("sensor not found", 404)

    limit_arg = request.args.get("limit")
    limit = None
    if limit_arg is not None and limit_arg != "":
        try:
            limit = int(limit_arg)
        except ValueError:
            return error("limit must be an integer", 400)
        if limit < 0:
            return error("limit must be non-negative", 400)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()[0]
    query = (
        "SELECT * FROM readings WHERE sensor_id = ? "
        "ORDER BY recorded_at DESC, id DESC"
    )
    params: tuple = (sensor_id,)
    if limit is not None:
        query += " LIMIT ?"
        params += (limit,)
    rows = db.execute(query, params).fetchall()
    return jsonify({"items": [reading_json(row) for row in rows], "total": total})


@app.post("/api/sensors/<int:sensor_id>/readings")
@login_required
def create_reading(sensor_id: int):
    row = fetch_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("not allowed", 403)

    data = json_body()
    value = data.get("value")
    if isinstance(value, str):
        try:
            value = float(value)
        except ValueError:
            return error("value must be a number", 400)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return error("value must be a number", 400)
    value = float(value)
    if value != value or value in (float("inf"), float("-inf")):
        return error("value must be a number", 400)

    recorded_at = utcnow()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, recorded_at),
    )
    db.execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (value, recorded_at, sensor_id),
    )
    db.commit()
    reading = db.execute(
        "SELECT * FROM readings WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(reading_json(reading)), 201


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
