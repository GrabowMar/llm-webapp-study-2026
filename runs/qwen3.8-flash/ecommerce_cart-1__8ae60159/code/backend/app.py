"""Flask entry point for the shop API + frontend server."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path

from flask import Flask, abort, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "shop.db"

PBKDF2_ITERATIONS = 120_000

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


# --------------------------------------------------------------------------- #
# database helpers

def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g._db = conn
    return conn


@app.teardown_appcontext
def close_db(_exc):
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    pw_salt TEXT,
    pw_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    created_at REAL NOT NULL,
    UNIQUE (user_id, product_id)
);
"""

SEED_PRODUCTS = [
    ("Anchor Mug", "Stoneware mug with a little anchor on the side.", 9.90, 40),
    ("Bamboo Cutting Board", "Durable board with a juice groove.", 24.50, 18),
    ("Cast Iron Skillet", "Pre-seasoned 26 cm skillet.", 34.90, 12),
    ("Cotton Tea Towels", "Pack of three waffle-weave towels.", 12.00, 30),
    ("Enamel Colander", "Chip-resistant enamel over steel.", 17.25, 15),
    ("Glass Storage Jars", "Set of four airtight jars.", 21.80, 22),
    ("Kitchen Scale", "Digital scale with a 5 kg capacity.", 29.95, 16),
    ("Steel Whisk", "Balanced whisk with a hanging loop.", 8.40, 50),
]


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None)
    try:
        conn.execute("BEGIN IMMEDIATE")
        for statement in SCHEMA.split(";"):
            if statement.strip():
                conn.execute(statement)
        count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO products (name, description, price, stock) VALUES (?, ?, ?, ?)",
                SEED_PRODUCTS,
            )
        conn.execute("COMMIT")
    finally:
        conn.close()


def hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return salt.hex(), dk.hex()


def verify_password(password: str, salt_hex: str, expected_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return hmac.compare_digest(dk.hex(), expected_hex)


# --------------------------------------------------------------------------- #
# auth context

def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_login():
    user = current_user()
    if user is None:
        abort(json_error("Authentication required", 401))
    return user


def require_admin():
    user = require_login()
    if not user["is_admin"]:
        abort(json_error("Admin access required", 403))
    return user


# --------------------------------------------------------------------------- #
# serialisation

def product_json(row: sqlite3.Row):
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row["description"],
        "price": round(row["price"], 2),
        "stock": row["stock"],
        "is_active": bool(row["is_active"]),
    }


def get_cart(user_id: int):
    rows = get_db().execute(
        "SELECT c.id, c.product_id, c.quantity, p.name, p.price"
        " FROM cart_items c JOIN products p ON p.id = c.product_id"
        " WHERE c.user_id = ? AND p.is_active = 1"
        " ORDER BY c.created_at ASC, c.id ASC",
        (user_id,),
    ).fetchall()
    items = []
    subtotal = 0.0
    for r in rows:
        line_total = round(r["quantity"] * r["price"], 2)
        subtotal += line_total
        items.append(
            {
                "id": r["id"],
                "product_id": r["product_id"],
                "quantity": r["quantity"],
                "name": r["name"],
                "unit_price": round(r["price"], 2),
                "line_total": line_total,
            }
        )
    return {"items": items, "subtotal": round(subtotal, 2)}


def json_error(message: str, status: int):
    response = jsonify({"error": message})
    response.status_code = status
    return response


def body_json(required: bool = True):
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        if required:
            abort(json_error("Request body must be a JSON object", 400))
        return {}
    return data


# --------------------------------------------------------------------------- #
# validation helpers

def parse_str(data, field, *, required=True, allow_blank=False, max_len=2000):
    if field not in data:
        if required:
            abort(json_error(f"'{field}' is required", 400))
        return None
    value = data[field]
    if not isinstance(value, str):
        abort(json_error(f"'{field}' must be a string", 400))
    value = value.strip()
    if not allow_blank and not value:
        abort(json_error(f"'{field}' must not be empty", 400))
    if len(value) > max_len:
        abort(json_error(f"'{field}' is too long", 400))
    return value


def parse_number(data, field, *, required=True, minimum=None):
    if field not in data:
        if required:
            abort(json_error(f"'{field}' is required", 400))
        return None
    value = data[field]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        abort(json_error(f"'{field}' must be a number", 400))
    if minimum is not None and value < minimum:
        abort(json_error(f"'{field}' must be at least {minimum}", 400))
    return value


def parse_int(data, field, *, required=True, minimum=None):
    if field not in data:
        if required:
            abort(json_error(f"'{field}' is required", 400))
        return None
    value = data[field]
    if isinstance(value, bool) or not isinstance(value, int):
        abort(json_error(f"'{field}' must be an integer", 400))
    if minimum is not None and value < minimum:
        abort(json_error(f"'{field}' must be at least {minimum}", 400))
    return value


def parse_bool(data, field, *, required=True, default=None):
    if field not in data:
        if required:
            abort(json_error(f"'{field}' is required", 400))
        return default
    value = data[field]
    if not isinstance(value, bool):
        abort(json_error(f"'{field}' must be a boolean", 400))
    return value


# --------------------------------------------------------------------------- #
# health

@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# accounts

@app.post("/api/auth/register")
def register():
    data = body_json()
    username = parse_str(data, "username", max_len=64)
    password = parse_str(data, "password", max_len=256)
    if not USERNAME_RE.match(username):
        return json_error(
            "Username must be 3-32 characters using letters, digits, '_', '-' or '.'", 400
        )
    if username.lower() == "admin":
        return json_error("Username is reserved", 409)
    salt_hex, hash_hex = hash_password(password)
    try:
        get_db().execute(
            "INSERT INTO users (username, pw_salt, pw_hash, is_admin) VALUES (?, ?, ?, 0)",
            (username, salt_hex, hash_hex),
        )
    except sqlite3.IntegrityError:
        return json_error("Username is already taken", 409)
    get_db().commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    username = parse_str(data, "username")
    password = parse_str(data, "password")

    if username.lower() == "admin":
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if not admin_password or not hmac.compare_digest(password, admin_password):
            return json_error("Invalid username or password", 401)
        db = get_db()
        row = db.execute("SELECT id FROM users WHERE username = ?", ("admin",)).fetchone()
        if row is None:
            db.execute(
                "INSERT INTO users (username, pw_salt, pw_hash, is_admin) VALUES (?, NULL, NULL, 1)",
                ("admin",),
            )
            row = db.execute("SELECT id FROM users WHERE username = ?", ("admin",)).fetchone()
            db.commit()
        user_id = row["id"]
    else:
        row = get_db().execute(
            "SELECT id, pw_salt, pw_hash FROM users WHERE username = ? AND is_admin = 0",
            (username,),
        ).fetchone()
        if (
            row is None
            or row["pw_hash"] is None
            or not verify_password(password, row["pw_salt"], row["pw_hash"])
        ):
            return json_error("Invalid username or password", 401)
        user_id = row["id"]

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, time.time()),
    )
    get_db().commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = require_login()
    return jsonify({"username": user["username"], "is_admin": bool(user["is_admin"])})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[len("Bearer "):].strip()
        if token:
            get_db().execute("DELETE FROM tokens WHERE token = ?", (token,))
            get_db().commit()
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- #
# catalogue

@app.get("/api/products")
def list_products():
    db = get_db()
    q = (request.args.get("q") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        return json_error("'page' must be an integer", 400)
    try:
        page_size = int(request.args.get("page_size", 12))
    except ValueError:
        return json_error("'page_size' must be an integer", 400)
    page_size = max(1, min(page_size, 100))

    where = "is_active = 1"
    params = []
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        where += " AND (name LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
        params.extend([like, like])

    total = db.execute(f"SELECT COUNT(*) FROM products WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM products WHERE {where} ORDER BY name COLLATE NOCASE ASC, id ASC"
        " LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [product_json(r) for r in rows],
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
        return json_error("Product not found", 404)
    return jsonify(product_json(row))


# --------------------------------------------------------------------------- #
# cart

@app.get("/api/cart")
def cart():
    user = require_login()
    return jsonify(get_cart(user["id"]))


@app.post("/api/cart")
def add_to_cart():
    user = require_login()
    data = body_json()
    product_id = parse_int(data, "product_id", minimum=1)
    quantity = parse_int(data, "quantity", minimum=1)
    db = get_db()
    product = db.execute(
        "SELECT id FROM products WHERE id = ? AND is_active = 1", (product_id,)
    ).fetchone()
    if product is None:
        return json_error("Product not found", 404)
    existing = db.execute(
        "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
        (user["id"], product_id),
    ).fetchone()
    if existing is None:
        db.execute(
            "INSERT INTO cart_items (user_id, product_id, quantity, created_at)"
            " VALUES (?, ?, ?, ?)",
            (user["id"], product_id, quantity, time.time()),
        )
    else:
        db.execute(
            "UPDATE cart_items SET quantity = quantity + ? WHERE id = ?",
            (quantity, existing["id"]),
        )
    db.commit()
    return jsonify(get_cart(user["id"])), 201


def load_own_cart_item(item_id: int, user_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM cart_items WHERE id = ? AND user_id = ?", (item_id, user_id)
    ).fetchone()
    if row is None:
        abort(json_error("Cart item not found", 404))
    return row


@app.patch("/api/cart/<int:item_id>")
def update_cart_item(item_id: int):
    user = require_login()
    item = load_own_cart_item(item_id, user["id"])
    data = body_json()
    if "quantity" not in data:
        return json_error("'quantity' is required", 400)
    quantity = parse_int(data, "quantity", minimum=1)
    get_db().execute("UPDATE cart_items SET quantity = ? WHERE id = ?", (quantity, item["id"]))
    get_db().commit()
    return jsonify(get_cart(user["id"]))


@app.delete("/api/cart/<int:item_id>")
def delete_cart_item(item_id: int):
    user = require_login()
    item = load_own_cart_item(item_id, user["id"])
    get_db().execute("DELETE FROM cart_items WHERE id = ?", (item["id"],))
    get_db().commit()
    return jsonify(get_cart(user["id"]))


# --------------------------------------------------------------------------- #
# admin catalogue management

@app.post("/api/admin/products")
def admin_create_product():
    require_admin()
    data = body_json()
    name = parse_str(data, "name", max_len=200)
    description = parse_str(data, "description", required=False, allow_blank=True) or ""
    price = parse_number(data, "price", minimum=0)
    stock = parse_int(data, "stock", required=False, minimum=0)
    is_active = parse_bool(data, "is_active", required=False, default=True)
    db = get_db()
    cur = db.execute(
        "INSERT INTO products (name, description, price, stock, is_active) VALUES (?, ?, ?, ?, ?)",
        (name, description, round(price, 2), 0 if stock is None else stock, int(bool(is_active))),
    )
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(product_json(row)), 201


@app.patch("/api/admin/products/<int:product_id>")
def admin_update_product(product_id: int):
    require_admin()
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if row is None:
        return json_error("Product not found", 404)
    data = body_json()

    updates = {}
    name = parse_str(data, "name", required=False, max_len=200)
    if name is not None:
        updates["name"] = name
    description = parse_str(data, "description", required=False, allow_blank=True)
    if description is not None:
        updates["description"] = description
    price = parse_number(data, "price", required=False, minimum=0)
    if price is not None:
        updates["price"] = round(price, 2)
    stock = parse_int(data, "stock", required=False, minimum=0)
    if stock is not None:
        updates["stock"] = stock
    is_active = parse_bool(data, "is_active", required=False)
    if is_active is not None:
        updates["is_active"] = int(bool(is_active))

    if not updates:
        return json_error("No valid fields to update", 400)
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    db.execute(f"UPDATE products SET {set_clause} WHERE id = ?", [*updates.values(), product_id])
    db.commit()
    row = db.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return jsonify(product_json(row))


@app.get("/api/admin/products")
def admin_list_products():
    require_admin()
    rows = get_db().execute(
        "SELECT * FROM products ORDER BY name COLLATE NOCASE ASC, id ASC"
    ).fetchall()
    return jsonify([product_json(r) for r in rows])


# --------------------------------------------------------------------------- #
# frontend

@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return index()


@app.errorhandler(405)
def method_not_allowed(_e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed"}), 405
    return index()


def index():
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return "Frontend not built yet.", 503


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return index()


init_db()
