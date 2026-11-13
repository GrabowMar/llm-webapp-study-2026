"""Flask entry point for the store finder."""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import re
import secrets
import sqlite3
import time
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
TOKEN_TTL_SECONDS = 7 * 24 * 3600
EARTH_RADIUS_KM = 6371.0088
DEFAULT_RADIUS_KM = 25.0
MAX_RADIUS_KM = 20038.0

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PHONE_RE = re.compile(r"^\+?[0-9 ()./-]{3,40}$")

SAMPLE_STORES = [
    ("Downtown Market", "120 Main St, Springfield, IL 62701", "+1 217-555-0101", 39.8017, -89.6436),
    ("Capitol Corner", "455 Capitol Ave, Springfield, IL 62701", "+1 217-555-0102", 39.7983, -89.6544),
    ("Westside Goods", "2900 Wabash Ave, Springfield, IL 62704", None, 39.7735, -89.6927),
    ("Loop Central", "75 W Madison St, Chicago, IL 60602", "+1 312-555-0110", 41.8819, -87.6298),
    ("Lakeview Shop", "3300 N Broadway, Chicago, IL 60657", "+1 312-555-0111", 41.9426, -87.6443),
    ("Gateway Outlet", "701 Market St, St. Louis, MO 63101", "+1 314-555-0120", 38.6270, -90.1945),
    ("Central West End Store", "4700 McPherson Ave, St. Louis, MO 63108", "+1 314-555-0121", 38.6440, -90.2620),
    ("Monument Circle Store", "1 Monument Cir, Indianapolis, IN 46204", "+1 317-555-0130", 39.7684, -86.1581),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    admin_fp TEXT,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
);
"""


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def store_to_dict(row: sqlite3.Row, distance: float | None = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": None if distance is None else round(distance, 3),
    }


def _number(value, field: str, lo: float, hi: float, errors: dict) -> float | None:
    if value is None:
        errors[field] = f"{field.capitalize()} is required."
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors[field] = f"{field.capitalize()} must be a number."
        return None
    value = float(value)
    if not math.isfinite(value) or value < lo or value > hi:
        errors[field] = f"{field.capitalize()} must be between {lo:g} and {hi:g}."
        return None
    return value


def _text(value, field: str, max_len: int, errors: dict, required: bool) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            errors[field] = f"{field.capitalize()} is required."
        return None
    if not isinstance(value, str):
        errors[field] = f"{field.capitalize()} must be a string."
        return None
    value = " ".join(value.split())
    if len(value) > max_len:
        errors[field] = f"{field.capitalize()} must be at most {max_len} characters."
        return None
    return value


def validate_store(data) -> dict:
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    errors: dict[str, str] = {}
    name = _text(data.get("name"), "name", 200, errors, required=True)
    address = _text(data.get("address"), "address", 500, errors, required=True)
    phone = _text(data.get("phone"), "phone", 40, errors, required=False)
    if phone is not None and not PHONE_RE.match(phone):
        errors["phone"] = "Phone may only contain digits, spaces and + ( ) . / -."
    latitude = _number(data.get("latitude"), "latitude", -90, 90, errors)
    longitude = _number(data.get("longitude"), "longitude", -180, 180, errors)
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return {
        "name": name,
        "address": address,
        "phone": phone,
        "latitude": latitude,
        "longitude": longitude,
    }


def _query_float(name: str, lo: float, hi: float, errors: dict) -> float | None:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        value = float(raw)
    except ValueError:
        errors[name] = f"{name} must be a number."
        return None
    if not math.isfinite(value) or value < lo or value > hi:
        errors[name] = f"{name} must be between {lo:g} and {hi:g}."
        return None
    return value


def create_app(data_dir: str | os.PathLike | None = None, admin_password: str | None = None) -> Flask:
    app = Flask(__name__, static_folder=None)
    app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
    app.json.sort_keys = False

    data_path = Path(data_dir or os.environ.get("DATA_DIR") or Path.cwd() / "data")
    data_path.mkdir(parents=True, exist_ok=True)
    db_path = data_path / "app.db"

    if admin_password is None:
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
    admin_password = admin_password or ""

    def connect() -> sqlite3.Connection:
        conn = sqlite3.connect(db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    with connect() as conn:
        conn.executescript(SCHEMA)
        row = conn.execute("SELECT value FROM meta WHERE key = 'secret'").fetchone()
        if row is None:
            conn.execute("INSERT INTO meta (key, value) VALUES ('secret', ?)", (secrets.token_hex(32),))
            row = conn.execute("SELECT value FROM meta WHERE key = 'secret'").fetchone()
        secret = row["value"]
        if conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone() is None:
            conn.executemany(
                "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                SAMPLE_STORES,
            )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (int(time.time()),))
    conn.close()

    admin_fp = (
        hmac.new(secret.encode(), admin_password.encode("utf-8"), hashlib.sha256).hexdigest()
        if admin_password
        else None
    )
    dummy_hash = generate_password_hash(secrets.token_hex(16))

    def db() -> sqlite3.Connection:
        if "db" not in g:
            g.db = connect()
        return g.db

    @app.teardown_appcontext
    def close_db(_exc):
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()

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
        return jsonify({"error": "Internal server error."}), 500

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        resp.headers.setdefault("Permissions-Policy", "geolocation=(self)")
        resp.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
            "connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
            "frame-ancestors 'none'",
        )
        if request.path.startswith("/api"):
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    def json_body() -> dict:
        data = request.get_json(force=True, silent=True)
        if not isinstance(data, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return data

    def current_user() -> dict | None:
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            return None
        row = db().execute(
            "SELECT username, admin_fp, expires_at FROM sessions WHERE token_hash = ?",
            (_hash_token(token),),
        ).fetchone()
        if row is None or row["expires_at"] < time.time():
            return None
        is_admin = row["username"] == ADMIN_USERNAME
        if is_admin:
            if admin_fp is None or not row["admin_fp"] or not hmac.compare_digest(row["admin_fp"], admin_fp):
                return None
        else:
            exists = db().execute("SELECT 1 FROM users WHERE username = ?", (row["username"],)).fetchone()
            if exists is None:
                return None
        return {"username": row["username"], "is_admin": is_admin, "token": token}

    def require_admin(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                raise ApiError(401, "Authentication required.")
            if not user["is_admin"]:
                raise ApiError(403, "Admin access required.")
            return fn(*args, **kwargs)

        return wrapper

    def get_store_row(store_id: int) -> sqlite3.Row:
        row = db().execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
        if row is None:
            raise ApiError(404, "Store not found.")
        return row

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        data = json_body()
        username = data.get("username")
        password = data.get("password")
        errors = {}
        if not isinstance(username, str) or not USERNAME_RE.match(username):
            errors["username"] = "Username must be 3-32 characters: letters, digits, '_', '.' or '-'."
        if not isinstance(password, str) or len(password) < 8:
            errors["password"] = "Password must be at least 8 characters."
        elif len(password) > 256:
            errors["password"] = "Password must be at most 256 characters."
        if errors:
            raise ApiError(400, "Validation failed.", errors)
        if username.lower() == ADMIN_USERNAME:
            raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
        conn = db()
        try:
            with conn:
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (username, generate_password_hash(password), int(time.time())),
                )
        except sqlite3.IntegrityError:
            raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
        return jsonify({"id": cur.lastrowid, "username": username, "is_admin": False}), 201

    @app.post("/api/auth/login")
    def login():
        data = json_body()
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
            raise ApiError(400, "Username and password are required.")
        fp = None
        if username == ADMIN_USERNAME:
            ok = bool(admin_password) and hmac.compare_digest(
                password.encode("utf-8"), admin_password.encode("utf-8")
            )
            fp = admin_fp
            canonical = ADMIN_USERNAME
        else:
            row = db().execute(
                "SELECT username, password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
            if row is None:
                check_password_hash(dummy_hash, password)
                ok = False
            else:
                ok = check_password_hash(row["password_hash"], password)
                canonical = row["username"]
        if not ok:
            raise ApiError(401, "Invalid username or password.")
        token = secrets.token_urlsafe(32)
        conn = db()
        with conn:
            conn.execute(
                "INSERT INTO sessions (token_hash, username, admin_fp, expires_at) VALUES (?, ?, ?, ?)",
                (_hash_token(token), canonical, fp, int(time.time()) + TOKEN_TTL_SECONDS),
            )
        return {"token": token, "username": canonical, "is_admin": canonical == ADMIN_USERNAME}

    @app.get("/api/auth/me")
    def me():
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required.")
        return {"username": user["username"], "is_admin": user["is_admin"]}

    @app.post("/api/auth/logout")
    def logout():
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required.")
        conn = db()
        with conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(user["token"]),))
        return "", 204

    @app.get("/api/stores")
    def list_stores():
        errors: dict[str, str] = {}
        lat = _query_float("lat", -90, 90, errors)
        lng = _query_float("lng", -180, 180, errors)
        radius = _query_float("radius", 0, MAX_RADIUS_KM, errors)
        if not errors and (lat is None) != (lng is None):
            errors["lat" if lat is None else "lng"] = "lat and lng must be given together."
        if errors:
            raise ApiError(400, "Invalid query parameters.", errors)

        sql = "SELECT * FROM stores"
        params: list = []
        q = (request.args.get("q") or "").strip()
        if q:
            if len(q) > 200:
                raise ApiError(400, "Invalid query parameters.", {"q": "q must be at most 200 characters."})
            pattern = "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            sql += " WHERE lower(name) LIKE ? ESCAPE '\\' OR lower(address) LIKE ? ESCAPE '\\'"
            params += [pattern, pattern]
        rows = db().execute(sql, params).fetchall()

        if lat is None:
            rows = sorted(rows, key=lambda r: (r["name"].casefold(), r["id"]))
            return {"items": [store_to_dict(r) for r in rows]}

        limit = DEFAULT_RADIUS_KM if radius is None else radius
        found = []
        for r in rows:
            d = haversine_km(lat, lng, r["latitude"], r["longitude"])
            if d <= limit:
                found.append((d, r))
        found.sort(key=lambda x: (x[0], x[1]["name"].casefold(), x[1]["id"]))
        return {"items": [store_to_dict(r, d) for d, r in found]}

    @app.get("/api/stores/<int:store_id>")
    def get_store(store_id: int):
        return store_to_dict(get_store_row(store_id))

    @app.post("/api/admin/stores")
    @require_admin
    def create_store():
        s = validate_store(json_body())
        conn = db()
        with conn:
            cur = conn.execute(
                "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                (s["name"], s["address"], s["phone"], s["latitude"], s["longitude"]),
            )
        return jsonify(store_to_dict(get_store_row(cur.lastrowid))), 201

    @app.put("/api/admin/stores/<int:store_id>")
    @require_admin
    def update_store(store_id: int):
        get_store_row(store_id)
        s = validate_store(json_body())
        conn = db()
        with conn:
            conn.execute(
                "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? WHERE id = ?",
                (s["name"], s["address"], s["phone"], s["latitude"], s["longitude"], store_id),
            )
        return store_to_dict(get_store_row(store_id))

    @app.delete("/api/admin/stores/<int:store_id>")
    @require_admin
    def delete_store(store_id: int):
        get_store_row(store_id)
        conn = db()
        with conn:
            conn.execute("DELETE FROM stores WHERE id = ?", (store_id,))
        return "", 204

    @app.get("/api", defaults={"path": ""})
    @app.get("/api/<path:path>")
    def api_not_found(path: str):
        raise ApiError(404, "Not found.")

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path: str = "index.html"):
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        if not (DIST / "index.html").is_file():
            return jsonify({"error": "Frontend not built."}), 404
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
