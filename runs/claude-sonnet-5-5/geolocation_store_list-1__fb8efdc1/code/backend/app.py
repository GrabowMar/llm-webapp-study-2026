"""Store finder: Flask API plus static frontend."""

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
import time
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "stores.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
TOKEN_TTL = 7 * 24 * 3600
DEFAULT_RADIUS_KM = 25.0
MAX_RADIUS_KM = 20040.0
EARTH_RADIUS_KM = 6371.0088

SAMPLE_STORES = [
    ("Downtown Market", "120 Main St, Springfield", "555-0101", 39.7990, -89.6440),
    ("Riverside Grocer", "48 River Rd, Springfield", "555-0102", 39.7817, -89.6501),
    ("Lakeview Corner Shop", "9 Lake Ave, Springfield", None, 39.8120, -89.6300),
    ("Harbor Provisions", "77 Pier St, Portland", "555-0201", 45.5231, -122.6765),
    ("Pearl District Goods", "1200 NW Marshall St, Portland", "555-0202", 45.5350, -122.6840),
    ("Mission Street Mart", "2500 Mission St, San Francisco", "555-0301", 37.7599, -122.4194),
    ("Bayside Emporium", "1 Embarcadero, San Francisco", "555-0302", 37.7955, -122.3937),
    ("Lonestar General Store", "600 Congress Ave, Austin", "555-0401", 30.2672, -97.7431),
]

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


def get_db() -> sqlite3.Connection:
    db = g.get("db")
    if db is None:
        db = g.db = connect()
    return db


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    return conn


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.isolation_level = None
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            """CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                username TEXT NOT NULL,
                expires_at REAL NOT NULL
            )"""
        )
        conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
        seeded = conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            has_rows = conn.execute("SELECT 1 FROM stores LIMIT 1").fetchone()
            if not has_rows:
                conn.executemany(
                    "INSERT INTO stores (name, address, phone, latitude, longitude) "
                    "VALUES (?, ?, ?, ?, ?)",
                    SAMPLE_STORES,
                )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.execute("DELETE FROM tokens WHERE username = ?", (ADMIN_USERNAME,))
        conn.execute("DELETE FROM tokens WHERE expires_at < ?", (time.time(),))
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()


init_db()


def error(status: int, message: str, details: dict | None = None):
    body: dict = {"error": message}
    if details:
        body["details"] = details
    return jsonify(body), status


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        if exc.code == 413:
            return error(413, "Request body too large")
        return error(exc.code or 500, exc.name)
    return exc


@app.errorhandler(Exception)
def unexpected_error(exc: Exception):
    app.logger.exception("Unhandled error: %s", exc)
    return error(500, "Internal server error")


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_username() -> str | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT username, expires_at FROM tokens WHERE token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < time.time():
        return None
    return row["username"]


def require_admin():
    username = current_username()
    if username is None:
        return error(401, "Authentication required")
    if username != ADMIN_USERNAME or not ADMIN_PASSWORD:
        return error(403, "Admin access required")
    return None


def issue_token(username: str) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("DELETE FROM tokens WHERE expires_at < ?", (time.time(),))
    db.execute(
        "INSERT INTO tokens (token_hash, username, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), username, time.time() + TOKEN_TTL),
    )
    db.commit()
    return token


DUMMY_HASH = generate_password_hash("dummy-password")


def credentials():
    data = json_body()
    if data is None:
        return None, error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    details = {}
    if not isinstance(username, str) or not username.strip():
        details["username"] = "Username is required"
    elif len(username.strip()) > 64:
        details["username"] = "Username must be at most 64 characters"
    if not isinstance(password, str) or not password:
        details["password"] = "Password is required"
    elif len(password) > 128:
        details["password"] = "Password must be at most 128 characters"
    if details:
        return None, error(400, "Invalid credentials", details)
    return (username.strip(), password), None


@app.post("/api/auth/register")
def register():
    creds, err = credentials()
    if err:
        return err
    username, password = creds
    if username.lower() == ADMIN_USERNAME:
        return error(409, "Username is already taken", {"username": "Username is already taken"})
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    creds, err = credentials()
    if err:
        return err
    username, password = creds
    if username == ADMIN_USERNAME:
        if ADMIN_PASSWORD and hmac.compare_digest(
            password.encode(), ADMIN_PASSWORD.encode()
        ):
            return jsonify({"token": issue_token(ADMIN_USERNAME)})
        check_password_hash(DUMMY_HASH, password)
        return error(401, "Invalid username or password")
    row = get_db().execute(
        "SELECT username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return error(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password")
    return jsonify({"token": issue_token(row["username"])})


def serialize(row: sqlite3.Row, distance: float | None = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": None if distance is None else round(distance, 2),
    }


def haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def parse_float_param(name: str, raw: str, lo: float, hi: float, details: dict):
    try:
        value = float(raw)
    except ValueError:
        details[name] = f"{name} must be a number"
        return None
    if not math.isfinite(value) or not lo <= value <= hi:
        details[name] = f"{name} must be between {lo:g} and {hi:g}"
        return None
    return value


@app.get("/api/stores")
def list_stores():
    q = request.args.get("q", "").strip().lower()
    raw_lat = request.args.get("lat")
    raw_lng = request.args.get("lng")
    raw_radius = request.args.get("radius")
    details: dict = {}
    lat = lng = None
    radius = DEFAULT_RADIUS_KM
    if (raw_lat is None) != (raw_lng is None):
        details["lat" if raw_lat is None else "lng"] = "lat and lng must be given together"
    elif raw_lat is not None and raw_lng is not None:
        lat = parse_float_param("lat", raw_lat, -90, 90, details)
        lng = parse_float_param("lng", raw_lng, -180, 180, details)
    if raw_radius is not None and raw_radius != "":
        r = parse_float_param("radius", raw_radius, 0, MAX_RADIUS_KM, details)
        if r is not None:
            radius = r
    if details:
        return error(400, "Invalid query parameters", details)

    rows = get_db().execute("SELECT * FROM stores").fetchall()
    if q:
        rows = [
            r for r in rows if q in r["name"].lower() or q in r["address"].lower()
        ]
    if lat is not None and lng is not None:
        found = []
        for r in rows:
            d = haversine(lat, lng, r["latitude"], r["longitude"])
            if d <= radius:
                found.append((d, r))
        found.sort(key=lambda t: (t[0], t[1]["name"].lower(), t[1]["id"]))
        items = [serialize(r, d) for d, r in found]
    else:
        rows.sort(key=lambda r: (r["name"].lower(), r["id"]))
        items = [serialize(r) for r in rows]
    return jsonify({"items": items})


def fetch_store(store_id: int):
    return get_db().execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()


@app.get("/api/stores/<int:store_id>")
def get_store(store_id: int):
    row = fetch_store(store_id)
    if row is None:
        return error(404, "Store not found")
    return jsonify(serialize(row))


def validate_store(data: dict):
    details: dict = {}
    clean: dict = {}

    def text(field: str, label: str, max_len: int, required: bool):
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            if required:
                details[field] = f"{label} is required"
            else:
                clean[field] = None
            return
        if not isinstance(value, str):
            details[field] = f"{label} must be a string"
        elif len(value.strip()) > max_len:
            details[field] = f"{label} must be at most {max_len} characters"
        else:
            clean[field] = value.strip()

    text("name", "Name", 200, True)
    text("address", "Address", 300, True)
    text("phone", "Phone", 50, False)

    for field, label, bound in (("latitude", "Latitude", 90), ("longitude", "Longitude", 180)):
        value = data.get(field)
        if value is None or value == "":
            details[field] = f"{label} is required"
        elif isinstance(value, bool) or not isinstance(value, (int, float)):
            details[field] = f"{label} must be a number"
        elif not math.isfinite(value) or abs(value) > bound:
            details[field] = f"{label} must be between -{bound} and {bound}"
        else:
            clean[field] = float(value)
    return clean, details


@app.post("/api/admin/stores")
def create_store():
    denied = require_admin()
    if denied:
        return denied
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    clean, details = validate_store(data)
    if details:
        return error(400, "Validation failed", details)
    db = get_db()
    cur = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
        (clean["name"], clean["address"], clean["phone"], clean["latitude"], clean["longitude"]),
    )
    db.commit()
    return jsonify(serialize(fetch_store(cur.lastrowid))), 201


@app.put("/api/admin/stores/<int:store_id>")
def update_store(store_id: int):
    denied = require_admin()
    if denied:
        return denied
    if fetch_store(store_id) is None:
        return error(404, "Store not found")
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    clean, details = validate_store(data)
    if details:
        return error(400, "Validation failed", details)
    db = get_db()
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? "
        "WHERE id = ?",
        (
            clean["name"],
            clean["address"],
            clean["phone"],
            clean["latitude"],
            clean["longitude"],
            store_id,
        ),
    )
    db.commit()
    return jsonify(serialize(fetch_store(store_id)))


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id: int):
    denied = require_admin()
    if denied:
        return denied
    db = get_db()
    cur = db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    if cur.rowcount == 0:
        return error(404, "Store not found")
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
