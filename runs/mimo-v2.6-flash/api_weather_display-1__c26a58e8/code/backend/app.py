"""Flask entry point: weather display API and frontend serving."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "weather.db"

PBKDF2_ITERATIONS = 200_000
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
DEFAULT_RECENT_LIMIT = 10
MAX_RECENT_LIMIT = 100

SAMPLE_REPORTS = [
    ("London", "United Kingdom", 12.4, "Cloudy", 78, 14.2),
    ("Paris", "France", 15.1, "Sunny", 61, 9.6),
    ("Tokyo", "Japan", 22.7, "Rain", 74, 11.3),
    ("New York", "United States", 9.8, "Windy", 55, 24.5),
    ("Sydney", "Australia", 26.3, "Sunny", 48, 17.8),
    ("Berlin", "Germany", 11.2, "Overcast", 70, 13.4),
]

app = Flask(__name__, static_folder=None)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def error(message: str, status: int):
    return jsonify({"error": message}), status


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def row_to_report(row: sqlite3.Row) -> dict:
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


def row_to_lookup(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _scheme, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return hmac.compare_digest(digest.hex(), expected)


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username FROM auth_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def require_auth():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def get_json_body() -> dict | None:
    data = request.get_json(silent=True)
    if data is None:
        return None, error("Request body must be a JSON object", 400)
    if not isinstance(data, dict):
        return None, error("Request body must be a JSON object", 400)
    return data, None


def as_number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def validate_report_fields(data: dict) -> tuple[dict | None, str | None]:
    """Validate a create/replace payload. Returns (fields, error_message)."""
    fields: dict = {}

    city = data.get("city")
    if not isinstance(city, str) or not city.strip():
        return None, "city is required and must be a non-empty string"
    fields["city"] = city.strip()

    temperature = as_number(data.get("temperature_c"))
    if temperature is None:
        return None, "temperature_c is required and must be a number"
    fields["temperature_c"] = temperature

    if "country" in data:
        country = data.get("country")
        if country is not None and not isinstance(country, str):
            return None, "country must be a string"
        fields["country"] = country.strip() if isinstance(country, str) and country.strip() else None

    if "condition" in data:
        condition = data.get("condition")
        if condition is not None and not isinstance(condition, str):
            return None, "condition must be a string"
        fields["condition"] = condition.strip() if isinstance(condition, str) and condition.strip() else None

    if "humidity" in data:
        humidity = data.get("humidity")
        if humidity is not None:
            value = as_number(humidity)
            if value is None or value != int(value) or not 0 <= value <= 100:
                return None, "humidity must be an integer between 0 and 100"
            fields["humidity"] = int(value)
        else:
            fields["humidity"] = None

    if "wind_kph" in data:
        wind = data.get("wind_kph")
        if wind is not None:
            value = as_number(wind)
            if value is None or value < 0:
                return None, "wind_kph must be a non-negative number"
            fields["wind_kph"] = value
        else:
            fields["wind_kph"] = None

    return fields, None


# ---------------------------------------------------------------------------
# database setup
# ---------------------------------------------------------------------------

def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                username_lower TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                city_lower TEXT NOT NULL UNIQUE,
                country TEXT,
                temperature_c REAL NOT NULL,
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

            CREATE INDEX IF NOT EXISTS idx_reports_city_lower ON reports(city_lower);
            CREATE INDEX IF NOT EXISTS idx_lookups_looked_up_at ON lookups(looked_up_at DESC);
            """
        )
        conn.commit()
        seed_if_empty(conn)
        conn.commit()
    finally:
        conn.close()


def seed_if_empty(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    if count:
        return
    observed_at = now_iso()
    for city, country, temperature, condition, humidity, wind in SAMPLE_REPORTS:
        try:
            conn.execute(
                """
                INSERT INTO reports
                    (city, city_lower, country, temperature_c, condition, humidity, wind_kph, observed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (city, city.lower(), country, temperature, condition, humidity, wind, observed_at),
            )
        except sqlite3.IntegrityError:
            pass


init_db()


# ---------------------------------------------------------------------------
# auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data, body_err = get_json_body()
    if body_err:
        return body_err

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required and must be a non-empty string", 400)
    if not isinstance(password, str) or not password:
        return error("password is required and must be a non-empty string", 400)
    username = username.strip()

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username_lower = ?", (username.lower(),)
    ).fetchone()
    if existing:
        return error("Username already taken", 409)

    try:
        cur = db.execute(
            """
            INSERT INTO users (username, username_lower, password_hash, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (username, username.lower(), hash_password(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("Username already taken", 409)

    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data, body_err = get_json_body()
    if body_err:
        return body_err

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required and must be a non-empty string", 400)
    if not isinstance(password, str) or not password:
        return error("password is required and must be a non-empty string", 400)

    user = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username_lower = ?",
        (username.strip().lower(),),
    ).fetchone()
    if user is None or not verify_password(password, user["password_hash"]):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------------------
# weather routes
# ---------------------------------------------------------------------------

def parse_int_arg(name: str, default: int, lo: int, hi: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    if value < lo:
        return default if lo <= default <= hi else lo
    return min(value, hi)


@app.get("/api/weather")
def list_weather():
    city = request.args.get("city")
    db = get_db()

    if city is not None and city.strip():
        city = city.strip()
        found_row = db.execute(
            "SELECT id FROM reports WHERE city_lower = ?", (city.lower(),)
        ).fetchone()
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city, 1 if found_row else 0, now_iso()),
        )
        db.commit()

        page = parse_int_arg("page", DEFAULT_PAGE, 1, 10_000_000)
        page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
        total = db.execute(
            "SELECT COUNT(*) FROM reports WHERE city_lower = ?", (city.lower(),)
        ).fetchone()[0]
        rows = db.execute(
            """
            SELECT * FROM reports WHERE city_lower = ?
            ORDER BY city COLLATE NOCASE ASC, id ASC
            LIMIT ? OFFSET ?
            """,
            (city.lower(), page_size, (page - 1) * page_size),
        ).fetchall()
        return jsonify(
            {"items": [row_to_report(r) for r in rows], "total": total,
             "page": page, "page_size": page_size}
        )

    page = parse_int_arg("page", DEFAULT_PAGE, 1, 10_000_000)
    page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    total = db.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
    rows = db.execute(
        """
        SELECT * FROM reports
        ORDER BY city COLLATE NOCASE ASC, id ASC
        LIMIT ? OFFSET ?
        """,
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {"items": [row_to_report(r) for r in rows], "total": total,
         "page": page, "page_size": page_size}
    )


@app.get("/api/weather/recent")
def recent_lookups():
    limit = parse_int_arg("limit", DEFAULT_RECENT_LIMIT, 1, MAX_RECENT_LIMIT)
    rows = get_db().execute(
        """
        SELECT * FROM lookups
        ORDER BY looked_up_at DESC, id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return jsonify({"items": [row_to_lookup(r) for r in rows]})


@app.post("/api/weather")
def create_weather():
    user, auth_err = require_auth()
    if auth_err:
        return auth_err

    data, body_err = get_json_body()
    if body_err:
        return body_err

    fields, field_err = validate_report_fields(data)
    if field_err:
        return error(field_err, 400)

    db = get_db()
    duplicate = db.execute(
        "SELECT id FROM reports WHERE city_lower = ?", (fields["city"].lower(),)
    ).fetchone()
    if duplicate:
        return error(f"City '{fields['city']}' already exists", 409)

    try:
        cur = db.execute(
            """
            INSERT INTO reports
                (city, city_lower, country, temperature_c, condition, humidity, wind_kph, observed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fields["city"],
                fields["city"].lower(),
                fields.get("country"),
                fields["temperature_c"],
                fields.get("condition"),
                fields.get("humidity"),
                fields.get("wind_kph"),
                now_iso(),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error(f"City '{fields['city']}' already exists", 409)

    row = db.execute("SELECT * FROM reports WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(row_to_report(row)), 201


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    row = get_db().execute(
        "SELECT * FROM reports WHERE id = ?", (report_id,)
    ).fetchone()
    if row is None:
        return error("Weather report not found", 404)
    return jsonify(row_to_report(row))


@app.put("/api/weather/<int:report_id>")
def replace_weather(report_id: int):
    user, auth_err = require_auth()
    if auth_err:
        return auth_err

    data, body_err = get_json_body()
    if body_err:
        return body_err

    fields, field_err = validate_report_fields(data)
    if field_err:
        return error(field_err, 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reports WHERE id = ?", (report_id,)
    ).fetchone()
    if existing is None:
        return error("Weather report not found", 404)

    duplicate = db.execute(
        "SELECT id FROM reports WHERE city_lower = ? AND id != ?",
        (fields["city"].lower(), report_id),
    ).fetchone()
    if duplicate:
        return error(f"City '{fields['city']}' already exists", 409)

    db.execute(
        """
        UPDATE reports
        SET city = ?, city_lower = ?, country = ?, temperature_c = ?,
            condition = ?, humidity = ?, wind_kph = ?, observed_at = ?
        WHERE id = ?
        """,
        (
            fields["city"],
            fields["city"].lower(),
            fields.get("country"),
            fields["temperature_c"],
            fields.get("condition"),
            fields.get("humidity"),
            fields.get("wind_kph"),
            now_iso(),
            report_id,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return jsonify(row_to_report(row))


@app.delete("/api/weather/<int:report_id>")
def delete_weather(report_id: int):
    user, auth_err = require_auth()
    if auth_err:
        return auth_err

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reports WHERE id = ?", (report_id,)
    ).fetchone()
    if existing is None:
        return error("Weather report not found", 404)
    db.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# frontend + errors
# ---------------------------------------------------------------------------

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("Not found", 404)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return error("Not found", 404)


@app.errorhandler(405)
def method_not_allowed(_exc):
    if request.path.startswith("/api/"):
        return error("Method not allowed", 405)
    return error("Method not allowed", 405)
