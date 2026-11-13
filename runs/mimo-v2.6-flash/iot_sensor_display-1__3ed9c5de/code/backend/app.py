"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "dashboard.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token   TEXT    PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sensors (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    unit         TEXT    NOT NULL DEFAULT '',
    location     TEXT    NOT NULL DEFAULT '',
    last_value   TEXT,
    last_updated TEXT,
    owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id   INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
    value       TEXT    NOT NULL,
    recorded_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensors_owner ON sensors(owner_id);
CREATE INDEX IF NOT EXISTS idx_sensors_name ON sensors(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_readings_sensor
    ON readings(sensor_id, recorded_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)


# ----------------------------------------------------------------- helpers


def error(message: str, status: int):
    return jsonify({"error": message}), status


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def encode(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def decode(raw: str | None) -> Any:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return raw


def body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def text_field(data: dict[str, Any], key: str) -> str | None:
    """Return a non-empty stripped string, or None when invalid."""
    value = data.get(key)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def row_to_sensor(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": decode(row["last_value"]),
        "last_updated": row["last_updated"],
        "owner": row["owner"],
    }


def row_to_reading(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": decode(row["value"]),
        "recorded_at": row["recorded_at"],
    }


SENSOR_SELECT = """
    SELECT s.id, s.name, s.unit, s.location, s.last_value, s.last_updated,
           u.username AS owner
    FROM sensors s
    JOIN users u ON u.id = s.owner_id
"""


# -------------------------------------------------------------------- auth


def current_user() -> dict[str, Any] | None:
    if "user" in g:
        return g.user

    found: dict[str, Any] | None = None
    header = request.headers.get("Authorization", "")
    scheme, _, raw = header.partition(" ")
    token = raw.strip()
    if scheme.lower() == "bearer" and token:
        row = get_db().execute(
            """
            SELECT u.id, u.username
            FROM tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token = ?
            """,
            (token,),
        ).fetchone()
        if row is not None:
            found = {"id": row["id"], "username": row["username"]}

    g.user = found
    return found


def require_auth(view):
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return error("authentication required", 401)
        return view(*args, **kwargs)

    return wrapped


def owned_sensor(sensor_id: int):
    """Fetch a sensor for the signed-in user.

    Returns (sensor_row, None) when found and owned, (None, response)
    otherwise.
    """
    row = get_db().execute(
        SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)
    ).fetchone()
    if row is None:
        return None, error("sensor not found", 404)
    user = current_user()
    if user is None or row["owner"].lower() != user["username"].lower():
        return None, error("you do not own this sensor", 403)
    return row, None


# ------------------------------------------------------------------ routes


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if username is None:
        return error("username is required", 400)
    if password is None:
        return error("password is required", 400)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        return error("username already exists", 409)
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = text_field(data, "username")
    password = text_field(data, "password")
    if username is None or password is None:
        return error("username and password are required", 400)

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, row["id"])
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(
        SENSOR_SELECT + " ORDER BY s.name COLLATE NOCASE ASC, s.name ASC, s.id ASC"
    ).fetchall()
    return jsonify({"items": [row_to_sensor(r) for r in rows]})


@app.post("/api/sensors")
@require_auth
def create_sensor():
    data = body()
    name = text_field(data, "name")
    if name is None:
        return error("name is required", 400)
    unit = data.get("unit", "")
    location = data.get("location", "")
    if not isinstance(unit, str) or not isinstance(location, str):
        return error("unit and location must be strings", 400)

    user = current_user()
    db = get_db()
    cur = db.execute(
        "INSERT INTO sensors (name, unit, location, owner_id) VALUES (?, ?, ?, ?)",
        (name, unit, location, user["id"]),
    )
    db.commit()
    row = db.execute(
        SENSOR_SELECT + " WHERE s.id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(row_to_sensor(row)), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    row = get_db().execute(
        SENSOR_SELECT + " WHERE s.id = ?", (sensor_id,)
    ).fetchone()
    if row is None:
        return error("sensor not found", 404)
    return jsonify(row_to_sensor(row))


@app.delete("/api/sensors/<int:sensor_id>")
@require_auth
def delete_sensor(sensor_id: int):
    row, failure = owned_sensor(sensor_id)
    if failure is not None:
        return failure
    db = get_db()
    db.execute("DELETE FROM sensors WHERE id = ?", (row["id"],))
    db.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    db = get_db()
    sensor = db.execute(
        "SELECT id FROM sensors WHERE id = ?", (sensor_id,)
    ).fetchone()
    if sensor is None:
        return error("sensor not found", 404)

    limit: int | None = None
    raw_limit = request.args.get("limit")
    if raw_limit is not None:
        try:
            limit = int(raw_limit)
        except ValueError:
            return error("limit must be an integer", 400)
        if limit < 0:
            return error("limit must not be negative", 400)

    total = db.execute(
        "SELECT COUNT(*) AS n FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()["n"]

    query = (
        "SELECT id, sensor_id, value, recorded_at FROM readings "
        "WHERE sensor_id = ? ORDER BY recorded_at DESC, id DESC"
    )
    params: list[Any] = [sensor_id]
    if limit is not None:
        query += " LIMIT ?"
        params.append(limit)
    rows = db.execute(query, params).fetchall()
    return jsonify({"items": [row_to_reading(r) for r in rows], "total": total})


@app.post("/api/sensors/<int:sensor_id>/readings")
@require_auth
def create_reading(sensor_id: int):
    _row, failure = owned_sensor(sensor_id)
    if failure is not None:
        return failure

    data = body()
    if "value" not in data or data.get("value") is None:
        return error("value is required", 400)

    recorded_at = now_iso()
    value = encode(data.get("value"))
    db = get_db()
    cur = db.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, recorded_at),
    )
    db.execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (value, recorded_at, sensor_id),
    )
    db.commit()
    row = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(row_to_reading(row)), 201


# ------------------------------------------------- unknown API routes / SPA


@app.get("/api/<path:rest>")
def api_not_found(rest: str):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
