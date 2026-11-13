"""Flask entry point for the shared customer directory."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "directory.db"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

PBKDF2_ITERATIONS = 120_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique
    ON customers(email) WHERE email IS NOT NULL;
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    logged_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS interactions_customer_idx
    ON interactions(customer_id, occurred_at DESC);
"""

CUSTOMER_SELECT = """
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
       (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
       (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_contacted_at
FROM customers c
"""

INTERACTION_SELECT = """
SELECT id, customer_id, kind, summary, occurred_at, logged_by
FROM interactions
"""


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


app = Flask(__name__, static_folder=None)


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return jsonify({"error": exc.message}), exc.status


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    if request.path.startswith("/api"):
        message = exc.description or exc.name
        if exc.code == 401:
            message = "Authentication required."
        elif exc.code == 404:
            message = "Not found."
        return jsonify({"error": message}), exc.code
    return exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------- auth


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def get_str(data: dict, key: str, *, required: bool = False, max_len: int = 500) -> str | None:
    value = data.get(key)
    if value is None:
        if required:
            raise ApiError(400, f"'{key}' is required.")
        return None
    if not isinstance(value, str):
        raise ApiError(400, f"'{key}' must be a string.")
    value = value.strip()
    if not value:
        if required:
            raise ApiError(400, f"'{key}' is required.")
        return None
    if len(value) > max_len:
        raise ApiError(400, f"'{key}' must be at most {max_len} characters.")
    return value


def hash_password(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS
    ).hex()


def current_user() -> dict:
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header.startswith("Bearer ") else ""
    if not token:
        raise ApiError(401, "Authentication required.")
    row = db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        raise ApiError(401, "Invalid or expired token.")
    user = {"id": row["id"], "username": row["username"]}
    g.user = user
    return user


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = get_str(data, "username", required=True, max_len=64)
    password = get_str(data, "password", required=True, max_len=128)
    conn = db()
    exists = conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        raise ApiError(400, "That username is already taken.")
    salt = secrets.token_hex(16)
    conn.execute(
        "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
        (username, hash_password(password, salt), salt, utcnow()),
    )
    conn.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = get_str(data, "username", required=True, max_len=64)
    password = get_str(data, "password", required=True, max_len=128)
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash, salt FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not secrets.compare_digest(
        row["password_hash"], hash_password(password, row["salt"])
    ):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    conn.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- customers


def parse_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"'{name}' must be an integer.")
    return max(minimum, min(maximum, value))


def row_to_customer(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"],
        "company": row["company"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "interaction_count": row["interaction_count"],
        "last_contacted_at": row["last_contacted_at"],
    }


def fetch_customer(customer_id: int) -> dict:
    row = db().execute(CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Customer not found.")
    return row_to_customer(row)


def parse_customer_fields(data: dict) -> dict:
    name = get_str(data, "name", required=True, max_len=200)
    email = get_str(data, "email", max_len=254)
    if email is not None and not EMAIL_RE.match(email):
        raise ApiError(400, "'email' must be a valid email address.")
    phone = get_str(data, "phone", max_len=50)
    company = get_str(data, "company", max_len=120)
    notes = get_str(data, "notes", max_len=4000)
    return {"name": name, "email": email, "phone": phone, "company": company, "notes": notes}


def check_email_unique(email: str | None, exclude_id: int | None = None) -> None:
    if email is None:
        return
    if exclude_id is None:
        clash = db().execute(
            "SELECT 1 FROM customers WHERE email IS NOT NULL AND LOWER(email) = LOWER(?)",
            (email,),
        ).fetchone()
    else:
        clash = db().execute(
            "SELECT 1 FROM customers WHERE email IS NOT NULL AND LOWER(email) = LOWER(?) AND id != ?",
            (email, exclude_id),
        ).fetchone()
    if clash:
        raise ApiError(400, "A customer with this email already exists.")


@app.get("/api/customers")
def list_customers():
    current_user()
    q = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()
    page = parse_int_arg("page", 1, 1, 1_000_000)
    page_size = parse_int_arg("page_size", 20, 1, 100)

    clauses: list[str] = []
    params: list = []
    if q:
        clauses.append(
            "(LOWER(c.name) LIKE '%' || LOWER(?) || '%' "
            "OR LOWER(c.email) LIKE '%' || LOWER(?) || '%' "
            "OR LOWER(c.company) LIKE '%' || LOWER(?) || '%')"
        )
        params.extend([q, q, q])
    if company:
        clauses.append("LOWER(c.company) = LOWER(?)")
        params.append(company)
    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM customers c" + where, params).fetchone()[0]
    rows = conn.execute(
        CUSTOMER_SELECT + where + " ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = [row_to_customer(r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.post("/api/customers")
def create_customer():
    current_user()
    fields = parse_customer_fields(json_body())
    check_email_unique(fields["email"])
    conn = db()
    created = utcnow()
    try:
        cur = conn.execute(
            "INSERT INTO customers (name, email, phone, company, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (fields["name"], fields["email"], fields["phone"], fields["company"], fields["notes"], created),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(400, "A customer with this email already exists.")
    customer = fetch_customer(cur.lastrowid)
    return jsonify(customer), 201


@app.get("/api/customers/<int:customer_id>")
def get_customer(customer_id: int):
    current_user()
    return jsonify(fetch_customer(customer_id))


@app.put("/api/customers/<int:customer_id>")
def update_customer(customer_id: int):
    current_user()
    existing = db().execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        raise ApiError(404, "Customer not found.")
    fields = parse_customer_fields(json_body())
    check_email_unique(fields["email"], exclude_id=customer_id)
    conn = db()
    try:
        conn.execute(
            "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ? WHERE id = ?",
            (fields["name"], fields["email"], fields["phone"], fields["company"], fields["notes"], customer_id),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        raise ApiError(400, "A customer with this email already exists.")
    return jsonify(fetch_customer(customer_id))


@app.delete("/api/customers/<int:customer_id>")
def delete_customer(customer_id: int):
    current_user()
    existing = db().execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        raise ApiError(404, "Customer not found.")
    conn = db()
    conn.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
    conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    conn.commit()
    return "", 204


# ---------------------------------------------------------------- interactions


def parse_timestamp(data: dict, key: str) -> str:
    value = data.get(key)
    if value is None:
        return utcnow()
    if not isinstance(value, str):
        raise ApiError(400, f"'{key}' must be an ISO 8601 timestamp.")
    value = value.strip()
    if not value:
        return utcnow()
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00").replace("z", "+00:00"))
    except ValueError:
        raise ApiError(400, f"'{key}' must be an ISO 8601 timestamp.")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


@app.get("/api/customers/<int:customer_id>/interactions")
def list_interactions(customer_id: int):
    current_user()
    existing = db().execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        raise ApiError(404, "Customer not found.")
    rows = db().execute(
        INTERACTION_SELECT + " WHERE customer_id = ? ORDER BY occurred_at DESC, id DESC",
        (customer_id,),
    ).fetchall()
    items = [dict(r) for r in rows]
    return jsonify({"items": items})


@app.post("/api/customers/<int:customer_id>/interactions")
def create_interaction(customer_id: int):
    user = current_user()
    existing = db().execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        raise ApiError(404, "Customer not found.")
    data = json_body()
    kind = get_str(data, "kind", required=True, max_len=30)
    summary = get_str(data, "summary", required=True, max_len=2000)
    occurred_at = parse_timestamp(data, "occurred_at")
    conn = db()
    cur = conn.execute(
        "INSERT INTO interactions (customer_id, kind, summary, occurred_at, logged_by) "
        "VALUES (?, ?, ?, ?, ?)",
        (customer_id, kind, summary, occurred_at, user["username"]),
    )
    conn.commit()
    row = conn.execute(INTERACTION_SELECT + " WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
