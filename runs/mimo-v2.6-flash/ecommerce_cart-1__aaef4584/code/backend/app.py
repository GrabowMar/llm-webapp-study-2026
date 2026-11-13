"""Shop backend: JSON API under /api plus the built-in frontend."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "shop.db"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 1000

SEED_PRODUCTS = [
    ("Aurora Desk Lamp", "Warm LED desk lamp with a touch dimmer and a brushed metal arm.", 3499, 25),
    ("Bamboo Monitor Riser", "Elevates your screen to eye level with a built-in drawer.", 2750, 18),
    ("Ceramic Pour-Over Set", "Hand-glazed dripper and carafe for a clean, slow brew.", 4200, 12),
    ("Drift Bluetooth Speaker", "Portable speaker with 12-hour battery and deep bass.", 5999, 30),
    ("Ember Ceramic Mug", "Double-walled mug that keeps coffee hot for hours.", 1425, 40),
    ("Frost Insulated Bottle", "Cold drinks stay cold for 24 hours, hot for 12.", 2175, 22),
    ("Grove Notebook A5", "Dot-grid pages with a lay-flat binding and pen loop.", 950, 50),
    ("Harbor Canvas Tote", "Heavyweight canvas tote with reinforced straps.", 1800, 15),
    ("Ivory Mechanical Keyboard", "Compact hot-swappable keyboard with tactile switches.", 8900, 11),
]

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return f"pbkdf2:{salt}:{digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split(":", 2)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return secrets.compare_digest(candidate.hex(), digest)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    NOT NULL UNIQUE,
                password_hash TEXT    NOT NULL,
                is_admin      INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token     TEXT PRIMARY KEY,
                user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE TABLE IF NOT EXISTS products (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                description TEXT    NOT NULL DEFAULT '',
                price_cents INTEGER NOT NULL,
                stock       INTEGER NOT NULL DEFAULT 0,
                is_active   INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS cart_items (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity   INTEGER NOT NULL,
                created_at TEXT    NOT NULL DEFAULT (datetime('now')),
                UNIQUE (user_id, product_id)
            );
            """
        )
        seed_products(conn)
        init_admin(conn)
        conn.commit()
    finally:
        conn.close()


def seed_products(conn: sqlite3.Connection) -> None:
    count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    if count:
        return
    conn.executemany(
        "INSERT INTO products (name, description, price_cents, stock, is_active) VALUES (?, ?, ?, ?, 1)",
        SEED_PRODUCTS,
    )


def init_admin(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if ADMIN_ENABLED:
        password_hash = hash_password(ADMIN_PASSWORD)
        if row is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                (password_hash,),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (password_hash, row["id"]),
            )
            conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
    elif row is not None:
        # Admin sign-in is disabled: neutralise the stored password and sessions.
        conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", ("pbkdf2::disabled", row["id"]))
        conn.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))


init_db()


# --------------------------------------------------------------------------
# Serialisation helpers
# --------------------------------------------------------------------------


def product_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": row["price_cents"] / 100,
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def cart_item_dict(row: sqlite3.Row) -> dict:
    line_cents = row["price_cents"] * row["quantity"]
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": row["quantity"],
        "name": row["name"],
        "unit_price": row["price_cents"] / 100,
        "line_total": line_cents / 100,
    }


def cart_payload(db: sqlite3.Connection, user_id: int) -> dict:
    rows = db.execute(
        """
        SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price_cents
        FROM cart_items ci
        JOIN products p ON p.id = ci.product_id
        WHERE ci.user_id = ? AND p.is_active = 1
        ORDER BY ci.id ASC
        """,
        (user_id,),
    ).fetchall()
    items = [cart_item_dict(r) for r in rows]
    subtotal_cents = sum(r["price_cents"] * r["quantity"] for r in rows)
    return {"items": items, "subtotal": subtotal_cents / 100}


def error(message: str, status: int):
    return jsonify({"message": message}), status


def payload() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username, u.is_admin
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def admin_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        if not user["is_admin"]:
            return error("Admin access required", 403)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def issue_token(db: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user_id))
    db.commit()
    return token


@app.post("/api/auth/register")
def register():
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if len(username) > 64:
        return error("username must be at most 64 characters", 400)
    if username.lower() == "admin":
        return error("That username is reserved", 400)

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error("Username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, hash_password(password)),
    )
    db.commit()
    return jsonify({"message": "Account created", "id": cur.lastrowid}), 201


@app.post("/api/auth/login")
def login():
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None:
        return error("Invalid username or password", 401)
    if user["is_admin"] and not ADMIN_ENABLED:
        return error("Admin sign-in is disabled", 401)
    if not verify_password(password, user["password_hash"]):
        return error("Invalid username or password", 401)
    token = issue_token(db, user["id"])
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@login_required
def me():
    user = g.user
    return jsonify({"username": user["username"], "is_admin": bool(user["is_admin"])}), 200


# --------------------------------------------------------------------------
# Products
# --------------------------------------------------------------------------


def parse_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@app.get("/api/products")
def list_products():
    q = (request.args.get("q") or "").strip()
    page = parse_int(request.args.get("page"), 1)
    page_size = parse_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE)
    if page < 1:
        page = 1
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        page_size = DEFAULT_PAGE_SIZE

    clauses = ["is_active = 1"]
    params: list = []
    if q:
        escaped = (
            q.lower()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        clauses.append("(LOWER(name) LIKE ? ESCAPE '\\' OR LOWER(description) LIKE ? ESCAPE '\\')")
        pattern = f"%{escaped}%"
        params.extend([pattern, pattern])

    where = " AND ".join(clauses)
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM products WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"""
        SELECT * FROM products
        WHERE {where}
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [product_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.get("/api/products/<int:product_id>")
def get_product(product_id: int):
    row = get_db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return error("Product not found", 404)
    return jsonify(product_dict(row)), 200


# --------------------------------------------------------------------------
# Cart
# --------------------------------------------------------------------------


@app.get("/api/cart")
@login_required
def get_cart():
    return jsonify(cart_payload(get_db(), g.user["id"])), 200


@app.post("/api/cart")
@login_required
def add_to_cart():
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)
    product_id = data.get("product_id")
    quantity = data.get("quantity")
    if not isinstance(product_id, int) or isinstance(product_id, bool):
        return error("product_id is required", 400)
    if not isinstance(quantity, int) or isinstance(quantity, bool):
        return error("quantity is required", 400)
    if quantity < 1:
        return error("quantity must be at least 1", 400)

    db = get_db()
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if product is None:
        return error("Product not found", 404)

    existing = db.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
        (g.user["id"], product_id),
    ).fetchone()
    if existing is not None:
        db.execute(
            "UPDATE cart_items SET quantity = ? WHERE id = ?",
            (existing["quantity"] + quantity, existing["id"]),
        )
    else:
        db.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
            (g.user["id"], product_id, quantity),
        )
    db.commit()
    return jsonify(cart_payload(db, g.user["id"])), 200


def own_cart_item(db: sqlite3.Connection, item_id: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, g.user["id"]),
    ).fetchone()


@app.patch("/api/cart/<int:item_id>")
@login_required
def update_cart_item(item_id: int):
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)
    quantity = data.get("quantity")
    if not isinstance(quantity, int) or isinstance(quantity, bool):
        return error("quantity is required", 400)
    if quantity < 1:
        return error("quantity must be at least 1", 400)

    db = get_db()
    item = own_cart_item(db, item_id)
    if item is None:
        return error("Cart item not found", 404)
    db.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
    db.commit()
    return jsonify(cart_payload(db, g.user["id"])), 200


@app.delete("/api/cart/<int:item_id>")
@login_required
def remove_cart_item(item_id: int):
    db = get_db()
    item = own_cart_item(db, item_id)
    if item is None:
        return error("Cart item not found", 404)
    db.execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    db.commit()
    return jsonify(cart_payload(db, g.user["id"])), 200


# --------------------------------------------------------------------------
# Admin
# --------------------------------------------------------------------------


def price_to_cents(value) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if value < 0:
        return None
    return int(round(value * 100))


@app.post("/api/admin/products")
@admin_required
def create_product():
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return error("name is required", 400)
    name = name.strip()
    if len(name) > 200:
        return error("name must be at most 200 characters", 400)

    description = data.get("description", "")
    if not isinstance(description, str):
        return error("description must be a string", 400)

    if "price" not in data:
        return error("price is required", 400)
    price_cents = price_to_cents(data.get("price"))
    if price_cents is None:
        return error("price must be a non-negative number", 400)

    stock = data.get("stock", 0)
    if not isinstance(stock, int) or isinstance(stock, bool) or stock < 0:
        return error("stock must be a non-negative integer", 400)

    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        return error("is_active must be a boolean", 400)

    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, description, price_cents, stock, is_active) VALUES (?, ?, ?, ?, ?)",
        (name, description, price_cents, stock, 1 if is_active else 0),
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(product_dict(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
@admin_required
def update_product(product_id: int):
    data = payload()
    if not data:
        return error("Invalid JSON body", 400)

    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return error("Product not found", 404)

    fields: dict[str, object] = {}
    if "name" in data:
        name = data["name"]
        if not isinstance(name, str) or not name.strip():
            return error("name must be a non-empty string", 400)
        if len(name.strip()) > 200:
            return error("name must be at most 200 characters", 400)
        fields["name"] = name.strip()
    if "description" in data:
        if not isinstance(data["description"], str):
            return error("description must be a string", 400)
        fields["description"] = data["description"]
    if "price" in data:
        price_cents = price_to_cents(data["price"])
        if price_cents is None:
            return error("price must be a non-negative number", 400)
        fields["price_cents"] = price_cents
    if "stock" in data:
        stock = data["stock"]
        if not isinstance(stock, int) or isinstance(stock, bool) or stock < 0:
            return error("stock must be a non-negative integer", 400)
        fields["stock"] = stock
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            return error("is_active must be a boolean", 400)
        fields["is_active"] = 1 if data["is_active"] else 0

    if not fields:
        return error("No valid fields to update", 400)

    sets = ", ".join(f"{column} = ?" for column in fields)
    db.execute(
        f"UPDATE products SET {sets} WHERE id = ?",
        [*fields.values(), product_id],
    )
    db.commit()
    updated = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_dict(updated)), 200


# --------------------------------------------------------------------------
# Frontend + fallbacks
# --------------------------------------------------------------------------


@app.after_request
def add_cors_headers(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault(
        "Access-Control-Allow-Headers", "Authorization, Content-Type"
    )
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


def serve_frontend(path: str):
    if path.startswith("api/"):
        return error("Not found", 404)
    target = (DIST / path).resolve()
    if path and target.is_file() and target.is_relative_to(DIST.resolve()):
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return error("Frontend build not found", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    return serve_frontend(path)


@app.post("/<path:path>")
@app.patch("/<path:path>")
@app.delete("/<path:path>")
def frontend_fallback(path: str):
    return serve_frontend(path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
