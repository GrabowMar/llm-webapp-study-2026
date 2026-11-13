"""Warehouse inventory API and static host for the built React frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("INVENTORY_DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "inventory.db"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 1000

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, errors: dict | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.errors = errors or {}


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER,
    username TEXT NOT NULL DEFAULT '',
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        connection.execute("PRAGMA busy_timeout = 5000")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    payload: dict = {"error": error.message, "message": error.message}
    if error.errors:
        payload["errors"] = error.errors
    return jsonify(payload), error.status


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api"):
        return jsonify({"error": "Not found", "message": "Not found"}), 404
    return frontend("index.html")


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api"):
        return jsonify({"error": "Method not allowed", "message": "Method not allowed"}), 405
    return jsonify({"error": "Method not allowed", "message": "Method not allowed"}), 405


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    app.logger.exception("Unhandled error: %s", error)
    return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500


def parse_int(value, default=None):
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else default
    if isinstance(value, str):
        text = value.strip()
        try:
            return int(text)
        except ValueError:
            pass
        try:
            number = float(text)
        except ValueError:
            return default
        return int(number) if number.is_integer() else default
    return default


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def body_payload() -> dict:
    payload = request.get_json(silent=True)
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise ApiError("Request body must be a JSON object.", 400)
    return payload


def field_error(field: str, message: str) -> ApiError:
    return ApiError(message, 400, {field: message})


def require_text(data: dict, field: str, label: str, max_length: int = 200) -> str:
    raw = data.get(field)
    if raw is None:
        raise field_error(field, f"{label} is required.")
    if not isinstance(raw, str):
        raw = str(raw)
    value = raw.strip()
    if not value:
        raise field_error(field, f"{label} is required.")
    if len(value) > max_length:
        raise field_error(field, f"{label} must be at most {max_length} characters.")
    return value


def optional_text(data: dict, field: str, label: str, max_length: int = 200) -> str:
    raw = data.get(field)
    if raw is None:
        return ""
    if not isinstance(raw, str):
        raw = str(raw)
    value = raw.strip()
    if len(value) > max_length:
        raise field_error(field, f"{label} must be at most {max_length} characters.")
    return value


def integer_field(data: dict, field: str, label: str, default: int) -> int:
    if field not in data or data.get(field) is None:
        return default
    value = parse_int(data.get(field), None)
    if value is None:
        raise field_error(field, f"{label} must be a whole number.")
    return value


def serialize_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def serialize_movement(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def fetch_item(item_id: int) -> sqlite3.Row:
    row = get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise ApiError("Item not found.", 404)
    return row


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
        (token,),
    ).fetchone()


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError("Authentication required.", 401)
    return user


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_payload()
    username = require_text(data, "username", "Username", 100)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        raise field_error("password", "Password is required.")
    if len(password) > 500:
        raise field_error("password", "Password must be at most 500 characters.")

    database = get_db()
    existing = database.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError(
            f"Username '{username}' is already taken.",
            409,
            {"username": f"Username '{username}' is already taken."},
        )

    cursor = database.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password, method="pbkdf2:sha256:100000"), now_iso()),
    )
    user_id = cursor.lastrowid
    token = secrets.token_urlsafe(32)
    database.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    database.commit()
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = body_payload()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise field_error("username", "Username is required.")
    if not isinstance(password, str) or not password:
        raise field_error("password", "Password is required.")

    database = get_db()
    user = database.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    database.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    database.commit()
    return jsonify({"token": token, "username": user["username"]})


@app.get("/api/me")
def me():
    user = require_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/auth/logout")
def logout():
    user = current_user()
    if user is None:
        raise ApiError("Authentication required.", 401)
    header = request.headers.get("Authorization", "")
    token = header.split(None, 1)[1].strip() if len(header.split(None, 1)) == 2 else ""
    database = get_db()
    database.execute("DELETE FROM tokens WHERE token = ?", (token,))
    database.commit()
    return jsonify({"ok": True})


@app.get("/api/items")
def list_items():
    database = get_db()
    query = request.args.get("q", "").strip()
    location = request.args.get("location", "").strip()
    low_stock = request.args.get("low_stock")
    page = parse_int(request.args.get("page"), 1)
    page_size = parse_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE)
    if page is None or page < 1:
        page = 1
    if page_size is None or page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    page_size = min(page_size, MAX_PAGE_SIZE)

    conditions: list[str] = []
    params: list = []
    if query:
        conditions.append("(LOWER(name) LIKE ? OR LOWER(sku) LIKE ?)")
        pattern = f"%{query.lower()}%"
        params.extend([pattern, pattern])
    if location:
        conditions.append("LOWER(location) = ?")
        params.append(location.lower())
    if low_stock is not None and parse_bool(low_stock):
        conditions.append("quantity <= reorder_level")
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""

    total = database.execute(f"SELECT COUNT(*) AS count FROM items{where}", params).fetchone()["count"]
    rows = database.execute(
        f"SELECT * FROM items{where} ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_item(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/items")
def create_item():
    user = require_user()
    data = body_payload()

    name = require_text(data, "name", "Name")
    sku = require_text(data, "sku", "SKU", 100)
    location = optional_text(data, "location", "Location")
    quantity = integer_field(data, "quantity", "Quantity", 0)
    reorder_level = integer_field(data, "reorder_level", "Reorder level", 0)
    if quantity < 0:
        raise field_error("quantity", "Quantity cannot be negative.")
    if reorder_level < 0:
        raise field_error("reorder_level", "Reorder level cannot be negative.")

    database = get_db()
    existing = database.execute("SELECT id FROM items WHERE sku = ?", (sku,)).fetchone()
    if existing is not None:
        raise ApiError(
            f"SKU '{sku}' already exists.",
            409,
            {"sku": f"SKU '{sku}' already exists."},
        )

    cursor = database.execute(
        "INSERT INTO items (name, sku, location, quantity, reorder_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (name, sku, location, quantity, reorder_level, now_iso()),
    )
    database.commit()
    row = fetch_item(cursor.lastrowid)
    return jsonify(serialize_item(row)), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    return jsonify(serialize_item(fetch_item(item_id)))


@app.put("/api/items/<int:item_id>")
def update_item(item_id: int):
    require_user()
    data = body_payload()
    row = fetch_item(item_id)

    name = row["name"]
    if "name" in data:
        name = require_text(data, "name", "Name")
    sku = row["sku"]
    if "sku" in data:
        sku = require_text(data, "sku", "SKU", 100)
    location = row["location"]
    if "location" in data:
        location = optional_text(data, "location", "Location")
    reorder_level = row["reorder_level"]
    if "reorder_level" in data:
        reorder_level = integer_field(data, "reorder_level", "Reorder level", reorder_level)
        if reorder_level < 0:
            raise field_error("reorder_level", "Reorder level cannot be negative.")

    database = get_db()
    if sku.lower() != row["sku"].lower():
        existing = database.execute(
            "SELECT id FROM items WHERE sku = ? AND id != ?", (sku, item_id)
        ).fetchone()
        if existing is not None:
            raise ApiError(
                f"SKU '{sku}' already exists.",
                409,
                {"sku": f"SKU '{sku}' already exists."},
            )

    database.execute(
        "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
        (name, sku, location, reorder_level, item_id),
    )
    database.commit()
    return jsonify(serialize_item(fetch_item(item_id)))


@app.delete("/api/items/<int:item_id>")
def delete_item(item_id: int):
    require_user()
    fetch_item(item_id)
    database = get_db()
    database.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
    database.execute("DELETE FROM items WHERE id = ?", (item_id,))
    database.commit()
    return jsonify({"deleted": True, "id": item_id})


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    fetch_item(item_id)
    rows = get_db().execute(
        "SELECT * FROM movements WHERE item_id = ? ORDER BY created_at DESC, id DESC",
        (item_id,),
    ).fetchall()
    return jsonify({"items": [serialize_movement(row) for row in rows]})


@app.post("/api/items/<int:item_id>/movements")
def create_movement(item_id: int):
    user = require_user()
    data = body_payload()
    row = fetch_item(item_id)

    if "delta" not in data or data.get("delta") is None:
        raise field_error("delta", "Delta is required.")
    delta = parse_int(data.get("delta"), None)
    if delta is None:
        raise field_error("delta", "Delta must be a whole number.")
    reason = optional_text(data, "reason", "Reason", 500)

    quantity_after = row["quantity"] + delta
    if quantity_after < 0:
        raise ApiError(
            f"Cannot take {abs(delta)} units out: only {row['quantity']} in stock.",
            400,
            {"delta": f"Only {row['quantity']} units are in stock."},
        )

    database = get_db()
    timestamp = now_iso()
    cursor = database.execute(
        "INSERT INTO movements (item_id, user_id, username, delta, reason, quantity_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (item_id, user["id"], user["username"], delta, reason, quantity_after, timestamp),
    )
    database.execute("UPDATE items SET quantity = ? WHERE id = ?", (quantity_after, item_id))
    database.commit()

    movement = database.execute(
        "SELECT * FROM movements WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_movement(movement)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return jsonify({"error": "Not found", "message": "Not found"}), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Frontend build missing", "message": "Frontend build missing"}), 500


init_db()
