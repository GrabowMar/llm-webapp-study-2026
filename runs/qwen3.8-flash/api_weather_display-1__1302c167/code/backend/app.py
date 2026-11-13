"""Flask entry point: weather API + frontend server."""

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "weather.db"

app = Flask(__name__, static_folder=None)

REQUIRED_CREATE = ("city", "temperature_c", "condition")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


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


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
    city TEXT NOT NULL UNIQUE COLLATE NOCASE,
    country TEXT,
    temperature_c REAL NOT NULL,
    condition TEXT NOT NULL,
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
"""

SEED_REPORTS = [
    ("London", "GB", 11.5, "Cloudy", 78, 15.2),
    ("Paris", "FR", 14.2, "Sunny", 61, 9.0),
    ("New York", "US", 8.7, "Rain", 84, 20.4),
    ("Tokyo", "JP", 19.3, "Clear", 55, 11.1),
    ("Sydney", "AU", 22.6, "Windy", 49, 31.7),
    ("Moscow", "RU", -3.1, "Snow", 91, 12.5),
]


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    count = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    if count == 0:
        stamp = now_iso()
        db.executemany(
            "INSERT OR IGNORE INTO reports (city, country, temperature_c, condition, humidity, wind_kph, observed_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            [(c, co, t, cd, h, w, stamp) for c, co, t, cd, h, w in SEED_REPORTS],
        )
        db.commit()
    db.close()


def report_json(row: sqlite3.Row) -> dict:
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


def lookup_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip() if isinstance(data.get("username"), str) else ""
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not username:
        return error("'username' is required")
    if not password:
        return error("'password' is required")
    if len(password) < 4:
        return error("'password' must be at least 4 characters")
    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return error("username already exists", 409)
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"status": "created"}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username") if isinstance(data.get("username"), str) else ""
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    if not username or not password:
        return error("'username' and 'password' are required")
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- weather


@app.get("/api/weather/recent")
def recent_lookups():
    raw = request.args.get("limit", "5")
    try:
        limit = int(raw)
    except (TypeError, ValueError):
        return error("'limit' must be an integer")
    limit = max(1, min(limit, 100))
    rows = get_db().execute(
        "SELECT * FROM lookups ORDER BY looked_up_at DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"items": [lookup_json(r) for r in rows]}), 200


@app.get("/api/weather")
def list_weather():
    db = get_db()
    city = request.args.get("city")
    try:
        page = max(int(request.args.get("page", 1) or 1), 1)
    except ValueError:
        return error("'page' must be an integer")
    try:
        page_size = int(request.args.get("page_size", 10) or 10)
    except ValueError:
        return error("'page_size' must be an integer")
    page_size = max(1, min(page_size, 100))

    if city is not None and city.strip() != "":
        city_clean = city.strip()
        row = db.execute("SELECT * FROM reports WHERE city = ?", (city_clean,)).fetchone()
        items = [report_json(row)] if row else []
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city_clean, 1 if row else 0, now_iso()),
        )
        db.commit()
        total = len(items)
    else:
        total = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        rows = db.execute(
            "SELECT * FROM reports ORDER BY city COLLATE NOCASE LIMIT ? OFFSET ?",
            (page_size, (page - 1) * page_size),
        ).fetchall()
        items = [report_json(r) for r in rows]

    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size}), 200


def validate_report(data: dict) -> dict | tuple:
    if not isinstance(data, dict):
        return error("request body must be a JSON object")

    result: dict = {
        "city": None,
        "country": None,
        "temperature_c": None,
        "condition": None,
        "humidity": None,
        "wind_kph": None,
    }

    city = data.get("city")
    if not isinstance(city, str) or not city.strip():
        return error("'city' is required and must be a non-empty string")
    result["city"] = city.strip()

    temp = data.get("temperature_c")
    if temp is None or isinstance(temp, bool) or not isinstance(temp, (int, float)):
        return error("'temperature_c' is required and must be a number")
    if not -90 <= float(temp) <= 60:
        return error("'temperature_c' must be between -90 and 60")
    result["temperature_c"] = float(temp)

    cond = data.get("condition")
    if not isinstance(cond, str) or not cond.strip():
        return error("'condition' is required and must be a non-empty string")
    result["condition"] = cond.strip()

    country = data.get("country")
    if country is not None:
        if not isinstance(country, str) or not country.strip():
            return error("'country' must be a non-empty string")
        result["country"] = country.strip()

    humidity = data.get("humidity")
    if humidity is not None:
        if isinstance(humidity, bool) or not isinstance(humidity, (int, float)):
            return error("'humidity' must be a number")
        if not 0 <= float(humidity) <= 100:
            return error("'humidity' must be between 0 and 100")
        result["humidity"] = int(humidity)

    wind = data.get("wind_kph")
    if wind is not None:
        if isinstance(wind, bool) or not isinstance(wind, (int, float)):
            return error("'wind_kph' must be a number")
        if float(wind) < 0:
            return error("'wind_kph' must not be negative")
        result["wind_kph"] = float(wind)

    return result


@app.post("/api/weather")
def create_weather():
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    fields = validate_report(request.get_json(silent=True) or {})
    if isinstance(fields, tuple):
        return fields
    db = get_db()
    clash = db.execute("SELECT 1 FROM reports WHERE city = ?", (fields["city"],)).fetchone()
    if clash:
        return error(f"a report for '{fields['city']}' already exists", 409)
    cur = db.execute(
        "INSERT INTO reports (city, country, temperature_c, condition, humidity, wind_kph, observed_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
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
    row = db.execute("SELECT * FROM reports WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(report_json(row)), 201


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    row = get_db().execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error("report not found", 404)
    return jsonify(report_json(row)), 200


@app.put("/api/weather/<int:report_id>")
def update_weather(report_id: int):
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    db = get_db()
    existing = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if existing is None:
        return error("report not found", 404)
    fields = validate_report(request.get_json(silent=True) or {})
    if isinstance(fields, tuple):
        return fields
    clash = db.execute(
        "SELECT 1 FROM reports WHERE city = ? AND id != ?", (fields["city"], report_id)
    ).fetchone()
    if clash:
        return error(f"a report for '{fields['city']}' already exists", 409)
    db.execute(
        "UPDATE reports SET city=?, country=?, temperature_c=?, condition=?, humidity=?,"
        " wind_kph=?, observed_at=? WHERE id=?",
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
    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return jsonify(report_json(row)), 200


@app.delete("/api/weather/<int:report_id>")
def delete_weather(report_id: int):
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    db = get_db()
    existing = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if existing is None:
        return error("report not found", 404)
    db.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db.commit()
    return jsonify({"status": "deleted", "id": report_id}), 200


# ---------------------------------------------------------------- health & frontend


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


init_db()
