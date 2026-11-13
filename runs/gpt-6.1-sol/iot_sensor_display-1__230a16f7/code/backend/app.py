import hashlib
import math
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
SENSOR_QUERY = """
    SELECT sensors.id, sensors.name, sensors.unit, sensors.location,
           sensors.last_value, sensors.last_updated, users.username AS owner
    FROM sensors JOIN users ON users.id = sensors.owner_id
"""


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(g.database_path, timeout=20)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError("A JSON object is required.", 400)
    return body


def text_field(body, name, maximum, required=True, strip=True):
    value = body.get(name, "")
    if not isinstance(value, str):
        raise ApiError(f"{name} must be text.", 400)
    if strip:
        value = value.strip()
    if (required and not value) or len(value) > maximum:
        raise ApiError(f"{name} must contain {'1' if required else '0'}–{maximum} characters.", 400)
    return value


class ApiError(Exception):
    def __init__(self, message, status):
        self.message = message
        self.status = status


def authenticated(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "").split()
        if len(header) != 2 or header[0].lower() != "bearer":
            raise ApiError("Sign in to continue.", 401)
        digest = hashlib.sha256(header[1].encode()).hexdigest()
        user = get_db().execute(
            """SELECT users.id, users.username FROM sessions
               JOIN users ON users.id = sessions.user_id
               WHERE token_hash = ? AND expires_at > ?""",
            (digest, utc_now()),
        ).fetchone()
        if user is None:
            raise ApiError("Your session has expired. Please sign in again.", 401)
        g.user = user
        g.token_hash = digest
        return view(*args, **kwargs)

    return wrapped


def find_sensor(sensor_id, owned=False):
    sensor = get_db().execute(SENSOR_QUERY + " WHERE sensors.id = ?", (sensor_id,)).fetchone()
    if sensor is None:
        raise ApiError("Sensor not found.", 404)
    if owned and sensor["owner"] != g.user["username"]:
        raise ApiError("Only the sensor owner can perform this action.", 403)
    return dict(sensor)


def create_app(config=None):
    application = Flask(__name__, static_folder=None)
    application.config.update(
        DATABASE=os.environ.get("DATABASE_PATH", str(Path.cwd() / "data" / "sensors.sqlite3")),
        MAX_CONTENT_LENGTH=16384,
    )
    if config:
        application.config.update(config)
    database_path = Path(application.config["DATABASE"])
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database_path, timeout=20)) as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sensors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_id INTEGER NOT NULL REFERENCES users(id),
                name TEXT NOT NULL,
                unit TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                last_value REAL,
                last_updated TEXT
            );
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sensor_id INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
                value REAL NOT NULL,
                recorded_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS readings_sensor_id ON readings(sensor_id, id DESC);
            CREATE INDEX IF NOT EXISTS sessions_user_id ON sessions(user_id);
        """)

    @application.before_request
    def database_config():
        g.database_path = application.config["DATABASE"]

    @application.teardown_appcontext
    def close_db(error=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @application.errorhandler(ApiError)
    def api_error(error):
        return {"error": error.message}, error.status

    @application.errorhandler(HTTPException)
    def http_error(error):
        if request.path == "/api" or request.path.startswith("/api/"):
            return {"error": error.description}, error.code
        return error

    @application.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.get("/api/health")
    def health():
        return {"status": "ok"}

    @application.post("/api/auth/register")
    def register():
        body = json_body()
        username = text_field(body, "username", 64)
        password = text_field(body, "password", 256, strip=False)
        password_hash = generate_password_hash(password)
        db = get_db()
        try:
            with db:
                db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, password_hash))
        except sqlite3.IntegrityError:
            raise ApiError("That username is already taken.", 409) from None
        return {"username": username}, 201

    @application.post("/api/auth/login")
    def login():
        body = json_body()
        username = text_field(body, "username", 64)
        password = text_field(body, "password", 256, strip=False)
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            raise ApiError("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(timespec="microseconds")
        with db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now(),))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"], expires),
            )
        return {"token": token}

    @application.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @application.post("/api/auth/logout")
    @authenticated
    def logout():
        db = get_db()
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @application.get("/api/sensors")
    def sensors():
        rows = get_db().execute(SENSOR_QUERY + " ORDER BY sensors.name COLLATE NOCASE, sensors.id").fetchall()
        return {"items": [dict(row) for row in rows]}

    @application.post("/api/sensors")
    @authenticated
    def add_sensor():
        body = json_body()
        name = text_field(body, "name", 120)
        unit = text_field(body, "unit", 32, required=False)
        location = text_field(body, "location", 160, required=False)
        db = get_db()
        with db:
            cursor = db.execute(
                "INSERT INTO sensors (owner_id, name, unit, location) VALUES (?, ?, ?, ?)",
                (g.user["id"], name, unit, location),
            )
        return find_sensor(cursor.lastrowid), 201

    @application.get("/api/sensors/<int:sensor_id>")
    def sensor(sensor_id):
        return find_sensor(sensor_id)

    @application.delete("/api/sensors/<int:sensor_id>")
    @authenticated
    def delete_sensor(sensor_id):
        find_sensor(sensor_id, owned=True)
        db = get_db()
        with db:
            db.execute("DELETE FROM sensors WHERE id = ?", (sensor_id,))
        return "", 204

    @application.get("/api/sensors/<int:sensor_id>/readings")
    def readings(sensor_id):
        find_sensor(sensor_id)
        try:
            limit = int(request.args.get("limit", "100"))
        except ValueError:
            raise ApiError("limit must be an integer between 1 and 1000.", 400) from None
        if not 1 <= limit <= 1000:
            raise ApiError("limit must be an integer between 1 and 1000.", 400)
        db = get_db()
        with db:
            rows = db.execute(
                "SELECT * FROM readings WHERE sensor_id = ? ORDER BY id DESC LIMIT ?", (sensor_id, limit)
            ).fetchall()
            total = db.execute("SELECT COUNT(*) FROM readings WHERE sensor_id = ?", (sensor_id,)).fetchone()[0]
        return {"items": [dict(row) for row in rows], "total": total}

    @application.post("/api/sensors/<int:sensor_id>/readings")
    @authenticated
    def add_reading(sensor_id):
        find_sensor(sensor_id, owned=True)
        raw_value = json_body().get("value")
        try:
            value = float(raw_value) if type(raw_value) in (int, float) else None
            valid = value is not None and math.isfinite(value)
        except OverflowError:
            valid = False
        if not valid:
            raise ApiError("value must be a finite number.", 400)
        db = get_db()
        with db:
            db.execute("BEGIN IMMEDIATE")
            find_sensor(sensor_id, owned=True)
            recorded_at = utc_now()
            cursor = db.execute(
                "INSERT INTO readings (sensor_id, value, recorded_at) VALUES (?, ?, ?)",
                (sensor_id, value, recorded_at),
            )
            db.execute(
                "UPDATE sensors SET last_value = ?, last_updated = ? WHERE id = ?",
                (value, recorded_at, sensor_id),
            )
        return {"id": cursor.lastrowid, "sensor_id": sensor_id, "value": value, "recorded_at": recorded_at}, 201

    @application.get("/")
    @application.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            raise ApiError("API endpoint not found.", 404)
        candidate = (DIST / path).resolve()
        if candidate.is_relative_to(DIST.resolve()) and candidate.is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return application


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
