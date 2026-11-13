"""Flask entry point for the store finder API."""

import hashlib
import hmac
import math
import os
import re
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, URLSafeTimedSerializer

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False

ser = None


# ---------------------------------------------------------------- database

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


DB_PATH = DATA_DIR / "stores.db"


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL
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
    )
    db.commit()
    db.execute("BEGIN IMMEDIATE")
    if db.execute("SELECT COUNT(*) FROM stores").fetchone()[0] == 0:
        sample = [
            ("Manhattan Flagship", "132 5th Ave, New York, NY", "+1 212 555 0101", 40.7549, -73.984),
            ("Brooklyn Outlet", "415 Water St, Brooklyn, NY", "+1 718 555 0134", 40.7009, -73.9973),
            ("Queens Corner", "37-06 Broadway, Astoria, NY", "+1 718 555 0177", 40.7549, -73.9202),
            ("Harlem Express", "2296 Frederick Douglass Blvd, New York, NY", None, 40.8099, -73.9531),
            ("Soho Store", "107 Soho St, London", "+44 20 7946 0958", 51.5131, -0.1318),
            ("Camden Market", "204 Camden High St, London", "+44 20 7946 0961", 51.5392, -0.1427),
            ("Shibuya Scramble", "21 Udagawacho, Shibuya, Tokyo", "+81 3 5555 0101", 35.6595, 139.7005),
            ("Shinjuku Hub", "3-38 Nishishinjuku, Tokyo", "+81 3 5555 0140", 35.6938, 139.7034),
        ]
        db.executemany(
            "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
            sample,
        )
    db.commit()
    db.close()


# ------------------------------------------------------------------- auth

def get_secret() -> str:
    secret_file = DATA_DIR / "secret_key"
    if secret_file.is_file():
        return secret_file.read_text().strip()
    secret_file.parent.mkdir(parents=True, exist_ok=True)
    tmp = secret_file.with_name(f"secret_key.{secrets.token_hex(8)}.tmp")
    tmp.write_text(secrets.token_hex(32))
    try:
        # atomic claim: first worker to link wins, others fall back to the file
        os.link(tmp, secret_file)
    except FileExistsError:
        pass
    tmp.unlink(missing_ok=True)
    return secret_file.read_text().strip()


def make_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_secret(), salt="auth-token")


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return f"{salt}${pbkdf2(password, salt)}"


def pbkdf2(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode(), bytes.fromhex(salt), 120_000
    ).hex()


def verify_password(stored: str, password: str) -> bool:
    salt, _, digest = stored.partition("$")
    return hmac.compare_digest(digest, pbkdf2(password, salt))


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    try:
        username = ser.loads(token)
    except BadSignature:
        return None
    if not isinstance(username, str):
        return None
    return username


def require_admin():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    if user != "admin":
        return None, error("Admin privileges required", 403)
    return user, None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not re.fullmatch(r"[A-Za-z0-9_.-]{3,64}", username):
        return error("Username must be 3-64 characters (letters, digits, _ . -)")
    if username.lower() == "admin":
        return error("Username 'admin' is reserved")
    if len(password) < 8:
        return error("Password must be at least 8 characters")
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        )
    except sqlite3.IntegrityError:
        return error("Username already taken", 409)
    db.commit()
    return jsonify({"status": "created", "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not username or not password:
        return error("Username and password are required", 401)
    if username.lower() == "admin":
        apw = admin_password()
        if apw and secrets.compare_digest(password, apw):
            return jsonify({"token": ser.dumps("admin")})
        return error("Invalid username or password", 401)
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is not None and verify_password(row["password_hash"], password):
        return jsonify({"token": ser.dumps(row["username"])})
    return error("Invalid username or password", 401)


# ----------------------------------------------------------------- stores

def store_row(row, distance=None):
    return {
        "id": row["id"],
        "name": row["name"],
        "address": row["address"],
        "phone": row["phone"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "distance_km": distance,
    }


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


@app.get("/api/stores")
def list_stores():
    q = (request.args.get("q") or "").strip().lower()
    lat = parse_float(request.args.get("lat"))
    lng = parse_float(request.args.get("lng"))
    rows = get_db().execute("SELECT * FROM stores").fetchall()
    items = []
    for row in rows:
        if q and q not in row["name"].lower() and q not in row["address"].lower():
            continue
        if lat is not None and lng is not None:
            d = haversine_km(lat, lng, row["latitude"], row["longitude"])
            radius = parse_float(request.args.get("radius"))
            if radius is None:
                radius = 50.0
            if d > radius:
                continue
            items.append(store_row(row, round(d, 2)))
        else:
            items.append(store_row(row))
    if lat is not None and lng is not None:
        items.sort(key=lambda s: s["distance_km"])
    else:
        items.sort(key=lambda s: s["name"].lower())
    return jsonify({"items": items})


@app.get("/api/stores/<int:store_id>")
def get_store(store_id):
    row = get_db().execute(
        "SELECT * FROM stores WHERE id = ?", (store_id,)
    ).fetchone()
    if row is None:
        return error("Store not found", 404)
    return jsonify(store_row(row))


def parse_float(value):
    if value is None or value == "":
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return f


def validate_store(body):
    """Return (fields, error_response). fields None means invalid."""
    errors = []
    fields = {}

    def get(key):
        return body.get(key) if isinstance(body, dict) else None

    name = get("name")
    if name is None:
        errors.append("'name' is required")
    elif not isinstance(name, str) or not name.strip():
        errors.append("'name' must be a non-empty string")
    else:
        fields["name"] = name.strip()

    address = get("address")
    if address is None:
        errors.append("'address' is required")
    elif not isinstance(address, str) or not address.strip():
        errors.append("'address' must be a non-empty string")
    else:
        fields["address"] = address.strip()

    phone = get("phone")
    if phone is None:
        fields["phone"] = None
    elif isinstance(phone, str):
        if len(phone.strip()) > 40:
            errors.append("'phone' must be at most 40 characters")
        else:
            fields["phone"] = phone.strip() or None
    else:
        errors.append("'phone' must be a string")

    lat = parse_float(get("latitude"))
    if get("latitude") is None:
        errors.append("'latitude' is required")
    elif lat is None or not -90 <= lat <= 90:
        errors.append("'latitude' must be a number between -90 and 90")
    else:
        fields["latitude"] = lat

    lng = parse_float(get("longitude"))
    if get("longitude") is None:
        errors.append("'longitude' is required")
    elif lng is None or not -180 <= lng <= 180:
        errors.append("'longitude' must be a number between -180 and 180")
    else:
        fields["longitude"] = lng

    if errors:
        return None, error("; ".join(errors))
    return fields, None


@app.post("/api/admin/stores")
def create_store():
    _, denied = require_admin()
    if denied:
        return denied
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error("Request body must be a JSON object")
    fields, invalid = validate_store(body)
    if invalid:
        return invalid
    db = get_db()
    cur = db.execute(
        "INSERT INTO stores (name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
        (
            fields["name"],
            fields["address"],
            fields["phone"],
            fields["latitude"],
            fields["longitude"],
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(store_row(row)), 201


@app.put("/api/admin/stores/<int:store_id>")
def update_store(store_id):
    _, denied = require_admin()
    if denied:
        return denied
    db = get_db()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    if row is None:
        return error("Store not found", 404)
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error("Request body must be a JSON object")
    fields, invalid = validate_store(body)
    if invalid:
        return invalid
    db.execute(
        "UPDATE stores SET name = ?, address = ?, phone = ?, latitude = ?, longitude = ? WHERE id = ?",
        (
            fields["name"],
            fields["address"],
            fields["phone"],
            fields["latitude"],
            fields["longitude"],
            store_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM stores WHERE id = ?", (store_id,)).fetchone()
    return jsonify(store_row(row))


@app.delete("/api/admin/stores/<int:store_id>")
def delete_store(store_id):
    _, denied = require_admin()
    if denied:
        return denied
    db = get_db()
    cur = db.execute("DELETE FROM stores WHERE id = ?", (store_id,))
    db.commit()
    if cur.rowcount == 0:
        return error("Store not found", 404)
    return "", 204


# ---------------------------------------------------------------- helpers

def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


@app.errorhandler(404)
def not_found(exc):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return serve_frontend("index.html")


@app.errorhandler(405)
def method_not_allowed(exc):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed"}), 405
    return serve_frontend("index.html")


# --------------------------------------------------------------- frontend

def serve_frontend(path: str):
    full = DIST / path
    if full.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
def index():
    return serve_frontend("index.html")


@app.get("/<path:path>")
def frontend(path: str):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return serve_frontend(path)


# ---------------------------------------------------------------- startup

init_db()
ser = make_serializer()
