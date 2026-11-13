"""Flask entry point: JSON API and the built React frontend."""

from __future__ import annotations

import math
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "weather.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL COLLATE NOCASE UNIQUE,
    country TEXT,
    temperature_c REAL,
    condition TEXT,
    humidity INTEGER,
    wind_kph REAL,
    observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    found INTEGER NOT NULL,
    looked_up_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

SAMPLE_REPORTS = [
    ("London", "United Kingdom", 13.5, "Overcast", 78, 18.0),
    ("Paris", "France", 17.0, "Partly cloudy", 64, 12.5),
    ("New York", "United States", 21.0, "Sunny", 52, 15.0),
    ("Tokyo", "Japan", 24.5, "Light rain", 81, 9.5),
    ("Sydney", "Australia", 19.0, "Clear", 58, 22.0),
    ("Cairo", "Egypt", 30.0, "Sunny", 35, 14.0),
]


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        conn.commit()
        seeded = conn.execute("SELECT value FROM meta WHERE key = 'seeded'").fetchone()
        if seeded is None:
            existing = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
            if existing == 0:
                now = utc_now()
                conn.executemany(
                    "INSERT OR IGNORE INTO reports "
                    "(city, country, temperature_c, condition, humidity, wind_kph, observed_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [(*report, now) for report in SAMPLE_REPORTS],
                )
            conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')")
            conn.commit()
    finally:
        conn.close()


init_db()


def report_json(row: sqlite3.Row) -> dict[str, Any]:
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


def lookup_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def error_response(message: str, status: int, errors: dict[str, list[str]] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if not token:
        return None
    db = get_db()
    return db.execute(
        "SELECT users.* FROM users JOIN tokens ON tokens.user_id = users.id WHERE tokens.token = ?",
        (token,),
    ).fetchone()


def auth_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return error_response("Authentication required.", 401)
        return view(*args, **kwargs)

    return wrapped


def request_json() -> dict[str, Any] | None:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None
    return payload


def parse_positive_int(name: str, default: int) -> tuple[int | None, Any]:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None, error_response(f"'{name}' must be a positive integer.", 400)
    if value < 1:
        return None, error_response(f"'{name}' must be a positive integer.", 400)
    return value, None


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def validate_report(payload: dict[str, Any]) -> tuple[dict[str, Any], dict[str, list[str]]]:
    values: dict[str, Any] = {}
    errors: dict[str, list[str]] = {}

    city = payload.get("city")
    if not isinstance(city, str) or not city.strip():
        errors.setdefault("city", []).append("City is required.")
    else:
        values["city"] = city.strip()

    for field, label in (("country", "Country"), ("condition", "Condition")):
        raw = payload.get(field)
        if raw is None:
            values[field] = None
        elif isinstance(raw, str):
            values[field] = raw.strip() or None
        else:
            errors.setdefault(field, []).append(f"{label} must be a string.")

    raw_temp = payload.get("temperature_c")
    if raw_temp is None:
        values["temperature_c"] = None
    elif is_number(raw_temp):
        values["temperature_c"] = float(raw_temp)
    else:
        errors.setdefault("temperature_c", []).append("Temperature must be a number.")

    raw_humidity = payload.get("humidity")
    if raw_humidity is None:
        values["humidity"] = None
    elif is_number(raw_humidity) and float(raw_humidity).is_integer():
        humidity = int(raw_humidity)
        if 0 <= humidity <= 100:
            values["humidity"] = humidity
        else:
            errors.setdefault("humidity", []).append("Humidity must be between 0 and 100.")
    else:
        errors.setdefault("humidity", []).append("Humidity must be a whole number.")

    raw_wind = payload.get("wind_kph")
    if raw_wind is None:
        values["wind_kph"] = None
    elif is_number(raw_wind) and raw_wind >= 0:
        values["wind_kph"] = float(raw_wind)
    else:
        errors.setdefault("wind_kph", []).append("Wind speed must be a non-negative number.")

    return values, errors


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = request_json()
    if payload is None:
        return error_response("Request body must be a JSON object.", 400)

    username = payload.get("username")
    password = payload.get("password")
    errors: dict[str, list[str]] = {}
    if not isinstance(username, str) or not username.strip():
        errors.setdefault("username", []).append("Username is required.")
    if not isinstance(password, str) or not password:
        errors.setdefault("password", []).append("Password is required.")
    if errors:
        return error_response("Validation failed.", 400, errors)

    username = username.strip()
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utc_now()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error_response(
            "Validation failed.", 409, {"username": ["That username is already taken."]}
        )

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = request_json()
    if payload is None:
        return error_response("Request body must be a JSON object.", 400)

    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error_response("Username and password are required.", 400)

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error_response("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utc_now()),
    )
    db.commit()
    return jsonify({"token": token, "username": user["username"]}), 200


@app.get("/api/weather")
def list_weather():
    page, page_error = parse_positive_int("page", 1)
    if page_error:
        return page_error
    page_size, page_size_error = parse_positive_int("page_size", 10)
    if page_size_error:
        return page_size_error

    db = get_db()
    city = request.args.get("city")
    city = city.strip() if isinstance(city, str) else None

    if city:
        rows = db.execute(
            "SELECT * FROM reports WHERE city = ? COLLATE NOCASE ORDER BY city COLLATE NOCASE",
            (city,),
        ).fetchall()
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city, 1 if rows else 0, utc_now()),
        )
        db.commit()
        total = len(rows)
        start = (page - 1) * page_size
        items = rows[start : start + page_size]
    else:
        total = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        start = (page - 1) * page_size
        rows = db.execute(
            "SELECT * FROM reports ORDER BY city COLLATE NOCASE, id LIMIT ? OFFSET ?",
            (page_size, start),
        ).fetchall()
        items = rows

    return jsonify(
        {
            "items": [report_json(row) for row in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/weather/recent")
def recent_lookups():
    limit, limit_error = parse_positive_int("limit", 10)
    if limit_error:
        return limit_error
    db = get_db()
    rows = db.execute(
        "SELECT * FROM lookups ORDER BY looked_up_at DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"items": [lookup_json(row) for row in rows]})


@app.post("/api/weather")
@auth_required
def create_weather():
    payload = request_json()
    if payload is None:
        return error_response("Request body must be a JSON object.", 400)

    values, errors = validate_report(payload)
    if errors:
        return error_response("Validation failed.", 400, errors)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO reports "
            "(city, country, temperature_c, condition, humidity, wind_kph, observed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                values["city"],
                values["country"],
                values["temperature_c"],
                values["condition"],
                values["humidity"],
                values["wind_kph"],
                utc_now(),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error_response(
            "Validation failed.", 409, {"city": ["A report for this city already exists."]}
        )

    row = db.execute("SELECT * FROM reports WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(report_json(row)), 201


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    row = get_db().execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error_response("Weather report not found.", 404)
    return jsonify(report_json(row))


@app.put("/api/weather/<int:report_id>")
@auth_required
def replace_weather(report_id: int):
    db = get_db()
    existing = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if existing is None:
        return error_response("Weather report not found.", 404)

    payload = request_json()
    if payload is None:
        return error_response("Request body must be a JSON object.", 400)

    values, errors = validate_report(payload)
    if errors:
        return error_response("Validation failed.", 400, errors)

    try:
        db.execute(
            "UPDATE reports SET city = ?, country = ?, temperature_c = ?, condition = ?, "
            "humidity = ?, wind_kph = ?, observed_at = ? WHERE id = ?",
            (
                values["city"],
                values["country"],
                values["temperature_c"],
                values["condition"],
                values["humidity"],
                values["wind_kph"],
                utc_now(),
                report_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error_response(
            "Validation failed.", 409, {"city": ["A report for this city already exists."]}
        )

    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return jsonify(report_json(row))


@app.delete("/api/weather/<int:report_id>")
@auth_required
def delete_weather(report_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error_response("Weather report not found.", 404)
    db.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
