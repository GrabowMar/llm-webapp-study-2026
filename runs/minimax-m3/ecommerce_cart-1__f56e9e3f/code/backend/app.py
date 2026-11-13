"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import base64
import fcntl
import hmac
import os
import secrets
import sqlite3
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (ROOT / "data")).resolve()
DB_PATH = DATA_DIR / "shop.db"
SECRET_PATH = DATA_DIR / "secret.key"
LOCK_PATH = DATA_DIR / "init.lock"

ADMIN_USERNAME = "admin"
TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 50

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def api_error(status: int, message: str):
    response = jsonify({"error": message, "message": message})
    response.status_code = status
    return response


class ApiError(Exception):
    """Raised to abort a request with a JSON error body."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return api_error(error.status, error.message)


def now_ts() -> float:
    return time.time()


def secret_key() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not SECRET_PATH.exists():
        SECRET_PATH.write_text(secrets.token_hex(32))
        os.chmod(SECRET_PATH, 0o600)
    return bytes.fromhex(SECRET_PATH.read_text().strip())


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _unb64(raw: str) -> bytes:
    return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))


def make_token(user_id: int) -> str:
    payload = f"{user_id}.{int(now_ts() + TOKEN_TTL_SECONDS)}"
    signature = hmac.new(secret_key(), payload.encode(), "sha256").hexdigest()
    return f"{_b64(payload.encode())}.{signature}"


def read_token(token: str) -> int | None:
    if not token or "." not in token:
        return None
    encoded, _, signature = token.partition(".")
    try:
        payload = _unb64(encoded).decode()
    except Exception:
        return None
    expected = hmac.new(secret_key(), payload.encode(), "sha256").hexdigest()
    if not hmac.compare_digest(expected, signature):
        return None
    try:
        user_id, expires = payload.split(".", 1)
        if int(expires) < now_ts():
            return None
        return int(user_id)
    except (TypeError, ValueError):
        return None


def db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=10000")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def to_price(value) -> Decimal | None:
    """Convert a JSON price into an exact decimal; None when not a usable number."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    if not isinstance(value, (int, float, Decimal)):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount < 0:
        return None
    return amount


def money(amount: Decimal) -> float:
    """Render an exact decimal amount as a JSON friendly float."""
    return float(amount)


def to_quantity(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    if isinstance(value, float):
        if not value.is_integer():
            return None
        value = int(value)
    if not isinstance(value, int):
        return None
    if value < 1:
        return None
    return value


def to_stock(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if not value:
            return None
    if isinstance(value, float):
        if not value.is_integer():
            return None
        value = int(value)
    if not isinstance(value, int) or value < 0:
        return None
    return value


def to_flag(value) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return True
        if lowered in ("false", "0", "no", "off"):
            return False
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    return None


def product_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": money(Decimal(str(row["price"]))),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def cart_item_json(row: sqlite3.Row) -> dict:
    unit = Decimal(str(row["price"]))
    quantity = row["quantity"]
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": quantity,
        "name": row["name"],
        "unit_price": money(unit),
        "line_total": money(unit * quantity),
    }


# --------------------------------------------------------------------------
# database bootstrap
# --------------------------------------------------------------------------
SEED_PRODUCTS = [
    ("Canvas Tote", "Heavy cotton tote bag, roomy enough for market runs.", "15.00", 30),
    ("Ceramic Mug", "Stoneware mug, 350 ml, dishwasher safe.", "12.50", 40),
    ("Desk Lamp", "Warm LED desk lamp with a dimmable arm.", "34.50", 15),
    ("Espresso Beans", "Dark roast arabica beans, 1 kg bag.", "18.99", 24),
    ("Notebook A5", "Dotted paper notebook with a soft cover.", "8.99", 60),
    ("Olive Oil", "Cold pressed extra virgin olive oil, 500 ml.", "21.50", 26),
    ("Puzzle 1000", "Landscape jigsaw puzzle with 1000 pieces.", "21.99", 14),
    ("Tea Sampler", "Six loose leaf blends, 120 g in total.", "16.50", 22),
    ("Wireless Mouse", "Quiet click mouse with a USB-C receiver.", "25.99", 18),
    ("Wool Scarf", "Brushed wool scarf, 180 x 30 cm.", "29.99", 12),
]


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(LOCK_PATH, "w") as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        try:
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA busy_timeout=30000")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_admin INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    price REAL NOT NULL DEFAULT 0,
                    stock INTEGER NOT NULL DEFAULT 0,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS cart_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                    quantity INTEGER NOT NULL,
                    created_at REAL NOT NULL,
                    UNIQUE (user_id, product_id)
                );
                """
            )
            count = conn.execute("SELECT COUNT(*) AS c FROM products").fetchone()["c"]
            if count == 0:
                timestamp = now_ts()
                conn.executemany(
                    "INSERT INTO products (name, description, price, stock, is_active, created_at)"
                    " VALUES (?, ?, ?, ?, 1, ?)",
                    [(n, d, float(p), s, timestamp) for n, d, p, s in SEED_PRODUCTS],
                )
            admin_password = os.environ.get("ADMIN_PASSWORD") or ""
            if admin_password:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at)"
                    " VALUES (?, ?, 1, ?)"
                    " ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash,"
                    " is_admin=1",
                    (ADMIN_USERNAME, generate_password_hash(admin_password), now_ts()),
                )
            else:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at)"
                    " VALUES (?, ?, 1, ?)"
                    " ON CONFLICT(username) DO UPDATE SET is_admin=1",
                    (ADMIN_USERNAME, generate_password_hash(secrets.token_urlsafe(32)), now_ts()),
                )
            conn.commit()
        finally:
            conn.close()


# --------------------------------------------------------------------------
# authentication
# --------------------------------------------------------------------------
def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    user_id = read_token(token.strip())
    if user_id is None:
        return None
    return db().execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError(401, "Sign in to continue.")
    return user


def require_admin() -> sqlite3.Row:
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "This action is restricted to the admin.")
    return user


def user_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


# --------------------------------------------------------------------------
# auth routes
# --------------------------------------------------------------------------
@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return api_error(400, "A username is required.")
    username = username.strip()
    if len(username) > 64:
        return api_error(400, "That username is too long.")
    if not isinstance(password, str) or not password:
        return api_error(400, "A password is required.")
    if username.lower() == ADMIN_USERNAME:
        return api_error(409, "That username is reserved for the admin.")
    try:
        cursor = db().execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), now_ts()),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return api_error(409, "That username is already taken.")
    row = db().execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify({"token": make_token(row["id"]), "user": user_json(row)}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return api_error(400, "A username and password are required.")
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        if not admin_password:
            return api_error(401, "Admin sign-in is disabled.")
        if not hmac.compare_digest(admin_password, password):
            return api_error(401, "Incorrect username or password.")
        row = db().execute("SELECT * FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
        if row is None:
            cursor = db().execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                (ADMIN_USERNAME, generate_password_hash(admin_password), now_ts()),
            )
            db().commit()
            row = db().execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        else:
            db().execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
            db().commit()
            row = db().execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
        return jsonify({"token": make_token(row["id"]), "user": user_json(row)}), 200
    row = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error(401, "Incorrect username or password.")
    return jsonify({"token": make_token(row["id"]), "user": user_json(row)}), 200


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"user": user_json(user)}), 200


# --------------------------------------------------------------------------
# catalogue
# --------------------------------------------------------------------------
@app.get("/api/products")
def list_products():
    search = (request.args.get("q") or "").strip()
    try:
        page = int(request.args.get("page") or 1)
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size") or DEFAULT_PAGE_SIZE)
    except ValueError:
        page_size = DEFAULT_PAGE_SIZE
    page = max(1, page)
    page_size = max(1, min(MAX_PAGE_SIZE, page_size))

    conn = db()
    where = "WHERE is_active = 1"
    params: list = []
    if search:
        where += " AND (name LIKE ? OR description LIKE ?)"
        pattern = f"%{search}%"
        params += [pattern, pattern]
    total = conn.execute(f"SELECT COUNT(*) AS c FROM products {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM products {where} ORDER BY name ASC, id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [product_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.get("/api/products/<int:product_id>")
def get_product(product_id: int):
    row = db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        return api_error(404, "Product not found.")
    return jsonify(product_json(row)), 200


# --------------------------------------------------------------------------
# cart
# --------------------------------------------------------------------------
def cart_rows(user_id: int) -> list[sqlite3.Row]:
    return db().execute(
        "SELECT ci.id, ci.product_id, ci.quantity, p.name, p.price"
        " FROM cart_items ci JOIN products p ON p.id = ci.product_id"
        " WHERE ci.user_id = ? AND p.is_active = 1"
        " ORDER BY ci.created_at ASC, ci.id ASC",
        (user_id,),
    ).fetchall()


def cart_payload(user_id: int) -> dict:
    rows = cart_rows(user_id)
    items = [cart_item_json(row) for row in rows]
    subtotal = sum(
        (Decimal(str(row["price"])) * row["quantity"] for row in rows), Decimal("0")
    )
    return {"items": items, "subtotal": money(subtotal)}


@app.get("/api/cart")
def get_cart():
    user = require_user()
    return jsonify(cart_payload(user["id"])), 200


@app.post("/api/cart")
def add_to_cart():
    user = require_user()
    data = body()
    product_id = data.get("product_id", data.get("productId", data.get("id")))
    if isinstance(product_id, str) and product_id.strip().lstrip("-").isdigit():
        product_id = int(product_id.strip())
    if not isinstance(product_id, int) or isinstance(product_id, bool):
        return api_error(400, "A product id is required.")
    quantity = to_quantity(data.get("quantity", 1))
    if quantity is None:
        return api_error(400, "Quantity must be a positive whole number.")

    product = db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if product is None or not product["is_active"]:
        return api_error(404, "That product is not available.")

    conn = db()
    existing = conn.execute(
        "SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?",
        (user["id"], product_id),
    ).fetchone()
    if existing is None:
        conn.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity, created_at) VALUES (?, ?, ?, ?)",
            (user["id"], product_id, quantity, now_ts()),
        )
    else:
        conn.execute(
            "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
            (quantity, existing["id"]),
        )
    conn.commit()
    payload = cart_payload(user["id"])
    item = next((entry for entry in payload["items"] if entry["product_id"] == product_id), None)
    if item is not None:
        payload["item"] = item
        payload.update(item)
    return jsonify(payload), 200


@app.patch("/api/cart/<int:item_id>")
def update_cart_item(item_id: int):
    user = require_user()
    data = body()
    quantity = to_quantity(data.get("quantity"))
    if quantity is None:
        return api_error(400, "Quantity must be a positive whole number.")
    conn = db()
    row = conn.execute(
        "SELECT * FROM cart_items WHERE id = ? AND user_id = ?", (item_id, user["id"])
    ).fetchone()
    if row is None:
        return api_error(404, "Cart item not found.")
    conn.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
    conn.commit()
    payload = cart_payload(user["id"])
    item = next((entry for entry in payload["items"] if entry["id"] == item_id), None)
    if item is not None:
        payload["item"] = item
        payload.update(item)
    return jsonify(payload), 200


@app.delete("/api/cart/<int:item_id>")
def delete_cart_item(item_id: int):
    user = require_user()
    conn = db()
    row = conn.execute(
        "SELECT * FROM cart_items WHERE id = ? AND user_id = ?", (item_id, user["id"])
    ).fetchone()
    if row is None:
        return api_error(404, "Cart item not found.")
    conn.execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    conn.commit()
    return jsonify(cart_payload(user["id"])), 200


# --------------------------------------------------------------------------
# admin
# --------------------------------------------------------------------------
@app.get("/api/admin/products")
def admin_list_products():
    require_admin()
    rows = db().execute("SELECT * FROM products ORDER BY name ASC, id ASC").fetchall()
    return jsonify({"items": [product_json(row) for row in rows]}), 200


@app.post("/api/admin/products")
def admin_create_product():
    require_admin()
    data = body()
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        return api_error(400, "A product name is required.")
    name = name.strip()
    description = data.get("description")
    if description is None:
        description = ""
    if not isinstance(description, str):
        return api_error(400, "The description must be text.")
    price = to_price(data.get("price", 0))
    if price is None:
        return api_error(400, "The price must be a positive number.")
    stock = to_stock(data.get("stock", 0))
    if stock is None:
        return api_error(400, "The stock must be a whole number of zero or more.")
    is_active = to_flag(data.get("is_active", True))
    if is_active is None:
        return api_error(400, "The active flag must be a boolean.")

    conn = db()
    cursor = conn.execute(
        "INSERT INTO products (name, description, price, stock, is_active, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (name, description.strip(), float(price), stock, 1 if is_active else 0, now_ts()),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(product_json(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
def admin_update_product(product_id: int):
    require_admin()
    data = body()
    conn = db()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return api_error(404, "Product not found.")

    updates: list[str] = []
    values: list = []

    if "name" in data:
        name = data.get("name")
        if not isinstance(name, str) or not name.strip():
            return api_error(400, "A product name is required.")
        updates.append("name = ?")
        values.append(name.strip())

    if "description" in data:
        description = data.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            return api_error(400, "The description must be text.")
        updates.append("description = ?")
        values.append(description.strip())

    if "price" in data:
        price = to_price(data.get("price"))
        if price is None:
            return api_error(400, "The price must be a positive number.")
        updates.append("price = ?")
        values.append(float(price))

    if "stock" in data:
        stock = to_stock(data.get("stock"))
        if stock is None:
            return api_error(400, "The stock must be a whole number of zero or more.")
        updates.append("stock = ?")
        values.append(stock)

    if "is_active" in data:
        is_active = to_flag(data.get("is_active"))
        if is_active is None:
            return api_error(400, "The active flag must be a boolean.")
        updates.append("is_active = ?")
        values.append(1 if is_active else 0)

    if updates:
        values.append(product_id)
        conn.execute(f"UPDATE products SET {', '.join(updates)} WHERE id = ?", values)
        conn.commit()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_json(row)), 200


@app.delete("/api/admin/products/<int:product_id>")
def admin_delete_product(product_id: int):
    require_admin()
    conn = db()
    row = conn.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return api_error(404, "Product not found.")
    conn.execute("DELETE FROM cart_items WHERE product_id = ?", (product_id,))
    conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
    conn.commit()
    return jsonify({"deleted": True, "id": product_id}), 200


# --------------------------------------------------------------------------
# frontend + health
# --------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error(404, "Unknown API endpoint.")
    candidate = DIST / path
    if candidate.is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return api_error(404, "The frontend has not been built yet.")
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
