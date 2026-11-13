"""Customer directory API and frontend server."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DB_PATH = Path(os.environ.get("DATABASE_PATH", "data/directory.db"))

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
VALID_KINDS = {"call", "email", "meeting"}
KIND_ALIASES = {
    "call": "call", "calls": "call", "phone": "call", "phone call": "call",
    "email": "email", "emails": "email", "e-mail": "email",
    "meeting": "meeting", "meetings": "meeting",
}
OPTIONAL_FIELDS = ("phone", "company", "notes")

CUSTOMER_SELECT = """
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
       COUNT(i.id) AS interaction_count,
       MAX(i.occurred_at) AS last_contacted_at
FROM customers c
LEFT JOIN interactions i ON i.customer_id = c.id
"""

app = Flask(__name__, static_folder=None)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def normalize_timestamp(value):
    if value is None or value == "":
        return now_iso()
    if not isinstance(value, str):
        return None
    text = value.strip()
    if text.endswith("Z") or text.endswith("z"):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def connect():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db():
    conn = connect()
    try:
        conn.executescript(
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
            CREATE TABLE IF NOT EXISTS customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                company TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email COLLATE NOCASE);
            CREATE TABLE IF NOT EXISTS interactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
                kind TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL,
                logged_by TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_interactions_customer
                ON interactions(customer_id, occurred_at DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def error(message, status=400, errors=None):
    body = {"message": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def body_json():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def customer_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "phone": row["phone"] or "",
        "company": row["company"] or "",
        "notes": row["notes"] or "",
        "created_at": row["created_at"],
        "interaction_count": row["interaction_count"] or 0,
        "last_contacted_at": row["last_contacted_at"],
    }


def interaction_dict(row):
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"] or "",
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by"],
    }


def fetch_customer(db, customer_id):
    row = db.execute(
        CUSTOMER_SELECT + " WHERE c.id = ? GROUP BY c.id", (customer_id,)
    ).fetchone()
    return customer_dict(row) if row else None


def validate_customer(data, exclude_id=None):
    errors = {}
    name = data.get("name")
    email = data.get("email")

    if not isinstance(name, str) or not name.strip():
        errors["name"] = "Name is required."
    if not isinstance(email, str) or not email.strip():
        errors["email"] = "Email is required."
    elif not EMAIL_RE.match(email.strip()):
        errors["email"] = "Enter a valid email address."
    for field in OPTIONAL_FIELDS:
        value = data.get(field, "")
        if value is None:
            value = ""
        if not isinstance(value, str):
            errors[field] = f"{field.capitalize()} must be a string."

    if errors:
        return None, error("Please correct the errors below.", 400, errors)

    clean = {
        "name": name.strip(),
        "email": email.strip(),
        "phone": (data.get("phone") or ""),
        "company": (data.get("company") or ""),
        "notes": (data.get("notes") or ""),
    }

    db = get_db()
    row = db.execute(
        "SELECT id FROM customers WHERE email = ? COLLATE NOCASE AND id != ?",
        (clean["email"], exclude_id if exclude_id is not None else -1),
    ).fetchone()
    if row:
        message = "A customer with this email already exists."
        return None, error(message, 400, {"email": message})
    return clean, None


def validate_interaction(data):
    errors = {}
    raw_kind = data.get("kind")
    kind = None
    if isinstance(raw_kind, str):
        kind = KIND_ALIASES.get(raw_kind.strip().lower())
    if kind is None:
        errors["kind"] = "Kind must be one of: call, email, meeting."

    summary = data.get("summary", "")
    if summary is None:
        summary = ""
    if not isinstance(summary, str):
        errors["summary"] = "Summary must be a string."

    occurred_at = normalize_timestamp(data.get("occurred_at"))
    if occurred_at is None:
        errors["occurred_at"] = "Enter a valid date and time."

    if errors:
        return None, error("Please correct the errors below.", 400, errors)
    return {"kind": kind, "summary": summary, "occurred_at": occurred_at}, None


@app.before_request
def authenticate():
    path = request.path
    if not path.startswith("/api/") or request.method == "OPTIONS":
        return None
    if path in ("/api/health", "/api/auth/register", "/api/auth/login"):
        return None

    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    token = parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""
    if token:
        row = get_db().execute(
            """SELECT u.id, u.username FROM tokens t
               JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
            (token,),
        ).fetchone()
        if row:
            g.user = {"id": row["id"], "username": row["username"]}
            return None
    return error("Authentication required.", 401)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_json()
    if data is None:
        return error("Request body must be a JSON object.", 400)
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."
    if errors:
        return error("Please correct the errors below.", 400, errors)

    username = username.strip()
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone():
        return error("That username is already taken.", 409, {"username": "That username is already taken."})

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, cur.lastrowid, now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_json()
    if data is None:
        return error("Request body must be a JSON object.", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Invalid username or password.", 401)
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/customers")
def list_customers():
    db = get_db()
    clauses = []
    params = []

    q = request.args.get("q", "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped.lower()}%"
        clauses.append(
            "(LOWER(c.name) LIKE ? ESCAPE '\\' OR LOWER(c.email) LIKE ? ESCAPE '\\' "
            "OR LOWER(c.company) LIKE ? ESCAPE '\\' OR LOWER(c.phone) LIKE ? ESCAPE '\\' "
            "OR LOWER(c.notes) LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 5)

    company = request.args.get("company", "").strip()
    if company:
        clauses.append("LOWER(c.company) = LOWER(?)")
        params.append(company)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    def parse_int(name, default, lo, hi):
        try:
            value = int(request.args.get(name, default))
        except (TypeError, ValueError):
            return default
        return max(lo, min(hi, value))

    page = parse_int("page", 1, 1, 1_000_000)
    page_size = parse_int("page_size", 20, 1, 100)

    total = db.execute("SELECT COUNT(*) FROM customers c" + where, params).fetchone()[0]
    rows = db.execute(
        CUSTOMER_SELECT + where +
        " GROUP BY c.id ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify({
        "items": [customer_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/customers")
def create_customer():
    data = body_json()
    if data is None:
        return error("Request body must be a JSON object.", 400)
    clean, err = validate_customer(data)
    if err:
        return err
    db = get_db()
    cur = db.execute(
        """INSERT INTO customers (name, email, phone, company, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (clean["name"], clean["email"], clean["phone"], clean["company"],
         clean["notes"], now_iso()),
    )
    db.commit()
    return jsonify(fetch_customer(db, cur.lastrowid)), 201


@app.get("/api/customers/<int:customer_id>")
def get_customer(customer_id):
    customer = fetch_customer(get_db(), customer_id)
    if customer is None:
        return error("Customer not found.", 404)
    return jsonify(customer)


@app.put("/api/customers/<int:customer_id>")
def update_customer(customer_id):
    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return error("Customer not found.", 404)
    data = body_json()
    if data is None:
        return error("Request body must be a JSON object.", 400)
    clean, err = validate_customer(data, exclude_id=customer_id)
    if err:
        return err
    db.execute(
        """UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ?
           WHERE id = ?""",
        (clean["name"], clean["email"], clean["phone"], clean["company"],
         clean["notes"], customer_id),
    )
    db.commit()
    return jsonify(fetch_customer(db, customer_id))


@app.delete("/api/customers/<int:customer_id>")
def delete_customer(customer_id):
    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return error("Customer not found.", 404)
    db.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
    db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/customers/<int:customer_id>/interactions")
def list_interactions(customer_id):
    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return error("Customer not found.", 404)
    rows = db.execute(
        "SELECT * FROM interactions WHERE customer_id = ? ORDER BY occurred_at DESC, id DESC",
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [interaction_dict(r) for r in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
def create_interaction(customer_id):
    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return error("Customer not found.", 404)
    data = body_json()
    if data is None:
        return error("Request body must be a JSON object.", 400)
    clean, err = validate_interaction(data)
    if err:
        return err
    cur = db.execute(
        """INSERT INTO interactions (customer_id, kind, summary, occurred_at, logged_by)
           VALUES (?, ?, ?, ?, ?)""",
        (customer_id, clean["kind"], clean["summary"], clean["occurred_at"],
         g.user["username"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM interactions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(interaction_dict(row)), 201


@app.errorhandler(404)
def handle_404(_exc):
    if request.path.startswith("/api/"):
        return error("Not found.", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_exc):
    if request.path.startswith("/api/"):
        return error("Method not allowed.", 405)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path="index.html"):
    if path.startswith("api/"):
        return error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
