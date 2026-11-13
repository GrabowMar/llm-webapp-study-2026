"""Weather display: Flask API backed by SQLite and a static React frontend."""

from __future__ import annotations

import hashlib
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
DATA_DIR = Path(os.environ.get("WEATHER_DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "weather.sqlite3"

app = Flask(__name__, static_folder=None)

SAMPLE_REPORTS = [
    {"city": "Cairo", "country": "Egypt", "temperature_c": 31.0,
     "condition": "Sunny", "humidity": 28, "wind_kph": 11.0},
    {"city": "London", "country": "United Kingdom", "temperature_c": 12.5,
     "condition": "Cloudy", "humidity": 78, "wind_kph": 16.0},
    {"city": "New York", "country": "United States", "temperature_c": 17.0,
     "condition": "Partly cloudy", "humidity": 61, "wind_kph": 9.5},
    {"city": "Paris", "country": "France", "temperature_c": 15.0,
     "condition": "Rainy", "humidity": 72, "wind_kph": 13.0},
    {"city": "Sydney", "country": "Australia", "temperature_c": 22.0,
     "condition": "Clear", "humidity": 55, "wind_kph": 20.0},
    {"city": "Tokyo", "country": "Japan", "temperature_c": 19.5,
     "condition": "Windy", "humidity": 64, "wind_kph": 24.0},
]

REPORT_FIELDS = (
    "id", "city", "country", "temperature_c", "condition", "humidity",
    "wind_kph", "observed_at",
)
LOOKUP_FIELDS = ("id", "city", "found", "looked_up_at")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS weather (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                city          TEXT NOT NULL COLLATE NOCASE UNIQUE,
                country       TEXT,
                temperature_c REAL NOT NULL,
                condition     TEXT,
                humidity      REAL,
                wind_kph      REAL,
                observed_at   TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS lookups (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                city         TEXT NOT NULL,
                found        INTEGER NOT NULL DEFAULT 0,
                looked_up_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        conn.execute("BEGIN IMMEDIATE")
        try:
            already = conn.execute(
                "SELECT value FROM meta WHERE key = 'seeded'"
            ).fetchone()
            if already is None:
                stamp = now_iso()
                for item in SAMPLE_REPORTS:
                    conn.execute(
                        """INSERT OR IGNORE INTO weather
                           (city, country, temperature_c, condition, humidity,
                            wind_kph, observed_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (item["city"], item["country"], item["temperature_c"],
                         item["condition"], item["humidity"], item["wind_kph"],
                         stamp),
                    )
                conn.execute(
                    "INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', '1')"
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def report_dict(row) -> dict:
    return {field: row[field] for field in REPORT_FIELDS}


def lookup_dict(row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def fail(status: int, message: str, errors: dict | None = None):
    payload = {"error": message, "message": message}
    if errors:
        payload["errors"] = errors
        payload["message"] = " ".join(errors.values())
    return jsonify(payload), status


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user_id():
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT user_id FROM tokens WHERE token_hash = ?", (token_hash(token),)
    ).fetchone()
    return row["user_id"] if row else None


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user_id() is None:
            response = fail(401, "Authentication required.")
            return response[0], response[1], {"WWW-Authenticate": "Bearer"}
        return view(*args, **kwargs)

    return wrapped


def _text(data, key, errors, *, required=False):
    value = data.get(key)
    if value is None or value == "":
        if required:
            errors[key] = f"{key.replace('_', ' ').capitalize()} is required."
        return None
    if not isinstance(value, str):
        errors[key] = f"{key.replace('_', ' ').capitalize()} must be a string."
        return None
    value = value.strip()
    if not value:
        if required:
            errors[key] = f"{key.replace('_', ' ').capitalize()} is required."
        return None
    return value


def _number(data, key, label, errors, *, required=False, minimum=None, maximum=None):
    value = data.get(key)
    if value is None or value == "":
        if required:
            errors[key] = f"{label} is required."
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors[key] = f"{label} must be a number."
        return None
    value = float(value)
    if not math.isfinite(value):
        errors[key] = f"{label} must be a finite number."
        return None
    if minimum is not None and value < minimum:
        errors[key] = f"{label} must be at least {minimum:g}."
        return None
    if maximum is not None and value > maximum:
        errors[key] = f"{label} must be at most {maximum:g}."
        return None
    return value


def validate_report(data):
    """Full replacement validation: omitted optional fields become None."""
    errors: dict[str, str] = {}
    values = {
        "city": _text(data, "city", errors, required=True),
        "country": _text(data, "country", errors),
        "temperature_c": _number(data, "temperature_c", "Temperature", errors,
                                 required=True),
        "condition": _text(data, "condition", errors),
        "humidity": _number(data, "humidity", "Humidity", errors,
                            minimum=0, maximum=100),
        "wind_kph": _number(data, "wind_kph", "Wind speed", errors, minimum=0),
    }
    if values["humidity"] is not None:
        values["humidity"] = round(values["humidity"], 2)
    return values, errors


def parse_int(value, default, low, high):
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(low, min(high, parsed))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return fail(400, "A JSON object is required.")
    username = _text(data, "username", {}, required=True)
    password = data.get("password")
    errors = {}
    if not username:
        errors["username"] = "Username is required."
    elif len(username) > 120:
        errors["username"] = "Username must be at most 120 characters."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return fail(400, "Validation failed.", errors)

    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return fail(409, "Username is already taken.",
                    {"username": "Username is already taken."})
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        return fail(409, "Username is already taken.",
                    {"username": "Username is already taken."})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return fail(400, "A JSON object is required.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return fail(400, "Username and password are required.",
                    {"username": "Username and password are required."})
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return fail(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_hash(token), row["id"], now_iso()),
    )
    return jsonify({"token": token})


@app.get("/api/auth/me")
@require_auth
def me():
    row = get_db().execute(
        "SELECT id, username FROM users WHERE id = ?", (current_user_id(),)
    ).fetchone()
    return {"id": row["id"], "username": row["username"]}


@app.get("/api/weather/recent")
def recent_lookups():
    limit = parse_int(request.args.get("limit"), 10, 1, 100)
    rows = get_db().execute(
        "SELECT * FROM lookups ORDER BY looked_up_at DESC, id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return {"items": [lookup_dict(row) for row in rows]}


@app.get("/api/weather")
def list_weather():
    db = get_db()
    page = parse_int(request.args.get("page"), 1, 1, 1_000_000)
    page_size = parse_int(request.args.get("page_size"), 10, 1, 100)

    where = ""
    params: list = []
    raw_city = request.args.get("city")
    if raw_city is not None and raw_city.strip():
        city = raw_city.strip()
        where = " WHERE city = ?"
        params = [city]
        found = db.execute(
            "SELECT 1 FROM weather WHERE city = ?", (city,)
        ).fetchone() is not None
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city, int(found), now_iso()),
        )
        db.commit()

    total = db.execute(
        "SELECT COUNT(*) AS n FROM weather" + where, params
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM weather" + where
        + " ORDER BY city COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [report_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/weather")
@require_auth
def create_weather():
    data = json_body()
    if data is None:
        return fail(400, "A JSON object is required.")
    values, errors = validate_report(data)
    if errors:
        return fail(400, "Validation failed.", errors)
    db = get_db()
    if db.execute("SELECT id FROM weather WHERE city = ?", (values["city"],)).fetchone():
        return fail(409, "A report for this city already exists.",
                    {"city": "A report for this city already exists."})
    try:
        cur = db.execute(
            """INSERT INTO weather
               (city, country, temperature_c, condition, humidity, wind_kph,
                observed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (values["city"], values["country"], values["temperature_c"],
             values["condition"], values["humidity"], values["wind_kph"],
             now_iso()),
        )
    except sqlite3.IntegrityError:
        return fail(409, "A report for this city already exists.",
                    {"city": "A report for this city already exists."})
    row = db.execute("SELECT * FROM weather WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(report_dict(row)), 201


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    row = get_db().execute(
        "SELECT * FROM weather WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        return fail(404, "Weather report not found.")
    return report_dict(row)


@app.put("/api/weather/<int:report_id>")
@require_auth
def update_weather(report_id: int):
    db = get_db()
    if db.execute("SELECT id FROM weather WHERE id = ?", (report_id,)).fetchone() is None:
        return fail(404, "Weather report not found.")
    data = json_body()
    if data is None:
        return fail(400, "A JSON object is required.")
    values, errors = validate_report(data)
    if errors:
        return fail(400, "Validation failed.", errors)
    clash = db.execute(
        "SELECT id FROM weather WHERE city = ? AND id <> ?",
        (values["city"], report_id),
    ).fetchone()
    if clash:
        return fail(409, "A report for this city already exists.",
                    {"city": "A report for this city already exists."})
    try:
        db.execute(
            """UPDATE weather SET city = ?, country = ?, temperature_c = ?,
               condition = ?, humidity = ?, wind_kph = ?, observed_at = ?
               WHERE id = ?""",
            (values["city"], values["country"], values["temperature_c"],
             values["condition"], values["humidity"], values["wind_kph"],
             now_iso(), report_id),
        )
    except sqlite3.IntegrityError:
        return fail(409, "A report for this city already exists.",
                    {"city": "A report for this city already exists."})
    row = db.execute("SELECT * FROM weather WHERE id = ?", (report_id,)).fetchone()
    return report_dict(row)


@app.delete("/api/weather/<int:report_id>")
@require_auth
def delete_weather(report_id: int):
    db = get_db()
    cur = db.execute("DELETE FROM weather WHERE id = ?", (report_id,))
    if cur.rowcount == 0:
        return fail(404, "Weather report not found.")
    return jsonify({"message": "Weather report deleted.", "id": report_id})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return fail(404, "Not found.")
    if not DIST.is_dir():
        return fail(404, "Frontend build not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
