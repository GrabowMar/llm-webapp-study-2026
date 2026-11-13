"""Shop API: accounts, catalogue, carts and administration."""

from __future__ import annotations

import os
import secrets
import sqlite3
from decimal import Decimal, InvalidOperation
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DB_PATH = Path(os.environ.get("SHOP_DB") or (BASE / "data" / "shop.sqlite3"))

SEED_PRODUCTS = [
    (1, "Alpine Water Bottle", "Insulated stainless steel bottle, 750 ml.", "14.99", 40),
    (2, "Bamboo Cutting Board", "Durable, knife-friendly bamboo board.", "24.50", 25),
    (3, "Ceramic Coffee Mug", "Hand-glazed mug, holds 350 ml.", "9.75", 60),
    (4, "Cotton Tote Bag", "Reusable heavyweight cotton tote.", "12", 35),
    (5, "Desk Lamp", "Adjustable LED lamp with warm light.", "39.95", 18),
    (6, "Espresso Beans 1kg", "Medium roast whole beans.", "22", 30),
    (7, "Linen Notebook", "Hardcover, 200 dotted pages.", "8.50", 50),
    (8, "Olive Wood Spoon", "Hand-carved serving spoon.", "7.25", 45),
    (9, "Stainless Steel Pen", "Refillable ballpoint with gift box.", "16", 22),
    (10, "Wireless Mouse", "Ergonomic, silent-click wireless mouse.", "29.99", 15),
]

app = Flask(__name__, static_folder=None)
app.url_map.strict_slashes = False
app.config["JSON_SORT_KEYS"] = False


def db_connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = db_connect()
    return g.db


@app.teardown_appcontext
def close_db(_error: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '0',
    stock INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
"""


def initialise() -> None:
    conn = db_connect()
    try:
        conn.executescript(SCHEMA)
        for pid, name, description, price, stock in SEED_PRODUCTS:
            conn.execute(
                "INSERT OR IGNORE INTO products (id, name, description, price, stock, is_active) "
                "VALUES (?, ?, ?, ?, ?, 1)",
                (pid, name, description, price, stock),
            )
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        secret = admin_password if admin_password else secrets.token_urlsafe(48)
        admin_hash = generate_password_hash(secret)
        row = conn.execute(
            "SELECT id FROM users WHERE username = 'admin' COLLATE NOCASE"
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                (admin_hash,),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (admin_hash, row["id"]),
            )
        conn.commit()
    finally:
        conn.close()


initialise()


def api_error(status: int, message: str):
    return jsonify({"error": message, "message": message}), status


def body() -> dict:
    data = request.get_json(force=True, silent=True)
    if not isinstance(data, dict):
        raise ValueError("A JSON object is required")
    return data


def first_present(data: dict, *keys: str):
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def parse_id(value) -> int:
    if isinstance(value, bool):
        raise ValueError("A valid id is required")
    try:
        result = int(value)
    except (TypeError, ValueError):
        raise ValueError("A valid id is required")
    if result < 1:
        raise ValueError("A valid id is required")
    return result


def parse_quantity(value) -> int:
    if value is None:
        raise ValueError("quantity must be a positive integer")
    if isinstance(value, bool):
        raise ValueError("quantity must be a positive integer")
    if isinstance(value, int):
        result = value
    elif isinstance(value, float):
        if not value.is_integer():
            raise ValueError("quantity must be a positive integer")
        result = int(value)
    elif isinstance(value, str):
        try:
            result = int(value.strip())
        except ValueError:
            raise ValueError("quantity must be a positive integer")
    else:
        raise ValueError("quantity must be a positive integer")
    if result < 1:
        raise ValueError("quantity must be a positive integer")
    if result > 1_000_000:
        raise ValueError("quantity is too large")
    return result


def parse_price(value) -> str:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError("price must be a non-negative number")
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("price must be a non-negative number")
    if not number.is_finite() or number < 0:
        raise ValueError("price must be a non-negative number")
    return str(number)


def parse_stock(value) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError("stock must be a non-negative integer")
    try:
        number = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("stock must be a non-negative integer")
    if not number.is_finite() or number < 0 or number != number.to_integral_value():
        raise ValueError("stock must be a non-negative integer")
    return int(number)


def parse_bool(value, field: str = "is_active") -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int) and value in (0, 1):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return 1
        if lowered in ("false", "0", "no", "off"):
            return 0
    raise ValueError(f"{field} must be a boolean")


def parse_positive_arg(value, default: int, maximum: int = 200) -> int:
    if value is None:
        return default
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    if result < 1:
        return default
    return min(result, maximum)


def decimal_number(number: Decimal):
    if number == number.to_integral_value():
        return int(number)
    return float(number)


def price_number(text: str):
    return decimal_number(Decimal(text))


def product_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": price_number(row["price"]),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def cart_payload(user_id: int) -> dict:
    rows = get_db().execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price "
        "FROM cart_items ci JOIN products p ON p.id = ci.product_id "
        "WHERE ci.user_id = ? AND p.is_active = 1 ORDER BY ci.created_at ASC, ci.id ASC",
        (user_id,),
    ).fetchall()
    items = []
    subtotal = Decimal("0")
    for row in rows:
        price = Decimal(row["price"])
        line_total = price * row["quantity"]
        subtotal += line_total
        items.append(
            {
                "id": row["id"],
                "product_id": row["product_id"],
                "quantity": row["quantity"],
                "name": row["name"],
                "unit_price": decimal_number(price),
                "line_total": decimal_number(line_total),
            }
        )
    return {"items": items, "subtotal": decimal_number(subtotal)}


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(36)
    get_db().execute(
        "INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user_id)
    )
    get_db().commit()
    return token


def require_user():
    user = current_user()
    if user is None:
        return None, api_error(401, "Authentication required")
    return user, None


def require_admin():
    user, failure = require_user()
    if failure is not None:
        return None, failure
    if not user["is_admin"]:
        return None, api_error(403, "Administrator access required")
    return user, None


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
@app.route("/api", methods=["OPTIONS"])
def api_options(_path: str = ""):
    return jsonify({})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    try:
        data = body()
        username = str(data.get("username") or "").strip()
        password = data.get("password")
        if not username:
            return api_error(400, "username is required")
        if len(username) > 100:
            return api_error(400, "username is too long")
        if not isinstance(password, str) or not password:
            return api_error(400, "password is required")
        if username.lower() == "admin":
            return api_error(409, "That username is reserved")
    except ValueError as exc:
        return api_error(400, str(exc))

    db = get_db()
    if db.execute(
        "SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone():
        return api_error(409, "Username already taken")
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, generate_password_hash(password)),
    )
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
    try:
        data = body()
        username = str(data.get("username") or "").strip()
        password = data.get("password")
        if not isinstance(password, str):
            password = ""
    except ValueError as exc:
        return api_error(400, str(exc))

    row = get_db().execute(
        "SELECT id, username, password_hash, is_admin FROM users "
        "WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error(401, "Invalid username or password")
    token = issue_token(row["id"])
    return jsonify(
        {
            "token": token,
            "username": row["username"],
            "is_admin": bool(row["is_admin"]),
        }
    )


@app.get("/api/auth/me")
def me():
    user, failure = require_user()
    if failure is not None:
        return failure
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "is_admin": bool(user["is_admin"]),
        }
    )


@app.post("/api/auth/logout")
def logout():
    user, failure = require_user()
    if failure is not None:
        return failure
    token = request.headers.get("Authorization", "")[7:].strip()
    get_db().execute("DELETE FROM tokens WHERE token = ?", (token,))
    get_db().commit()
    return jsonify({"username": user["username"], "signed_out": True})


@app.get("/api/products")
def list_products():
    db = get_db()
    query = (request.args.get("q") or "").strip()
    page = parse_positive_arg(request.args.get("page"), 1)
    page_size = parse_positive_arg(request.args.get("page_size"), 20)
    where = "is_active = 1"
    params: list = []
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where += " AND name LIKE ? ESCAPE '\\'"
        params.append(f"%{escaped}%")
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM products WHERE {where}", params
    ).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM products WHERE {where} ORDER BY name COLLATE NOCASE ASC, id ASC "
        "LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [product_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/products/<int:product_id>")
def get_product(product_id: int):
    row = get_db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return api_error(404, "Product not found")
    return jsonify(product_dict(row))


@app.get("/api/admin/products")
def admin_list_products():
    _, failure = require_admin()
    if failure is not None:
        return failure
    rows = get_db().execute(
        "SELECT * FROM products ORDER BY name COLLATE NOCASE ASC, id ASC"
    ).fetchall()
    items = [product_dict(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


@app.post("/api/admin/products")
def admin_create_product():
    _, failure = require_admin()
    if failure is not None:
        return failure
    try:
        data = body()
        name = str(data.get("name") or "").strip()
        if not name:
            return api_error(400, "name is required")
        description = str(data.get("description") or "")
        price = parse_price(data.get("price", 0))
        stock = parse_stock(data.get("stock", 0))
        active_value = first_present(data, "is_active", "active")
        is_active = parse_bool(active_value) if active_value is not None else 1
    except ValueError as exc:
        return api_error(400, str(exc))

    cursor = get_db().execute(
        "INSERT INTO products (name, description, price, stock, is_active) "
        "VALUES (?, ?, ?, ?, ?)",
        (name, description, price, stock, is_active),
    )
    get_db().commit()
    row = get_db().execute(
        "SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(product_dict(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
def admin_update_product(product_id: int):
    _, failure = require_admin()
    if failure is not None:
        return failure
    db = get_db()
    if db.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
        return api_error(404, "Product not found")
    try:
        data = body()
        updates: list[str] = []
        values: list = []
        if "name" in data:
            name = str(data.get("name") or "").strip()
            if not name:
                return api_error(400, "name is required")
            updates.append("name = ?")
            values.append(name)
        if "description" in data:
            updates.append("description = ?")
            values.append(str(data.get("description") or ""))
        if "price" in data:
            updates.append("price = ?")
            values.append(parse_price(data["price"]))
        if "stock" in data:
            updates.append("stock = ?")
            values.append(parse_stock(data["stock"]))
        active_value = first_present(data, "is_active", "active")
        if active_value is not None:
            updates.append("is_active = ?")
            values.append(parse_bool(active_value))
    except ValueError as exc:
        return api_error(400, str(exc))

    if updates:
        values.append(product_id)
        db.execute(f"UPDATE products SET {', '.join(updates)} WHERE id = ?", values)
        db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_dict(row))


@app.get("/api/cart")
def get_cart():
    user, failure = require_user()
    if failure is not None:
        return failure
    return jsonify(cart_payload(user["id"]))


@app.post("/api/cart")
def add_to_cart():
    user, failure = require_user()
    if failure is not None:
        return failure
    try:
        data = body()
        product_id = parse_id(first_present(data, "product_id", "productId", "product", "id"))
        raw_quantity = first_present(data, "quantity", "qty")
        quantity = parse_quantity(1 if raw_quantity is None else raw_quantity)
    except ValueError as exc:
        return api_error(400, str(exc))

    db = get_db()
    if db.execute(
        "SELECT 1 FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone() is None:
        return api_error(404, "Product not found")
    existing = db.execute(
        "SELECT id FROM cart_items WHERE user_id = ? AND product_id = ?",
        (user["id"], product_id),
    ).fetchone()
    if existing is None:
        db.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
            (user["id"], product_id, quantity),
        )
    else:
        db.execute(
            "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
            (quantity, existing["id"]),
        )
    db.commit()
    return jsonify(cart_payload(user["id"]))


@app.patch("/api/cart/<int:item_id>")
def update_cart_item(item_id: int):
    user, failure = require_user()
    if failure is not None:
        return failure
    try:
        data = body()
        quantity = parse_quantity(first_present(data, "quantity", "qty"))
    except ValueError as exc:
        return api_error(400, str(exc))

    db = get_db()
    row = db.execute(
        "SELECT id FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, user["id"]),
    ).fetchone()
    if row is None:
        return api_error(404, "Cart item not found")
    db.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
    db.commit()
    return jsonify(cart_payload(user["id"]))


@app.delete("/api/cart/<int:item_id>")
def delete_cart_item(item_id: int):
    user, failure = require_user()
    if failure is not None:
        return failure
    db = get_db()
    row = db.execute(
        "SELECT id FROM cart_items WHERE id = ? AND user_id = ?",
        (item_id, user["id"]),
    ).fetchone()
    if row is None:
        return api_error(404, "Cart item not found")
    db.execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    db.commit()
    return jsonify(cart_payload(user["id"]))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error(404, "Not found")
    parts = Path(path).parts
    candidate = path if parts and ".." not in parts else ""
    if candidate and (DIST / candidate).is_file():
        return send_from_directory(DIST, candidate)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return "<!doctype html><title>Shop</title><p>Frontend build not found.</p>", 404
