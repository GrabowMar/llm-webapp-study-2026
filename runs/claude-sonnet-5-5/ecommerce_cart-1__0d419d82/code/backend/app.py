"""Shop API (Flask + SQLite) that also serves the frontend build."""

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
import time
from decimal import Decimal, InvalidOperation
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "shop.db"
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SESSION_TTL = 7 * 24 * 3600
MAX_PRICE_CENTS = 100_000_000
MAX_STOCK = 1_000_000
DUMMY_HASH = generate_password_hash(secrets.token_hex(8))

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    UNIQUE (user_id, product_id)
);
"""

SEED = [
    ("Classic Mug", "Ceramic mug, 350 ml.", 1200, 40),
    ("Canvas Tote Bag", "Sturdy cotton tote bag.", 1800, 25),
    ("Notebook A5", "Dotted notebook with 120 pages.", 950, 60),
    ("Ballpoint Pen Set", "Set of five smooth-writing pens.", 700, 100),
    ("Desk Lamp", "Adjustable LED desk lamp.", 3499, 15),
    ("Wireless Mouse", "Compact 2.4 GHz wireless mouse.", 2250, 30),
    ("Sticker Pack", "Twenty weatherproof vinyl stickers.", 450, 200),
    ("Water Bottle", "Insulated steel bottle, 500 ml.", 2100, 35),
    ("Phone Stand", "Foldable aluminium phone stand.", 1399, 20),
    ("Wool Beanie", "Warm knitted beanie.", 1650, 12),
]


class ApiError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        if conn.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO products (name, description, price_cents, stock) VALUES (?, ?, ?, ?)",
                SEED,
            )
        conn.execute(
            "DELETE FROM sessions WHERE expires_at < ? OR user_id IN (SELECT id FROM users WHERE is_admin = 1)",
            (int(time.time()),),
        )
        conn.execute("COMMIT")
    finally:
        conn.close()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.errorhandler(ApiError)
def handle_api_error(e):
    return jsonify(error=e.message), e.status


@app.errorhandler(HTTPException)
def handle_http_error(e):
    if request.path.startswith("/api/") or request.path == "/api":
        messages = {
            404: "Not found",
            405: "Method not allowed",
            413: "Request body too large",
        }
        return jsonify(error=messages.get(e.code, e.description or e.name)), e.code
    return e


@app.errorhandler(Exception)
def handle_unexpected(e):
    app.logger.exception("Unhandled error")
    return jsonify(error="Internal server error"), 500


def body_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if hasattr(g, "user"):
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        row = db().execute(
            "SELECT u.id, u.username, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token_hash = ? AND s.expires_at > ?",
            (hash_token(parts[1].strip()), int(time.time())),
        ).fetchone()
        if row and (not row["is_admin"] or ADMIN_PASSWORD):
            g.user = row
    return g.user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


def require_admin():
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin access required")
    return user


def issue_token(conn, user_id):
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, int(time.time()) + SESSION_TTL),
    )
    return token


def money(cents):
    return cents / 100


def parse_credentials():
    data = body_json()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    return username.strip(), password


@app.post("/api/auth/register")
def register():
    username, password = parse_credentials()
    if not username:
        raise ApiError(400, "username must not be empty")
    if len(username) > 64:
        raise ApiError(400, "username must be at most 64 characters")
    if not password:
        raise ApiError(400, "password must not be empty")
    if len(password) > 256:
        raise ApiError(400, "password must be at most 256 characters")
    key = username.casefold()
    if key == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken")
    try:
        cur = db().execute(
            "INSERT INTO users (username, username_key, password_hash) VALUES (?, ?, ?)",
            (username, key, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify(id=cur.lastrowid, username=username), 201


@app.post("/api/auth/login")
def login():
    username, password = parse_credentials()
    conn = db()
    key = username.casefold()
    if key == ADMIN_USERNAME:
        ok = bool(ADMIN_PASSWORD) and hmac.compare_digest(
            password.encode(), ADMIN_PASSWORD.encode()
        )
        if not ok:
            raise ApiError(401, "Invalid username or password")
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT id FROM users WHERE username_key = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            cur = conn.execute(
                "INSERT INTO users (username, username_key, password_hash, is_admin) VALUES (?, ?, '!', 1)",
                (ADMIN_USERNAME, ADMIN_USERNAME),
            )
            user_id = cur.lastrowid
        else:
            user_id = row["id"]
            conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (user_id,))
        token = issue_token(conn, user_id)
        conn.execute("COMMIT")
        return jsonify(token=token, username=ADMIN_USERNAME, is_admin=True)
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username_key = ? AND is_admin = 0",
        (key,),
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = issue_token(conn, row["id"])
    return jsonify(token=token, username=row["username"], is_admin=False)


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify(username=user["username"], is_admin=bool(user["is_admin"]))


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if require_user() and len(parts) == 2:
        db().execute(
            "DELETE FROM sessions WHERE token_hash = ?", (hash_token(parts[1].strip()),)
        )
    return "", 204


def product_json(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": money(row["price_cents"]),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def parse_int(value, field, minimum, maximum=None):
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError(400, f"{field} must be an integer")
    if value < minimum:
        raise ApiError(400, f"{field} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise ApiError(400, f"{field} must be at most {maximum}")
    return value


def parse_price(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(400, "price must be a number")
    if isinstance(value, float) and not math.isfinite(value):
        raise ApiError(400, "price must be a finite number")
    try:
        dec = Decimal(repr(value))
    except InvalidOperation:
        raise ApiError(400, "price must be a number")
    if dec < 0:
        raise ApiError(400, "price must not be negative")
    cents = dec * 100
    if cents != cents.to_integral_value():
        raise ApiError(400, "price must have at most two decimal places")
    cents = int(cents)
    if cents > MAX_PRICE_CENTS:
        raise ApiError(400, "price is too large")
    return cents


def parse_text(value, field, max_len, required):
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be a string")
    value = value.strip()
    if required and not value:
        raise ApiError(400, f"{field} must not be empty")
    if len(value) > max_len:
        raise ApiError(400, f"{field} must be at most {max_len} characters")
    return value


def parse_bool(value, field):
    if not isinstance(value, bool):
        raise ApiError(400, f"{field} must be true or false")
    return value


def parse_page_args():
    def arg(name, default):
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            val = int(raw)
        except ValueError:
            raise ApiError(400, f"{name} must be an integer")
        if val < 1:
            raise ApiError(400, f"{name} must be at least 1")
        return val

    page = arg("page", 1)
    page_size = min(arg("page_size", 12), 100)
    return page, page_size


def list_products(active_only):
    page, page_size = parse_page_args()
    where, params = [], []
    if active_only:
        where.append("is_active = 1")
    q = request.args.get("q", "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')")
        params += [f"%{escaped}%"] * 2
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM products {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM products {clause} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        items=[product_json(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.get("/api/products")
def products():
    return list_products(True)


@app.get("/api/products/<int:product_id>")
def product(product_id):
    row = db().execute(
        "SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Product not found")
    return jsonify(product_json(row))


@app.get("/api/admin/products")
def admin_products():
    require_admin()
    return list_products(False)


@app.post("/api/admin/products")
def admin_create_product():
    require_admin()
    data = body_json()
    if "name" not in data or "price" not in data:
        raise ApiError(400, "name and price are required")
    name = parse_text(data["name"], "name", 200, True)
    description = parse_text(data.get("description", ""), "description", 2000, False)
    price = parse_price(data["price"])
    stock = parse_int(data.get("stock", 0), "stock", 0, MAX_STOCK)
    active = parse_bool(data.get("is_active", True), "is_active")
    conn = db()
    cur = conn.execute(
        "INSERT INTO products (name, description, price_cents, stock, is_active) VALUES (?, ?, ?, ?, ?)",
        (name, description, price, stock, int(active)),
    )
    row = conn.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(product_json(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
def admin_update_product(product_id):
    require_admin()
    data = body_json()
    updates = {}
    if "name" in data:
        updates["name"] = parse_text(data["name"], "name", 200, True)
    if "description" in data:
        updates["description"] = parse_text(data["description"], "description", 2000, False)
    if "price" in data:
        updates["price_cents"] = parse_price(data["price"])
    if "stock" in data:
        updates["stock"] = parse_int(data["stock"], "stock", 0, MAX_STOCK)
    if "is_active" in data:
        updates["is_active"] = int(parse_bool(data["is_active"], "is_active"))
    conn = db()
    if not conn.execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone():
        raise ApiError(404, "Product not found")
    if updates:
        sets = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(
            f"UPDATE products SET {sets} WHERE id = ?", [*updates.values(), product_id]
        )
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_json(row))


CART_SELECT = (
    "SELECT c.id, c.product_id, c.quantity, p.name, p.price_cents "
    "FROM cart_items c JOIN products p ON p.id = c.product_id "
)


def cart_item_json(row):
    return {
        "id": row["id"],
        "product_id": row["product_id"],
        "quantity": row["quantity"],
        "name": row["name"],
        "unit_price": money(row["price_cents"]),
        "line_total": money(row["price_cents"] * row["quantity"]),
    }


@app.get("/api/cart")
def get_cart():
    user = require_user()
    rows = db().execute(
        CART_SELECT + "WHERE c.user_id = ? AND p.is_active = 1 ORDER BY c.id",
        (user["id"],),
    ).fetchall()
    subtotal = sum(r["price_cents"] * r["quantity"] for r in rows)
    return jsonify(items=[cart_item_json(r) for r in rows], subtotal=money(subtotal))


def check_stock(quantity, stock):
    if quantity > stock:
        raise ApiError(
            409,
            "Out of stock" if stock == 0 else f"Only {stock} in stock",
        )


@app.post("/api/cart")
def add_to_cart():
    user = require_user()
    data = body_json()
    if "product_id" not in data:
        raise ApiError(400, "product_id is required")
    product_id = parse_int(data["product_id"], "product_id", 1)
    quantity = parse_int(data.get("quantity", 1), "quantity", 1, MAX_STOCK)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        prod = conn.execute(
            "SELECT stock FROM products WHERE id = ? AND is_active = 1", (product_id,)
        ).fetchone()
        if prod is None:
            raise ApiError(404, "Product not found")
        existing = conn.execute(
            "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
            (user["id"], product_id),
        ).fetchone()
        if existing:
            check_stock(existing["quantity"] + quantity, prod["stock"])
            conn.execute(
                "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
                (quantity, existing["id"]),
            )
            item_id, status = existing["id"], 201
        else:
            check_stock(quantity, prod["stock"])
            item_id = conn.execute(
                "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
                (user["id"], product_id, quantity),
            ).lastrowid
            status = 201
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    row = conn.execute(CART_SELECT + "WHERE c.id = ?", (item_id,)).fetchone()
    return jsonify(cart_item_json(row)), status


def own_item(user, item_id, active_only):
    sql = CART_SELECT + "WHERE c.id = ? AND c.user_id = ?"
    if active_only:
        sql += " AND p.is_active = 1"
    row = db().execute(sql, (item_id, user["id"])).fetchone()
    if row is None:
        raise ApiError(404, "Cart item not found")
    return row


@app.patch("/api/cart/<int:item_id>")
def update_cart_item(item_id):
    user = require_user()
    data = body_json()
    if "quantity" not in data:
        raise ApiError(400, "quantity is required")
    quantity = parse_int(data["quantity"], "quantity", 1, MAX_STOCK)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        item = own_item(user, item_id, True)
        stock = conn.execute(
            "SELECT stock FROM products WHERE id = ?", (item["product_id"],)
        ).fetchone()["stock"]
        check_stock(quantity, stock)
        conn.execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return jsonify(cart_item_json(own_item(user, item_id, True)))


@app.delete("/api/cart/<int:item_id>")
def delete_cart_item(item_id):
    user = require_user()
    own_item(user, item_id, False)
    db().execute("DELETE FROM cart_items WHERE id = ?", (item_id,))
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
