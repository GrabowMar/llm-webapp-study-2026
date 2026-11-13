"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "app.db"))

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def now_iso() -> str:
    """Timestamp used for `recorded_at` / `last_updated` (UTC, ISO 8601)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def error(message: str, status: int) -> tuple[Any, int]:
    return jsonify({"error": message}), status


def payload() -> dict[str, Any]:
    """JSON body of the request, falling back to form data."""
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    if request.form:
        return request.form.to_dict()
    return {}


def as_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def as_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
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
                last_value NUMERIC,
                last_updated TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                value NUMERIC NOT NULL,
                recorded_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings(sensor_id, recorded_at DESC, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


# --------------------------------------------------------------------------
# authentication
# --------------------------------------------------------------------------


def create_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso()))
    db.commit()
    return token


def user_for_token(token: str) -> sqlite3.Row | None:
    if not token:
        return None
    db = get_db()
    return db.execute(
        """
        SELECT users.id AS id, users.username AS username
        FROM tokens JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    return user_for_token(header.split(None, 1)[1].strip())


def require_user(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


# --------------------------------------------------------------------------
# serialisation
# --------------------------------------------------------------------------

SENSOR_QUERY = """
SELECT sensors.id, sensors.name, sensors.unit, sensors.location,
       sensors.last_value, sensors.last_updated, users.username AS owner
FROM sensors JOIN users ON users.id = sensors.owner_id
"""


def serialize_sensor(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
        "owner": row["owner"],
    }


def serialize_reading(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": row["value"],
        "recorded_at": row["recorded_at"],
    }


def fetch_sensor(sensor_id: int) -> sqlite3.Row | None:
    return get_db().execute(SENSOR_QUERY + " WHERE sensors.id = ?", (sensor_id,)).fetchone()


# --------------------------------------------------------------------------
# auth routes
# --------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = payload()
    username = as_text(data.get("username"))
    password = data.get("password")
    if not username:
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    user_id = cursor.lastrowid
    token = create_token(user_id)
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = payload()
    username = as_text(data.get("username"))
    password = data.get("password")
    if not username or not isinstance(password, str) or not password:
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = create_token(row["id"])
    return jsonify({"token": token, "user": {"id": row["id"], "username": row["username"]}}), 200


@app.post("/api/auth/logout")
@require_user
def logout():
    header = request.headers.get("Authorization", "")
    token = header.split(None, 1)[1].strip() if " " in header else ""
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return "", 204


@app.get("/api/me")
@require_user
def me():
    user = g.user
    return jsonify({"id": user["id"], "username": user["username"]}), 200


# --------------------------------------------------------------------------
# sensor routes
# --------------------------------------------------------------------------


@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(SENSOR_QUERY + " ORDER BY sensors.name ASC, sensors.id ASC").fetchall()
    return jsonify({"items": [serialize_sensor(row) for row in rows]}), 200


@app.post("/api/sensors")
@require_user
def create_sensor():
    data = payload()
    name = as_text(data.get("name"))
    if not name:
        return error("name is required", 400)
    unit = as_text(data.get("unit"))
    location = as_text(data.get("location"))

    db = get_db()
    cursor = db.execute(
        "INSERT INTO sensors (name, unit, location, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
        (name, unit, location, g.user["id"], now_iso()),
    )
    db.commit()
    row = fetch_sensor(cursor.lastrowid)
    return jsonify(serialize_sensor(row)), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    row = fetch_sensor(sensor_id)
    if row is None:
        return error("sensor not found", 404)
    return jsonify(serialize_sensor(row)), 200


@app.delete("/api/sensors/<int:sensor_id>")
@require_user
def delete_sensor(sensor_id: int):
    db = get_db()
    row = db.execute("SELECT owner_id FROM sensors WHERE id = ?", (sensor_id,)).fetchone()
    if row is None:
        return error("sensor not found", 404)
    if row["owner_id"] != g.user["id"]:
        return error("only the owner may delete this sensor", 403)

    db.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
    db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    db.commit()
    return "", 204


# --------------------------------------------------------------------------
# reading routes
# --------------------------------------------------------------------------


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM sensors WHERE id = ?", (sensor_id,)).fetchone() is None:
        return error("sensor not found", 404)

    total = db.execute("SELECT COUNT(*) AS n FROM readings WHERE sensor_id = ?", (sensor_id,)).fetchone()["n"]

    limit: int | None = None
    raw_limit = request.args.get("limit")
    if raw_limit is not None and raw_limit != "":
        try:
            limit = int(raw_limit)
        except ValueError:
            return error("limit must be an integer", 400)
        if limit < 0:
            return error("limit must not be negative", 400)

    sql = """
    SELECT id, sensor_id, value, recorded_at FROM readings
    WHERE sensor_id = ?
    ORDER BY recorded_at DESC, id DESC
    """
    params: list[Any] = [sensor_id]
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)
    rows = db.execute(sql, params).fetchall()
    return jsonify({"items": [serialize_reading(row) for row in rows], "total": total}), 200


@app.post("/api/sensors/<int:sensor_id>/readings")
@require_user
def create_reading(sensor_id: int):
    db = get_db()
    sensor = db.execute("SELECT owner_id FROM sensors WHERE id = ?", (sensor_id,)).fetchone()
    if sensor is None:
        return error("sensor not found", 404)
    if sensor["owner_id"] != g.user["id"]:
        return error("only the owner may post readings to this sensor", 403)

    data = payload()
    if "value" not in data:
        return error("value is required", 400)
    value = as_number(data.get("value"))
    if value is None:
        return error("value must be a number", 400)

    recorded_at = now_iso()
    cursor = db.execute(
        "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
        (sensor_id, value, recorded_at),
    )
    db.execute(
        "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
        (value, recorded_at, sensor_id),
    )
    db.commit()

    row = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_reading(row)), 201


# --------------------------------------------------------------------------
# misc
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if path == "":
        path = "index.html"
    if (DIST / path).is_file():
        response = send_from_directory(DIST, path)
        if path.endswith(".html"):
            response.headers["Cache-Control"] = "no-cache"
        return response
    if not (DIST / "index.html").is_file():
        return "frontend build not found; run `npm run build` in frontend/", 500
    response = send_from_directory(DIST, "index.html")
    response.headers["Cache-Control"] = "no-cache"
    return response
