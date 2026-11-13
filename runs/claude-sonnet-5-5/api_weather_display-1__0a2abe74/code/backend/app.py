"""Weather display Flask app."""

import hashlib
import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "weather.db"

TOKEN_TTL = timedelta(days=7)
MAX_INT = 2**63 - 1
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
DEFAULT_RECENT = 5
MAX_RECENT = 100

SAMPLES = [
    ("London", "United Kingdom", 12.5, "Cloudy", 78, 15.0),
    ("Paris", "France", 14.0, "Partly cloudy", 65, 11.5),
    ("New York", "United States", 8.3, "Clear", 55, 20.4),
    ("Tokyo", "Japan", 17.8, "Light rain", 82, 9.7),
    ("Sydney", "Australia", 24.2, "Sunny", 60, 18.2),
    ("Cairo", "Egypt", 31.0, "Sunny", 28, 12.0),
    ("Reykjavik", "Iceland", -2.5, "Snow", 88, 32.1),
]

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                username_key TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                city TEXT NOT NULL,
                city_key TEXT NOT NULL UNIQUE,
                country TEXT,
                temperature_c REAL NOT NULL,
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
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        conn.execute("BEGIN IMMEDIATE")
        seeded = conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            for city, country, temp, cond, hum, wind in SAMPLES:
                conn.execute(
                    "INSERT OR IGNORE INTO reports (city, city_key, country, temperature_c,"
                    " condition, humidity, wind_kph, observed_at) VALUES (?,?,?,?,?,?,?,?)",
                    (city, city.casefold(), country, temp, cond, hum, wind, now_iso()),
                )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.commit()
    finally:
        conn.close()


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def json_body() -> dict:
    data = request.get_json(force=True, silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    row = get_db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token_hash = ?",
        (hash_token(parts[1].strip()),),
    ).fetchone()
    if row is None or row["expires_at"] <= now_iso():
        return None
    return row


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif not 3 <= len(username.strip()) <= 32:
        errors["username"] = "Username must be 3 to 32 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < 8:
        errors["password"] = "Password must be at least 8 characters"
    elif len(password) > 128:
        errors["password"] = "Password must be at most 128 characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    username = username.strip()
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, username_key, password_hash) VALUES (?,?,?)",
            (username, username.casefold(), generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "Username and password are required")
    db = get_db()
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE username_key = ?",
        (username.strip().casefold(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.execute("DELETE FROM tokens WHERE expires_at <= ?", (now_iso(),))
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?,?,?)",
        (hash_token(token), user["id"], (now + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%S.%fZ")),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"id": user["id"], "username": user["username"]})


def report_json(row) -> dict:
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


def is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate_report(data: dict) -> dict:
    errors = {}
    out = {}

    def text(field, label, required, max_len):
        v = data.get(field)
        if v is None or (isinstance(v, str) and not v.strip()):
            if required:
                errors[field] = f"{label} is required"
            out[field] = None
        elif not isinstance(v, str):
            errors[field] = f"{label} must be a string"
        elif len(v.strip()) > max_len:
            errors[field] = f"{label} must be at most {max_len} characters"
        else:
            out[field] = v.strip()

    def number(field, label, required, lo, hi):
        v = data.get(field)
        if v is None:
            if required:
                errors[field] = f"{label} is required"
            out[field] = None
        elif not is_number(v):
            errors[field] = f"{label} must be a number"
        elif not lo <= v <= hi:
            errors[field] = f"{label} must be between {lo} and {hi}"
        else:
            out[field] = float(v)

    text("city", "City", True, 100)
    text("country", "Country", False, 100)
    number("temperature_c", "Temperature", True, -90, 60)
    text("condition", "Condition", False, 100)
    number("humidity", "Humidity", False, 0, 100)
    number("wind_kph", "Wind speed", False, 0, 500)
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return out


def get_report_or_404(report_id: int):
    row = None
    if 0 < report_id <= MAX_INT:
        row = get_db().execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Weather report not found")
    return row


def int_param(name: str, default: int, lo: int, hi: int) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        raise ApiError(400, f"{name} must be an integer")
    if not lo <= value <= hi:
        raise ApiError(400, f"{name} must be between {lo} and {hi}")
    return value


@app.get("/api/weather")
def list_weather():
    page = int_param("page", 1, 1, MAX_INT // MAX_PAGE_SIZE)
    page_size = int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    city = request.args.get("city")
    if city is not None:
        city = city.strip()
        if not city:
            raise ApiError(400, "city must not be empty")
        if len(city) > 100:
            raise ApiError(400, "city must be at most 100 characters")
    db = get_db()
    if city is None:
        where, params = "", ()
    else:
        where, params = " WHERE city_key = ?", (city.casefold(),)
    total = db.execute(f"SELECT COUNT(*) FROM reports{where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM reports{where} ORDER BY city_key, id LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    if city is not None:
        db.execute(
            "INSERT INTO lookups (city, found, looked_up_at) VALUES (?,?,?)",
            (city, 1 if total > 0 else 0, now_iso()),
        )
        db.commit()
    return jsonify(
        {
            "items": [report_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/weather/recent")
def recent_lookups():
    limit = int_param("limit", DEFAULT_RECENT, 1, MAX_RECENT)
    rows = get_db().execute(
        "SELECT id, city, found, looked_up_at FROM lookups ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    return jsonify(
        {
            "items": [
                {
                    "id": r["id"],
                    "city": r["city"],
                    "found": bool(r["found"]),
                    "looked_up_at": r["looked_up_at"],
                }
                for r in rows
            ]
        }
    )


@app.post("/api/weather")
def create_weather():
    require_user()
    fields = validate_report(json_body())
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO reports (city, city_key, country, temperature_c, condition, humidity,"
            " wind_kph, observed_at) VALUES (?,?,?,?,?,?,?,?)",
            (
                fields["city"],
                fields["city"].casefold(),
                fields["country"],
                fields["temperature_c"],
                fields["condition"],
                fields["humidity"],
                fields["wind_kph"],
                now_iso(),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "A report for this city already exists", {"city": "A report for this city already exists"})
    return jsonify(report_json(get_report_or_404(cur.lastrowid))), 201


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    return jsonify(report_json(get_report_or_404(report_id)))


@app.put("/api/weather/<int:report_id>")
def replace_weather(report_id: int):
    require_user()
    get_report_or_404(report_id)
    fields = validate_report(json_body())
    db = get_db()
    try:
        db.execute(
            "UPDATE reports SET city=?, city_key=?, country=?, temperature_c=?, condition=?,"
            " humidity=?, wind_kph=?, observed_at=? WHERE id=?",
            (
                fields["city"],
                fields["city"].casefold(),
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
    except sqlite3.IntegrityError:
        raise ApiError(409, "A report for this city already exists", {"city": "A report for this city already exists"})
    return jsonify(report_json(get_report_or_404(report_id)))


@app.delete("/api/weather/<int:report_id>")
def delete_weather(report_id: int):
    require_user()
    get_report_or_404(report_id)
    db = get_db()
    db.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    db.commit()
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/", defaults={"path": ""})
@app.route("/api/<path:path>")
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
