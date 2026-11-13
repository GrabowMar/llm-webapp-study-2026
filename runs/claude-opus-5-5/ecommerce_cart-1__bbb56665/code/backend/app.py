"""Flask entry point."""

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
from contextlib import closing
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "shop.db"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 12
MAX_QUANTITY = 1_000_000
MAX_PRICE_CENTS = 100_000_000_00

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SEED_PRODUCTS = [
    ("Ceramic Mug", "A sturdy 350 ml stoneware mug with a glazed finish.", 1250, 40),
    ("Canvas Tote Bag", "Heavy cotton canvas tote with reinforced handles.", 1800, 25),
    ("Desk Lamp", "Adjustable LED desk lamp with three brightness levels.", 4599, 15),
    ("Notebook A5", "Dot-grid notebook, 120 pages of 100 gsm paper.", 899, 60),
    ("Water Bottle", "Insulated stainless steel bottle, keeps drinks cold for 24 hours.", 2495, 30),
    ("Wireless Mouse", "Compact wireless mouse with silent clicks.", 2999, 20),
    ("Wool Beanie", "Soft merino wool beanie in charcoal grey.", 2200, 18),
    ("Bamboo Cutting Board", "Large bamboo cutting board with juice groove.", 3450, 12),
    ("Scented Candle", "Hand-poured soy candle with cedar and vanilla notes.", 1599, 35),
    ("Fountain Pen", "Steel nib fountain pen with converter included.", 3900, 10),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    UNIQUE (user_id, product_id)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        try:
            seeded = conn.execute("SELECT value FROM meta WHERE key = 'seeded'").fetchone()
            if not seeded:
                conn.executemany(
                    "INSERT INTO products (name, description, price_cents, stock) VALUES (?, ?, ?, ?)",
                    SEED_PRODUCTS,
                )
                conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
            admin = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if admin is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, NULL, 1)",
                    (ADMIN_USERNAME,),
                )
            else:
                conn.execute(
                    "UPDATE users SET is_admin = 1, password_hash = NULL WHERE id = ?",
                    (admin["id"],),
                )
                if not ADMIN_PASSWORD:
                    conn.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message, "message": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        message = err.description or err.name
        return jsonify({"error": message, "message": message}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    if isinstance(err, HTTPException):
        return handle_http_error(err)
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error", "message": "Internal server error"}), 500


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def money(cents: int) -> float:
    return round(cents / 100, 2)


def parse_price(value) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(400, "price must be a number")
    if not math.isfinite(value) or value < 0:
        raise ApiError(400, "price must be a non-negative number")
    cents = int(round(value * 100))
    if cents > MAX_PRICE_CENTS:
        raise ApiError(400, "price is too large")
    return cents


def parse_int(value, field: str, minimum: int, maximum: int = MAX_QUANTITY) -> int:
    if isinstance(value, bool):
        raise ApiError(400, f"{field} must be an integer")
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if not isinstance(value, int):
        raise ApiError(400, f"{field} must be an integer")
    if value < minimum:
        raise ApiError(400, f"{field} must be at least {minimum}")
    if value > maximum:
        raise ApiError(400, f"{field} must be at most {maximum}")
    return value


def parse_text(value, field: str, required: bool, max_len: int) -> str:
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be a string")
    value = value.strip()
    if required and not value:
        raise ApiError(400, f"{field} is required")
    if len(value) > max_len:
        raise ApiError(400, f"{field} must be at most {max_len} characters")
    return value


def product_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": money(row["price_cents"]),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def cart_item_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": row["quantity"],
        "name": row["name"],
        "unit_price": money(row["price_cents"]),
        "line_total": money(row["price_cents"] * row["quantity"]),
    }


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username, u.is_admin FROM sessions s "
            "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row is not None and not (row["is_admin"] and not ADMIN_PASSWORD):
            g.user = {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        if not user["is_admin"]:
            raise ApiError(403, "Admin access required")
        return fn(*args, **kwargs)

    return wrapper


def user_json(user: dict) -> dict:
    return {"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])}


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    if not (3 <= len(username) <= 32) or any(c.isspace() for c in username):
        raise ApiError(400, "username must be 3-32 characters without spaces")
    if len(password) < 4 or len(password) > 200:
        raise ApiError(400, "password must be 4-200 characters")
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "username is already taken")
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "username is already taken")
    return {"id": cur.lastrowid, "username": username, "is_admin": False}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    ok = False
    if row is not None:
        if row["is_admin"]:
            ok = bool(ADMIN_PASSWORD) and hmac.compare_digest(
                password.encode(), ADMIN_PASSWORD.encode()
            )
        elif row["password_hash"]:
            ok = check_password_hash(row["password_hash"], password)
    if not ok:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)", (hash_token(token), row["id"])
    )
    return {"token": token, "user": user_json(row)}


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token.strip()),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return user_json(current_user())


def page_params():
    def get(name: str, default: int, maximum: int | None) -> int:
        raw = request.args.get(name)
        if raw is None or raw.strip() == "":
            return default
        try:
            value = int(raw)
        except ValueError:
            raise ApiError(400, f"{name} must be a positive integer")
        if value < 1:
            raise ApiError(400, f"{name} must be a positive integer")
        if maximum is not None:
            value = min(value, maximum)
        return value

    return get("page", 1, None), get("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)


def list_products(active_only: bool):
    page, page_size = page_params()
    q = (request.args.get("q") or "").strip()
    where = []
    params: list = []
    if active_only:
        where.append("is_active = 1")
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')")
        params += [f"%{escaped}%", f"%{escaped}%"]
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM products {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM products {clause} ORDER BY name, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [product_json(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/products")
def products_index():
    return list_products(active_only=True)


@app.get("/api/products/<int:product_id>")
def products_show(product_id: int):
    row = db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Product not found")
    return product_json(row)


CART_SELECT = (
    "SELECT c.id, c.product_id, c.quantity, p.name, p.price_cents, p.stock "
    "FROM cart_items c JOIN products p ON p.id = c.product_id "
    "WHERE c.user_id = ? AND p.is_active = 1"
)


def fetch_cart_item(conn: sqlite3.Connection, user_id: int, item_id: int):
    return conn.execute(CART_SELECT + " AND c.id = ?", (user_id, item_id)).fetchone()


def check_stock(quantity: int, stock: int, name: str):
    if stock <= 0:
        raise ApiError(409, f"{name} is out of stock")
    if quantity > stock:
        raise ApiError(409, f"Only {stock} of {name} in stock")


@app.get("/api/cart")
@login_required
def cart_show():
    rows = db().execute(CART_SELECT + " ORDER BY c.id", (current_user()["id"],)).fetchall()
    subtotal = sum(r["price_cents"] * r["quantity"] for r in rows)
    return {"items": [cart_item_json(r) for r in rows], "subtotal": money(subtotal)}


@app.post("/api/cart")
@login_required
def cart_add():
    data = json_body()
    if "product_id" not in data:
        raise ApiError(400, "product_id is required")
    product_id = parse_int(data.get("product_id"), "product_id", 1, 2**62)
    quantity = parse_int(data.get("quantity", 1), "quantity", 1)
    user_id = current_user()["id"]
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        product = conn.execute(
            "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
        ).fetchone()
        if product is None:
            raise ApiError(404, "Product not found")
        existing = conn.execute(
            "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
            (user_id, product_id),
        ).fetchone()
        new_quantity = quantity + (existing["quantity"] if existing else 0)
        check_stock(new_quantity, product["stock"], product["name"])
        if existing:
            conn.execute(
                "UPDATE cart_items SET quantity = ? WHERE id = ?", (new_quantity, existing["id"])
            )
            item_id, status = existing["id"], 200
        else:
            cur = conn.execute(
                "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
                (user_id, product_id, new_quantity),
            )
            item_id, status = cur.lastrowid, 201
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return cart_item_json(fetch_cart_item(conn, user_id, item_id)), status


@app.patch("/api/cart/<int:item_id>")
@login_required
def cart_update(item_id: int):
    data = json_body()
    if "quantity" not in data:
        raise ApiError(400, "quantity is required")
    quantity = parse_int(data.get("quantity"), "quantity", 1)
    user_id = current_user()["id"]
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        item = fetch_cart_item(conn, user_id, item_id)
        if item is None:
            raise ApiError(404, "Cart item not found")
        check_stock(quantity, item["stock"], item["name"])
        conn.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return cart_item_json(fetch_cart_item(conn, user_id, item_id))


@app.delete("/api/cart/<int:item_id>")
@login_required
def cart_delete(item_id: int):
    cur = db().execute(
        "DELETE FROM cart_items WHERE id = ? AND user_id = ?", (item_id, current_user()["id"])
    )
    if cur.rowcount == 0:
        raise ApiError(404, "Cart item not found")
    return "", 204


@app.get("/api/admin/products")
@admin_required
def admin_products_index():
    return list_products(active_only=False)


@app.post("/api/admin/products")
@admin_required
def admin_products_create():
    data = json_body()
    if "name" not in data:
        raise ApiError(400, "name is required")
    if "price" not in data:
        raise ApiError(400, "price is required")
    name = parse_text(data["name"], "name", True, 200)
    description = parse_text(data.get("description") or "", "description", False, 5000)
    price_cents = parse_price(data["price"])
    stock = parse_int(data.get("stock", 0), "stock", 0)
    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        raise ApiError(400, "is_active must be a boolean")
    conn = db()
    cur = conn.execute(
        "INSERT INTO products (name, description, price_cents, stock, is_active) VALUES (?, ?, ?, ?, ?)",
        (name, description, price_cents, stock, int(is_active)),
    )
    row = conn.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return product_json(row), 201


@app.patch("/api/admin/products/<int:product_id>")
@admin_required
def admin_products_update(product_id: int):
    data = json_body()
    updates: dict = {}
    if "name" in data:
        updates["name"] = parse_text(data["name"], "name", True, 200)
    if "description" in data:
        updates["description"] = parse_text(
            data["description"] if data["description"] is not None else "", "description", False, 5000
        )
    if "price" in data:
        updates["price_cents"] = parse_price(data["price"])
    if "stock" in data:
        updates["stock"] = parse_int(data["stock"], "stock", 0)
    if "is_active" in data:
        if not isinstance(data["is_active"], bool):
            raise ApiError(400, "is_active must be a boolean")
        updates["is_active"] = int(data["is_active"])
    conn = db()
    if conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
        raise ApiError(404, "Product not found")
    if updates:
        assignments = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE products SET {assignments} WHERE id = ?", [*updates.values(), product_id]
        )
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return product_json(row)


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")


init_db()
