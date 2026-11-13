"""Store finder: Flask API + frontend host."""

import math
import os
import secrets
import sqlite3
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

EARTH_RADIUS_KM = 6371.0

app = Flask(__name__, static_folder=None)


def _secret_key() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    secret_file = DATA_DIR / "secret.key"
    if secret_file.exists():
        return secret_file.read_text().strip()
    secret = secrets.token_hex(32)
    secret_file.write_text(secret)
    return secret


SERIALIZER = URLSafeTimedSerializer(_secret_key(), salt="store-finder-auth")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
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
        """
    )
    conn.commit()
    conn.close()


def seed_stores() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    count = conn.execute("SELECT COUNT(*) AS c FROM stores").fetchone()["c"]
    if count == 0:
        samples = [
            ("Bean & Brew", "12 High Street, London", "+44 20 7946 0101", 51.5074, -0.1278),
            ("Maple Diner", "450 Queen Street W, Toronto", "+1 416 555 0134", 43.6467, -79.4001),
            ("Sunrise Bakery", "88 Rue de Rivoli, Paris", "+33 1 42 60 12 34", 48.8566, 2.3522),
            ("Harbour Cafe", "5 Circular Quay, Sydney", "+61 2 9250 7788", -33.8612, 151.2100),
            ("Nordic Roast", "21 Storgatan, Stockholm", "+46 8 555 0102", 59.3293, 18.0686),
            ("Golden Noodle", "300 5th Ave, New York", "+1 212 555 0199", 40.7484, -73.9857),
            ("Cactus Grill", "77 Lavaca St, Austin", "+1 512 555 0177", 30.2672, -97.7431),
            ("Alpine Hut", "9 Bahnhofstrasse, Zurich", "+41 44 555 0103", 47.3769, 8.5417),
        ]
        conn.executemany(
            "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
            samples,
        )
        conn.commit()
    conn.close()


def upsert_admin() -> None:
    if not ADMIN_ENABLED:
        return
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    password_hash = generate_password_hash(ADMIN_PASSWORD)
    if existing is None:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (ADMIN_USERNAME, password_hash),
        )
    else:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (password_hash, ADMIN_USERNAME),
        )
    conn.commit()
    conn.close()


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def store_to_dict(row, distance_km=None):
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": None if distance_km is None else round(distance_km, 2),
    }


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer ") :].strip()
    try:
        data = SERIALIZER.loads(token)
        return data.get("username")
    except Exception:
        return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        username = current_user()
        if username is None:
            return jsonify({"error": "Authentication required."}), 401
        g.username = username
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        username = current_user()
        if username is None:
            return jsonify({"error": "Authentication required."}), 401
        if username != ADMIN_USERNAME:
            return jsonify({"error": "Forbidden."}), 403
        g.username = username
        return fn(*args, **kwargs)

    return wrapper


def validate_store_payload(data, partial: bool = False):
    errors = {}
    if "name" in data or not partial:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            errors["name"] = "Name is required."
    if "address" in data or not partial:
        address = data.get("address")
        if not isinstance(address, str) or not address.strip():
            errors["address"] = "Address is required."
    if "latitude" in data or not partial:
        lat = data.get("latitude")
        if not isinstance(lat, (int, float)) or isinstance(lat, bool) or not (-90 <= lat <= 90):
            errors["latitude"] = "Latitude must be a number between -90 and 90."
    if "longitude" in data or not partial:
        lng = data.get("longitude")
        if not isinstance(lng, (int, float)) or isinstance(lng, bool) or not (-180 <= lng <= 180):
            errors["longitude"] = "Longitude must be a number between -180 and 180."
    if "phone" in data:
        phone = data.get("phone")
        if not isinstance(phone, str):
            errors["phone"] = "Phone must be a string."
    return errors


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Username is required."}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "Password is required."}), 400
    if username == ADMIN_USERNAME:
        return jsonify({"error": "This username is reserved."}), 409
    db = get_db()
    exists = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists is not None:
        return jsonify({"error": "Username is already taken."}), 409
    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid username or password."}), 401
    db = get_db()
    row = db.execute(
        "SELECT username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401
    token = SERIALIZER.dumps({"username": username})
    return jsonify({"token": token}), 200


@app.get("/api/stores")
def list_stores():
    q = request.args.get("q", "").strip()
    lat_raw = request.args.get("lat")
    lng_raw = request.args.get("lng")
    radius_raw = request.args.get("radius")

    db = get_db()
    rows = db.execute(
        "SELECT * FROM stores ORDER BY name COLLATE NOCASE"
    ).fetchall()

    stores = [store_to_dict(r) for r in rows]

    if q:
        ql = q.lower()
        stores = [
            s for s in stores if ql in s["name"].lower() or ql in s["address"].lower()
        ]

    has_location = lat_raw is not None and lng_raw is not None
    if has_location:
        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "lat and lng must be numbers."}), 400
        try:
            radius = float(radius_raw) if radius_raw is not None else 10.0
        except (TypeError, ValueError):
            return jsonify({"error": "radius must be a number."}), 400
        if radius <= 0:
            return jsonify({"error": "radius must be positive."}), 400
        for s in stores:
            s["distance_km"] = round(
                haversine_km(lat, lng, s["latitude"], s["longitude"]), 2
            )
        stores = [s for s in stores if s["distance_km"] <= radius]
        stores.sort(key=lambda s: s["distance_km"])

    return jsonify({"items": stores})


@app.get("/api/stores/<int:store_id>")
def get_store(store_id):
    db = get_db()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Store not found."}), 404
    return jsonify(store_to_dict(row))


@app.post("/api/admin/stores")
@require_admin
def create_store():
    data = request.get_json(silent=True) or {}
    errors = validate_store_payload(data)
    if errors:
        return jsonify({"error": "Validation failed.", "errors": errors}), 400
    db = get_db()
    cur = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
        (
            data["name"].strip(),
            data["address"].strip(),
            (data.get("phone") or "").strip(),
            float(data["latitude"]),
            float(data["longitude"]),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM stores WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(store_to_dict(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
@require_admin
def update_store(store_id):
    db = get_db()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Store not found."}), 404
    data = request.get_json(silent=True) or {}
    errors = validate_store_payload(data)
    if errors:
        return jsonify({"error": "Validation failed.", "errors": errors}), 400
    phone = (data.get("phone") or "").strip()
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? WHERE id = ?",
        (
            data["name"].strip(),
            data["address"].strip(),
            phone,
            float(data["latitude"]),
            float(data["longitude"]),
            store_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(store_to_dict(row))


@app.delete("/api/admin/stores/<int:store_id>")
@require_admin
def delete_store(store_id):
    db = get_db()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Store not found."}), 404
    db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
seed_stores()
upsert_admin()
