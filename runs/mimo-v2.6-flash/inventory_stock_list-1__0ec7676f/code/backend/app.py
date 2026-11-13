"""Flask entry point: warehouse inventory API and frontend host."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "inventory.db"
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 0,
    reorder_level INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def request_json() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def error_response(message: str, status: int = 400, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def validation_response(errors: dict[str, str]):
    message = next(iter(errors.values())) if errors else "Invalid input"
    return error_response(message, 400, errors)


def as_int(value: Any) -> int | None:
    """Coerce JSON value to int; return None when it is not a whole number."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        text = value.strip()
        try:
            return int(text)
        except ValueError:
            return None
    return None


def as_str(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    return None


def parse_bool(raw: str | None) -> bool | None:
    if raw is None:
        return None
    text = raw.strip().lower()
    if text in ("", "1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return None


def parse_int_arg(raw: str | None, default: int, minimum: int | None = None) -> int:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if minimum is not None and value < minimum:
        return default
    return value


def item_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    quantity = row["quantity"]
    reorder_level = row["reorder_level"]
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": quantity,
        "reorder_level": reorder_level,
        "low_stock": quantity <= reorder_level,
    }


def movement_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM auth_tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return error_response("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = request_json()
    errors: dict[str, str] = {}
    username = data.get("username")
    password = data.get("password")
    if as_str(username) is None or not as_str(username).strip():
        errors["username"] = "Username is required"
    if as_str(password) is None or password == "":
        errors["password"] = "Password is required"
    if errors:
        return validation_response(errors)

    username = as_str(username).strip()
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return validation_response({"username": "Username already exists"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request_json()
    errors: dict[str, str] = {}
    username = data.get("username")
    password = data.get("password")
    if as_str(username) is None or not as_str(username).strip():
        errors["username"] = "Username is required"
    if as_str(password) is None or password == "":
        errors["password"] = "Password is required"
    if errors:
        return validation_response(errors)

    username = as_str(username).strip()
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error_response("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


@app.get("/api/items")
def list_items():
    args = request.args
    where: list[str] = []
    params: list[Any] = []

    q = (args.get("q") or "").strip()
    if q:
        escaped = (
            q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        where.append(
            "(name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\' "
            "OR location LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern, pattern])

    location = (args.get("location") or "").strip()
    if location:
        where.append("location = ? COLLATE NOCASE")
        params.append(location)

    if parse_bool(args.get("low_stock")):
        where.append("quantity <= reorder_level")

    clause = f" WHERE {' AND '.join(where)}" if where else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM items{clause}", params).fetchone()[0]

    page = parse_int_arg(args.get("page"), default=1, minimum=1)
    page_size = parse_int_arg(
        args.get("page_size"), default=DEFAULT_PAGE_SIZE, minimum=1
    )
    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM items{clause} "
        "ORDER BY name COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()
    return jsonify(
        {
            "items": [item_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_item_fields(data: dict[str, Any], exclude_id: int | None = None):
    """Return (clean fields, errors). Fields absent from data are omitted."""
    fields: dict[str, Any] = {}
    errors: dict[str, str] = {}
    db = get_db()

    if "name" in data:
        name = as_str(data["name"])
        if name is None or not name.strip():
            errors["name"] = "Name is required"
        else:
            fields["name"] = name.strip()

    if "sku" in data:
        sku = as_str(data["sku"])
        if sku is None or not sku.strip():
            errors["sku"] = "SKU is required"
        else:
            sku = sku.strip()
            query = "SELECT id FROM items WHERE sku = ?"
            params: list[Any] = [sku]
            if exclude_id is not None:
                query += " AND id != ?"
                params.append(exclude_id)
            if db.execute(query, params).fetchone() is not None:
                errors["sku"] = "SKU already exists"
            else:
                fields["sku"] = sku

    if "location" in data:
        location = as_str(data["location"])
        if location is None:
            errors["location"] = "Location must be a string"
        else:
            fields["location"] = location.strip()

    if "quantity" in data:
        quantity = as_int(data["quantity"])
        if quantity is None or quantity < 0:
            errors["quantity"] = "Quantity must be a non-negative integer"
        else:
            fields["quantity"] = quantity

    if "reorder_level" in data:
        reorder_level = as_int(data["reorder_level"])
        if reorder_level is None or reorder_level < 0:
            errors["reorder_level"] = "Reorder level must be a non-negative integer"
        else:
            fields["reorder_level"] = reorder_level

    return fields, errors


@app.post("/api/items")
@login_required
def create_item():
    data = request_json()
    required = {"name", "sku"}
    missing = required - data.keys()
    if missing:
        errors = {key: "Name is required" if key == "name" else "SKU is required" for key in missing}
        return validation_response(errors)

    fields, errors = validate_item_fields(data)
    if errors:
        return validation_response(errors)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO items (name, sku, location, quantity, reorder_level) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                fields["name"],
                fields["sku"],
                fields.get("location", ""),
                fields.get("quantity", 0),
                fields.get("reorder_level", 0),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return validation_response({"sku": "SKU already exists"})

    row = db.execute("SELECT * FROM items WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(item_to_dict(row)), 201


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    row = get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return error_response("Item not found", 404)
    return jsonify(item_to_dict(row))


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return error_response("Item not found", 404)

    data = request_json()
    fields, errors = validate_item_fields(data, exclude_id=item_id)
    if errors:
        return validation_response(errors)

    updated = {
        "name": fields.get("name", row["name"]),
        "sku": fields.get("sku", row["sku"]),
        "location": fields.get("location", row["location"]),
        "reorder_level": fields.get("reorder_level", row["reorder_level"]),
    }
    try:
        db.execute(
            "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? "
            "WHERE id = ?",
            (
                updated["name"],
                updated["sku"],
                updated["location"],
                updated["reorder_level"],
                item_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return validation_response({"sku": "SKU already exists"})

    row = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    return jsonify(item_to_dict(row))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id: int):
    db = get_db()
    row = db.execute("SELECT id FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return error_response("Item not found", 404)
    db.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
    db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Movements
# ---------------------------------------------------------------------------

MOVEMENT_SELECT = (
    "SELECT m.id, m.item_id, m.delta, m.reason, m.quantity_after, m.created_at, "
    "u.username FROM movements m JOIN users u ON u.id = m.user_id"
)


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    rows = get_db().execute(
        f"{MOVEMENT_SELECT} WHERE m.item_id = ? ORDER BY m.id DESC", (item_id,)
    ).fetchall()
    return jsonify({"items": [movement_to_dict(row) for row in rows]})


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id: int):
    data = request_json()
    errors: dict[str, str] = {}

    delta = as_int(data["delta"]) if "delta" in data else None
    if delta is None:
        errors["delta"] = "Delta must be an integer"
    elif delta == 0:
        errors["delta"] = "Delta must be a non-zero integer"

    reason = data.get("reason", "")
    if reason is None:
        reason = ""
    if not isinstance(reason, str):
        errors["reason"] = "Reason must be a string"
        reason = ""
    else:
        reason = reason.strip()

    if errors:
        return validation_response(errors)

    db = get_db()
    item = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    if item is None:
        return error_response("Item not found", 404)

    new_quantity = item["quantity"] + delta
    if new_quantity < 0:
        message = (
            f"Insufficient stock: only {item['quantity']} available"
            if delta < 0
            else "Insufficient stock"
        )
        return error_response(message, 400, {"delta": message})

    created_at = now_iso()
    user = g.user
    cur = db.execute(
        "INSERT INTO movements (item_id, delta, reason, quantity_after, created_at, "
        "user_id) VALUES (?, ?, ?, ?, ?, ?)",
        (item_id, delta, reason, new_quantity, created_at, user["id"]),
    )
    db.execute(
        "UPDATE items SET quantity = ? WHERE id = ?", (new_quantity, item_id)
    )
    db.commit()

    row = db.execute(
        f"{MOVEMENT_SELECT} WHERE m.id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(movement_to_dict(row)), 201


# ---------------------------------------------------------------------------
# Frontend hosting
# ---------------------------------------------------------------------------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error_response("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return error_response("Not found", 404)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return error_response("Not found", 404)


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return error_response("Method not allowed", 405)
    return error_response("Method not allowed", 405)


@app.errorhandler(500)
def internal_error(_error):
    return error_response("Internal server error", 500)
