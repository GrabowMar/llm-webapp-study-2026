"""Flask API and frontend host for the shop app."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "shop.db")))

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

T = TypeVar("T")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def cents_to_price(cents: int) -> float:
    return float(Decimal(cents) / Decimal(100))


def price_to_cents(value: Any) -> int:
    if value is None or isinstance(value, bool):
        raise ValueError("Invalid price")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("Invalid price") from None
    if not amount.is_finite() or amount < 0:
        raise ValueError("Price must be a non-negative number")
    return int((amount * 100).to_integral_value(rounding=ROUND_HALF_UP))


def parse_int(value: Any) -> int:
    if isinstance(value, bool):
        raise ValueError("Invalid integer")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and re.fullmatch(r"[+-]?\d+", value.strip()):
        return int(value.strip())
    raise ValueError("Invalid integer")


def error(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


# ---------------------------------------------------------------------------
# Database


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


SEED_PRODUCTS = [
    ("Aurora Desk Lamp", "A warm, dimmable lamp with a brushed brass base.", 4999, 24),
    ("Canvas Tote Bag", "Sturdy organic cotton tote with an inner pocket.", 2499, 40),
    ("Cedar Notebook", "A5 dot-grid notebook with 160 pages of thick paper.", 1499, 60),
    ("Cloud Ceramic Mug", "Hand-glazed 350 ml mug that keeps coffee warm.", 1899, 35),
    ("Drift Wool Scarf", "Soft merino scarf woven in a muted charcoal stripe.", 3999, 18),
    ("Evergreen Water Bottle", "Insulated stainless bottle, 750 ml, leak proof.", 2999, 30),
    ("Fjord Backpack", "Weather-resistant daypack with a padded laptop sleeve.", 8999, 16),
    ("Grove Cutting Board", "Solid oak board with a juice groove and hanging loop.", 3499, 22),
    ("Harbor Bluetooth Speaker", "Pocket speaker with 12 hours of playback.", 5999, 27),
    ("Meadow Candle", "Soy wax candle scented with lavender and sage.", 2199, 50),
    ("Orbit Wall Clock", "Minimal sweep-movement clock, 30 cm diameter.", 4299, 14),
    ("Page Turner Book Light", "Clip-on reading light with three brightness levels.", 1699, 45),
]


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                price_cents INTEGER NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cart_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                quantity INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(user_id, product_id)
            );
            CREATE INDEX IF NOT EXISTS idx_products_active_name
                ON products(is_active, name);
            CREATE INDEX IF NOT EXISTS idx_cart_user
                ON cart_items(user_id, id);
            """
        )

        conn.execute("BEGIN IMMEDIATE")
        count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if count == 0:
            now = utcnow()
            conn.executemany(
                """
                INSERT INTO products
                    (name, description, price_cents, stock, is_active, created_at)
                VALUES (?, ?, ?, ?, 1, ?)
                """,
                [(name, desc, price, stock, now) for name, desc, price, stock in SEED_PRODUCTS],
            )

        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if admin_password:
            admin_hash = generate_password_hash(admin_password)
            row = conn.execute(
                "SELECT id FROM users WHERE username = 'admin'"
            ).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO users (username, password_hash, is_admin, created_at)
                    VALUES ('admin', ?, 1, ?)
                    """,
                    (admin_hash, utcnow()),
                )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (admin_hash, row["id"]),
                )
        else:
            conn.execute("DELETE FROM users WHERE username = 'admin'")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Authentication helpers


def current_user() -> sqlite3.Row | None:
    if "current_user" in g:
        return g.current_user
    header = request.headers.get("Authorization", "")
    user = None
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        if token:
            user = get_db().execute(
                """
                SELECT u.id, u.username, u.is_admin
                FROM auth_tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.token = ?
                """,
                (token,),
            ).fetchone()
    g.current_user = user
    return user


def login_required(view: Callable[..., T]) -> Callable[..., T]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return error("Authentication required", 401)
        return view(*args, **kwargs)

    return wrapped


def admin_required(view: Callable[..., T]) -> Callable[..., T]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        if not user["is_admin"]:
            return error("Admin access required", 403)
        return view(*args, **kwargs)

    return wrapped


def body() -> dict[str, Any] | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("Not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(_exc):
    if request.path.startswith("/api/"):
        return error("Method not allowed", 405)
    return send_from_directory(DIST, "index.html")


# ---------------------------------------------------------------------------
# Serializers


def product_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": cents_to_price(row["price_cents"]),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


CART_ITEM_SELECT = """
    SELECT c.id, c.product_id, c.quantity, p.name, p.price_cents,
           (p.price_cents * c.quantity) AS line_cents
    FROM cart_items c
    JOIN products p ON p.id = c.product_id
"""


def cart_item_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": row["quantity"],
        "name": row["name"],
        "unit_price": cents_to_price(row["price_cents"]),
        "line_total": cents_to_price(row["line_cents"]),
    }


# ---------------------------------------------------------------------------
# Health and auth


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("Username is required", 400)
    if not isinstance(password, str) or not password:
        return error("Password is required", 400)
    username = username.strip()
    if username.lower() == "admin":
        return error("That username is not available", 409)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing is not None:
        return error("Username is already taken", 409)
    try:
        cur = db.execute(
            """
            INSERT INTO users (username, password_hash, is_admin, created_at)
            VALUES (?, ?, 0, ?)
            """,
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("Username is already taken", 409)
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required", 400)
    username = username.strip()

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token, "username": user["username"]}), 200


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return {
        "id": user["id"],
        "username": user["username"],
        "is_admin": bool(user["is_admin"]),
    }


# ---------------------------------------------------------------------------
# Products


@app.get("/api/products")
def list_products():
    q = request.args.get("q", "").strip()
    try:
        page = parse_int(request.args.get("page", 1))
        page_size = parse_int(request.args.get("page_size", 20))
    except ValueError:
        return error("Invalid pagination", 400)
    if page < 1:
        return error("Page must be at least 1", 400)
    if page_size < 1 or page_size > 100:
        return error("Page size must be between 1 and 100", 400)

    where = ["is_active = 1"]
    params: list[Any] = []
    if q:
        like = f"%{q}%"
        where.append("(name LIKE ? COLLATE NOCASE OR description LIKE ? COLLATE NOCASE)")
        params.extend([like, like])
    clause = " AND ".join(where)

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM products WHERE {clause}", params
    ).fetchone()[0]
    rows = db.execute(
        f"""
        SELECT * FROM products
        WHERE {clause}
        ORDER BY name COLLATE NOCASE, id
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [product_json(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/products/<int:product_id>")
def get_product(product_id: int):
    row = get_db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return error("Product not found", 404)
    return product_json(row)


# ---------------------------------------------------------------------------
# Cart


def find_cart_item(db: sqlite3.Connection, user_id: int, item_id: int):
    return db.execute(
        CART_ITEM_SELECT
        + " WHERE c.id = ? AND c.user_id = ? AND p.is_active = 1",
        (item_id, user_id),
    ).fetchone()


@app.get("/api/cart")
@login_required
def get_cart():
    user = current_user()
    rows = get_db().execute(
        CART_ITEM_SELECT
        + """
        WHERE c.user_id = ? AND p.is_active = 1
        ORDER BY c.id
        """,
        (user["id"],),
    ).fetchall()
    items = [cart_item_json(row) for row in rows]
    subtotal_cents = sum(row["line_cents"] for row in rows)
    return {"items": items, "subtotal": cents_to_price(subtotal_cents)}


@app.post("/api/cart")
@login_required
def add_to_cart():
    user = current_user()
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    try:
        product_id = parse_int(
            data.get(
                "product_id",
                data.get("productId", data.get("id", data.get("product"))),
            )
        )
        quantity = parse_int(data.get("quantity", 1))
    except ValueError:
        return error("product_id and quantity are required", 400)
    if quantity < 1:
        return error("Quantity must be at least 1", 400)

    db = get_db()
    product = db.execute(
        "SELECT id, is_active FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if product is None:
        return error("Product not found", 404)
    if not product["is_active"]:
        return error("Product is not available", 400)

    existing = db.execute(
        "SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?",
        (user["id"], product_id),
    ).fetchone()
    created = existing is None
    if created:
        cur = db.execute(
            """
            INSERT INTO cart_items (user_id, product_id, quantity, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (user["id"], product_id, quantity, utcnow()),
        )
        item_id = cur.lastrowid
    else:
        item_id = existing["id"]
        db.execute(
            "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
            (quantity, item_id),
        )
    db.commit()
    row = find_cart_item(db, user["id"], item_id)
    return jsonify(cart_item_json(row)), 200


@app.patch("/api/cart/<int:item_id>")
@login_required
def update_cart_item(item_id: int):
    user = current_user()
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    if "quantity" not in data:
        return error("Quantity is required", 400)
    try:
        quantity = parse_int(data.get("quantity"))
    except ValueError:
        return error("Quantity must be a whole number", 400)
    if quantity < 1:
        return error("Quantity must be at least 1", 400)

    db = get_db()
    row = find_cart_item(db, user["id"], item_id)
    if row is None:
        return error("Cart item not found", 404)
    db.execute(
        "UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id)
    )
    db.commit()
    row = find_cart_item(db, user["id"], item_id)
    return cart_item_json(row)


@app.delete("/api/cart/<int:item_id>")
@login_required
def delete_cart_item(item_id: int):
    user = current_user()
    db = get_db()
    row = find_cart_item(db, user["id"], item_id)
    if row is None:
        return error("Cart item not found", 404)
    db.execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# Admin products


def validate_product_fields(data: dict[str, Any], partial: bool) -> tuple[dict[str, Any], str | None]:
    fields: dict[str, Any] = {}
    if not partial or "name" in data:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            return {}, "Name is required"
        fields["name"] = name.strip()
    if "description" in data or not partial:
        description = data.get("description", "")
        if description is None:
            description = ""
        if not isinstance(description, str):
            return {}, "Description must be a string"
        fields["description"] = description
    if "price" in data or not partial:
        if "price" not in data:
            return {}, "Price is required"
        try:
            fields["price_cents"] = price_to_cents(data.get("price"))
        except ValueError as exc:
            return {}, str(exc)
    if "stock" in data:
        try:
            stock = parse_int(data.get("stock"))
        except ValueError:
            return {}, "Stock must be a whole number"
        if stock < 0:
            return {}, "Stock must be non-negative"
        fields["stock"] = stock
    elif not partial:
        fields["stock"] = 0
    if "active" in data and "is_active" not in data:
        data = {**data, "is_active": data["active"]}
    if "is_active" in data:
        active = data.get("is_active")
        if isinstance(active, bool):
            fields["is_active"] = 1 if active else 0
        elif isinstance(active, int) and active in (0, 1):
            fields["is_active"] = active
        else:
            return {}, "is_active must be a boolean"
    elif not partial:
        fields["is_active"] = 1
    return fields, None


@app.get("/api/admin/products")
@admin_required
def admin_list_products():
    rows = get_db().execute(
        "SELECT * FROM products ORDER BY name COLLATE NOCASE, id"
    ).fetchall()
    return {"items": [product_json(row) for row in rows]}


@app.post("/api/admin/products")
@admin_required
def create_product():
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    fields, message = validate_product_fields(data, partial=False)
    if message:
        return error(message, 400)
    db = get_db()
    cur = db.execute(
        """
        INSERT INTO products
            (name, description, price_cents, stock, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            fields["name"],
            fields.get("description", ""),
            fields["price_cents"],
            fields["stock"],
            fields.get("is_active", 1),
            utcnow(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(product_json(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
@admin_required
def update_product(product_id: int):
    data = body()
    if data is None:
        return error("Expected a JSON object", 400)
    db = get_db()
    existing = db.execute(
        "SELECT * FROM products WHERE id = ?", (product_id,)
    ).fetchone()
    if existing is None:
        return error("Product not found", 404)

    fields, message = validate_product_fields(data, partial=True)
    if message:
        return error(message, 400)
    if not fields:
        return product_json(existing)

    assignments = ", ".join(f"{column} = ?" for column in fields)
    db.execute(
        f"UPDATE products SET {assignments} WHERE id = ?",
        [*fields.values(), product_id],
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return product_json(row)


# ---------------------------------------------------------------------------
# Frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    candidate = DIST / path
    if candidate.is_file() and DIST in candidate.resolve().parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
