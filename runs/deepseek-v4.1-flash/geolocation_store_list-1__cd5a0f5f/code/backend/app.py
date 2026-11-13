"""Store finder Flask application."""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "storefinder.db"

app = Flask(__name__, static_folder=None)

SAMPLE_STORES = [
    ("Harbour Books", "12 Quay Street, Bristol", "+44 117 496 0011", 51.4500, -2.5930),
    ("Meadow Cafe", "48 Park Road, Bristol", "+44 117 496 0022", 51.4620, -2.6110),
    ("Central Cycles", "7 Market Square, Bath", "+44 1225 460 033", 51.3810, -2.3590),
    ("Roman Baths Gifts", "9 Abbey Churchyard, Bath", "+44 1225 460 044", 51.3815, -2.3597),
    ("Thames Grocer", "101 Riverside Walk, London", "+44 20 7946 055", 51.5074, -0.1278),
    ("Soho Records", "22 Berwick Street, London", "+44 20 7946 066", 51.5138, -0.1359),
    ("Bridge Street Deli", "3 Bridge Street, Manchester", "+44 161 496 077", 53.4808, -2.2426),
    ("Northern Outfitters", "55 Deansgate, Manchester", "+44 161 496 088", 53.4785, -2.2478),
]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    phone TEXT,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        seeded = conn.execute(
            "SELECT 1 FROM meta WHERE key = 'seeded'"
        ).fetchone()
        if seeded is None:
            conn.executemany(
                "INSERT INTO stores (name, address, phone, latitude, longitude)"
                " VALUES (?, ?, ?, ?, ?)",
                SAMPLE_STORES,
            )
            conn.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('seeded', '1')")

        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if admin_password:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = 'admin'"
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (generate_password_hash(admin_password), existing[0]),
                )
            else:
                conn.execute(
                    "INSERT OR IGNORE INTO users (username, password_hash, is_admin)"
                    " VALUES ('admin', ?, 1)",
                    (generate_password_hash(admin_password),),
                )
        conn.commit()
    finally:
        conn.close()


init_db()


def json_error(message: str, status: int, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def store_to_dict(row: sqlite3.Row, distance: float | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": None if distance is None else round(distance, 2),
    }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def parse_coordinate(value: Any, name: str, limit: float) -> tuple[float | None, str | None]:
    if value is None or isinstance(value, bool):
        return None, f"{name} is required"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None, f"{name} must be a number"
    if not math.isfinite(number):
        return None, f"{name} must be a number"
    if not -limit <= number <= limit:
        return None, f"{name} must be between -{limit:g} and {limit:g}"
    return number, None


def validate_store(data: Any) -> tuple[dict[str, Any] | None, dict[str, str]]:
    errors: dict[str, str] = {}
    if not isinstance(data, dict):
        return None, {"body": "Expected a JSON object"}

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors["name"] = "Name is required"
        name = ""
    else:
        name = name.strip()

    address = data.get("address")
    if not isinstance(address, str) or not address.strip():
        errors["address"] = "Address is required"
        address = ""
    else:
        address = address.strip()

    phone = data.get("phone")
    if phone is None:
        phone = None
    elif isinstance(phone, str):
        phone = phone.strip() or None
    else:
        errors["phone"] = "Phone must be a string"

    latitude, latitude_error = parse_coordinate(data.get("latitude"), "Latitude", 90)
    if latitude_error:
        errors["latitude"] = latitude_error
    longitude, longitude_error = parse_coordinate(data.get("longitude"), "Longitude", 180)
    if longitude_error:
        errors["longitude"] = longitude_error

    if errors:
        return None, errors
    return {
        "name": name,
        "address": address,
        "phone": phone,
        "latitude": latitude,
        "longitude": longitude,
    }, {}


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT users.id, users.username, users.is_admin FROM tokens"
        " JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
        (token,),
    ).fetchone()
    return row


def require_admin():
    user = current_user()
    if user is None:
        return None, json_error("Authentication required", 401)
    if not user["is_admin"]:
        return None, json_error("Admin access required", 403)
    return user, None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Expected a JSON object", 400)

    username = data.get("username")
    password = data.get("password")
    errors: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
        username = ""
    else:
        username = username.strip()
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
        password = ""
    if errors:
        return json_error("Validation failed", 400, errors)

    if username.lower() == "admin":
        return json_error("Username is already taken", 409, {"username": "Username is already taken"})

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return json_error("Username is already taken", 409, {"username": "Username is already taken"})

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return json_error("Expected a JSON object", 400)

    username = data.get("username")
    password = data.get("password")
    errors: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    if errors:
        return json_error("Validation failed", 400, errors)

    username = username.strip()
    db = get_db()

    if username == "admin" and not os.environ.get("ADMIN_PASSWORD", ""):
        return json_error("Invalid username or password", 401)

    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    db.commit()
    return jsonify({"token": token})


@app.get("/api/stores")
def list_stores():
    args = request.args
    q = args.get("q", "").strip()

    lat_raw = args.get("lat")
    lng_raw = args.get("lng")
    radius_raw = args.get("radius")
    has_location = lat_raw is not None or lng_raw is not None

    latitude = longitude = radius = None
    if has_location:
        errors: dict[str, str] = {}
        if lat_raw is None:
            errors["lat"] = "lat is required with lng"
        if lng_raw is None:
            errors["lng"] = "lng is required with lat"
        if not errors:
            latitude, lat_error = parse_coordinate(lat_raw, "lat", 90)
            if lat_error:
                errors["lat"] = lat_error
            longitude, lng_error = parse_coordinate(lng_raw, "lng", 180)
            if lng_error:
                errors["lng"] = lng_error
        if radius_raw not in (None, ""):
            try:
                radius = float(radius_raw)
                if not math.isfinite(radius) or radius < 0:
                    raise ValueError
            except (TypeError, ValueError):
                errors["radius"] = "radius must be a non-negative number"
        if errors:
            return json_error("Validation failed", 400, errors)

    sql = "SELECT * FROM stores"
    params: list[Any] = []
    if q:
        like = f"%{q}%"
        sql += " WHERE (name LIKE ? OR address LIKE ? OR phone LIKE ?)"
        params.extend([like, like, like])
    sql += " ORDER BY name COLLATE NOCASE ASC"

    rows = get_db().execute(sql, params).fetchall()

    if has_location:
        located = []
        for row in rows:
            distance = haversine_km(latitude, longitude, row["latitude"], row["longitude"])
            if radius is None or distance <= radius:
                located.append((distance, row))
        located.sort(key=lambda item: (item[0], item[1]["name"].lower()))
        return jsonify(
            {"items": [store_to_dict(row, distance) for distance, row in located]}
        )

    return jsonify({"items": [store_to_dict(row) for row in rows]})


@app.get("/api/stores/<int:store_id>")
def get_store(store_id: int):
    row = get_db().execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return json_error("Store not found", 404)
    return jsonify(store_to_dict(row))


@app.post("/api/admin/stores")
def create_store():
    _user, auth_error = require_admin()
    if auth_error:
        return auth_error

    store, errors = validate_store(request.get_json(silent=True))
    if errors:
        return json_error("Validation failed", 400, errors)

    db = get_db()
    cursor = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude)"
        " VALUES (?, ?, ?, ?, ?)",
        (
            store["name"],
            store["address"],
            store["phone"],
            store["latitude"],
            store["longitude"],
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(store_to_dict(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
def update_store(store_id: int):
    _user, auth_error = require_admin()
    if auth_error:
        return auth_error

    db = get_db()
    existing = db.execute("SELECT id FROM stores WHERE id = ?", (store_id,)).fetchone()
    if existing is None:
        return json_error("Store not found", 404)

    store, errors = validate_store(request.get_json(silent=True))
    if errors:
        return json_error("Validation failed", 400, errors)

    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ?"
        " WHERE id = ?",
        (
            store["name"],
            store["address"],
            store["phone"],
            store["latitude"],
            store["longitude"],
            store_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(store_to_dict(row))


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id: int):
    _user, auth_error = require_admin()
    if auth_error:
        return auth_error

    db = get_db()
    cursor = db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    if cursor.rowcount == 0:
        return json_error("Store not found", 404)
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return json_error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
