"""Warehouse inventory API and frontend host."""

import os
import secrets
import sqlite3
from datetime import datetime
from datetime import timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "inventory.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
"""


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(SCHEMA)
    db.commit()
    db.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def auth_error(message="Authentication required", status=401):
    return jsonify({"error": message}), status


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return auth_error()
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def item_to_dict(row):
    quantity = row["quantity"]
    reorder = row["reorder_level"]
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": quantity,
        "reorder_level": reorder,
        "low_stock": quantity <= reorder,
    }


def movement_to_dict(row):
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username:
        return jsonify({"error": "Username is required"}), 400
    if not password:
        return jsonify({"error": "Password is required"}), 400
    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return jsonify({"error": "Username already taken"}), 409
    db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/items")
def list_items():
    db = get_db()
    conditions = []
    params = []

    q = (request.args.get("q") or "").strip()
    if q:
        conditions.append("(name LIKE ? OR sku LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]

    location = (request.args.get("location") or "").strip()
    if location:
        conditions.append("location = ?")
        params.append(location)

    low_stock = request.args.get("low_stock")
    if low_stock in ("true", "1", "yes"):
        conditions.append("quantity <= reorder_level")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    total = db.execute(f"SELECT COUNT(*) AS c FROM items {where}", params).fetchone()["c"]

    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(page_size, 100))

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM items {where} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    return jsonify(
        {
            "items": [item_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_item(data, db, item_id=None):
    errors = []
    name = (data.get("name") or "").strip()
    sku = (data.get("sku") or "").strip()
    if not name:
        errors.append("Name is required")
    if not sku:
        errors.append("SKU is required")
    if sku:
        row = db.execute(
            "SELECT id FROM items WHERE sku = ? AND id != ?",
            (sku, item_id or -1),
        ).fetchone()
        if row:
            errors.append("SKU already exists")

    location = (data.get("location") or "").strip()
    return name, sku, location, errors


@app.post("/api/items")
@login_required
def create_item():
    data = body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    db = get_db()
    name, sku, location, errors = validate_item(data, db)
    quantity = data.get("quantity", 0)
    reorder_level = data.get("reorder_level", 0)

    try:
        quantity = int(quantity)
    except (TypeError, ValueError):
        errors.append("Quantity must be an integer")
    try:
        reorder_level = int(reorder_level)
    except (TypeError, ValueError):
        errors.append("Reorder level must be an integer")

    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    if quantity < 0:
        return jsonify({"error": "Quantity cannot be negative"}), 400
    if reorder_level < 0:
        return jsonify({"error": "Reorder level cannot be negative"}), 400

    cur = db.execute(
        "INSERT INTO items (name, sku, location, quantity, reorder_level) VALUES (?, ?, ?, ?, ?)",
        (name, sku, location, quantity, reorder_level),
    )
    db.commit()
    row = db.execute("SELECT * FROM items WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(item_to_dict(row)), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id):
    row = get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Item not found"}), 404
    return jsonify(item_to_dict(row))


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id):
    data = body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    db = get_db()
    existing = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Item not found"}), 404

    name, sku, location, errors = validate_item(data, db, item_id=item_id)
    try:
        reorder_level = int(data.get("reorder_level", 0))
    except (TypeError, ValueError):
        errors.append("Reorder level must be an integer")

    if errors:
        return jsonify({"error": "; ".join(errors)}), 400
    if reorder_level < 0:
        return jsonify({"error": "Reorder level cannot be negative"}), 400

    db.execute(
        "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
        (name, sku, location, reorder_level, item_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    return jsonify(item_to_dict(row))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id):
    db = get_db()
    existing = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Item not found"}), 404
    db.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
    db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    return "", 204


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id):
    db = get_db()
    existing = db.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Item not found"}), 404
    rows = db.execute(
        "SELECT m.*, u.username FROM movements m JOIN users u ON u.id = m.user_id "
        "WHERE m.item_id = ? ORDER BY m.id DESC",
        (item_id,),
    ).fetchall()
    return jsonify({"items": [movement_to_dict(r) for r in rows]})


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id):
    data = body()
    if data is None:
        return jsonify({"error": "Invalid JSON body"}), 400
    db = get_db()
    existing = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Item not found"}), 404

    try:
        delta = int(data.get("delta"))
    except (TypeError, ValueError):
        return jsonify({"error": "Delta must be an integer"}), 400
    if delta == 0:
        return jsonify({"error": "Delta cannot be zero"}), 400

    reason = (data.get("reason") or "").strip()
    quantity_after = existing["quantity"] + delta
    if quantity_after < 0:
        return jsonify({"error": "Not enough stock"}), 400

    cur = db.execute(
        "INSERT INTO movements (item_id, user_id, delta, reason, quantity_after, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (item_id, g.user["id"], delta, reason, quantity_after, now_iso()),
    )
    db.execute("UPDATE items SET quantity = ? WHERE id = ?", (quantity_after, item_id))
    db.commit()

    row = db.execute(
        "SELECT m.*, u.username FROM movements m JOIN users u ON u.id = m.user_id "
        "WHERE m.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(movement_to_dict(row)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
