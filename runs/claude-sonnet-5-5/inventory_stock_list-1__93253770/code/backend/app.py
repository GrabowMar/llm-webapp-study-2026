"""Flask entry point: warehouse inventory JSON API plus the frontend build."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "inventory.db"

MAX_NUMBER = 1_000_000_000
TOKEN_MAX_AGE = 7 * 24 * 3600
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
    location TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    reorder_level INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS items_name ON items (name COLLATE NOCASE, id);
CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users (id) ON DELETE SET NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    quantity_after INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS movements_item ON movements (item_id, id);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def load_secret() -> str:
    env = os.environ.get("SECRET_KEY")
    if env:
        return env
    path = DATA_DIR / "secret.key"
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        tmp = DATA_DIR / f".secret.{os.getpid()}.tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write(secrets.token_hex(32))
        try:
            os.link(tmp, path)
        except FileExistsError:
            pass
        finally:
            tmp.unlink(missing_ok=True)
    return path.read_text().strip()


init_db()
serializer = URLSafeTimedSerializer(load_secret(), salt="inventory-auth")
DUMMY_HASH = generate_password_hash(secrets.token_hex(8))


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(status: int, message: str, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    try:
        data = serializer.loads(parts[1].strip(), max_age=TOKEN_MAX_AGE)
        user_id = int(data["uid"])
    except (BadSignature, KeyError, TypeError, ValueError):
        return None
    return db().execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            resp = jsonify({"error": "authentication required"})
            resp.status_code = 401
            resp.headers["WWW-Authenticate"] = "Bearer"
            return resp
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def is_int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    elif len(username.strip()) > 64:
        errors["username"] = "username must be at most 64 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    elif len(password) > 256:
        errors["password"] = "password must be at most 256 characters"
    if errors:
        return error(400, "validation failed", errors)
    username = username.strip()
    try:
        cur = db().execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        return error(
            409,
            "username already taken",
            {"username": "username already taken"},
        )
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error(400, "request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return error(401, "invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        return error(401, "invalid username or password")
    token = serializer.dumps({"uid": row["id"]})
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


def item_json(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "sku": row["sku"],
        "location": row["location"],
        "quantity": row["quantity"],
        "reorder_level": row["reorder_level"],
        "low_stock": row["quantity"] <= row["reorder_level"],
    }


def movement_json(row) -> dict:
    return {
        "id": row["id"],
        "item_id": row["item_id"],
        "delta": row["delta"],
        "reason": row["reason"],
        "quantity_after": row["quantity_after"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def validate_int(data, field, errors, *, default=None, minimum=0, label=None):
    label = label or field
    if field not in data or data[field] is None:
        if default is None:
            errors[field] = f"{label} is required"
        return default
    value = data[field]
    if not is_int(value):
        errors[field] = f"{label} must be a whole number"
        return None
    if value < minimum:
        errors[field] = f"{label} must be at least {minimum}"
        return None
    if value > MAX_NUMBER:
        errors[field] = f"{label} must be at most {MAX_NUMBER}"
        return None
    return value


def validate_item(data, *, with_quantity):
    errors = {}
    out = {}
    for field, limit in (("name", 200), ("sku", 100)):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = f"{field} is required"
        elif len(value.strip()) > limit:
            errors[field] = f"{field} must be at most {limit} characters"
        else:
            out[field] = value.strip()
    location = data.get("location")
    if location is None:
        out["location"] = ""
    elif not isinstance(location, str):
        errors["location"] = "location must be text"
    elif len(location.strip()) > 100:
        errors["location"] = "location must be at most 100 characters"
    else:
        out["location"] = location.strip()
    out["reorder_level"] = validate_int(
        data, "reorder_level", errors, default=0, label="reorder level"
    )
    if with_quantity:
        out["quantity"] = validate_int(
            data, "quantity", errors, default=0, label="quantity"
        )
    return out, errors


def sku_taken(sku: str, exclude_id: int | None = None) -> bool:
    row = db().execute(
        "SELECT id FROM items WHERE sku = ? AND id IS NOT ?", (sku, exclude_id)
    ).fetchone()
    return row is not None


def duplicate_sku():
    msg = "sku already exists"
    return error(409, msg, {"sku": msg})


def get_item(item_id: int):
    return db().execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()


def not_found():
    return error(404, "item not found")


def like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def parse_positive(name: str, default: int, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    if not re.fullmatch(r"[0-9]+", raw) or int(raw) < 1:
        return None, f"{name} must be a positive integer"
    value = int(raw)
    if maximum is not None and value > maximum:
        return None, f"{name} must be at most {maximum}"
    return value, None


@app.get("/api/items")
def list_items():
    page, err = parse_positive("page", 1)
    if err:
        return error(400, err, {"page": err})
    page_size, err = parse_positive("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    if err:
        return error(400, err, {"page_size": err})

    where = []
    params: list = []
    q = request.args.get("q", "").strip()
    if q:
        pattern = f"%{like_escape(q)}%"
        where.append("(name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\')")
        params += [pattern, pattern]
    location = request.args.get("location")
    if location is not None and location.strip() != "":
        where.append("location = ? COLLATE NOCASE")
        params.append(location.strip())
    low = request.args.get("low_stock")
    if low is not None and low.strip() != "":
        flag = low.strip().lower()
        if flag in ("1", "true", "yes", "on"):
            where.append("quantity <= reorder_level")
        elif flag not in ("0", "false", "no", "off"):
            msg = "low_stock must be true or false"
            return error(400, msg, {"low_stock": msg})
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM items{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM items{clause} ORDER BY name COLLATE NOCASE, name, id "
        "LIMIT ? OFFSET ?",
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
        "SELECT DISTINCT location FROM items WHERE location <> '' "
        "ORDER BY location COLLATE NOCASE"
    ).fetchall()
    return {"items": [r["location"] for r in rows]}


@app.post("/api/items")
@login_required
def create_item():
    data = json_body()
    if data is None:
        return error(400, "request body must be a JSON object")
    out, errors = validate_item(data, with_quantity=True)
    if errors:
        return error(400, "validation failed", errors)
    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        if sku_taken(out["sku"]):
            conn.execute("ROLLBACK")
            return duplicate_sku()
        cur = conn.execute(
            "INSERT INTO items (name, sku, location, quantity, reorder_level) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                out["name"],
                out["sku"],
                out["location"],
                out["quantity"],
                out["reorder_level"],
            ),
        )
        item_id = cur.lastrowid
        conn.execute("COMMIT")
    except sqlite3.IntegrityError:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        return duplicate_sku()
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    resp = jsonify(item_json(get_item(item_id)))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/items/{item_id}"
    return resp


@app.get("/api/items/<int:item_id>")
def read_item(item_id: int):
    row = get_item(item_id)
    if row is None:
        return not_found()
    return item_json(row)


@app.put("/api/items/<int:item_id>")
@login_required
def update_item(item_id: int):
    data = json_body()
    if data is None:
        return error(400, "request body must be a JSON object")
    conn = db()
    if get_item(item_id) is None:
        return not_found()
    out, errors = validate_item(data, with_quantity=False)
    if errors:
        return error(400, "validation failed", errors)
    try:
        conn.execute("BEGIN IMMEDIATE")
        if get_item(item_id) is None:
            conn.execute("ROLLBACK")
            return not_found()
        if sku_taken(out["sku"], item_id):
            conn.execute("ROLLBACK")
            return duplicate_sku()
        conn.execute(
            "UPDATE items SET name = ?, sku = ?, location = ?, reorder_level = ? "
            "WHERE id = ?",
            (out["name"], out["sku"], out["location"], out["reorder_level"], item_id),
        )
        conn.execute("COMMIT")
    except sqlite3.IntegrityError:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        return duplicate_sku()
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    return item_json(get_item(item_id))


@app.delete("/api/items/<int:item_id>")
@login_required
def delete_item(item_id: int):
    cur = db().execute("DELETE FROM items WHERE id = ?", (item_id,))
    if cur.rowcount == 0:
        return not_found()
    return "", 204


@app.get("/api/items/<int:item_id>/movements")
def list_movements(item_id: int):
    if get_item(item_id) is None:
        return not_found()
    rows = db().execute(
        "SELECT m.*, u.username AS username FROM movements m "
        "LEFT JOIN users u ON u.id = m.user_id "
        "WHERE m.item_id = ? ORDER BY m.id DESC",
        (item_id,),
    ).fetchall()
    return {"items": [movement_json(r) for r in rows]}


@app.post("/api/items/<int:item_id>/movements")
@login_required
def create_movement(item_id: int):
    data = json_body()
    if data is None:
        return error(400, "request body must be a JSON object")
    if get_item(item_id) is None:
        return not_found()
    errors = {}
    delta = data.get("delta")
    if not is_int(delta):
        errors["delta"] = "delta must be a whole number"
    elif delta == 0:
        errors["delta"] = "delta must not be zero"
    elif abs(delta) > MAX_NUMBER:
        errors["delta"] = f"delta must be between -{MAX_NUMBER} and {MAX_NUMBER}"
    reason = data.get("reason")
    if reason is None:
        reason = ""
    elif not isinstance(reason, str):
        errors["reason"] = "reason must be text"
    elif len(reason.strip()) > 200:
        errors["reason"] = "reason must be at most 200 characters"
    else:
        reason = reason.strip()
    if errors:
        return error(400, "validation failed", errors)

    conn = db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = get_item(item_id)
        if row is None:
            conn.execute("ROLLBACK")
            return not_found()
        new_qty = row["quantity"] + delta
        if new_qty < 0:
            conn.execute("ROLLBACK")
            msg = f"insufficient stock: only {row['quantity']} on hand"
            return error(409, msg, {"delta": msg})
        if new_qty > MAX_NUMBER:
            conn.execute("ROLLBACK")
            msg = f"quantity cannot exceed {MAX_NUMBER}"
            return error(409, msg, {"delta": msg})
        conn.execute("UPDATE items SET quantity = ? WHERE id = ?", (new_qty, item_id))
        cur = conn.execute(
            "INSERT INTO movements "
            "(item_id, user_id, delta, reason, quantity_after, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (item_id, g.user["id"], delta, reason, new_qty, now_iso()),
        )
        conn.execute("COMMIT")
    except Exception:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    mv = conn.execute(
        "SELECT m.*, u.username AS username FROM movements m "
        "LEFT JOIN users u ON u.id = m.user_id WHERE m.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(movement_json(mv)), 201


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        resp = jsonify({"error": exc.description or exc.name})
        resp.status_code = exc.code or 500
        if exc.code == 405 and exc.valid_methods:
            resp.headers["Allow"] = ", ".join(exc.valid_methods)
        return resp
    return exc


@app.errorhandler(Exception)
def unexpected(exc: Exception):
    app.logger.exception("unhandled error")
    if request.path.startswith("/api/"):
        return error(500, "internal server error")
    raise exc


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error(404, "not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target is not None and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
