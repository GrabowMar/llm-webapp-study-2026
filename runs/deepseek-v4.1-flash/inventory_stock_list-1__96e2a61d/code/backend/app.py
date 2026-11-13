"""Flask entry point for the warehouse inventory app."""

import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "inventory.db"

app = Flask(__name__, static_folder=None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = sqlite3.connect(DB_PATH, timeout=30)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g._db = db
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    try:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                password_salt TEXT NOT NULL,
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
                quantity INTEGER NOT NULL DEFAULT 0,
                reorder_level INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS movements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                delta INTEGER NOT NULL,
                reason TEXT NOT NULL DEFAULT '',
                quantity_after INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                user_id INTEGER REFERENCES users(id),
                username TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_movements_item
                ON movements(item_id, created_at DESC, id DESC);
            """
        )
        db.commit()
    finally:
        db.close()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 200_000
    ).hex()
    return digest, salt


def current_user():
    user = getattr(g, "_user", None)
    if user is not None:
        return user
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()
    g._user = row
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return error("Authentication required.", 401)
        return view(*args, **kwargs)

    return wrapped


def parse_int(value, field: str, default=None):
    if value is None or value == "":
        return default, None
    if isinstance(value, bool):
        return None, f"{field} must be a whole number."
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None, f"{field} must be a whole number."
    if isinstance(value, float) and not value.is_integer():
        return None, f"{field} must be a whole number."
    return number, None


def serialize_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def serialize_movement(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def get_item_row(item_id: int):
    return get_db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


def validate_item_fields(body: dict, existing: sqlite3.Row | None = None):
    name = body.get("name", existing["name"] if existing else None)
    sku = body.get("sku", existing["sku"] if existing else None)
    location = body.get("location", existing["location"] if existing else "")
    reorder_raw = body.get("reorder_level", existing["reorder_level"] if existing else 0)

    if not isinstance(name, str) or not name.strip():
        return None, "Name is required."
    if not isinstance(sku, str) or not sku.strip():
        return None, "SKU is required."
    if location is None:
        location = ""
    if not isinstance(location, str):
        return None, "Location must be text."

    reorder_level, err = parse_int(reorder_raw, "Reorder level", 0)
    if err:
        return None, err
    if reorder_level is None:
        reorder_level = 0
    if reorder_level < 0:
        return None, "Reorder level must be 0 or greater."

    return {
        "name": name.strip(),
        "sku": sku.strip(),
        "location": location.strip(),
        "reorder_level": reorder_level,
    }, None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("Username is required.")
    username = username.strip()
    if len(username) > 50:
        return error("Username must be 50 characters or fewer.")
    if not isinstance(password, str) or not password:
        return error("Password is required.")
    if len(password) > 200:
        return error("Password must be 200 characters or fewer.")

    password_hash, salt = hash_password(password)
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)",
            (username, password_hash, salt, utc_now()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("An account with that username already exists.")

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")

    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 401)

    row = get_db().execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username.strip(),)
    ).fetchone()
    if row is None:
        return error("Invalid username or password.", 401)
    digest, _ = hash_password(password, row["password_salt"])
    if not secrets.compare_digest(digest, row["password_hash"]):
        return error("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utc_now()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/items")
def list_items():
    q = request.args.get("q", "").strip()
    location = request.args.get("location", "").strip()
    low_stock = request.args.get("low_stock", "").strip().lower()

    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        page_size = 20
    page = max(page, 1)
    page_size = min(max(page_size, 1), 200)

    clauses = []
    params = []
    if q:
        clauses.append("(name LIKE ? OR sku LIKE ?)")
        pattern = f"%{q}%"
        params.extend([pattern, pattern])
    if location:
        clauses.append("location = ? COLLATE NOCASE")
        params.append(location)
    if low_stock in ("true", "1", "yes", "on"):
        clauses.append("quantity <= reorder_level")
    elif low_stock in ("false", "0", "no", "off"):
        clauses.append("quantity > reorder_level")

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM items {where}", params).fetchone()[0]
    rows = db.execute(
        f"""
        SELECT * FROM items {where}
        ORDER BY name COLLATE NOCASE ASC, id ASC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_item(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/items")
@login_required
def create_item():
    body = json_body()
    fields, err = validate_item_fields(body)
    if err:
        return error(err)

    quantity_value = body.get("quantity", body.get("opening_quantity"))
    quantity, err = parse_int(quantity_value, "Quantity", 0)
    if err:
        return error(err)
    if quantity is None:
        quantity = 0
    if quantity < 0:
        return error("Quantity must be 0 or greater.")

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO items (name, sku, location, quantity, reorder_level, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                fields["name"],
                fields["sku"],
                fields["location"],
                quantity,
                fields["reorder_level"],
                utc_now(),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("An item with this SKU already exists.")

    return jsonify(serialize_item(get_item_row(cursor.lastrowid))), 201


@app.get("/api/locations")
def list_locations():
    rows = get_db().execute(
        "SELECT DISTINCT location FROM items WHERE location <> '' ORDER BY location COLLATE NOCASE"
    ).fetchall()
    return jsonify({"items": [row["location"] for row in rows]})


@app.get("/api/items/<int:item_id>")
def get_item(item_id: int):
    row = get_item_row(item_id)
    if row is None:
        return error("Item not found.", 404)
    return jsonify(serialize_item(row))


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id: int):
    existing = get_item_row(item_id)
    if existing is None:
        return error("Item not found.", 404)

    body = json_body()
    fields, err = validate_item_fields(body, existing)
    if err:
        return error(err)

    db = get_db()
    try:
        db.execute(
            """
            UPDATE items
            SET name = ?, sku = ?, location = ?, reorder_level = ?
            WHERE id = ?
            """,
            (
                fields["name"],
                fields["sku"],
                fields["location"],
                fields["reorder_level"],
                item_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("An item with this SKU already exists.")

    return jsonify(serialize_item(get_item_row(item_id)))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id: int):
    db = get_db()
    cursor = db.execute("DELETE FROM items WHERE id = ?", (item_id,))
    db.commit()
    if cursor.rowcount == 0:
        return error("Item not found.", 404)
    return "", 204


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    if get_item_row(item_id) is None:
        return error("Item not found.", 404)

    rows = get_db().execute(
        """
        SELECT * FROM movements
        WHERE item_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (item_id,),
    ).fetchall()
    return jsonify({"items": [serialize_movement(row) for row in rows]})


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id: int):
    if get_item_row(item_id) is None:
        return error("Item not found.", 404)

    body = json_body()
    delta, err = parse_int(body.get("delta"), "Delta")
    if err:
        return error(err)
    if delta is None:
        return error("Delta is required.")

    reason = body.get("reason", "")
    if reason is None:
        reason = ""
    if not isinstance(reason, str):
        return error("Reason must be text.")
    reason = reason.strip()[:500]

    user = current_user()
    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT quantity FROM items WHERE id = ?", (item_id,)).fetchone()
        if row is None:
            db.rollback()
            return error("Item not found.", 404)
        new_quantity = row["quantity"] + delta
        if new_quantity < 0:
            db.rollback()
            return error("Not enough stock for that movement.")

        db.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_quantity, item_id))
        cursor = db.execute(
            """
            INSERT INTO movements
                (item_id, delta, reason, quantity_after, created_at, user_id, username)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (item_id, delta, reason, new_quantity, utc_now(), user["id"], user["username"]),
        )
        db.commit()
    except Exception:
        db.rollback()
        raise

    movement = db.execute(
        "SELECT * FROM movements WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_movement(movement)), 201


@app.errorhandler(404)
def not_found(_err):
    if request.path.startswith("/api/"):
        return error("Not found.", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found.", 404)
    if path != "index.html" and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
