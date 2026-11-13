"""Weather display: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "weather.db"
DIST = BASE_DIR / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 100
DEFAULT_LIMIT = 100
MAX_PAGE_SIZE = 1000

SAMPLE_REPORTS = [
    ("London", "United Kingdom", 12.5, "Overcast", 78, 14.0),
    ("Paris", "France", 15.2, "Partly cloudy", 65, 11.5),
    ("Tokyo", "Japan", 21.0, "Sunny", 54, 9.0),
    ("New York", "United States", 17.8, "Light rain", 70, 18.4),
    ("Sydney", "Australia", 24.3, "Clear", 48, 16.2),
    ("Berlin", "Germany", 13.1, "Cloudy", 69, 12.8),
]

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    city_key TEXT NOT NULL UNIQUE,
    country TEXT,
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        count = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        if count == 0:
            for city, country, temp, condition, humidity, wind in SAMPLE_REPORTS:
                conn.execute(
                    "INSERT INTO reports (city, city_key, country, temperature_c,"
                    " condition, humidity, wind_kph, observed_at)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (city, city.lower(), country, temp, condition, humidity, wind, now_iso()),
                )
        conn.commit()
    finally:
        conn.close()


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


def error(message: str, status: int):
    return jsonify({"error": message}), status


def get_json_body():
    if not request.data:
        return None
    payload = request.get_json(silent=True)
    if payload is None or not isinstance(payload, dict):
        return None
    return payload


def parse_positive_int(raw: str | None, name: str, default: int):
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be a positive integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    return value, None


def parse_report_payload(payload: dict):
    """Validate a create/replace body; omitted optional fields are cleared."""
    problems = []
    clean = {
        "city": None,
        "country": None,
        "temperature_c": None,
        "condition": None,
        "humidity": None,
        "wind_kph": None,
    }

    if "city" not in payload:
        problems.append("city is required")
    else:
        city = payload["city"]
        if not isinstance(city, str) or not city.strip():
            problems.append("city is required")
        else:
            clean["city"] = city.strip()

    for field in ("country", "condition"):
        if field in payload and payload[field] is not None:
            value = payload[field]
            if not isinstance(value, str):
                problems.append(f"{field} must be a string")
            else:
                clean[field] = value.strip() or None

    for field in ("temperature_c", "humidity", "wind_kph"):
        if field in payload and payload[field] is not None:
            value = payload[field]
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                problems.append(f"{field} must be a number")
            else:
                clean[field] = float(value)

    if clean["temperature_c"] is not None and not -150.0 <= clean["temperature_c"] <= 70.0:
        problems.append("temperature_c must be between -150 and 70")

    if clean["humidity"] is not None and not 0.0 <= clean["humidity"] <= 100.0:
        problems.append("humidity must be a number between 0 and 100")

    if clean["wind_kph"] is not None and clean["wind_kph"] < 0:
        problems.append("wind_kph must be a non-negative number")

    return clean, problems


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token.strip(),),
        )
        .fetchone()
    )


# ---------------------------------------------------------------- health


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- accounts


@app.post("/api/auth/register")
def register():
    payload = get_json_body()
    if payload is None:
        return error("request body must be a JSON object", 400)
    username = payload.get("username")
    password = payload.get("password")
    problems = []
    if not isinstance(username, str) or not username.strip():
        problems.append("username is required")
        username = None
    else:
        username = username.strip()
    if not isinstance(password, str) or not password:
        problems.append("password is required")
        password = None
    if problems:
        return error("; ".join(problems), 400)

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = get_json_body()
    if payload is None:
        return error("request body must be a JSON object", 400)
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


# ---------------------------------------------------------------- weather


@app.get("/api/weather")
def list_reports():
    page, problem = parse_positive_int(request.args.get("page"), "page", 1)
    if problem:
        return error(problem, 400)
    page_size, problem = parse_positive_int(
        request.args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE
    )
    if problem:
        return error(problem, 400)
    if page_size > MAX_PAGE_SIZE:
        return error(f"page_size must be at most {MAX_PAGE_SIZE}", 400)

    db = get_db()
    where = ""
    params = []
    city = request.args.get("city")
    if city is not None and city.strip():
        searched = city.strip()
        where = "WHERE city_key = ?"
        params.append(searched.lower())

    total = db.execute(f"SELECT COUNT(*) FROM reports {where}", params).fetchone()[0]

    if where:
        found = total > 0
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (searched, int(found), now_iso()),
        )
        db.commit()

    rows = db.execute(
        f"SELECT * FROM reports {where} ORDER BY city LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [report_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/weather")
def create_report():
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    payload = get_json_body()
    if payload is None:
        return error("request body must be a JSON object", 400)
    clean, problems = parse_report_payload(payload)
    if problems:
        return error("; ".join(problems), 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reports WHERE city_key = ?", (clean["city"].lower(),)
    ).fetchone()
    if existing is not None:
        return error("a report for this city already exists", 409)

    cur = db.execute(
        "INSERT INTO reports (city, city_key, country, temperature_c, condition,"
        " humidity, wind_kph, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            clean["city"],
            clean["city"].lower(),
            clean["country"],
            clean["temperature_c"],
            clean["condition"],
            clean["humidity"],
            clean["wind_kph"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM reports WHERE id = ?", (cur.lastrowid,)).fetchone()
    response = jsonify(report_to_dict(row))
    response.headers["Location"] = f"/api/weather/{row['id']}"
    return response, 201


@app.get("/api/weather/recent")
def recent_lookups():
    limit, problem = parse_positive_int(request.args.get("limit"), "limit", DEFAULT_LIMIT)
    if problem:
        return error(problem, 400)
    if limit > MAX_PAGE_SIZE:
        return error(f"limit must be at most {MAX_PAGE_SIZE}", 400)
    rows = get_db().execute(
        "SELECT * FROM lookups ORDER BY looked_up_at DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()
    return jsonify({"items": [lookup_to_dict(row) for row in rows]})


@app.get("/api/weather/<int:report_id>")
def get_report(report_id: int):
    row = get_db().execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error("report not found", 404)
    return jsonify(report_to_dict(row))


@app.put("/api/weather/<int:report_id>")
def replace_report(report_id: int):
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    payload = get_json_body()
    if payload is None:
        return error("request body must be a JSON object", 400)
    clean, problems = parse_report_payload(payload)
    if problems:
        return error("; ".join(problems), 400)

    db = get_db()
    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error("report not found", 404)
    clash = db.execute(
        "SELECT id FROM reports WHERE city_key = ? AND id != ?",
        (clean["city"].lower(), report_id),
    ).fetchone()
    if clash is not None:
        return error("a report for this city already exists", 409)

    db.execute(
        "UPDATE reports SET city = ?, city_key = ?, country = ?, temperature_c = ?,"
        " condition = ?, humidity = ?, wind_kph = ?, observed_at = ? WHERE id = ?",
        (
            clean["city"],
            clean["city"].lower(),
            clean["country"],
            clean["temperature_c"],
            clean["condition"],
            clean["humidity"],
            clean["wind_kph"],
            now_iso(),
            report_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return jsonify(report_to_dict(row))


@app.delete("/api/weather/<int:report_id>")
def delete_report(report_id: int):
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    db = get_db()
    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        return error("report not found", 404)
    db.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db.commit()
    return jsonify({"message": "report deleted"})


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
