"""Shop backend: JSON API + frontend static serving."""

import os
import re
import sqlite3
import secrets
import hashlib
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "shop.db"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")


# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------

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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    UNIQUE (user_id, product_id)
);
"""

SEED_PRODUCTS = [
    ("Espresso Cup", "A small ceramic cup for espresso.", 12.50, 40),
    ("French Press", "1 litre glass and steel press.", 29.99, 25),
    ("Coffee Grinder", "Burr grinder for consistent grounds.", 74.00, 15),
    ("Moka Pot", "3-cup stovetop espresso maker.", 24.95, 30),
    ("Pour-over Dripper", "Ceramic cone dripper.", 18.00, 20),
    ("Gooseneck Kettle", "Stainless steel pouring kettle.", 55.50, 12),
    ("Beans 250g", "Single-origin medium roast.", 9.90, 100),
    ("Travel Mug", "Insulated 350ml travel mug.", 21.00, 35),
    ("Milk Frother", "Handheld battery frother.", 13.25, 18),
    ("Digital Scale", "Coffee scale with timer.", 39.00, 10),
]


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    count = conn.execute("SELECT COUNT(*) AS c FROM products").fetchone()["c"]
    if count == 0:
        conn.executemany(
            "INSERT INTO products (name, description, price, stock, is_active) "
            "VALUES (?, ?, ?, ?, 1)",
            SEED_PRODUCTS,
        )
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------
# Auth helpers
# --------------------------------------------------------------------------

def _hash_password(password: str) -> str:
    return generate_password_hash(password)


def _verify_password(password: str, stored: str) -> bool:
    return check_password_hash(stored, password)


def _issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user_id))
    db.commit()
    return token


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT u.id, u.username, u.is_admin FROM users u "
        "JOIN tokens t ON t.user_id = u.id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def _require_user():
    user = current_user()
    if user is None:
        return None
    return user


def _require_admin():
    user = current_user()
    if user is None or not user["is_admin"]:
        return None
    return user


# --------------------------------------------------------------------------
# Error helpers
# --------------------------------------------------------------------------

def _error(message: str, status: int):
    return jsonify({"error": message}), status


# --------------------------------------------------------------------------
# Auth routes
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return _error("username is required", 400)
    username = username.strip()
    if not isinstance(password, str) or not password:
        return _error("password is required", 400)
    if not re.match(r"^[A-Za-z0-9_.-]{1,64}$", username):
        return _error("invalid username", 400)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return _error("username already taken", 409)

    cur = db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, _hash_password(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        return _error("username and password are required", 400)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username,),
    ).fetchone()

    if user is None or not _verify_password(password, user["password_hash"]):
        return _error("invalid username or password", 401)

    token = _issue_token(user["id"])
    return jsonify({"token": token})


# --------------------------------------------------------------------------
# Product serialization
# --------------------------------------------------------------------------

def _product_dict(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": row["price"],
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


# --------------------------------------------------------------------------
# Product routes
# --------------------------------------------------------------------------

@app.get("/api/products")
def list_products():
    q = request.args.get("q", "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(100, page_size))

    db = get_db()
    where = "WHERE is_active = 1"
    params = []
    if q:
        where += " AND name LIKE ?"
        params.append(f"%{q}%")

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM products {where}", params
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM products {where} ORDER BY name COLLATE NOCASE, id "
        "LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    return jsonify({
        "items": [_product_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.get("/api/products/<int:product_id>")
def get_product(product_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return _error("product not found", 404)
    return jsonify(_product_dict(row))


# --------------------------------------------------------------------------
# Cart routes
# --------------------------------------------------------------------------

def _cart_item_dict(row) -> dict:
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": row["quantity"],
        "name": row["name"],
        "unit_price": row["price"],
        "line_total": round(row["price"] * row["quantity"], 2),
    }


@app.get("/api/cart")
def get_cart():
    user = _require_user()
    if user is None:
        return _error("authentication required", 401)

    db = get_db()
    rows = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price "
        "FROM cart_items ci "
        "JOIN products p ON p.id = ci.product_id "
        "WHERE ci.user_id = ? AND p.is_active = 1 "
        "ORDER BY ci.id",
        (user["id"],),
    ).fetchall()

    items = [_cart_item_dict(r) for r in rows]
    subtotal = round(sum(i["line_total"] for i in items), 2)
    return jsonify({"items": items, "subtotal": subtotal})


@app.post("/api/cart")
def add_to_cart():
    user = _require_user()
    if user is None:
        return _error("authentication required", 401)

    data = request.get_json(silent=True) or {}
    product_id = data.get("product_id")
    quantity = data.get("quantity", 1)

    if not isinstance(product_id, int):
        return _error("product_id is required", 400)
    if not isinstance(quantity, int) or quantity <= 0:
        return _error("quantity must be a positive integer", 400)

    db = get_db()
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if product is None:
        return _error("product not found", 404)

    existing = db.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
        (user["id"], product_id),
    ).fetchone()

    if existing:
        new_qty = existing["quantity"] + quantity
        db.execute(
            "UPDATE cart_items SET quantity = ? WHERE id = ?",
            (new_qty, existing["id"]),
        )
        item_id = existing["id"]
    else:
        cur = db.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
            (user["id"], product_id, quantity),
        )
        item_id = cur.lastrowid
    db.commit()

    row = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price "
        "FROM cart_items ci JOIN products p ON p.id = ci.product_id "
        "WHERE ci.id = ?",
        (item_id,),
    ).fetchone()
    return jsonify(_cart_item_dict(row)), 200


@app.patch("/api/cart/<int:item_id>")
def update_cart_item(item_id):
    user = _require_user()
    if user is None:
        return _error("authentication required", 401)

    data = request.get_json(silent=True) or {}
    quantity = data.get("quantity")
    if not isinstance(quantity, int) or quantity <= 0:
        return _error("quantity must be a positive integer", 400)

    db = get_db()
    row = db.execute(
        "SELECT ci.id, ci.quantity FROM cart_items ci "
        "JOIN products p ON p.id = ci.product_id "
        "WHERE ci.id = ? AND ci.user_id = ? AND p.is_active = 1",
        (item_id, user["id"]),
    ).fetchone()
    if row is None:
        return _error("cart item not found", 404)

    db.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
    db.commit()

    updated = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price "
        "FROM cart_items ci JOIN products p ON p.id = ci.product_id "
        "WHERE ci.id = ?",
        (item_id,),
    ).fetchone()
    return jsonify(_cart_item_dict(updated))


@app.delete("/api/cart/<int:item_id>")
def remove_cart_item(item_id):
    user = _require_user()
    if user is None:
        return _error("authentication required", 401)

    db = get_db()
    cur = db.execute(
        "DELETE FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return _error("cart item not found", 404)
    return jsonify({"ok": True})


# --------------------------------------------------------------------------
# Admin routes
# --------------------------------------------------------------------------

def _normalize_product_fields(data, existing=None):
    fields = {}
    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            raise ValueError("name is required")
        fields["name"] = name.strip()
    if "description" in data:
        desc = data["description"]
        if not isinstance(desc, str):
            raise ValueError("description must be a string")
        fields["description"] = desc
    if "price" in data:
        price = data["price"]
        if not isinstance(price, (int, float)) or isinstance(price, bool) or price < 0:
            raise ValueError("price must be a non-negative number")
        fields["price"] = round(float(price), 2)
    if "stock" in data:
        stock = data["stock"]
        if not isinstance(stock, int) or isinstance(stock, bool) or stock < 0:
            raise ValueError("stock must be a non-negative integer")
        fields["stock"] = stock
    if "is_active" in data:
        act = data["is_active"]
        if not isinstance(act, bool):
            raise ValueError("is_active must be a boolean")
        fields["is_active"] = 1 if act else 0
    return fields


@app.post("/api/admin/products")
def admin_create_product():
    admin = _require_admin()
    if admin is None:
        return _error("admin authentication required", 401)

    data = request.get_json(silent=True) or {}
    if "name" not in data or "price" not in data:
        return _error("name and price are required", 400)

    try:
        fields = _normalize_product_fields(data)
    except ValueError as e:
        return _error(str(e), 400)

    if "name" not in fields or "price" not in fields:
        return _error("name and price are required", 400)

    fields.setdefault("description", "")
    fields.setdefault("stock", 0)
    fields.setdefault("is_active", 1)

    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, description, price, stock, is_active) "
        "VALUES (:name, :description, :price, :stock, :is_active)",
        fields,
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(_product_dict(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
def admin_update_product(product_id):
    admin = _require_admin()
    if admin is None:
        return _error("admin authentication required", 401)

    db = get_db()
    existing = db.execute(
        "SELECT * FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if existing is None:
        return _error("product not found", 404)

    data = request.get_json(silent=True) or {}
    try:
        fields = _normalize_product_fields(data)
    except ValueError as e:
        return _error(str(e), 400)

    if not fields:
        return _error("no valid fields to update", 400)

    assignments = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = product_id
    db.execute(
        f"UPDATE products SET {assignments} WHERE id = :id", fields
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(_product_dict(row))


# --------------------------------------------------------------------------
# Admin login bootstrap
# --------------------------------------------------------------------------

def ensure_admin():
    """Create the admin account if it does not exist and ADMIN_PASSWORD is set."""
    if not ADMIN_PASSWORD:
        return
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    admin = conn.execute(
        "SELECT id FROM users WHERE username = 'admin'"
    ).fetchone()
    if admin is None:
        conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
            ("admin", _hash_password(ADMIN_PASSWORD)),
        )
        conn.commit()
    else:
        conn.execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = 'admin'",
            (_hash_password(ADMIN_PASSWORD),),
        )
        conn.commit()
    conn.close()


# --------------------------------------------------------------------------
# Health + frontend
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return _error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
ensure_admin()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
