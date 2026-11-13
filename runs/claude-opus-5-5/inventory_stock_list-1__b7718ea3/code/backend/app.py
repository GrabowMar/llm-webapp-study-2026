"""Flask entry point."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "inventory.db"

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name COLLATE NOCASE, id);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id, id);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or {}


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


init_db()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def validation_error(errors):
    first = next(iter(errors.values()))
    raise ApiError(400, first, errors)


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if row:
            g.user = {"id": row["id"], "username": row["username"], "token": token}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


def parse_int(value, field, errors, minimum=None, required=False, default=None, label=None):
    field_name = field
    field = label or field
    if value is None:
        if required:
            errors[field_name] = f"{field} is required"
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        errors[field_name] = f"{field} must be an integer"
        return None
    if isinstance(value, float):
        if not value.is_integer():
            errors[field_name] = f"{field} must be an integer"
            return None
        value = int(value)
    if minimum is not None and value < minimum:
        errors[field_name] = f"{field} must be at least {minimum}"
        return None
    if abs(value) > 10**12:
        errors[field_name] = f"{field} is too large"
        return None
    return value


def parse_str(value, field, errors, required=True, max_len=200, label=None):
    label = label or field
    if value is None:
        if required:
            errors[field] = f"{label} is required"
        return ""
    if not isinstance(value, str):
        errors[field] = f"{label} must be a string"
        return ""
    value = value.strip()
    if required and not value:
        errors[field] = f"{label} is required"
    elif len(value) > max_len:
        errors[field] = f"{label} must be at most {max_len} characters"
    return value


# ---------------------------------------------------------------- serializers


def item_json(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def movement_json(row):
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def get_item_or_404(item_id):
    row = db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Item not found")
    return row


# ---------------------------------------------------------------------- routes


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    errors = {}
    username = parse_str(data.get("username"), "username", errors, max_len=50, label="Username")
    password = data.get("password")
    if password is None or password == "":
        errors["password"] = "Password is required"
    elif not isinstance(password, str):
        errors["password"] = "Password must be a string"
    elif len(password) > 200:
        errors["password"] = "Password must be at most 200 characters"
    if errors:
        validation_error(errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip() or not password:
        raise ApiError(400, "Username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    return jsonify({"token": token, "username": row["username"]})


@app.post("/api/auth/logout")
@login_required
def logout():
    db().execute("DELETE FROM tokens WHERE token = ?", (g.user["token"],))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


def query_int(name, default, minimum):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be an integer", {name: f"{name} must be an integer"})
    if value < minimum:
        raise ApiError(400, f"{name} must be at least {minimum}", {name: f"{name} must be at least {minimum}"})
    return value


@app.get("/api/items")
def list_items():
    page = query_int("page", 1, 1)
    page_size = min(query_int("page_size", DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    where = []
    params = []
    q = request.args.get("q", "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("(name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')")
        params += [f"%{escaped}%", f"%{escaped}%"]
    location = request.args.get("location", "").strip()
    if location:
        where.append("location = ? COLLATE NOCASE")
        params.append(location)
    low = request.args.get("low_stock", "").strip().lower()
    if low in ("1", "true", "yes", "on"):
        where.append("quantity <= reorder_level")
    clause = f"WHERE {' AND '.join(where)}" if where else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM items {clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM items {clause} ORDER BY name COLLATE NOCASE, name, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [item_json(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/locations")
def list_locations():
    rows = db().execute(
        "SELECT DISTINCT location FROM items WHERE location != '' ORDER BY location COLLATE NOCASE"
    ).fetchall()
    return {"items": [r["location"] for r in rows]}


def validate_item(data, with_quantity):
    errors = {}
    fields = {
        "name": parse_str(data.get("name"), "name", errors, max_len=200, label="Name"),
        "sku": parse_str(data.get("sku"), "sku", errors, max_len=64, label="SKU"),
        "location": parse_str(data.get("location"), "location", errors, required=False, max_len=100, label="Location"),
        "reorder_level": parse_int(data.get("reorder_level"), "reorder_level", errors, minimum=0, default=0, label="Reorder level"),
    }
    if with_quantity:
        fields["quantity"] = parse_int(data.get("quantity"), "quantity", errors, minimum=0, default=0, label="Quantity")
    if errors:
        validation_error(errors)
    return fields


def duplicate_sku():
    return ApiError(409, "An item with this SKU already exists", {"sku": "An item with this SKU already exists"})


@app.post("/api/items")
@login_required
def create_item():
    f = validate_item(json_body(), with_quantity=True)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO items (name, sku, location, quantity, reorder_level) VALUES (?, ?, ?, ?, ?)",
            (f["name"], f["sku"], f["location"], f["quantity"], f["reorder_level"]),
        )
    except sqlite3.IntegrityError:
        raise duplicate_sku()
    return jsonify(item_json(get_item_or_404(cur.lastrowid))), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id):
    return item_json(get_item_or_404(item_id))


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id):
    get_item_or_404(item_id)
    f = validate_item(json_body(), with_quantity=False)
    conn = db()
    try:
        cur = conn.execute(
            "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
            (f["name"], f["sku"], f["location"], f["reorder_level"], item_id),
        )
    except sqlite3.IntegrityError:
        raise duplicate_sku()
    if cur.rowcount == 0:
        raise ApiError(404, "Item not found")
    return item_json(get_item_or_404(item_id))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id):
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
        cur = conn.execute("DELETE FROM items WHERE id = ?", (item_id,))
        if cur.rowcount == 0:
            conn.execute("ROLLBACK")
            raise ApiError(404, "Item not found")
        conn.execute("COMMIT")
    except ApiError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise
    return "", 204


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id):
    get_item_or_404(item_id)
    rows = db().execute(
        "SELECT * FROM movements WHERE item_id = ? ORDER BY id DESC", (item_id,)
    ).fetchall()
    return {"items": [movement_json(r) for r in rows]}


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id):
    get_item_or_404(item_id)
    data = json_body()
    errors = {}
    delta = parse_int(data.get("delta"), "delta", errors, required=True, label="Quantity change")
    if delta == 0 and "delta" not in errors:
        errors["delta"] = "Quantity change must not be zero"
    reason = parse_str(data.get("reason"), "reason", errors, required=False, max_len=500, label="Reason")
    if errors:
        validation_error(errors)
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute("SELECT quantity FROM items WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            conn.execute("ROLLBACK")
            raise ApiError(404, "Item not found")
        new_qty = row["quantity"] + delta
        if new_qty < 0:
            conn.execute("ROLLBACK")
            msg = f"Not enough stock: only {row['quantity']} available"
            raise ApiError(409, msg, {"delta": msg})
        conn.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_qty, item_id))
        cur = conn.execute(
            "INSERT INTO movements (item_id, delta, reason, quantity_after, created_at, user_id, username)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (item_id, delta, reason, new_qty, now_iso(), g.user["id"], g.user["username"]),
        )
        movement_id = cur.lastrowid
        conn.execute("COMMIT")
    except ApiError:
        raise
    except Exception:
        conn.execute("ROLLBACK")
        raise
    row = conn.execute("SELECT * FROM movements WHERE id = ?", (movement_id,)).fetchone()
    return jsonify(movement_json(row)), 201


@app.route("/api", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
def api_not_found(_path=""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
