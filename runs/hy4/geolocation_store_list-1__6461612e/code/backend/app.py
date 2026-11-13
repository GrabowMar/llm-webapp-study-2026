"""Store finder Flask application."""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "stores.sqlite3"

app = Flask(__name__, static_folder=None)

SAMPLE_STORES = [
    ("Central Books", "12 Market Street, London", "+44 20 7946 0101", 51.5074, -0.1278),
    ("River Coffee", "8 Bridge Road, London", "+44 20 7946 0102", 51.5155, -0.1412),
    ("North Bakery", "3 High Street, Manchester", "+44 161 496 0103", 53.4808, -2.2426),
    ("Park Grocer", "45 Green Lane, Manchester", "+44 161 496 0104", 53.4720, -2.2500),
    ("Harbour Records", "1 Dock Side, Bristol", "+44 117 496 0105", 51.4545, -2.5879),
    ("Old Town Toys", "9 Castle Close, Edinburgh", "+44 131 496 0106", 55.9533, -3.1883),
    ("West End Pharmacy", "77 Queen Street, Glasgow", "", 55.8609, -4.2576),
    ("Seaside Gallery", "2 Pier Walk, Brighton", "+44 1273 496 0107", 50.8225, -0.1372),
]


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
            );
            """
        )
        cur = conn.execute("SELECT COUNT(*) AS n FROM stores")
        if cur.fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO stores (name, address, phone, latitude, longitude) "
                "VALUES (?, ?, ?, ?, ?)",
                SAMPLE_STORES,
            )
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split(":", 1)
        salt = bytes.fromhex(salt_hex)
    except (ValueError, TypeError):
        return False
    expected = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return hmac.compare_digest(expected.hex(), digest_hex)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()


def unauthorized():
    return jsonify(error="Authentication required."), 401


def require_admin():
    user = current_user()
    if user is None:
        return None, unauthorized()
    if user["username"] != "admin":
        return None, (jsonify(error="Admin access required."), 403)
    return user, None


def validation_error(errors: dict[str, str]):
    return jsonify(errors=errors), 400


# ---------------------------------------------------------------------------
# Store serialisation, validation, and distance
# ---------------------------------------------------------------------------

def store_dict(row: sqlite3.Row, distance_km: float | None = None) -> dict:
    result = {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": distance_km,
    }
    return result


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(a)))


def parse_store_payload(partial: bool = False) -> tuple[dict | None, dict | None]:
    """Return (values, errors); errors is a field->message mapping."""
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None, {"body": "A JSON object is required."}

    errors: dict[str, str] = {}
    values: dict = {}

    for field in ("name", "address"):
        if field not in body and partial:
            continue
        value = body.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = f"{field.capitalize()} is required and must be a non-empty string."
        else:
            values[field] = value.strip()

    if "phone" not in body and partial:
        values["phone"] = ""
    else:
        phone = body.get("phone", "")
        if phone is None:
            phone = ""
        if not isinstance(phone, str):
            errors["phone"] = "Phone must be a string."
        else:
            values["phone"] = phone.strip()

    for field, low, high in (("latitude", -90.0, 90.0), ("longitude", -180.0, 180.0)):
        if field not in body and partial:
            continue
        value = body.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors[field] = f"{field.capitalize()} must be a number between {low:g} and {high:g}."
        elif not math.isfinite(float(value)) or not low <= float(value) <= high:
            errors[field] = f"{field.capitalize()} must be a number between {low:g} and {high:g}."
        else:
            values[field] = float(value)

    return (None, errors) if errors else (values, None)


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------


def auth_credentials() -> tuple[dict | None, tuple | None]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None, (jsonify(error="A JSON object is required."), 400)
    username, password = body.get("username"), body.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, (jsonify(errors={"username": "Username is required."}), 400)
    if not isinstance(password, str) or not password:
        return None, (jsonify(errors={"password": "Password is required."}), 400)
    return {"username": username.strip(), "password": password}, None


@app.post("/api/auth/register")
def register():
    creds, error = auth_credentials()
    if error:
        return error
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (creds["username"],)).fetchone():
        return jsonify(errors={"username": "That username is already taken."}), 409
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (creds["username"], hash_password(creds["password"])),
    )
    db.commit()
    return jsonify(id=cur.lastrowid, username=creds["username"]), 201


@app.post("/api/auth/login")
def login():
    creds, error = auth_credentials()
    if error:
        return error
    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (creds["username"],),
    ).fetchone()
    if user is None:
        return jsonify(error="Invalid username or password."), 401
    if user["username"] == "admin":
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if not admin_password or not hmac.compare_digest(creds["password"], admin_password):
            return jsonify(error="Invalid username or password."), 401
    elif not verify_password(creds["password"], user["password_hash"]):
        return jsonify(error="Invalid username or password."), 401

    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    db.commit()
    return jsonify(token=token), 200


# ---------------------------------------------------------------------------
# Public store endpoints
# ---------------------------------------------------------------------------


@app.get("/api/stores")
def list_stores():
    q = request.args.get("q", "").strip()
    lat_raw, lng_raw = request.args.get("lat"), request.args.get("lng")
    radius_raw = request.args.get("radius")

    params: list = []
    sql = "SELECT * FROM stores"
    if q:
        sql += " WHERE name LIKE ? OR address LIKE ?"
        params = [f"%{q}%", f"%{q}%"]

    if lat_raw is not None and lng_raw is not None:
        try:
            lat, lng = float(lat_raw), float(lng_raw)
        except (TypeError, ValueError):
            return jsonify(errors={"lat": "lat and lng must be valid numbers."}), 400
        if not math.isfinite(lat) or not math.isfinite(lng) or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            return jsonify(errors={"lat": "lat/lng out of range."}), 400
        radius = 10.0
        if radius_raw is not None:
            try:
                radius = float(radius_raw)
            except (TypeError, ValueError):
                return jsonify(errors={"radius": "radius must be a positive number."}), 400
            if not math.isfinite(radius) or radius <= 0:
                return jsonify(errors={"radius": "radius must be a positive number."}), 400
    else:
        lat = lng = None
        radius = None

    rows = get_db().execute(sql, params).fetchall()
    items = [store_dict(row) for row in rows]
    if lat is not None:
        for item in items:
            item["distance_km"] = round(haversine(lat, lng, item["latitude"], item["longitude"]), 3)
        items = [item for item in items if item["distance_km"] <= radius]
        items.sort(key=lambda item: (item["distance_km"], item["name"].casefold(), item["id"]))
    else:
        items.sort(key=lambda item: (item["name"].casefold(), item["id"]))
    return jsonify(items=items)


@app.get("/api/stores/<int:store_id>")
def get_store(store_id: int):
    row = get_db().execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return jsonify(error="Store not found."), 404
    return jsonify(store_dict(row))


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@app.post("/api/admin/stores")
def create_store():
    _user, error = require_admin()
    if error:
        return error
    values, errors = parse_store_payload()
    if errors:
        return validation_error(errors)
    db = get_db()
    cur = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
        (values["name"], values["address"], values["phone"], values["latitude"], values["longitude"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(store_dict(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
def replace_store(store_id: int):
    _user, error = require_admin()
    if error:
        return error
    db = get_db()
    if db.execute("SELECT 1 FROM stores WHERE id = ?", (store_id,)).fetchone() is None:
        return jsonify(error="Store not found."), 404
    values, errors = parse_store_payload()
    if errors:
        return validation_error(errors)
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? WHERE id = ?",
        (values["name"], values["address"], values["phone"], values["latitude"], values["longitude"], store_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(store_dict(row)), 200


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id: int):
    _user, error = require_admin()
    if error:
        return error
    db = get_db()
    cur = db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    if cur.rowcount == 0:
        return jsonify(error="Store not found."), 404
    return jsonify(deleted=store_id), 200


# ---------------------------------------------------------------------------
# Health and frontend
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify(error="Not found."), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


with app.app_context():
    init_db()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    row = get_db().execute("SELECT 1 FROM users WHERE username = 'admin'").fetchone()
    if row is None:
        get_db().execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            ("admin", hash_password(admin_password or secrets.token_urlsafe(32))),
        )
        get_db().commit()
