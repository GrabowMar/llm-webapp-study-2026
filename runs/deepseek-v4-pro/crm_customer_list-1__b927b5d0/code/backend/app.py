"""Customer directory API and static frontend server."""

import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR.parent / "data"
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
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
            email TEXT,
            phone TEXT,
            company TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email
            ON customers(email) WHERE email IS NOT NULL AND email <> '';

        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            logged_by INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_interactions_customer
            ON interactions(customer_id, occurred_at DESC);
        """
    )
    conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #

def current_user():
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    token = token[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"]}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    errors = {}
    if not username:
        errors["username"] = "Username is required."
    if not password:
        errors["password"] = "Password is required."
    elif len(password) < 4:
        errors["password"] = "Password must be at least 4 characters."
    if errors:
        return jsonify({"errors": errors}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify({"errors": {"username": "That username is already taken."}}), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def customer_row(db, customer_id):
    return db.execute(
        """
        SELECT c.*,
               (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
               (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_contacted_at
        FROM customers c WHERE c.id = ?
        """,
        (customer_id,),
    ).fetchone()


def serialize_customer(row):
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


def serialize_interaction(row):
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by_username"],
    }


def parse_customer_fields(data):
    """Validate customer fields. Returns (fields, errors)."""
    errors = {}
    name = (data.get("name") or "").strip()
    if not name:
        errors["name"] = "Name is required."

    email = data.get("email")
    if email is not None:
        email = email.strip() if isinstance(email, str) else ""
        email = email or None
    phone = data.get("phone")
    if phone is not None:
        phone = phone.strip() if isinstance(phone, str) else ""
        phone = phone or None
    company = data.get("company")
    if company is not None:
        company = company.strip() if isinstance(company, str) else ""
        company = company or None
    notes = data.get("notes")
    if notes is not None:
        notes = notes.strip() if isinstance(notes, str) else ""
        notes = notes or None

    if email and "@" not in email:
        errors["email"] = "Enter a valid email address."

    fields = {"name": name, "email": email, "phone": phone, "company": company, "notes": notes}
    return fields, errors


def ensure_unique_email(db, email, exclude_id=None):
    if not email:
        return None
    if exclude_id is None:
        row = db.execute("SELECT id FROM customers WHERE email = ?", (email,)).fetchone()
    else:
        row = db.execute(
            "SELECT id FROM customers WHERE email = ? AND id <> ?", (email, exclude_id)
        ).fetchone()
    return row is not None


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #

@app.get("/api/customers")
def list_customers():
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    q = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()
    try:
        page = max(int(request.args.get("page", 1)), 1)
    except ValueError:
        page = 1
    try:
        page_size = max(min(int(request.args.get("page_size", 20)), 100), 1)
    except ValueError:
        page_size = 20

    db = get_db()
    where = []
    params = []
    if q:
        like = f"%{q}%"
        where.append("(name LIKE ? OR email LIKE ? OR company LIKE ? OR phone LIKE ?)")
        params.extend([like, like, like, like])
    if company:
        where.append("company = ?")
        params.append(company)

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    total = db.execute(f"SELECT COUNT(*) AS n FROM customers {where_sql}", params).fetchone()["n"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"""
        SELECT c.*,
               (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
               (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id) AS last_contacted_at
        FROM customers c
        {where_sql}
        ORDER BY c.name COLLATE NOCASE ASC, c.id ASC
        LIMIT ? OFFSET ?
        """,
        params + [page_size, offset],
    ).fetchall()

    return jsonify({
        "items": [serialize_customer(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/customers")
def create_customer():
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    data = request.get_json(silent=True) or {}
    fields, errors = parse_customer_fields(data)
    if errors:
        return jsonify({"errors": errors}), 400

    db = get_db()
    if ensure_unique_email(db, fields["email"]):
        return jsonify({"errors": {"email": "A customer with this email already exists."}}), 409

    cur = db.execute(
        "INSERT INTO customers (name, email, phone, company, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (fields["name"], fields["email"], fields["phone"], fields["company"], fields["notes"], now_iso()),
    )
    db.commit()
    return jsonify(serialize_customer(customer_row(db, cur.lastrowid))), 201


@app.get("/api/customers/<int:customer_id>")
def get_customer(customer_id):
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    row = customer_row(get_db(), customer_id)
    if row is None:
        return jsonify({"error": "Customer not found."}), 404
    return jsonify(serialize_customer(row))


@app.put("/api/customers/<int:customer_id>")
def update_customer(customer_id):
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    db = get_db()
    existing = db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Customer not found."}), 404

    data = request.get_json(silent=True) or {}
    fields, errors = parse_customer_fields(data)
    if errors:
        return jsonify({"errors": errors}), 400

    if ensure_unique_email(db, fields["email"], exclude_id=customer_id):
        return jsonify({"errors": {"email": "A customer with this email already exists."}}), 409

    db.execute(
        "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ? WHERE id = ?",
        (fields["name"], fields["email"], fields["phone"], fields["company"], fields["notes"], customer_id),
    )
    db.commit()
    return jsonify(serialize_customer(customer_row(db, customer_id)))


@app.delete("/api/customers/<int:customer_id>")
def delete_customer(customer_id):
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    db = get_db()
    existing = db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone()
    if existing is None:
        return jsonify({"error": "Customer not found."}), 404

    db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db.commit()
    return jsonify({"ok": True})


# --------------------------------------------------------------------------- #
# Interactions
# --------------------------------------------------------------------------- #

@app.get("/api/customers/<int:customer_id>/interactions")
def list_interactions(customer_id):
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return jsonify({"error": "Customer not found."}), 404

    rows = db.execute(
        """
        SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at, u.username AS logged_by_username
        FROM interactions i
        LEFT JOIN users u ON u.id = i.logged_by
        WHERE i.customer_id = ?
        ORDER BY i.occurred_at DESC, i.id DESC
        """,
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [serialize_interaction(r) for r in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
def create_interaction(customer_id):
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required."}), 401

    db = get_db()
    if db.execute("SELECT id FROM customers WHERE id = ?", (customer_id,)).fetchone() is None:
        return jsonify({"error": "Customer not found."}), 404

    data = request.get_json(silent=True) or {}
    kind = (data.get("kind") or "").strip()
    summary = (data.get("summary") or "").strip()

    errors = {}
    if not kind:
        errors["kind"] = "Kind is required."
    if not summary:
        errors["summary"] = "Summary is required."
    if errors:
        return jsonify({"errors": errors}), 400

    occurred_at = (data.get("occurred_at") or "").strip() or now_iso()

    cur = db.execute(
        "INSERT INTO interactions (customer_id, kind, summary, occurred_at, logged_by, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (customer_id, kind, summary, occurred_at, user["id"], now_iso()),
    )
    db.commit()

    row = db.execute(
        """
        SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at, u.username AS logged_by_username
        FROM interactions i LEFT JOIN users u ON u.id = i.logged_by WHERE i.id = ?
        """,
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(serialize_interaction(row)), 201


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
