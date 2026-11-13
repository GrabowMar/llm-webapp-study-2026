"""Store finder: JSON API under /api plus serving the frontend build."""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "stores.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

DEFAULT_RADIUS_KM = 50.0
EARTH_RADIUS_KM = 6371.0088

SAMPLE_STORES = [
    (1, "Canal Square Store", "Damrak 45, 1012 LK Amsterdam", "+31 20 555 0101", 52.3765, 4.8975),
    (2, "Vondelpark Store", "Overtoom 140, 1054 HD Amsterdam", "+31 20 555 0102", 52.3622, 4.8735),
    (3, "Market Hall Store", "Domplein 21, 3512 JE Utrecht", "+31 30 555 0201", 52.0907, 5.1214),
    (4, "Harbour Front Store", "Wilhelminakade 66, 3072 AR Rotterdam", "+31 10 555 0301", 51.9036, 4.4868),
    (5, "Riverside Store", "Blaak 12, 3011 TA Rotterdam", "+31 10 555 0302", 51.9200, 4.4830),
    (6, "Old Town Store", "Grote Markt 8, 2511 BH Den Haag", "+31 70 555 0401", 52.0777, 4.3143),
    (7, "Alexanderplatz Store", "Karl-Liebknecht-Str. 5, 10178 Berlin", "+49 30 555 0501", 52.5219, 13.4132),
    (8, "Rivoli Store", "Rue de Rivoli 72, 75001 Paris", "+33 1 55 55 06 01", 48.8606, 2.3487),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

app = Flask(__name__, static_folder=None)


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fresh = not DB_PATH.exists()
    db = connect_db()
    try:
        db.executescript(SCHEMA)
        if fresh:
            db.executemany(
                "INSERT OR IGNORE INTO stores (id, name, address, phone, latitude, longitude)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                SAMPLE_STORES,
            )
        db.commit()
    finally:
        db.close()


init_db()


def json_error(message: str, status: int, fields: dict | None = None):
    body: dict = {"error": message}
    if fields:
        body["fields"] = fields
    return jsonify(body), status


def store_dict(row: sqlite3.Row, distance_km: float | None = None) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": distance_km,
    }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def bearer_username() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute("SELECT username FROM tokens WHERE token = ?", (token,)).fetchone()
    return row["username"] if row is not None else None


def require_admin():
    username = bearer_username()
    if username is None:
        return None, json_error("authentication required", 401)
    if username != ADMIN_USERNAME:
        return None, json_error("admin access required", 403)
    return username, None


def parse_coord(value, name: str, lo: float, hi: float, fields: dict):
    out_of_range = f"{name} must be a number between {lo:g} and {hi:g}"
    if value is None:
        fields[name] = f"{name} is required"
        return None
    if isinstance(value, bool):
        fields[name] = out_of_range
        return None
    if isinstance(value, str):
        try:
            value = float(value.strip())
        except ValueError:
            fields[name] = out_of_range
            return None
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        fields[name] = out_of_range
        return None
    if not lo <= value <= hi:
        fields[name] = out_of_range
        return None
    return float(value)


def validate_store(data: dict):
    fields: dict = {}
    name = data.get("name")
    address = data.get("address")
    if not isinstance(name, str) or not name.strip():
        fields["name"] = "name is required"
    if not isinstance(address, str) or not address.strip():
        fields["address"] = "address is required"
    phone = data.get("phone")
    if phone is not None:
        if not isinstance(phone, str):
            fields["phone"] = "phone must be a string"
        else:
            phone = phone.strip() or None
    lat = parse_coord(data.get("latitude"), "latitude", -90, 90, fields)
    lng = parse_coord(data.get("longitude"), "longitude", -180, 180, fields)
    if fields:
        return None, json_error("; ".join(fields.values()), 400, fields)
    return {
        "name": name.strip(),
        "address": address.strip(),
        "phone": phone,
        "latitude": lat,
        "longitude": lng,
    }, None


def body_dict():
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        return None, json_error("a JSON body is required", 400)
    return data, None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data, err = body_dict()
    if err:
        return err
    fields: dict = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "username is required"
    elif username.strip().lower() == ADMIN_USERNAME:
        fields["username"] = "username 'admin' is reserved"
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        return json_error("; ".join(fields.values()), 400, fields)
    username = username.strip()
    db = get_db()
    taken = db.execute(
        "SELECT id FROM users WHERE lower(username) = lower(?)", (username,)
    ).fetchone()
    if taken is not None:
        return json_error("username already taken", 409, {"username": "username already taken"})
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data, err = body_dict()
    if err:
        return err
    username = data.get("username")
    password = data.get("password")
    fields: dict = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "username is required"
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        return json_error("; ".join(fields.values()), 400, fields)
    username = username.strip()
    db = get_db()
    if username.lower() == ADMIN_USERNAME:
        if not ADMIN_PASSWORD:
            return json_error("admin sign-in is disabled", 401)
        if not secrets.compare_digest(password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")):
            return json_error("invalid username or password", 401)
        account = ADMIN_USERNAME
    else:
        row = db.execute(
            "SELECT * FROM users WHERE lower(username) = lower(?)", (username,)
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return json_error("invalid username or password", 401)
        account = row["username"]
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, username) VALUES (?, ?)", (token, account))
    db.commit()
    return jsonify({"token": token})


@app.get("/api/stores")
def list_stores():
    q = (request.args.get("q") or "").strip().lower()
    use_geo = "lat" in request.args or "lng" in request.args
    lat = lng = radius = None
    if use_geo:
        fields: dict = {}
        lat = parse_coord(request.args.get("lat"), "latitude", -90, 90, fields)
        lng = parse_coord(request.args.get("lng"), "longitude", -180, 180, fields)
        raw_radius = request.args.get("radius")
        if raw_radius is None or raw_radius == "":
            radius = DEFAULT_RADIUS_KM
        else:
            try:
                radius = float(raw_radius)
            except ValueError:
                radius = None
            if radius is None or not math.isfinite(radius) or radius <= 0:
                fields["radius"] = "radius must be a positive number"
        if fields:
            return json_error("; ".join(fields.values()), 400, fields)

    rows = get_db().execute("SELECT * FROM stores").fetchall()
    results: list[tuple[sqlite3.Row, float | None]] = []
    for row in rows:
        if q and q not in f"{row['name']} {row['address']} {row['phone'] or ''}".lower():
            continue
        distance = None
        if use_geo:
            raw_distance = haversine_km(lat, lng, row["latitude"], row["longitude"])
            if raw_distance > radius:
                continue
            distance = round(raw_distance, 2)
        results.append((row, distance))
    if use_geo:
        results.sort(key=lambda item: (item[1], item[0]["name"].lower()))
    else:
        results.sort(key=lambda item: item[0]["name"].lower())
    return jsonify({"items": [store_dict(row, distance) for row, distance in results]})


@app.get("/api/stores/<int:store_id>")
def get_store(store_id: int):
    row = get_db().execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return json_error("store not found", 404)
    return jsonify(store_dict(row))


@app.post("/api/admin/stores")
def create_store():
    _, err = require_admin()
    if err:
        return err
    data, err = body_dict()
    if err:
        return err
    payload, err = validate_store(data)
    if err:
        return err
    db = get_db()
    cur = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
        (payload["name"], payload["address"], payload["phone"], payload["latitude"], payload["longitude"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(store_dict(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
def update_store(store_id: int):
    _, err = require_admin()
    if err:
        return err
    data, err = body_dict()
    if err:
        return err
    payload, err = validate_store(data)
    if err:
        return err
    db = get_db()
    existing = db.execute("SELECT id FROM stores WHERE id = ?", (store_id,)).fetchone()
    if existing is None:
        return json_error("store not found", 404)
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? WHERE id = ?",
        (payload["name"], payload["address"], payload["phone"], payload["latitude"], payload["longitude"], store_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(store_dict(row))


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id: int):
    _, err = require_admin()
    if err:
        return err
    db = get_db()
    existing = db.execute("SELECT id FROM stores WHERE id = ?", (store_id,)).fetchone()
    if existing is None:
        return json_error("store not found", 404)
    db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return json_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
