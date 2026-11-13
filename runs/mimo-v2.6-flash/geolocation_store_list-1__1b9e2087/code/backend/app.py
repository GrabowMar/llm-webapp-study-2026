"""Store finder: Flask API and frontend host."""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "storefinder.db"
DIST = BASE_DIR / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_ENABLED = bool(ADMIN_PASSWORD.strip())

SAMPLE_STORES = [
    ("Baker Street Books", "221 Baker Street, London NW1 6XE, United Kingdom", "+44 20 7946 0958", 51.5238, -0.1585),
    ("Camden Market Goods", "54 Camden High Street, London NW1 0JH, United Kingdom", "+44 20 7485 8585", 51.5390, -0.1426),
    ("Thames Side Outfitters", "18 Lower Thames Street, London EC3R 6HD, United Kingdom", None, 51.5081, -0.0870),
    ("Le Marais Boutique", "12 Rue des Francs Bourgeois, 75004 Paris, France", "+33 1 42 78 12 45", 48.8566, 2.3522),
    ("Saint-Germain Supply", "45 Rue de Seine, 75006 Paris, France", "+33 1 43 26 66 66", 48.8530, 2.3345),
    ("Mitte Werkstatt", "Torstrasse 101, 10119 Berlin, Germany", "+49 30 1234567", 52.5251, 13.4010),
    ("Kreuzberg Kiosk", "Oranienstrasse 42, 10999 Berlin, Germany", None, 52.5024, 13.4170),
    ("Jordaan Decor", "Prinsengracht 263, 1016 GV Amsterdam, Netherlands", "+31 20 555 0143", 52.3740, 4.8840),
]


# ---------------------------------------------------------------- database


@contextmanager
def db() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2:{salt.hex()}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split(":")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), 200_000
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fresh = not DB_PATH.exists()
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS stores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT NOT NULL,
                phone TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            """
        )
        if fresh:
            conn.executemany(
                "INSERT INTO stores (name, address, phone, latitude, longitude) "
                "VALUES (?, ?, ?, ?, ?)",
                SAMPLE_STORES,
            )
    if ADMIN_ENABLED:
        with db() as conn:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if existing:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (hash_password(ADMIN_PASSWORD), existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                    (ADMIN_USERNAME, hash_password(ADMIN_PASSWORD)),
                )


# ---------------------------------------------------------------- helpers


def row_to_store(row: sqlite3.Row, distance: float | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": round(distance, 3) if distance is not None else None,
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def parse_float(name: str) -> float | None:
    """Return the float query parameter, or None when absent."""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None
    try:
        return float(raw)
    except ValueError:
        raise BadRequest(f"{name} must be a number")


class ApiError(Exception):
    def __init__(self, status: int, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.fields = fields


class BadRequest(ApiError):
    def __init__(self, message: str, fields: dict[str, str] | None = None):
        super().__init__(400, message, fields)


def json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise BadRequest("request body must be a JSON object")
    return body


def current_user() -> dict[str, Any] | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    with db() as conn:
        row = conn.execute(
            "SELECT u.username AS username, u.is_admin AS is_admin "
            "FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ?",
            (token,),
        ).fetchone()
    if row is None:
        return None
    return {"username": row["username"], "admin": bool(row["is_admin"])}


def require_user() -> dict[str, Any]:
    user = current_user()
    if user is None:
        raise ApiError(401, "authentication required")
    return user


def require_admin() -> dict[str, Any]:
    user = require_user()
    if not user["admin"]:
        raise ApiError(403, "admin privileges required")
    return user


def validate_store(body: dict[str, Any]) -> dict[str, Any]:
    fields: dict[str, str] = {}

    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        fields["name"] = "name is required"
    address = body.get("address")
    if not isinstance(address, str) or not address.strip():
        fields["address"] = "address is required"

    def coord(key: str, label: str, low: float, high: float) -> None:
        value = body.get(key)
        if value is None:
            fields[key] = f"{label} is required"
        elif isinstance(value, bool) or not isinstance(value, (int, float)):
            fields[key] = f"{label} must be a number between {low} and {high}"
        elif not low <= float(value) <= high:
            fields[key] = f"{label} must be a number between {low} and {high}"

    coord("latitude", "latitude", -90, 90)
    coord("longitude", "longitude", -180, 180)

    phone = body.get("phone")
    if phone is not None and not isinstance(phone, str):
        fields["phone"] = "phone must be a string"

    if fields:
        raise BadRequest("; ".join(fields.values()), fields)
    return {
        "name": name.strip(),
        "address": address.strip(),
        "phone": phone.strip() or None if isinstance(phone, str) else None,
        "latitude": float(body["latitude"]),
        "longitude": float(body["longitude"]),
    }


def store_or_404(store_id: int) -> sqlite3.Row:
    with db() as conn:
        row = conn.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        raise ApiError(404, "store not found")
    return row


# ---------------------------------------------------------------- app


init_db()

app = Flask(__name__, static_folder=None)


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    payload: dict[str, Any] = {"error": err.message}
    if err.fields:
        payload["fields"] = err.fields
    return jsonify(payload), err.status


@app.errorhandler(404)
def handle_404(_err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(DIST, "index.html") if (DIST / "index.html").is_file() else (
        "frontend not built",
        404,
    )


@app.errorhandler(405)
def handle_405(_err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return jsonify({"error": "method not allowed"}), 405


@app.after_request
def add_cors(response):
    if request.path.startswith("/api/"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Authorization, Content-Type"
        )
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    fields: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "username is required"
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        raise BadRequest("; ".join(fields.values()), fields)
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "username is reserved")
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
                (username, hash_password(password)),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "username already exists")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    fields: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "username is required"
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        raise BadRequest("; ".join(fields.values()), fields)
    username = username.strip()
    if username == ADMIN_USERNAME and not ADMIN_ENABLED:
        raise ApiError(401, "admin sign-in is disabled")
    with db() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            raise ApiError(401, "invalid username or password")
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, row["id"])
        )
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"username": user["username"], "admin": user["admin"]})


# ---------------------------------------------------------------- stores


@app.get("/api/stores")
def list_stores():
    q = (request.args.get("q") or "").strip().lower()
    lat = parse_float("lat")
    lng = parse_float("lng")
    radius = parse_float("radius")
    if (lat is None) != (lng is None):
        raise BadRequest("lat and lng must be given together")
    if radius is not None and radius < 0:
        raise BadRequest("radius must be a non-negative number")

    with db() as conn:
        rows = conn.execute("SELECT * FROM stores").fetchall()

    stores: list[dict[str, Any]] = []
    for row in rows:
        if q and not any(
            q in (row[field] or "").lower() for field in ("name", "address", "phone")
        ):
            continue
        distance = None
        if lat is not None and lng is not None:
            distance = haversine_km(lat, lng, row["latitude"], row["longitude"])
            if radius is not None and distance > radius:
                continue
        stores.append(row_to_store(row, distance))

    if lat is not None and lng is not None:
        stores.sort(key=lambda s: (s["distance_km"], s["name"].lower()))
    else:
        stores.sort(key=lambda s: s["name"].lower())
    return jsonify({"items": stores})


@app.get("/api/stores/<int:store_id>")
def get_store(store_id: int):
    row = store_or_404(store_id)
    return jsonify(row_to_store(row))


@app.post("/api/admin/stores")
def create_store():
    require_admin()
    data = validate_store(json_body())
    with db() as conn:
        cursor = conn.execute(
            "INSERT INTO stores (name, address, phone, latitude, longitude) "
            "VALUES (?, ?, ?, ?, ?)",
            (data["name"], data["address"], data["phone"], data["latitude"], data["longitude"]),
        )
        store_id = cursor.lastrowid
        row = conn.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(row_to_store(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
def replace_store(store_id: int):
    require_admin()
    store_or_404(store_id)
    body = json_body()
    if "phone" not in body:
        body["phone"] = None
    data = validate_store(body)
    with db() as conn:
        conn.execute(
            "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? "
            "WHERE id = ?",
            (
                data["name"],
                data["address"],
                data["phone"],
                data["latitude"],
                data["longitude"],
                store_id,
            ),
        )
        row = conn.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(row_to_store(row))


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id: int):
    require_admin()
    store_or_404(store_id)
    with db() as conn:
        conn.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    return jsonify({"deleted": True, "id": store_id})


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    target = DIST / path
    if path != "index.html" and target.is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "frontend not built"}), 404
