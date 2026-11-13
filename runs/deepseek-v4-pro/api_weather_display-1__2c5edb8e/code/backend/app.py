"""Weather display application backend.

Serves a JSON API under /api and the built frontend under /.
"""

from __future__ import annotations

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
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "weather.db"

app = Flask(__name__, static_folder=None)

SAMPLE_REPORTS = [
    ("London", "United Kingdom", 12.4, "Cloudy", 76, 18),
    ("Tokyo", "Japan", 18.9, "Clear", 58, 11),
    ("New York", "United States", 22.1, "Partly cloudy", 64, 15),
    ("Sydney", "Australia", 27.3, "Sunny", 49, 22),
    ("Berlin", "Germany", 9.8, "Rain", 83, 27),
    ("Mumbai", "India", 31.5, "Humid", 88, 9),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS weather_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT NOT NULL COLLATE NOCASE UNIQUE,
            country TEXT NOT NULL,
            temperature_c REAL,
            condition TEXT,
            humidity REAL,
            wind_kph REAL,
            observed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS lookups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT NOT NULL,
            found INTEGER NOT NULL,
            looked_up_at TEXT NOT NULL
        );
        """
    )
    count = db.execute("SELECT COUNT(*) FROM weather_reports").fetchone()[0]
    if count == 0:
        for city, country, temp, cond, hum, wind in SAMPLE_REPORTS:
            db.execute(
                "INSERT INTO weather_reports "
                "(city, country, temperature_c, condition, humidity, wind_kph, observed_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (city, country, temp, cond, hum, wind, now_iso()),
            )
    db.commit()
    db.close()


init_db()


def report_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "country": row["country"],
        "temperature_c": row["temperature_c"],
        "condition": row["condition"],
        "humidity": row["humidity"],
        "wind_kph": row["wind_kph"],
        "observed_at": row["observed_at"],
    }


def lookup_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT users.id, users.username FROM sessions "
        "JOIN users ON users.id = sessions.user_id WHERE sessions.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "Authentication required"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def error(message: str, status: int):
    return jsonify({"error": message}), status


def _validate_username(username) -> str | None:
    if not isinstance(username, str) or not username.strip():
        return "username is required"
    return None


def _validate_password(password) -> str | None:
    if not isinstance(password, str) or not password:
        return "password is required"
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    err = _validate_username(username) or _validate_password(password)
    if err:
        return error(err, 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return error("username is already taken", 400)

    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username.strip(), generate_password_hash(password)),
    )
    db.commit()
    return "", 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    err = _validate_username(username) or _validate_password(password)
    if err:
        return error(err, 400)

    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


def _parse_report_fields(data: dict, *, for_update: bool):
    """Validate report payload and return (fields_dict, error_message)."""
    city = data.get("city")
    country = data.get("country")

    if not isinstance(city, str) or not city.strip():
        return None, "city is required"
    if not isinstance(country, str) or not country.strip():
        return None, "country is required"

    def optional_number(key, allow_float=True):
        if key not in data or data[key] is None:
            return None, None
        value = data[key]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return None, f"{key} must be a number"
        if not allow_float and float(value) != int(value):
            return None, f"{key} must be an integer"
        return value, None

    def optional_string(key):
        if key not in data or data[key] is None:
            return None, None
        value = data[key]
        if not isinstance(value, str) or not value.strip():
            return None, f"{key} must be a non-empty string"
        return value.strip(), None

    temp, err = optional_number("temperature_c")
    if err:
        return None, err
    humidity, err = optional_number("humidity")
    if err:
        return None, err
    wind, err = optional_number("wind_kph")
    if err:
        return None, err
    cond, err = optional_string("condition")
    if err:
        return None, err

    fields = {
        "city": city.strip(),
        "country": country.strip(),
        "temperature_c": temp,
        "condition": cond,
        "humidity": humidity,
        "wind_kph": wind,
    }
    return fields, None


@app.get("/api/weather")
def list_weather():
    db = get_db()
    city = request.args.get("city")
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20

    if city is not None:
        city = city.strip()
        row = db.execute(
            "SELECT * FROM weather_reports WHERE city = ? COLLATE NOCASE", (city,)
        ).fetchone()
        found = row is not None
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city, int(found), now_iso()),
        )
        db.commit()

        items = [report_to_dict(row)] if row else []
        return jsonify(
            {"items": items, "total": len(items), "page": 1, "page_size": page_size}
        )

    total = db.execute("SELECT COUNT(*) FROM weather_reports").fetchone()[0]
    offset = (page - 1) * page_size
    rows = db.execute(
        "SELECT * FROM weather_reports ORDER BY city COLLATE NOCASE LIMIT ? OFFSET ?",
        (page_size, offset),
    ).fetchall()
    items = [report_to_dict(r) for r in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/weather")
@login_required
def create_weather():
    data = request.get_json(silent=True) or {}
    fields, err = _parse_report_fields(data, for_update=False)
    if err:
        return error(err, 400)

    db = get_db()
    exists = db.execute(
        "SELECT id FROM weather_reports WHERE city = ? COLLATE NOCASE", (fields["city"],)
    ).fetchone()
    if exists:
        return error("a report for this city already exists", 400)

    cur = db.execute(
        "INSERT INTO weather_reports "
        "(city, country, temperature_c, condition, humidity, wind_kph, observed_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            fields["city"],
            fields["country"],
            fields["temperature_c"],
            fields["condition"],
            fields["humidity"],
            fields["wind_kph"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM weather_reports WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(report_to_dict(row)), 201


@app.get("/api/weather/recent")
def recent_lookups():
    limit = request.args.get("limit", 5, type=int)
    if limit < 1:
        limit = 5
    db = get_db()
    rows = db.execute(
        "SELECT * FROM lookups ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"items": [lookup_to_dict(r) for r in rows]})


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM weather_reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        return error("report not found", 404)
    return jsonify(report_to_dict(row))


@app.put("/api/weather/<int:report_id>")
@login_required
def update_weather(report_id):
    data = request.get_json(silent=True) or {}
    fields, err = _parse_report_fields(data, for_update=True)
    if err:
        return error(err, 400)

    db = get_db()
    row = db.execute(
        "SELECT id FROM weather_reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        return error("report not found", 404)

    exists = db.execute(
        "SELECT id FROM weather_reports WHERE city = ? COLLATE NOCASE AND id != ?",
        (fields["city"], report_id),
    ).fetchone()
    if exists:
        return error("a report for this city already exists", 400)

    db.execute(
        "UPDATE weather_reports SET city = ?, country = ?, temperature_c = ?, "
        "condition = ?, humidity = ?, wind_kph = ?, observed_at = ? WHERE id = ?",
        (
            fields["city"],
            fields["country"],
            fields["temperature_c"],
            fields["condition"],
            fields["humidity"],
            fields["wind_kph"],
            now_iso(),
            report_id,
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM weather_reports WHERE id = ?", (report_id,)
    ).fetchone()
    return jsonify(report_to_dict(row))


@app.delete("/api/weather/<int:report_id>")
@login_required
def delete_weather(report_id):
    db = get_db()
    row = db.execute(
        "SELECT id FROM weather_reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        return error("report not found", 404)
    db.execute("DELETE FROM weather_reports WHERE id = ?", (report_id,))
    db.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
