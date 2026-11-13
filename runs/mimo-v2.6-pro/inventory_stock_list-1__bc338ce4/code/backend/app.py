"""Warehouse inventory: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from itsdangerous import BadSignature
from itsdangerous import URLSafeSerializer
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "inventory.db"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    username TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_item ON movements (item_id);
"""

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- database

def get_db() -> sqlite3.Connection:
    conn = g.get("db")
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return conn


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)


def get_serializer() -> URLSafeSerializer:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = DATA_DIR / "secret_key"
    if key_file.is_file():
        secret = key_file.read_bytes()
    else:
        secret = secrets.token_bytes(32)
        key_file.write_bytes(secret)
    return URLSafeSerializer(secret, salt="inventory-auth")


init_db()
serializer = get_serializer()


# ---------------------------------------------------------------- helpers

def error(message: str, status: int):
    return jsonify({"error": message}), status


def body() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def as_int(value):
    """Return an int or None; accepts integral floats and numeric strings."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        text = value.strip()
        if re.fullmatch(r"-?\d+", text):
            return int(text)
    return None


def text_field(data: dict, field: str, errors: list[str], required: bool = True):
    value = data.get(field)
    if value is None:
        value = ""
    if not isinstance(value, str):
        errors.append(f"{field} must be text")
        return None
    value = value.strip()
    if required and not value:
        errors.append(f"{field} is required")
        return None
    return value


def int_field(data: dict, field: str, errors: list[str], default: int = 0, minimum: int = 0):
    value = data.get(field)
    if value is None or value == "":
        return default
    value = as_int(value)
    if value is None:
        errors.append(f"{field} must be a whole number")
        return None
    if value < minimum:
        errors.append(f"{field} must be at least {minimum}")
        return None
    return value


def item_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def movement_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def find_item(item_id):
    return get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


# ---------------------------------------------------------------- auth

def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    try:
        payload = serializer.loads(token.strip())
    except BadSignature:
        return None
    user_id = payload.get("uid") if isinstance(payload, dict) else None
    if not isinstance(user_id, int):
        return None
    return get_db().execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    data = body()
    errors: list[str] = []
    username = text_field(data, "username", errors)
    password = data.get("password")
    if password is None or password == "":
        errors.append("password is required")
        password = None
    elif not isinstance(password, str):
        errors.append("password must be text")
        password = None
    if errors:
        return error("; ".join(errors), 400)
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error(f"username '{username}' is already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    row = None
    if isinstance(username, str) and isinstance(password, str):
        row = get_db().execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = serializer.dumps({"uid": row["id"]})
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- items

@app.get("/api/items")
def list_items():
    q = request.args.get("q", "").strip()
    location = request.args.get("location", "").strip()
    low_stock = request.args.get("low_stock", "").strip().lower() in {"1", "true", "yes", "on"}

    page = as_int(request.args.get("page")) or 1
    page = max(page, 1)
    page_size = as_int(request.args.get("page_size")) or DEFAULT_PAGE_SIZE
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    clauses = []
    params: list = []
    if q:
        clauses.append("(name LIKE ? COLLATE NOCASE OR sku LIKE ? COLLATE NOCASE)")
        params += [f"%{q}%", f"%{q}%"]
    if location:
        clauses.append("location = ? COLLATE NOCASE")
        params.append(location)
    if low_stock:
        clauses.append("quantity <= reorder_level")
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) FROM items{where}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM items{where} ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [item_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/items")
@login_required
def create_item():
    data = body()
    errors: list[str] = []
    name = text_field(data, "name", errors)
    sku = text_field(data, "sku", errors)
    location = text_field(data, "location", errors, required=False) or ""
    reorder_level = int_field(data, "reorder_level", errors)
    quantity = int_field(data, "quantity", errors)
    if errors:
        return error("; ".join(errors), 400)
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO items (name, sku, location, quantity, reorder_level) VALUES (?, ?, ?, ?, ?)",
            (name, sku, location, quantity, reorder_level),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error(f"duplicate sku '{sku}': an item with this sku already exists", 409)
    return jsonify(item_json(find_item(cur.lastrowid))), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    row = find_item(item_id)
    if row is None:
        return error("item not found", 404)
    return jsonify(item_json(row))


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id: int):
    row = find_item(item_id)
    if row is None:
        return error("item not found", 404)
    data = body()
    errors: list[str] = []
    name = text_field(data, "name", errors)
    sku = text_field(data, "sku", errors)
    location = text_field(data, "location", errors, required=False) or ""
    reorder_level = int_field(data, "reorder_level", errors)
    if errors:
        return error("; ".join(errors), 400)
    conn = get_db()
    try:
        conn.execute(
            "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
            (name, sku, location, reorder_level, item_id),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error(f"duplicate sku '{sku}': an item with this sku already exists", 409)
    return jsonify(item_json(find_item(item_id)))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id: int):
    conn = get_db()
    row = find_item(item_id)
    if row is None:
        return error("item not found", 404)
    with conn:
        conn.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
        conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
    return "", 204


# ---------------------------------------------------------------- movements

@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    if find_item(item_id) is None:
        return error("item not found", 404)
    rows = get_db().execute(
        "SELECT * FROM movements WHERE item_id = ? ORDER BY id DESC", (item_id,)
    ).fetchall()
    return jsonify({"items": [movement_json(row) for row in rows]})


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id: int):
    if find_item(item_id) is None:
        return error("item not found", 404)
    data = body()
    errors: list[str] = []
    if "delta" not in data or data["delta"] is None:
        errors.append("delta is required")
        delta = None
    else:
        delta = as_int(data["delta"])
        if delta is None:
            errors.append("delta must be a whole number")
        elif delta == 0:
            errors.append("delta must not be zero")
    reason = text_field(data, "reason", errors, required=False) or ""
    if errors:
        return error("; ".join(errors), 400)

    conn = get_db()
    with conn:
        cur = conn.execute(
            "UPDATE items SET quantity = quantity + ? WHERE id = ? AND quantity + ? >= 0",
            (delta, item_id, delta),
        )
        if cur.rowcount == 0:
            return error("movement would take stock below zero", 400)
        quantity_after = conn.execute(
            "SELECT quantity FROM items WHERE id = ?", (item_id,)
        ).fetchone()[0]
        cur = conn.execute(
            "INSERT INTO movements (item_id, delta, reason, quantity_after, created_at, username)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                item_id,
                delta,
                reason,
                quantity_after,
                datetime.now(timezone.utc).isoformat(),
                g.user["username"],
            ),
        )
    row = conn.execute("SELECT * FROM movements WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(movement_json(row)), 201


# ---------------------------------------------------------------- frontend

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
