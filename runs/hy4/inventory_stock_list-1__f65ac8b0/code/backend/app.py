"""Warehouse inventory API and frontend server."""

from __future__ import annotations

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
DATA_DIR = Path(os.environ.get("INVENTORY_DATA_DIR", "data"))
DB_PATH = DATA_DIR / "inventory.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL COLLATE NOCASE UNIQUE,
    location TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    reorder_level INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movements_item ON movements(item_id, id DESC);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


init_db()


def item_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def movement_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def fail(message: str, status: int = 400, errors: dict | None = None):
    payload = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def to_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text.isdigit() or (text.startswith("-") and text[1:].isdigit()):
            return int(text)
    return None


def truthy(value) -> bool:
    return value is not None and value.strip().lower() in {"1", "true", "yes", "on"}


def required_string(data: dict, field: str, errors: dict, label: str | None = None):
    value = data.get(field)
    if not isinstance(value, str) or not value.strip():
        errors[field] = f"{label or field.replace('_', ' ').capitalize()} is required."
        return None
    return value.strip()


def parse_integer(data: dict, field: str, errors: dict, *, label: str, minimum=None,
                  nonzero=False):
    value = to_int(data.get(field))
    if value is None or (minimum is not None and value < minimum) or (nonzero and value == 0):
        qualifier = "non-zero" if nonzero else "non-negative"
        errors[field] = f"{label} must be a {qualifier} integer."
        return None
    return value


def validate_item(data: dict, *, opening: bool = False, exclude_id: int | None = None):
    errors: dict = {}
    name = required_string(data, "name", errors, "Name")
    sku = required_string(data, "sku", errors, "SKU")
    location = required_string(data, "location", errors, "Location")
    reorder_level = parse_integer(data, "reorder_level", errors, label="Reorder level", minimum=0)
    quantity = None
    if opening:
        quantity = parse_integer(data, "quantity", errors, label="Opening quantity", minimum=0)
    if sku:
        db = get_db()
        if exclude_id is None:
            existing = db.execute("SELECT id FROM items WHERE sku = ?", (sku,)).fetchone()
        else:
            existing = db.execute(
                "SELECT id FROM items WHERE sku = ? AND id != ?", (sku, exclude_id)
            ).fetchone()
        if existing:
            errors["sku"] = "An item with this SKU already exists."
    values = {
        "name": name,
        "sku": sku,
        "location": location,
        "reorder_level": reorder_level,
        "quantity": quantity,
    }
    return errors, values


def find_item(item_id: int):
    return get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header[7:].strip() if header.lower().startswith("bearer ") else ""
        if not token:
            return fail("Authentication required.", 401)
        user = get_db().execute(
            "SELECT u.id, u.username FROM tokens t "
            "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if user is None:
            return fail("Invalid or expired token.", 401)
        g.user = {"id": user["id"], "username": user["username"]}
        return view(*args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    errors: dict = {}
    username = required_string(data, "username", errors, "Username")
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return fail("Please correct the errors below.", 400, errors)
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        message = "That username is already taken."
        return fail(message, 400, {"username": message})
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        message = "That username is already taken."
        return fail(message, 400, {"username": message})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    errors: dict = {}
    username = required_string(data, "username", errors, "Username")
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return fail("Please correct the errors below.", 400, errors)
    user = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return fail("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify(g.user)


@app.get("/api/items")
def list_items():
    clauses: list[str] = []
    params: list = []
    q = (request.args.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        clauses.append("(name LIKE ? OR sku LIKE ?)")
        params += [like, like]
    location = (request.args.get("location") or "").strip()
    if location:
        clauses.append("location = ?")
        params.append(location)
    if truthy(request.args.get("low_stock")):
        clauses.append("quantity <= reorder_level")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""

    page = to_int(request.args.get("page"))
    page = page if page is not None and page >= 1 else 1
    page_size = to_int(request.args.get("page_size"))
    page_size = page_size if page_size is not None and page_size >= 1 else 20
    page_size = min(page_size, 1000)

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM items" + where, params).fetchone()[0]
    rows = db.execute(
        "SELECT * FROM items" + where + " ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify({
        "items": [item_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/items")
@require_auth
def create_item():
    errors, values = validate_item(body(), opening=True)
    if errors:
        return fail("Please correct the errors below.", 400, errors)
    try:
        cur = get_db().execute(
            "INSERT INTO items (name, sku, location, quantity, reorder_level) "
            "VALUES (?, ?, ?, ?, ?)",
            (values["name"], values["sku"], values["location"],
             values["quantity"], values["reorder_level"]),
        )
        get_db().commit()
    except sqlite3.IntegrityError:
        message = "An item with this SKU already exists."
        return fail(message, 400, {"sku": message})
    return jsonify(item_dict(find_item(cur.lastrowid))), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    row = find_item(item_id)
    if row is None:
        return fail("Item not found.", 404)
    return jsonify(item_dict(row))


@app.put("/api/items/<int:item_id>")
@require_auth
def update_item(item_id: int):
    if find_item(item_id) is None:
        return fail("Item not found.", 404)
    errors, values = validate_item(body(), exclude_id=item_id)
    if errors:
        return fail("Please correct the errors below.", 400, errors)
    try:
        get_db().execute(
            "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
            (values["name"], values["sku"], values["location"],
             values["reorder_level"], item_id),
        )
        get_db().commit()
    except sqlite3.IntegrityError:
        message = "An item with this SKU already exists."
        return fail(message, 400, {"sku": message})
    return jsonify(item_dict(find_item(item_id)))


@app.delete("/api/items/<int:item_id>")
@require_auth
def delete_item(item_id: int):
    if find_item(item_id) is None:
        return fail("Item not found.", 404)
    db = get_db()
    db.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
    db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    return "", 204


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    if find_item(item_id) is None:
        return fail("Item not found.", 404)
    rows = get_db().execute(
        "SELECT * FROM movements WHERE item_id = ? ORDER BY id DESC", (item_id,)
    ).fetchall()
    return jsonify({"items": [movement_dict(row) for row in rows]})


@app.post("/api/items/<int:item_id>/movements")
@require_auth
def create_movement(item_id: int):
    data = body()
    errors: dict = {}
    delta = parse_integer(data, "delta", errors, label="Delta", nonzero=True)
    reason = data.get("reason", "")
    if reason is None:
        reason = ""
    if not isinstance(reason, str):
        errors["reason"] = "Reason must be a string."
    if errors:
        return fail("Please correct the errors below.", 400, errors)

    db = get_db()
    db.rollback()
    db.execute("BEGIN IMMEDIATE")
    row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        db.rollback()
        return fail("Item not found.", 404)
    new_quantity = row["quantity"] + delta
    if new_quantity < 0:
        db.rollback()
        return fail(
            "Not enough stock: this movement would take the quantity below 0.",
            400,
            {"delta": "Not enough stock to take out this quantity."},
        )
    db.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_quantity, item_id))
    cur = db.execute(
        "INSERT INTO movements "
        "(item_id, user_id, username, delta, reason, quantity_after, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (item_id, g.user["id"], g.user["username"], delta, reason.strip(),
         new_quantity, now_iso()),
    )
    movement_id = cur.lastrowid
    db.commit()
    movement = db.execute("SELECT * FROM movements WHERE id = ?", (movement_id,)).fetchone()
    return jsonify(movement_dict(movement)), 201


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": exc.description or exc.name}), exc.code
    return exc


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return jsonify({"error": "Not found"}), 404
    if ".." not in Path(path).parts and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
