"""Flask entry point for the warehouse inventory API."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATABASE = DATA_DIR / "inventory.db"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DATABASE, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
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
            sku TEXT NOT NULL UNIQUE,
            location TEXT NOT NULL DEFAULT '',
            quantity INTEGER NOT NULL DEFAULT 0,
            reorder_level INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            delta INTEGER NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            quantity_after INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()


with app.app_context():
    init_db()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        return None
    return data


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_auth():
    user = current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def item_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def movement_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def parse_int(value, default):
    if value is None or value == "":
        return default, None
    try:
        return int(value), None
    except (TypeError, ValueError):
        return None, "must be an integer"


@app.errorhandler(404)
def not_found(exc):
    if request.path.startswith("/api"):
        return error("Not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(exc):
    if request.path.startswith("/api"):
        return error("Method not allowed", 405)
    return exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("Invalid JSON body")
    username = (data.get("username") or "").strip() if isinstance(data.get("username"), str) else ""
    password = data.get("password") or ""
    if not isinstance(password, str):
        return error("Password must be a string")
    if not username:
        return error("Username is required")
    if not password:
        return error("Password is required")
    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return error("Username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("Invalid JSON body")
    username = data.get("username") or ""
    password = data.get("password") or ""
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if not row or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": username}), 200


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token = ?", (header[len("Bearer ") :].strip(),))
        db.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/items")
def list_items():
    q = (request.args.get("q") or "").strip()
    location = (request.args.get("location") or "").strip()
    low_stock_raw = (request.args.get("low_stock") or "").strip().lower()
    page, err = parse_int(request.args.get("page"), 1)
    if err:
        return error("page " + err)
    page_size, err = parse_int(request.args.get("page_size"), 20)
    if err:
        return error("page_size " + err)
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    where = []
    params = []
    if q:
        where.append("(i.name LIKE ? OR i.sku LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])
    if location:
        where.append("i.location = ? COLLATE NOCASE")
        params.append(location)
    if low_stock_raw in ("1", "true", "yes"):
        where.append("i.quantity <= i.reorder_level")

    sql_where = ("WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) AS c FROM items i {sql_where}", params).fetchone()["c"]
    rows = db.execute(
        f"SELECT i.* FROM items i {sql_where} ORDER BY i.name COLLATE NOCASE, i.id LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [item_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_item_fields(data: dict, editing: bool):
    """Return (fields, error_response). fields is None on error."""
    name = data.get("name")
    sku = data.get("sku")
    location = data.get("location", "")
    reorder_level = data.get("reorder_level", 0)

    if not isinstance(name, str) or not name.strip():
        return None, error("Name is required")
    if not isinstance(sku, str) or not sku.strip():
        return None, error("SKU is required")
    if not isinstance(location, str):
        return None, error("Location must be a string")
    if isinstance(reorder_level, bool) or not isinstance(reorder_level, int):
        try:
            reorder_level = int(str(reorder_level))
        except (TypeError, ValueError):
            return None, error("Reorder level must be an integer")
    if reorder_level < 0:
        return None, error("Reorder level must be 0 or more")

    fields = {
        "name": name.strip(),
        "sku": sku.strip(),
        "location": location.strip(),
        "reorder_level": reorder_level,
    }
    if not editing:
        quantity = data.get("quantity", 0)
        if isinstance(quantity, bool) or not isinstance(quantity, int):
            try:
                quantity = int(str(quantity))
            except (TypeError, ValueError):
                return None, error("Quantity must be an integer")
        if quantity < 0:
            return None, error("Quantity must be 0 or more")
        fields["quantity"] = quantity
    return fields, None


@app.post("/api/items")
def create_item():
    user, err = require_auth()
    if err:
        return err
    data = json_body()
    if data is None:
        return error("Invalid JSON body")
    fields, err = validate_item_fields(data, editing=False)
    if err:
        return err
    db = get_db()
    existing = db.execute("SELECT id FROM items WHERE sku = ?", (fields["sku"],)).fetchone()
    if existing:
        return error("An item with this SKU already exists", 409)
    cur = db.execute(
        "INSERT INTO items (name, sku, location, quantity, reorder_level, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            fields["name"],
            fields["sku"],
            fields["location"],
            fields["quantity"],
            fields["reorder_level"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM items WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(item_json(row)), 201


def fetch_item(item_id: int):
    return get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    row = fetch_item(item_id)
    if not row:
        return error("Item not found", 404)
    return jsonify(item_json(row))


@app.put("/api/items/<int:item_id>")
def update_item(item_id: int):
    user, err = require_auth()
    if err:
        return err
    row = fetch_item(item_id)
    if not row:
        return error("Item not found", 404)
    data = json_body()
    if data is None:
        return error("Invalid JSON body")
    fields, err = validate_item_fields(data, editing=True)
    if err:
        return err
    db = get_db()
    existing = db.execute(
        "SELECT id FROM items WHERE sku = ? AND id != ?", (fields["sku"], item_id)
    ).fetchone()
    if existing:
        return error("An item with this SKU already exists", 409)
    db.execute(
        "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? WHERE id = ?",
        (fields["name"], fields["sku"], fields["location"], fields["reorder_level"], item_id),
    )
    db.commit()
    return jsonify(item_json(fetch_item(item_id)))


@app.delete("/api/items/<int:item_id>")
def delete_item(item_id: int):
    user, err = require_auth()
    if err:
        return err
    db = get_db()
    row = fetch_item(item_id)
    if not row:
        return error("Item not found", 404)
    db.execute("DELETE FROM movements WHERE item_id = ?", (item_id,))
    db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    row = fetch_item(item_id)
    if not row:
        return error("Item not found", 404)
    rows = get_db().execute(
        "SELECT m.*, COALESCE(u.username, '') AS username FROM movements m "
        "LEFT JOIN users u ON u.id = m.user_id WHERE m.item_id = ? "
        "ORDER BY m.created_at DESC, m.id DESC",
        (item_id,),
    ).fetchall()
    return jsonify({"items": [movement_json(r) for r in rows]})


@app.post("/api/items/<int:item_id>/movements")
def create_movement(item_id: int):
    user, err = require_auth()
    if err:
        return err
    row = fetch_item(item_id)
    if not row:
        return error("Item not found", 404)
    data = json_body()
    if data is None:
        return error("Invalid JSON body")
    delta = data.get("delta")
    reason = data.get("reason", "")
    if isinstance(delta, bool) or not isinstance(delta, int):
        try:
            delta = int(str(delta))
        except (TypeError, ValueError):
            return error("Delta must be an integer")
    if delta == 0:
        return error("Delta must not be zero")
    if not isinstance(reason, str):
        return error("Reason must be a string")

    db = get_db()
    item = db.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
    new_quantity = item["quantity"] + delta
    if new_quantity < 0:
        return error(
            f"Movement would take the quantity below 0 (current quantity: {item['quantity']})",
            400,
        )
    cur = db.execute(
        "INSERT INTO movements (item_id, user_id, delta, reason, quantity_after, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (item_id, user["id"], delta, reason.strip(), new_quantity, now_iso()),
    )
    db.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_quantity, item_id))
    db.commit()
    mrow = db.execute(
        "SELECT m.*, COALESCE(u.username, '') AS username FROM movements m "
        "LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(movement_json(mrow)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    candidate = (DIST / path).resolve()
    dist_root = DIST.resolve()
    if candidate.is_file() and str(candidate).startswith(str(dist_root)):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
