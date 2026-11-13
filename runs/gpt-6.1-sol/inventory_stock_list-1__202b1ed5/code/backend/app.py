import hashlib
import os
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
MAX_QUANTITY = 2_147_483_647


class ValidationError(Exception):
    def __init__(self, errors, status=400):
        self.errors = errors
        self.status = status


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path(os.environ.get("DATA_DIR", "./data")) / "inventory.sqlite3"),
        SEED_DEMO=os.environ.get("SEED_DEMO", "1") == "1",
        MAX_CONTENT_LENGTH=64 * 1024,
    )
    if config:
        app.config.update(config)

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=30)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(error=None):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    with app.app_context():
        Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
        connection = db()
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
                location TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity >= 0),
                reorder_level INTEGER NOT NULL CHECK(reorder_level >= 0)
            );
            CREATE TABLE IF NOT EXISTS movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                delta INTEGER NOT NULL CHECK(delta != 0),
                reason TEXT NOT NULL,
                quantity_after INTEGER NOT NULL CHECK(quantity_after >= 0),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS movement_item ON movements(item_id, id DESC);
            CREATE INDEX IF NOT EXISTS item_name ON items(name COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY);
        """)
        with connection:
            initialized = connection.execute(
                "INSERT OR IGNORE INTO metadata(key) VALUES ('initialized')"
            ).rowcount
            if initialized and app.config["SEED_DEMO"]:
                connection.executemany(
                    "INSERT INTO items(name, sku, location, quantity, reorder_level) VALUES (?, ?, ?, ?, ?)",
                    [
                        ("Adjustable wrench", "TLS-001", "Zone A · Rack 01", 48, 10),
                        ("Bubble wrap roll", "PKG-002", "Zone B · Rack 03", 12, 15),
                        ("Cable ties · 100 pack", "ELC-003", "Zone A · Rack 02", 120, 25),
                        ("Cardboard boxes · Medium", "PKG-004", "Zone B · Rack 03", 240, 50),
                        ("Cordless drill", "TLS-005", "Zone A · Rack 01", 8, 10),
                        ("Heavy-duty work gloves", "SFT-006", "Zone C · Rack 04", 64, 20),
                        ("Hex bolt · M10", "FST-007", "Zone A · Rack 02", 560, 100),
                        ("Packing tape · Clear", "PKG-008", "Zone B · Rack 03", 36, 40),
                        ("Safety glasses", "SFT-009", "Zone C · Rack 04", 85, 20),
                        ("Steel shelving bracket", "FST-010", "Zone A · Rack 02", 72, 15),
                        ("Utility knife", "TLS-011", "Zone A · Rack 01", 32, 10),
                        ("Warehouse labels · 500 pack", "PKG-012", "Zone B · Rack 03", 18, 5),
                    ],
                )

    def body():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise ValidationError({"body": "Send a valid JSON object."})
        return data

    def text(data, field, limit=120):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValidationError({field: f"{field.replace('_', ' ').capitalize()} is required."})
        value = value.strip()
        if len(value) > limit:
            raise ValidationError({field: f"Must be {limit} characters or fewer."})
        return value

    def integer(data, field, minimum=0):
        value = data.get(field)
        if type(value) is not int or not minimum <= value <= MAX_QUANTITY:
            raise ValidationError({field: f"Must be a whole number between {minimum} and {MAX_QUANTITY}."})
        return value

    def item_data(data, opening=False):
        result = {field: text(data, field) for field in ("name", "sku", "location")}
        result["reorder_level"] = integer(data, "reorder_level")
        if opening:
            result["quantity"] = integer(data, "quantity")
        return result

    def serialize_item(row):
        result = dict(row)
        result["low_stock"] = result["quantity"] <= result["reorder_level"]
        return result

    def get_item(item_id):
        item = db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if item is None:
            raise ValidationError({"item": "Item not found."}, 404)
        return item

    def current_user():
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None
        token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
        return db().execute(
            "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id "
            "WHERE token_hash = ? AND expires_at > ?",
            (token_hash, datetime.now(UTC).isoformat()),
        ).fetchone()

    def signed_in(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            g.user = current_user()
            if g.user is None:
                raise ValidationError({"auth": "Sign in to manage your inventory."}, 401)
            return view(*args, **kwargs)
        return wrapper

    def credentials():
        data = body()
        username = text(data, "username", 64)
        password = data.get("password")
        if not isinstance(password, str) or not password or len(password) > 128:
            raise ValidationError({"password": "Password is required and must be 128 characters or fewer."})
        return username, password

    def page_args():
        values = []
        for field, default, maximum in (("page", 1, MAX_QUANTITY), ("page_size", 10, 100)):
            try:
                value = int(request.args.get(field, default))
                if not 1 <= value <= maximum:
                    raise ValueError
            except (ValueError, TypeError):
                raise ValidationError({field: f"Must be a whole number between 1 and {maximum}."})
            values.append(value)
        return values

    @app.errorhandler(ValidationError)
    def validation_error(error):
        return {"error": next(iter(error.errors.values())), "errors": error.errors}, error.status

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api"):
            return {"error": error.description}, error.code
        return error

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        username, password = credentials()
        try:
            with db():
                db().execute(
                    "INSERT INTO users(username, password_hash) VALUES (?, ?)",
                    (username, generate_password_hash(password)),
                )
        except sqlite3.IntegrityError:
            raise ValidationError({"username": "This username is already taken."}, 409)
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        username, password = credentials()
        user = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            raise ValidationError({"auth": "Incorrect username or password."}, 401)
        token = secrets.token_urlsafe(32)
        with db():
            db().execute(
                "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"],
                 (datetime.now(UTC) + timedelta(days=30)).isoformat()),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @signed_in
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @signed_in
    def logout():
        token = request.headers["Authorization"].split()[1]
        with db():
            db().execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
        return "", 204

    @app.get("/api/items")
    def list_items():
        page, page_size = page_args()
        clauses, parameters = [], []
        if request.args.get("q", "").strip():
            query = request.args["q"].strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append("(name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')")
            parameters.extend([f"%{query}%", f"%{query}%"])
        if request.args.get("location"):
            clauses.append("location = ?")
            parameters.append(request.args["location"])
        low_stock = request.args.get("low_stock", "").lower()
        if low_stock in ("true", "1"):
            clauses.append("quantity <= reorder_level")
        elif low_stock not in ("", "false", "0"):
            raise ValidationError({"low_stock": "Must be true or false."})
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        total = db().execute("SELECT COUNT(*) FROM items" + where, parameters).fetchone()[0]
        rows = db().execute(
            "SELECT * FROM items" + where + " ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
            [*parameters, page_size, (page - 1) * page_size],
        ).fetchall()
        return {"items": [serialize_item(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.post("/api/items")
    @signed_in
    def add_item():
        data = item_data(body(), opening=True)
        try:
            with db():
                cursor = db().execute(
                    "INSERT INTO items(name, sku, location, reorder_level, quantity) VALUES (?, ?, ?, ?, ?)",
                    tuple(data[field] for field in ("name", "sku", "location", "reorder_level", "quantity")),
                )
        except sqlite3.IntegrityError:
            raise ValidationError({"sku": "An item with this SKU already exists."}, 409)
        return serialize_item(get_item(cursor.lastrowid)), 201

    @app.get("/api/items/<int:item_id>")
    def item_detail(item_id):
        return serialize_item(get_item(item_id))

    @app.put("/api/items/<int:item_id>")
    @signed_in
    def update_item(item_id):
        get_item(item_id)
        data = item_data(body())
        try:
            with db():
                db().execute(
                    "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
                    (*[data[field] for field in ("name", "sku", "location", "reorder_level")], item_id),
                )
        except sqlite3.IntegrityError:
            raise ValidationError({"sku": "An item with this SKU already exists."}, 409)
        return serialize_item(get_item(item_id))

    @app.delete("/api/items/<int:item_id>")
    @signed_in
    def delete_item(item_id):
        get_item(item_id)
        with db():
            db().execute("DELETE FROM items WHERE id = ?", (item_id,))
        return "", 204

    @app.get("/api/items/<int:item_id>/movements")
    def item_movements(item_id):
        get_item(item_id)
        rows = db().execute(
            "SELECT movements.id, item_id, delta, reason, quantity_after, created_at, username "
            "FROM movements JOIN users ON users.id = movements.user_id "
            "WHERE item_id = ? ORDER BY movements.id DESC", (item_id,),
        ).fetchall()
        return {"items": [dict(row) for row in rows]}

    @app.post("/api/items/<int:item_id>/movements")
    @signed_in
    def add_movement(item_id):
        data = body()
        delta = integer(data, "delta", -MAX_QUANTITY)
        if delta == 0:
            raise ValidationError({"delta": "Quantity must be greater than zero."})
        reason = text(data, "reason", 500)
        connection = db()
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            item = get_item(item_id)
            quantity_after = item["quantity"] + delta
            if quantity_after < 0:
                raise ValidationError({"delta": f"Not enough stock. Only {item['quantity']} units are available."})
            if quantity_after > MAX_QUANTITY:
                raise ValidationError({"delta": "This movement exceeds the maximum stock quantity."})
            created_at = datetime.now(UTC).isoformat()
            connection.execute("UPDATE items SET quantity = ? WHERE id = ?", (quantity_after, item_id))
            cursor = connection.execute(
                "INSERT INTO movements(item_id, user_id, delta, reason, quantity_after, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (item_id, g.user["id"], delta, reason, quantity_after, created_at),
            )
        return {"id": cursor.lastrowid, "item_id": item_id, "delta": delta, "reason": reason,
                "quantity_after": quantity_after, "created_at": created_at, "username": g.user["username"]}, 201

    @app.get("/api/overview")
    def overview():
        totals = db().execute(
            "SELECT COUNT(*) AS total_items, COALESCE(SUM(quantity), 0) AS total_units, "
            "COALESCE(SUM(quantity <= reorder_level), 0) AS low_stock FROM items"
        ).fetchone()
        locations = db().execute(
            "SELECT location, COUNT(*) AS item_count, SUM(quantity) AS total_units, "
            "SUM(quantity <= reorder_level) AS low_stock FROM items GROUP BY location ORDER BY location"
        ).fetchall()
        return {**dict(totals), "locations": [dict(row) for row in locations]}

    @app.get("/api/activity")
    def activity():
        page, page_size = page_args()
        total = db().execute("SELECT COUNT(*) FROM movements").fetchone()[0]
        rows = db().execute(
            "SELECT movements.id, item_id, delta, reason, quantity_after, created_at, username, items.name, items.sku "
            "FROM movements JOIN users ON users.id = movements.user_id JOIN items ON items.id = movements.item_id "
            "ORDER BY movements.id DESC LIMIT ? OFFSET ?", (page_size, (page - 1) * page_size),
        ).fetchall()
        return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return {"error": "API endpoint not found."}, 404
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
