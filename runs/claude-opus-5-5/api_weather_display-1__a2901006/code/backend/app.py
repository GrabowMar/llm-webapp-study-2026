"""Flask entry point."""

import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=7)
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
DEFAULT_RECENT_LIMIT = 5
MAX_RECENT_LIMIT = 100

USERNAME_MIN, USERNAME_MAX = 3, 50
PASSWORD_MIN, PASSWORD_MAX = 4, 200
CITY_MAX = 100
COUNTRY_MAX = 100
CONDITION_MAX = 100
TEMP_MIN, TEMP_MAX = -100.0, 70.0
WIND_MAX = 500.0

SAMPLE_REPORTS = [
    ("London", "United Kingdom", 11.0, "Light rain", 82, 18.0),
    ("Paris", "France", 13.5, "Partly cloudy", 70, 12.0),
    ("New York", "United States", 9.0, "Clear", 55, 15.5),
    ("Tokyo", "Japan", 17.0, "Sunny", 60, 8.0),
    ("Sydney", "Australia", 22.5, "Cloudy", 65, 20.0),
    ("Cairo", "Egypt", 27.0, "Sunny", 30, 10.0),
    ("Reykjavik", "Iceland", 2.0, "Snow", 88, 30.0),
    ("Rio de Janeiro", "Brazil", 28.0, "Thunderstorm", 78, 14.0),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    city_key TEXT NOT NULL UNIQUE,
    country TEXT,
    temperature_c NUMERIC NOT NULL,
    condition TEXT,
    humidity NUMERIC,
    wind_kph NUMERIC,
    observed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lookups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    found INTEGER NOT NULL,
    looked_up_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_city ON reports (city COLLATE NOCASE);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now_iso() -> str:
    return iso(datetime.now(timezone.utc))


def city_key(name: str) -> str:
    return " ".join(name.split()).casefold()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        seeded = conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            ts = now_iso()
            for city, country, temp, cond, hum, wind in SAMPLE_REPORTS:
                conn.execute(
                    "INSERT OR IGNORE INTO reports (city, city_key, country, temperature_c,"
                    " condition, humidity, wind_kph, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (city, city_key(city), country, temp, cond, hum, wind, ts),
                )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', ?)", (ts,))
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


# ---------- helpers ----------


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    resp = jsonify(body)
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def validation_error(errors: dict):
    message = "; ".join(f"{field}: {msg}" for field, msg in errors.items())
    raise ApiError(400, f"Validation failed: {message}", errors)


def int_param(name: str, default: int, minimum: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        validation_error({name: "must be an integer"})
    if value < minimum:
        validation_error({name: f"must be at least {minimum}"})
    if maximum is not None and value > maximum:
        value = maximum
    return value


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None
    if row["expires_at"] < now_iso():
        db().execute("DELETE FROM tokens WHERE token = ?", (token,))
        db().commit()
        return None
    return {"id": row["id"], "username": row["username"], "token": token}


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


# ---------- health ----------


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- auth ----------


def validate_credentials(data: dict) -> tuple[str, str]:
    errors = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "is required"
    else:
        username = username.strip()
        if not (USERNAME_MIN <= len(username) <= USERNAME_MAX):
            errors["username"] = f"must be {USERNAME_MIN}-{USERNAME_MAX} characters"
    if not isinstance(password, str) or password == "":
        errors["password"] = "is required"
    elif not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        errors["password"] = f"must be {PASSWORD_MIN}-{PASSWORD_MAX} characters"
    if errors:
        validation_error(errors)
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = validate_credentials(json_body())
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (username, username.casefold(), generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(409, "Username is already taken", {"username": "is already taken"})
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip() or not password:
        raise ApiError(400, "Username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username_key = ?",
        (username.strip().casefold(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    expires = iso(datetime.now(timezone.utc) + TOKEN_TTL)
    conn = db()
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now_iso(),))
    conn.execute("INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)", (token, row["id"], expires))
    conn.commit()
    return {"token": token, "username": row["username"]}


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    db().execute("DELETE FROM tokens WHERE token = ?", (g.user["token"],))
    db().commit()
    return "", 204


# ---------- weather ----------


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


def _number(data: dict, field: str, errors: dict, required: bool, lo: float, hi: float):
    value = data.get(field)
    if value is None:
        if required:
            errors[field] = "is required"
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        errors[field] = "must be a number"
        return None
    if value < lo or value > hi:
        errors[field] = f"must be between {lo:g} and {hi:g}"
        return None
    return value


def _text(data: dict, field: str, errors: dict, required: bool, max_len: int):
    value = data.get(field)
    if value is None:
        if required:
            errors[field] = "is required"
        return None
    if not isinstance(value, str):
        errors[field] = "must be a string"
        return None
    value = " ".join(value.split())
    if not value:
        if required:
            errors[field] = "is required"
        return None
    if len(value) > max_len:
        errors[field] = f"must be at most {max_len} characters"
        return None
    return value


def validate_report(data: dict) -> dict:
    errors: dict = {}
    values = {
        "city": _text(data, "city", errors, True, CITY_MAX),
        "country": _text(data, "country", errors, False, COUNTRY_MAX),
        "temperature_c": _number(data, "temperature_c", errors, True, TEMP_MIN, TEMP_MAX),
        "condition": _text(data, "condition", errors, False, CONDITION_MAX),
        "humidity": _number(data, "humidity", errors, False, 0, 100),
        "wind_kph": _number(data, "wind_kph", errors, False, 0, WIND_MAX),
    }
    if errors:
        validation_error(errors)
    return values


def get_report_or_404(report_id: int) -> sqlite3.Row:
    row = db().execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Weather report not found")
    return row


def duplicate_city(city: str):
    raise ApiError(409, f"A report for {city} already exists", {"city": "already exists"})


@app.get("/api/weather")
def list_weather():
    page = int_param("page", 1, 1)
    page_size = int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    city = request.args.get("city")
    city = " ".join(city.split()) if city is not None else ""
    conn = db()
    where, params = "", []
    if city:
        where, params = "WHERE city_key = ?", [city_key(city)]
    total = conn.execute(f"SELECT COUNT(*) FROM reports {where}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM reports {where} ORDER BY city COLLATE NOCASE, id LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    if city:
        conn.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
            (city[:CITY_MAX], 1 if total else 0, now_iso()),
        )
        conn.commit()
    return {
        "items": [report_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/weather")
@login_required
def create_weather():
    values = validate_report(json_body())
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO reports (city, city_key, country, temperature_c, condition, humidity,"
            " wind_kph, observed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                values["city"], city_key(values["city"]), values["country"], values["temperature_c"],
                values["condition"], values["humidity"], values["wind_kph"], now_iso(),
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        duplicate_city(values["city"])
    return report_to_dict(get_report_or_404(cur.lastrowid)), 201


@app.get("/api/weather/recent")
def recent_lookups():
    limit = int_param("limit", DEFAULT_RECENT_LIMIT, 1, MAX_RECENT_LIMIT)
    rows = db().execute(
        "SELECT * FROM lookups ORDER BY id DESC LIMIT ?", (limit,)
    ).fetchall()
    return {"items": [lookup_to_dict(r) for r in rows]}


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    return report_to_dict(get_report_or_404(report_id))


@app.put("/api/weather/<int:report_id>")
@login_required
def replace_weather(report_id: int):
    get_report_or_404(report_id)
    values = validate_report(json_body())
    conn = db()
    try:
        conn.execute(
            "UPDATE reports SET city = ?, city_key = ?, country = ?, temperature_c = ?, condition = ?,"
            " humidity = ?, wind_kph = ?, observed_at = ? WHERE id = ?",
            (
                values["city"], city_key(values["city"]), values["country"], values["temperature_c"],
                values["condition"], values["humidity"], values["wind_kph"], now_iso(), report_id,
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        duplicate_city(values["city"])
    return report_to_dict(get_report_or_404(report_id))


@app.delete("/api/weather/<int:report_id>")
@login_required
def delete_weather(report_id: int):
    get_report_or_404(report_id)
    db().execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db().commit()
    return "", 204


# ---------- frontend ----------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")
