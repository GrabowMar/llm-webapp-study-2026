"""Flask entry point for the store finder.

Serves the JSON API under ``/api`` and the built frontend from
``frontend/dist``.
"""

from __future__ import annotations

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("STORE_FINDER_DATA_DIR") or (BASE_DIR / "data"))
DB_PATH = DATA_DIR / "store_finder.db"
DIST = BASE_DIR / "frontend" / "dist"

EARTH_RADIUS_KM = 6371.0088
TOKEN_TTL = timedelta(days=30)
PBKDF2_ITERATIONS = 120_000
ADMIN_USERNAME = "admin"

app = Flask(__name__, static_folder=None)

SAMPLE_STORES: list[dict[str, Any]] = [
    {
        "name": "Alte Post Markt",
        "address": "Hauptstrasse 12, 10115 Berlin",
        "phone": "+49 30 5550101",
        "latitude": 52.5291,
        "longitude": 13.4019,
    },
    {
        "name": "Nordbahnhof Kiosk",
        "address": "Invalidenstrasse 105, 10557 Berlin",
        "phone": "+49 30 5550102",
        "latitude": 52.5326,
        "longitude": 13.3849,
    },
    {
        "name": "Kreuzberg Spatskrampe",
        "address": "Oranienstrasse 24, 10999 Berlin",
        "phone": "+49 30 5550103",
        "latitude": 52.4995,
        "longitude": 13.4194,
    },
    {
        "name": "HafenCity Provisions",
        "address": "Am Sandtorkai 42, 20457 Hamburg",
        "phone": "+49 40 5550201",
        "latitude": 53.5411,
        "longitude": 9.9931,
    },
    {
        "name": "Altona Backwaren",
        "address": "Osterbrooksweg 78, 22769 Hamburg",
        "phone": "+49 40 5550202",
        "latitude": 53.5556,
        "longitude": 9.9288,
    },
    {
        "name": "Isar Markt",
        "address": "Reichenbachstrasse 5, 81479 Munich",
        "phone": "+49 89 5550301",
        "latitude": 48.1425,
        "longitude": 11.6136,
    },
    {
        "name": "Schwabing Feinkost",
        "address": "Türkenstrasse 58, 80333 Munich",
        "phone": "+49 89 5550302",
        "latitude": 48.1372,
        "longitude": 11.5767,
    },
    {
        "name": "Kostentor City Store",
        "address": "Bei den Muehren 3, 50668 Cologne",
        "phone": "+49 221 5550401",
        "latitude": 50.9413,
        "longitude": 6.9588,
    },
]


# --------------------------------------------------------------------------- #
# database
# --------------------------------------------------------------------------- #


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA foreign_keys=ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS stores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT NOT NULL DEFAULT '',
            phone TEXT,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()
    ensure_admin_user()
    seed_sample_stores()


def ensure_admin_user() -> None:
    db = get_db()
    row = db.execute(
        "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if row is None:
        db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at)"
            " VALUES (?, ?, 1, ?)",
            (
                ADMIN_USERNAME,
                hash_password(secrets.token_urlsafe(32)),
                utc_now(),
            ),
        )
        db.commit()


def seed_sample_stores() -> None:
    db = get_db()
    if db.execute("SELECT COUNT(*) AS n FROM stores").fetchone()["n"] > 0:
        return
    db.execute("BEGIN IMMEDIATE")
    try:
        if db.execute("SELECT COUNT(*) AS n FROM stores").fetchone()["n"] == 0:
            db.executemany(
                "INSERT INTO stores (name, address, phone, latitude, longitude,"
                " created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        store["name"],
                        store["address"],
                        store["phone"],
                        store["latitude"],
                        store["longitude"],
                        utc_now(),
                    )
                    for store in SAMPLE_STORES
                ],
            )
        db.commit()
    except Exception:
        db.rollback()
        raise


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(iterations),
        )
    except (AttributeError, TypeError, ValueError):
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + TOKEN_TTL
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at)"
        " VALUES (?, ?, ?, ?)",
        (hash_token(token), user_id, utc_now(), expires_at.isoformat(timespec="seconds")),
    )
    db.commit()
    return token


def current_user() -> dict[str, Any] | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id AS id, u.username AS username, u.is_admin AS is_admin"
        " FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    expires_at = get_db().execute(
        "SELECT expires_at FROM tokens WHERE token_hash = ?", (hash_token(token),)
    ).fetchone()
    if expires_at is not None:
        try:
            if datetime.fromisoformat(expires_at["expires_at"]) < datetime.now(timezone.utc):
                return None
        except ValueError:
            return None
    return {
        "id": row["id"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


def require_user() -> dict[str, Any]:
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required.", "missing_token")
    return user


def require_admin() -> dict[str, Any]:
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin privileges required.", "forbidden")
    return user


class ApiError(Exception):
    def __init__(
        self, status: int, message: str, code: str = "error", errors: dict[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code
        self.errors = errors or {}


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    payload: dict[str, Any] = {"error": error.message, "code": error.code}
    if error.errors:
        payload["errors"] = error.errors
        payload["fields"] = error.errors
    return jsonify(payload), error.status


@app.errorhandler(404)
def handle_404(_error: Any):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found.", "code": "not_found"}), 404
    return serve_frontend()


@app.errorhandler(405)
def handle_405(_error: Any):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed.", "code": "method_not_allowed"}), 405
    return jsonify({"error": "Method not allowed.", "code": "method_not_allowed"}), 405


@app.errorhandler(Exception)
def handle_unexpected(error: Exception):
    if isinstance(error, ApiError):
        return handle_api_error(error)
    if isinstance(error, HTTPException):
        payload = {
            "error": error.description or error.name,
            "code": error.name.lower().replace(" ", "_"),
        }
        return jsonify(payload), error.code
    app.logger.exception("unhandled error: %s", error)
    return jsonify({"error": "Internal server error.", "code": "server_error"}), 500


def request_json() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if body is None:
        return {}
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object.", "invalid_body")
    return body


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def serialize_store(row: sqlite3.Row, distance_km: float | None = None) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"] or "",
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": distance_km,
    }


def parse_float(raw: str, field: str) -> float:
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ApiError(400, f"'{field}' must be a number.", "invalid_query") from None
    if math.isnan(value) or math.isinf(value):
        raise ApiError(400, f"'{field}' must be a finite number.", "invalid_query")
    return value


# --------------------------------------------------------------------------- #
# store payload validation
# --------------------------------------------------------------------------- #


def validate_store_payload(body: dict[str, Any], require_phone: bool = False) -> dict[str, Any]:
    errors: dict[str, str] = {}
    store: dict[str, Any] = {}

    name = body.get("name")
    if not isinstance(name, str) or not name.strip():
        errors["name"] = "Name is required."
    else:
        store["name"] = name.strip()

    address = body.get("address")
    if not isinstance(address, str) or not address.strip():
        errors["address"] = "Address is required."
    else:
        store["address"] = address.strip()

    phone = body.get("phone")
    if phone is None:
        store["phone"] = None
    elif isinstance(phone, str):
        store["phone"] = phone.strip() or None
    elif require_phone:
        errors["phone"] = "Phone must be a string."
    else:
        errors["phone"] = "Phone must be a string."

    latitude = body.get("latitude")
    if latitude is None or latitude == "":
        errors["latitude"] = "Latitude is required."
    elif isinstance(latitude, bool) or not isinstance(latitude, (int, float, str)):
        errors["latitude"] = "Latitude must be a number."
    else:
        try:
            value = float(latitude)
        except (TypeError, ValueError):
            errors["latitude"] = "Latitude must be a number."
        else:
            if math.isnan(value) or math.isinf(value) or not -90 <= value <= 90:
                errors["latitude"] = "Latitude must be between -90 and 90."
            else:
                store["latitude"] = value

    longitude = body.get("longitude")
    if longitude is None or longitude == "":
        errors["longitude"] = "Longitude is required."
    elif isinstance(longitude, bool) or not isinstance(longitude, (int, float, str)):
        errors["longitude"] = "Longitude must be a number."
    else:
        try:
            value = float(longitude)
        except (TypeError, ValueError):
            errors["longitude"] = "Longitude must be a number."
        else:
            if math.isnan(value) or math.isinf(value) or not -180 <= value <= 180:
                errors["longitude"] = "Longitude must be between -180 and 180."
            else:
                store["longitude"] = value

    if errors:
        raise ApiError(400, "Validation failed.", "validation_error", errors)
    return store


# --------------------------------------------------------------------------- #
# API: health
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# API: auth
# --------------------------------------------------------------------------- #


@app.post("/api/auth/register")
def register():
    body = request_json()
    errors: dict[str, str] = {}
    username = body.get("username")
    password = body.get("password")

    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) < 3:
        errors["username"] = "Username must be at least 3 characters."
    elif username.strip().lower() == ADMIN_USERNAME:
        errors["username"] = "That username is reserved."

    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."

    if errors:
        raise ApiError(400, "Validation failed.", "validation_error", errors)

    username = username.strip()
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError(409, "That username is already taken.", "username_taken")

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at)"
        " VALUES (?, ?, 0, ?)",
        (username, hash_password(password), utc_now()),
    )
    db.commit()
    user_id = cursor.lastrowid
    token = issue_token(user_id)
    return (
        jsonify(
            {
                "id": user_id,
                "username": username,
                "is_admin": False,
                "token": token,
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    body = request_json()
    errors: dict[str, str] = {}
    username = body.get("username")
    password = body.get("password")

    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        raise ApiError(400, "Validation failed.", "validation_error", errors)

    username = username.strip()
    db = get_db()

    if username.lower() == ADMIN_USERNAME:
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        if not admin_password:
            raise ApiError(
                401, "Admin sign-in is disabled.", "admin_disabled"
            )
        row = db.execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            ensure_admin_user()
            row = db.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        if not hmac.compare_digest(admin_password, password):
            raise ApiError(401, "Invalid username or password.", "invalid_credentials")
        token = issue_token(row["id"])
        return jsonify({"token": token, "username": ADMIN_USERNAME, "is_admin": True})

    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        raise ApiError(401, "Invalid username or password.", "invalid_credentials")

    token = issue_token(row["id"])
    return jsonify({"token": token, "username": username, "is_admin": False})


@app.get("/api/auth/me")
def whoami():
    user = require_user()
    return {"user": user}


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token:
            db = get_db()
            db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
            db.commit()
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# API: stores
# --------------------------------------------------------------------------- #


@app.get("/api/stores")
def list_stores():
    db = get_db()
    query = (request.args.get("q") or "").strip()
    lat_raw = request.args.get("lat")
    lng_raw = request.args.get("lng")
    radius_raw = request.args.get("radius")

    latitude = longitude = radius = None
    has_lat = lat_raw is not None and lat_raw != ""
    has_lng = lng_raw is not None and lng_raw != ""
    if has_lat != has_lng:
        raise ApiError(
            400, "'lat' and 'lng' must be provided together.", "invalid_query"
        )
    if has_lat:
        latitude = parse_float(lat_raw, "lat")
        longitude = parse_float(lng_raw, "lng")
        if not -90 <= latitude <= 90:
            raise ApiError(400, "'lat' must be between -90 and 90.", "invalid_query")
        if not -180 <= longitude <= 180:
            raise ApiError(400, "'lng' must be between -180 and 180.", "invalid_query")
    if radius_raw is not None and radius_raw != "":
        radius = parse_float(radius_raw, "radius")
        if radius < 0:
            raise ApiError(400, "'radius' must not be negative.", "invalid_query")

    sql = "SELECT * FROM stores"
    params: list[Any] = []
    if query:
        sql += (
            " WHERE lower(name) LIKE ? OR lower(address) LIKE ?"
            " OR lower(IFNULL(phone, '')) LIKE ?"
        )
        needle = f"%{query.lower()}%"
        params.extend([needle, needle, needle])
    sql += " ORDER BY lower(name) ASC, name ASC"
    rows = db.execute(sql, params).fetchall()

    items: list[dict[str, Any]] = []
    if latitude is not None and longitude is not None:
        for row in rows:
            distance = haversine_km(
                latitude, longitude, row["latitude"], row["longitude"]
            )
            if radius is not None and distance > radius:
                continue
            items.append(serialize_store(row, round(distance, 3)))
        items.sort(key=lambda item: (item["distance_km"], item["name"].lower()))
    else:
        items = [serialize_store(row) for row in rows]

    return {"items": items, "count": len(items)}


@app.get("/api/stores/<store_id>")
def get_store(store_id: str):
    row = find_store(store_id)
    if row is None:
        raise ApiError(404, "Store not found.", "not_found")
    return serialize_store(row)


def find_store(store_id: str) -> sqlite3.Row | None:
    if not str(store_id).isdigit():
        return None
    return get_db().execute(
        "SELECT * FROM stores WHERE id = ?", (int(store_id),)
    ).fetchone()


# --------------------------------------------------------------------------- #
# API: admin
# --------------------------------------------------------------------------- #


@app.post("/api/admin/stores")
def create_store():
    require_admin()
    body = request_json()
    store = validate_store_payload(body)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            store["name"],
            store["address"],
            store["phone"],
            store["latitude"],
            store["longitude"],
            utc_now(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize_store(row)), 201


@app.put("/api/admin/stores/<store_id>")
def update_store(store_id: str):
    require_admin()
    row = find_store(store_id)
    if row is None:
        raise ApiError(404, "Store not found.", "not_found")
    body = request_json()
    store = validate_store_payload(body)
    db = get_db()
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?,"
        " longitude = ? WHERE id = ?",
        (
            store["name"],
            store["address"],
            store["phone"],
            store["latitude"],
            store["longitude"],
            row["id"],
        ),
    )
    db.commit()
    updated = db.execute(
        "SELECT * FROM stores WHERE id = ?", (row["id"],)
    ).fetchone()
    return jsonify(serialize_store(updated))


@app.delete("/api/admin/stores/<store_id>")
def delete_store(store_id: str):
    require_admin()
    row = find_store(store_id)
    if row is None:
        raise ApiError(404, "Store not found.", "not_found")
    db = get_db()
    db.execute("DELETE FROM stores WHERE id = ?", (row["id"],))
    db.commit()
    return "", 204


# --------------------------------------------------------------------------- #
# frontend
# --------------------------------------------------------------------------- #


def serve_frontend(path: str = "index.html"):
    if not DIST.is_dir():
        return (
            jsonify(
                {
                    "error": "Frontend build not found.",
                    "code": "frontend_missing",
                }
            ),
            503,
        )
    candidate = (DIST / path).resolve()
    try:
        inside = candidate.is_relative_to(DIST.resolve())
    except AttributeError:  # pragma: no cover - python < 3.9
        inside = str(candidate).startswith(str(DIST.resolve()))
    if inside and candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found.", "not_found")
    return serve_frontend(path)


with app.app_context():
    init_db()
