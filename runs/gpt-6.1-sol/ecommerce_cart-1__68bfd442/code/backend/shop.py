import hashlib
import os
import re
import secrets
import sqlite3
import time
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
SEED_PRODUCTS = [
    ("Amber glass vase", "Home & living · Warm-toned recycled glass for a stem or two.", 3200, 24),
    ("Arc bookends", "Home & living · A sculptural pair, cast in warm sandstone.", 4800, 18),
    ("Everyday ceramic mug", "Kitchen & dining · Your morning ritual, made a little slower.", 1800, 40),
    ("Linen cushion", "Home & living · Soft, washed linen in a quiet shade of olive.", 4200, 25),
    ("Oak serving board", "Kitchen & dining · Solid oak. For gathering around the table.", 3600, 20),
    ("Ribbed pillar candle", "Home & living · An unscented, slow-burning moment of calm.", 1600, 30),
    ("Softcover notebook", "Everyday essentials · A little space for your next big idea.", 1400, 45),
    ("Stoneware bowl", "Kitchen & dining · Hand-finished stoneware, beautifully imperfect.", 2400, 32),
    ("Terra planter", "Home & living · A terracotta home for something green.", 2800, 22),
    ("Woven cotton throw", "Home & living · An easy layer for your favorite corner.", 6400, 15),
    ("Woven market tote", "Everyday essentials · Natural cotton for wherever the day takes you.", 2600, 28),
    ("Wooden desk tray", "Everyday essentials · A place for the small things, in solid ash.", 2200, 20),
]


class APIError(Exception):
    def __init__(self, message, status=400):
        self.message = message
        self.status = status


def connect_database(path):
    connection = sqlite3.connect(path, timeout=20)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 20000")
    return connection


def initialize_database(path, admin_password):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    connection = connect_database(path)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
                stock INTEGER NOT NULL CHECK(stock >= 0),
                is_active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS cart_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                quantity INTEGER NOT NULL CHECK(quantity > 0),
                UNIQUE(user_id, product_id)
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        """)
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM products LIMIT 1").fetchone():
            connection.executemany(
                "INSERT INTO products (name, description, price_cents, stock) VALUES (?, ?, ?, ?)",
                SEED_PRODUCTS,
            )
        admin = connection.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
        password_changed = admin and (
            not admin_password
            or not admin["password_hash"]
            or not check_password_hash(admin["password_hash"], admin_password)
        )
        if not admin:
            connection.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                (generate_password_hash(admin_password) if admin_password else "",),
            )
        elif password_changed:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
            connection.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (generate_password_hash(admin_password) if admin_password else "", admin["id"]),
            )
        connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        connection.commit()
    finally:
        connection.close()


def product_json(product):
    return {
        "id": product["id"],
        "name": product["name"],
        "description": product["description"],
        "price": product["price_cents"] / 100,
        "stock": product["stock"],
        "is_active": bool(product["is_active"]),
    }


def item_json(item):
    return {
        "id": item["id"],
        "product_id": item["product_id"],
        "quantity": item["quantity"],
        "name": item["name"],
        "unit_price": item["price_cents"] / 100,
        "line_total": item["quantity"] * item["price_cents"] / 100,
    }


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise APIError("Please send a JSON object.")
    return body


def integer(value, name, minimum=0):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= 1_000_000:
        raise APIError(f"{name} must be a whole number between {minimum} and 1000000.")
    return value


def validated_product(body, partial=False):
    fields = {"name", "description", "price", "stock", "is_active"}
    if set(body) - fields:
        raise APIError("Unknown product field.")
    if not partial and ("name" not in body or "price" not in body):
        raise APIError("Name and price are required.")
    if not body and partial:
        raise APIError("Provide at least one field to update.")
    result = {}
    for field in ("name", "description"):
        if field in body:
            value = body[field]
            if not isinstance(value, str) or len(value) > (150 if field == "name" else 2000):
                raise APIError(f"{field.capitalize()} must be valid text.")
            if field == "name" and not value.strip():
                raise APIError("Product name cannot be empty.")
            result[field] = value.strip()
    if "price" in body:
        try:
            if isinstance(body["price"], bool):
                raise InvalidOperation
            price = Decimal(str(body["price"]))
            if not price.is_finite() or not 0 <= price <= 1_000_000 or price * 100 != (price * 100).to_integral_value():
                raise InvalidOperation
            result["price_cents"] = int(price * 100)
        except (InvalidOperation, ValueError, TypeError):
            raise APIError("Price must be a non-negative amount with at most two decimal places.") from None
    if "stock" in body:
        result["stock"] = integer(body["stock"], "Stock")
    if "is_active" in body:
        if not isinstance(body["is_active"], bool):
            raise APIError("Active status must be true or false.")
        result["is_active"] = int(body["is_active"])
    if not partial:
        result.setdefault("description", "")
        result.setdefault("stock", 0)
        result.setdefault("is_active", 1)
    return result


def create_app(config=None):
    application = Flask(__name__, static_folder=None)
    application.config.update(
        DATABASE=str(Path.cwd() / "data" / "shop.sqlite3"),
        ADMIN_PASSWORD=os.environ.get("ADMIN_PASSWORD", ""),
        MAX_CONTENT_LENGTH=64 * 1024,
    )
    if config:
        application.config.update(config)
    initialize_database(application.config["DATABASE"], application.config["ADMIN_PASSWORD"])

    def db():
        if "db" not in g:
            g.db = connect_database(application.config["DATABASE"])
        return g.db

    @application.teardown_appcontext
    def close_database(error=None):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    @application.errorhandler(APIError)
    def api_error(error):
        return {"message": error.message}, error.status

    @application.errorhandler(HTTPException)
    def http_error(error):
        return {"message": error.description}, error.code

    @application.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def authenticated(admin_only=False):
        def decorator(view):
            @wraps(view)
            def wrapped(*args, **kwargs):
                auth = request.headers.get("Authorization", "").split()
                if len(auth) != 2 or auth[0].lower() != "bearer":
                    raise APIError("Please sign in to continue.", 401)
                token_hash = hashlib.sha256(auth[1].encode()).hexdigest()
                user = (
                    db()
                    .execute(
                        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
                        "WHERE s.token_hash = ? AND s.expires_at > ?",
                        (token_hash, int(time.time())),
                    )
                    .fetchone()
                )
                if user is None or (user["is_admin"] and not application.config["ADMIN_PASSWORD"]):
                    raise APIError("Your session has expired. Please sign in again.", 401)
                if admin_only and not user["is_admin"]:
                    raise APIError("Only the admin can manage products.", 403)
                g.user = user
                g.token_hash = token_hash
                return view(*args, **kwargs)

            return wrapped

        return decorator

    def credentials():
        body = json_body()
        username, password = body.get("username"), body.get("password")
        if not isinstance(username, str) or not re.fullmatch(r"[a-zA-Z0-9_.-]{1,32}", username):
            raise APIError("Use a username of 1–32 letters, numbers, dots, underscores or hyphens.")
        if not isinstance(password, str) or not 1 <= len(password) <= 256:
            raise APIError("Password must be between 1 and 256 characters.")
        return username, password

    @application.get("/api/health")
    def health():
        return {"status": "ok"}

    @application.post("/api/auth/register")
    def register():
        username, password = credentials()
        if username.lower() == "admin":
            raise APIError("That username is reserved.", 409)
        try:
            with db():
                cursor = db().execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, generate_password_hash(password)),
                )
        except sqlite3.IntegrityError:
            raise APIError("That username is already taken.", 409) from None
        return {"id": cursor.lastrowid, "username": username}, 201

    @application.post("/api/auth/login")
    def login():
        username, password = credentials()
        user = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if (
            user is None
            or not user["password_hash"]
            or (user["is_admin"] and not application.config["ADMIN_PASSWORD"])
            or not check_password_hash(user["password_hash"], password)
        ):
            raise APIError("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(48)
        with db():
            db().execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"], int(time.time()) + 30 * 86400),
            )
        return {"token": token}

    @application.get("/api/auth/me")
    @authenticated()
    def me():
        return {"id": g.user["id"], "username": g.user["username"], "is_admin": bool(g.user["is_admin"])}

    @application.post("/api/auth/logout")
    @authenticated()
    def logout():
        with db():
            db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return {"message": "Signed out."}

    def paged_products(include_inactive=False):
        try:
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("page_size", "8"))
        except ValueError:
            raise APIError("Page and page_size must be positive whole numbers.") from None
        if not 1 <= page <= 1_000_000 or not 1 <= page_size <= 100:
            raise APIError("Page must be positive and page_size must be between 1 and 100.")
        query = request.args.get("q", "").strip()[:200]
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where = "(name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
        if not include_inactive:
            where += " AND is_active = 1"
        parameters = (f"%{escaped}%", f"%{escaped}%")
        total = db().execute(f"SELECT COUNT(*) FROM products WHERE {where}", parameters).fetchone()[0]
        products = (
            db()
            .execute(
                f"SELECT * FROM products WHERE {where} ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
                (*parameters, page_size, (page - 1) * page_size),
            )
            .fetchall()
        )
        return {
            "items": [product_json(product) for product in products],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @application.get("/api/products")
    def products():
        return paged_products()

    @application.get("/api/products/<int:product_id>")
    def product_detail(product_id):
        product = db().execute("SELECT * FROM products WHERE id = ? AND is_active = 1", (product_id,)).fetchone()
        if product is None:
            raise APIError("Product not found.", 404)
        return product_json(product)

    def cart_item(item_id):
        item = (
            db()
            .execute(
                "SELECT c.*, p.name, p.price_cents, p.stock, p.is_active FROM cart_items c "
                "JOIN products p ON p.id = c.product_id WHERE c.id = ? AND c.user_id = ?",
                (item_id, g.user["id"]),
            )
            .fetchone()
        )
        if item is None:
            raise APIError("Cart item not found.", 404)
        return item

    def available(product, quantity):
        if not product["is_active"]:
            raise APIError("This product is no longer available.", 404)
        if product["stock"] == 0:
            raise APIError("This product is out of stock.")
        if quantity > product["stock"]:
            raise APIError(f"Only {product['stock']} available. Please choose a smaller quantity.")

    @application.get("/api/cart")
    @authenticated()
    def cart():
        items = (
            db()
            .execute(
                "SELECT c.*, p.name, p.price_cents FROM cart_items c JOIN products p ON p.id = c.product_id "
                "WHERE c.user_id = ? AND p.is_active = 1 ORDER BY c.id",
                (g.user["id"],),
            )
            .fetchall()
        )
        return {
            "items": [item_json(item) for item in items],
            "subtotal": sum(item["quantity"] * item["price_cents"] for item in items) / 100,
        }

    @application.post("/api/cart")
    @authenticated()
    def add_to_cart():
        body = json_body()
        product_id = integer(body.get("product_id"), "Product ID", 1)
        quantity = integer(body.get("quantity"), "Quantity", 1)
        with db():
            db().execute("BEGIN IMMEDIATE")
            product = db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
            if product is None:
                raise APIError("Product not found.", 404)
            existing = (
                db()
                .execute("SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?", (g.user["id"], product_id))
                .fetchone()
            )
            new_quantity = quantity + (existing["quantity"] if existing else 0)
            available(product, new_quantity)
            if existing:
                db().execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (new_quantity, existing["id"]))
                item_id = existing["id"]
            else:
                cursor = db().execute(
                    "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
                    (g.user["id"], product_id, quantity),
                )
                item_id = cursor.lastrowid
            item = item_json(cart_item(item_id))
        return item, 201

    @application.patch("/api/cart/<int:item_id>")
    @authenticated()
    def update_cart_item(item_id):
        with db():
            db().execute("BEGIN IMMEDIATE")
            item = cart_item(item_id)
            quantity = integer(json_body().get("quantity"), "Quantity", 1)
            available(item, quantity)
            db().execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item_id))
            result = item_json(cart_item(item_id))
        return result

    @application.delete("/api/cart/<int:item_id>")
    @authenticated()
    def remove_cart_item(item_id):
        with db():
            cart_item(item_id)
            db().execute("DELETE FROM cart_items WHERE id = ? AND user_id = ?", (item_id, g.user["id"]))
        return "", 204

    @application.get("/api/admin/products")
    @authenticated(admin_only=True)
    def admin_products():
        return paged_products(include_inactive=True)

    @application.post("/api/admin/products")
    @authenticated(admin_only=True)
    def create_product():
        fields = validated_product(json_body())
        with db():
            cursor = db().execute(
                f"INSERT INTO products ({', '.join(fields)}) VALUES ({', '.join('?' for _ in fields)})",
                tuple(fields.values()),
            )
            product = db().execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return product_json(product), 201

    @application.patch("/api/admin/products/<int:product_id>")
    @authenticated(admin_only=True)
    def update_product(product_id):
        if db().execute("SELECT 1 FROM products WHERE id = ?", (product_id,)).fetchone() is None:
            raise APIError("Product not found.", 404)
        fields = validated_product(json_body(), partial=True)
        with db():
            db().execute(
                f"UPDATE products SET {', '.join(f'{field} = ?' for field in fields)} WHERE id = ?",
                (*fields.values(), product_id),
            )
            product = db().execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        return product_json(product)

    @application.get("/")
    @application.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            raise APIError("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return application
