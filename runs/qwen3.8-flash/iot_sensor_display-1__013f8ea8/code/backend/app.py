"""Sensor dashboard API and frontend server."""

import os
import re
import secrets
import sqlite3
import hashlib
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "sensors.db"

PBKDF2_ITERATIONS = 120_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
DEFAULT_READING_LIMIT = 100
MAX_READING_LIMIT = 1000

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            unit TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL DEFAULT '',
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
        CREATE INDEX IF NOT EXISTS idx_readings_sensor ON readings (sensor_id, recorded_at DESC);
        """
    )
    db.commit()
    db.close()


def hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return digest.hex()


def error(status: int, message: str):
    return jsonify({"error": message}), status


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"], "token": token}


class ApiError(Exception):
    def __init__(self, response):
        self.response = response


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return exc.response


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(error(401, "authentication required"))
    return user


def body_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(error(400, "request body must be a JSON object"))
    return data


def sensor_to_json(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "unit": row["unit"],
        "location": row["location"],
        "last_value": row["last_value"],
        "last_updated": row["last_updated"],
        "owner": row["owner"],
    }


def reading_to_json(row) -> dict:
    return {
        "id": row["id"],
        "sensor_id": row["sensor_id"],
        "value": row["value"],
        "recorded_at": row["recorded_at"],
    }


SENSOR_SELECT = (
    "SELECT s.id, s.name, s.unit, s.location, s.last_value, s.last_updated, "
    "u.username AS owner FROM sensors s JOIN users u ON u.id = s.owner_id"
)


def get_sensor_or_404(sensor_id: int):
    row = get_db().execute(f"{SENSOR_SELECT} WHERE s.id = ?", (sensor_id,)).fetchone()
    if row is None:
        raise ApiError(error(404, "sensor not found"))
    return row


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        return error(
            400, "username must match [A-Za-z0-9_.-]{1,64}"
        )
    if not isinstance(password, str) or len(password) < 4:
        return error(400, "password must be a string of at least 4 characters")
    db = get_db()
    try:
        with db:
            salt = secrets.token_bytes(16)
            db.execute(
                "INSERT INTO users (username, password_hash, salt, created_at) "
                "VALUES (?, ?, ?, ?)",
                (username, hash_password(password, salt), salt.hex(), now_iso()),
            )
    except sqlite3.IntegrityError:
        return error(409, "username already taken")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(401, "invalid credentials")
    row = get_db().execute(
        "SELECT id, password_hash, salt FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        hash_password(password, secrets.token_bytes(16))
        return error(401, "invalid credentials")
    if not secrets.compare_digest(
        row["password_hash"], hash_password(password, bytes.fromhex(row["salt"]))
    ):
        return error(401, "invalid credentials")
    token = secrets.token_urlsafe(32)
    db = get_db()
    with db:
        db.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], now_iso()),
        )
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"username": user["username"]})


@app.get("/api/sensors")
def list_sensors():
    rows = get_db().execute(f"{SENSOR_SELECT} ORDER BY s.name COLLATE NOCASE, s.id").fetchall()
    return jsonify({"items": [sensor_to_json(r) for r in rows]})


@app.post("/api/sensors")
def create_sensor():
    user = require_user()
    data = body_json()
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return error(400, "name is required")
    unit = data.get("unit", "")
    location = data.get("location", "")
    if not isinstance(unit, str) or not isinstance(location, str):
        return error(400, "unit and location must be strings")
    db = get_db()
    with db:
        cur = db.execute(
            "INSERT INTO sensors (owner_id, name, unit, location, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (user["id"], name.strip(), unit.strip(), location.strip(), now_iso()),
        )
    sensor = get_sensor_or_404(cur.lastrowid)
    return jsonify(sensor_to_json(sensor)), 201


@app.get("/api/sensors/<int:sensor_id>")
def get_sensor(sensor_id: int):
    return jsonify(sensor_to_json(get_sensor_or_404(sensor_id)))


@app.delete("/api/sensors/<int:sensor_id>")
def delete_sensor(sensor_id: int):
    user = require_user()
    row = get_db().execute(
        "SELECT owner_id FROM sensors WHERE id = ?", (sensor_id,)
    ).fetchone()
    if row is None:
        return error(404, "sensor not found")
    if row["owner_id"] != user["id"]:
        return error(403, "not your sensor")
    db = get_db()
    with db:
        db.execute("DELETE FROM readings WHERE sensor_id = ?", (sensor_id,))
        db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
    return "", 204


@app.get("/api/sensors/<int:sensor_id>/readings")
def list_readings(sensor_id: int):
    get_sensor_or_404(sensor_id)
    limit_raw = request.args.get("limit")
    limit = DEFAULT_READING_LIMIT
    if limit_raw is not None:
        try:
            limit = int(limit_raw)
        except ValueError:
            return error(400, "limit must be an integer")
        if limit < 1 or limit > MAX_READING_LIMIT:
            return error(400, f"limit must be between 1 and {MAX_READING_LIMIT}")
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM readings WHERE sensor_id = ?", (sensor_id,)
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings "
        "WHERE sensor_id = ? ORDER BY recorded_at DESC, id DESC LIMIT ?",
        (sensor_id, limit),
    ).fetchall()
    return jsonify(
        {"items": [reading_to_json(r) for r in rows], "total": total}
    )


@app.post("/api/sensors/<int:sensor_id>/readings")
def create_reading(sensor_id: int):
    user = require_user()
    row = get_db().execute(
        "SELECT owner_id FROM sensors WHERE id = ?", (sensor_id,)
    ).fetchone()
    if row is None:
        return error(404, "sensor not found")
    if row["owner_id"] != user["id"]:
        return error(403, "not your sensor")
    data = body_json()
    value = data.get("value")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return error(400, "value must be a number")
    recorded_at = now_iso()
    db = get_db()
    with db:
        cur = db.execute(
            "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
            (sensor_id, float(value), recorded_at),
        )
        db.execute(
            "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
            (float(value), recorded_at, sensor_id),
        )
    reading = db.execute(
        "SELECT id, sensor_id, value, recorded_at FROM readings WHERE id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(reading_to_json(reading)), 201


@app.errorhandler(404)
def not_found(exc):
    if request.path.startswith("/api/"):
        return error(404, "not found")
    return exc


@app.errorhandler(405)
def method_not_allowed(exc):
    if request.path.startswith("/api/"):
        return error(405, "method not allowed")
    return exc


STATIC_SUFFIXES = (".js", ".css", ".map", ".json", ".ico", ".png", ".svg", ".woff", ".woff2")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "not found")
    candidate = DIST / path
    if path and candidate.is_file():
        return send_from_directory(DIST, path)
    if path.startswith("assets/") or path.endswith(STATIC_SUFFIXES):
        return error(404, "not found")
    return send_from_directory(DIST, "index.html")


init_db()
