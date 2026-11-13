"""Flask entry point: shop JSON API plus frontend hosting."""

from __future__ import annotations

import json
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
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "shop.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

SEED_PRODUCTS = [
    ("Aurora Desk Lamp", "LED desk lamp with a dimmable, adjustable arm.", 34.99, 25),
    ("Bamboo Cutting Board", "Large end-grain bamboo board with juice groove.", 24.50, 40),
    ("Ceramic Pour-Over Set", "Hand-glazed dripper, carafe and two cups.", 48.00, 15),
    ("Cotton Throw Blanket", "Soft woven throw, machine washable, 130x170 cm.", 39.99, 30),
    ("Espresso Hand Grinder", "Conical burr grinder with 30 click settings.", 79.00, 12),
    ("Linen Apron", "Stonewashed linen apron with cross-back straps.", 28.75, 22),
    ("Maple Serving Bowl", "Turned maple bowl, finished with food-safe oil.", 44.00, 18),
    ("Stoneware Mug", "Stackable 350 ml stoneware mug, dishwasher safe.", 16.99, 50),
    ("Walnut Picture Frame", "Solid walnut frame for 13x18 cm photos.", 22.00, 35),
    ("Wool Felt Coasters", "Set of six merino felt coasters in mixed colours.", 12.99, 10),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    quantity INTEGER NOT NULL,
    UNIQUE (user_id, product_id)
);
"""

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) AS n FROM products").fetchone()["n"] == 0:
            conn.executemany(
                "INSERT INTO products (name, description, price, stock, is_active)"
                " VALUES (?, ?, ?, ?, 1)",
                SEED_PRODUCTS,
            )
        if ADMIN_PASSWORD:
            pw_hash = generate_password_hash(ADMIN_PASSWORD)
            row = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (pw_hash, row["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (ADMIN_USERNAME, pw_hash),
                )
        else:
            conn.execute(
                "UPDATE users SET password_hash = '' WHERE username = ?",
                (ADMIN_USERNAME,),
            )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Serialisation
# --------------------------------------------------------------------------

def product_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": float(row["price"]),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def cart_item_dict(row: sqlite3.Row) -> dict:
    unit_price = float(row["price"])
    quantity = row["quantity"]
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": quantity,
        "name": row["name"],
        "unit_price": unit_price,
        "line_total": unit_price * quantity,
    }


def error(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


# --------------------------------------------------------------------------
# Request parsing
# --------------------------------------------------------------------------

def json_body():
    body = request.get_json(silent=True)
    if body is not None:
        return body
    raw = request.get_data(cache=False, as_text=True)
    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


def as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def as_int(value):
    number = as_number(value)
    if number is None:
        return None
    if isinstance(number, float) and not number.is_integer():
        return None
    return int(number)


def as_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return None


def as_price(value):
    number = as_number(value)
    if number is None or number < 0:
        return None
    return float(number)


def as_stock(value):
    number = as_int(value)
    if number is None or number < 0:
        return None
    return number


# --------------------------------------------------------------------------
# Authentication
# --------------------------------------------------------------------------

def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id"
            " WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        if user["username"] != ADMIN_USERNAME:
            return error("admin access required", 403)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


# --------------------------------------------------------------------------
# Auth routes
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        return error("username is reserved", 400)
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    user_id = cur.lastrowid
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user_id))
    db.commit()
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    user = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not user["password_hash"]:
        return error("invalid credentials", 401)
    if not check_password_hash(user["password_hash"], password):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    db.commit()
    return jsonify({"token": token}), 200


# --------------------------------------------------------------------------
# Catalogue routes
# --------------------------------------------------------------------------

def list_products(include_inactive: bool):
    db = get_db()
    where = []
    params = []
    if not include_inactive:
        where.append("is_active = 1")
    q = request.args.get("q")
    if q:
        pattern = (
            "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        )
        where.append("LOWER(name) LIKE ? ESCAPE '\\'")
        params.append(pattern)
    where_sql = (" WHERE " + " AND ".join(where)) if where else ""

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        return None, error("page and page_size must be integers", 400)
    if page < 1:
        return None, error("page must be at least 1", 400)
    if page_size < 1:
        return None, error("page_size must be at least 1", 400)

    total = db.execute(
        "SELECT COUNT(*) AS n FROM products" + where_sql, params
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM products"
        + where_sql
        + " ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    payload = {
        "items": [product_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
    return payload, None


@app.get("/api/products")
def products_index():
    payload, err = list_products(include_inactive=False)
    return err if err else jsonify(payload)


@app.get("/api/products/<int:product_id>")
def products_show(product_id: int):
    row = get_db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return error("product not found", 404)
    return jsonify(product_dict(row))


# --------------------------------------------------------------------------
# Cart routes
# --------------------------------------------------------------------------

@app.get("/api/cart")
@login_required
def cart_index():
    rows = get_db().execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price"
        " FROM cart_items ci JOIN products p ON p.id = ci.product_id"
        " WHERE ci.user_id = ? AND p.is_active = 1 ORDER BY ci.id",
        (g.user["id"],),
    ).fetchall()
    items = [cart_item_dict(row) for row in rows]
    subtotal = sum(item["line_total"] for item in items)
    return jsonify({"items": items, "subtotal": subtotal})


@app.post("/api/cart")
@login_required
def cart_add():
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    raw_id = body.get("product_id", body.get("id"))
    product_id = as_int(raw_id)
    if product_id is None:
        return error("product_id is required", 400)
    if "quantity" in body:
        quantity = as_int(body.get("quantity"))
        if quantity is None or quantity < 1:
            return error("quantity must be a positive integer", 400)
    else:
        quantity = 1
    db = get_db()
    product = db.execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if product is None:
        return error("product not found", 404)
    existing = db.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
        (g.user["id"], product_id),
    ).fetchone()
    if existing:
        new_quantity = existing["quantity"] + quantity
        db.execute(
            "UPDATE cart_items SET quantity = ? WHERE id = ?",
            (new_quantity, existing["id"]),
        )
        item_id = existing["id"]
    else:
        cur = db.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
            (g.user["id"], product_id, quantity),
        )
        item_id = cur.lastrowid
    db.commit()
    row = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price"
        " FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ?",
        (item_id,),
    ).fetchone()
    return jsonify(cart_item_dict(row)), 201


@app.patch("/api/cart/<int:item_id>")
@login_required
def cart_update(item_id: int):
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    quantity = as_int(body.get("quantity"))
    if quantity is None or quantity < 1:
        return error("quantity must be a positive integer", 400)
    db = get_db()
    row = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price"
        " FROM cart_items ci JOIN products p ON p.id = ci.product_id"
        " WHERE ci.id = ? AND ci.user_id = ?",
        (item_id, g.user["id"]),
    ).fetchone()
    if row is None:
        return error("cart item not found", 404)
    db.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
    db.commit()
    row = db.execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price"
        " FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ?",
        (item_id,),
    ).fetchone()
    return jsonify(cart_item_dict(row))


@app.delete("/api/cart/<int:item_id>")
@login_required
def cart_delete(item_id: int):
    db = get_db()
    row = db.execute(
        "SELECT id FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, g.user["id"]),
    ).fetchone()
    if row is None:
        return error("cart item not found", 404)
    db.execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    db.commit()
    return "", 204


# --------------------------------------------------------------------------
# Admin routes
# --------------------------------------------------------------------------

def validate_product_fields(body: dict, partial: bool):
    fields = {}
    if "name" in body:
        name = body.get("name")
        if not isinstance(name, str) or not name.strip():
            return None, "name must be a non-empty string"
        fields["name"] = name.strip()
    if "description" in body:
        description = body.get("description")
        if not isinstance(description, str):
            return None, "description must be a string"
        fields["description"] = description
    if "price" in body:
        price = as_price(body.get("price"))
        if price is None:
            return None, "price must be a non-negative number"
        fields["price"] = price
    if "stock" in body:
        stock = as_stock(body.get("stock"))
        if stock is None:
            return None, "stock must be a non-negative integer"
        fields["stock"] = stock
    if "is_active" in body:
        is_active = as_bool(body.get("is_active"))
        if is_active is None:
            return None, "is_active must be a boolean"
        fields["is_active"] = is_active
    if not partial:
        if "name" not in fields:
            return None, "name is required"
        if "price" not in fields:
            return None, "price is required"
        fields.setdefault("description", "")
        fields.setdefault("stock", 0)
        fields.setdefault("is_active", True)
    return fields, None


@app.get("/api/admin/products")
@admin_required
def admin_products_index():
    payload, err = list_products(include_inactive=True)
    return err if err else jsonify(payload)


@app.post("/api/admin/products")
@admin_required
def admin_products_create():
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    fields, err = validate_product_fields(body, partial=False)
    if err:
        return error(err, 400)
    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, description, price, stock, is_active)"
        " VALUES (:name, :description, :price, :stock, :is_active)",
        fields,
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM products WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(product_dict(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
@admin_required
def admin_products_update(product_id: int):
    body = json_body()
    if not isinstance(body, dict):
        return error("a JSON body is required", 400)
    fields, err = validate_product_fields(body, partial=True)
    if err:
        return error(err, 400)
    if not fields:
        return error("no valid fields to update", 400)
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return error("product not found", 404)
    assignments = ", ".join(f"{key} = :{key}" for key in fields)
    db.execute(
        f"UPDATE products SET {assignments} WHERE id = :id",
        {**fields, "id": product_id},
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_dict(row))


# --------------------------------------------------------------------------
# Errors and frontend
# --------------------------------------------------------------------------

@app.errorhandler(404)
def handle_not_found(exc):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return frontend()


@app.errorhandler(405)
def handle_method_not_allowed(exc):
    return error("method not allowed", 405)


@app.errorhandler(500)
def handle_internal_error(exc):
    return error("internal server error", 500)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
