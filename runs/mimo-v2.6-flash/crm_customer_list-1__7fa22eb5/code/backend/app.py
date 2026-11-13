"""Flask entry point: customer directory API plus frontend hosting."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (BASE_DIR / "data"))
DB_PATH = DATA_DIR / "directory.db"

DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 10
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
INTERACTION_KINDS = ("call", "email", "meeting")
DUPLICATE_EMAIL_MESSAGE = "Duplicate email: a customer with this email already exists."

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (email);
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    logged_by TEXT NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_interactions_customer
    ON interactions (customer_id, occurred_at);
"""

CUSTOMER_SELECT = """
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
       (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id)
           AS interaction_count,
       (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id)
           AS last_contacted_at
FROM customers c
"""


def format_ts(dt: datetime) -> str:
    if dt.microsecond:
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def now_iso() -> str:
    return format_ts(datetime.now(timezone.utc))


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, isolation_level=None)
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA)
    finally:
        connection.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers


def fail(message: str, status: int = 400):
    return jsonify({"error": message}), status


def invalid(errors: dict[str, str]):
    message = next(iter(errors.values())) if len(errors) == 1 else "Validation failed."
    return jsonify({"error": message, "errors": errors}), 400


def payload() -> dict[str, Any] | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def current_user() -> tuple[int, str] | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT u.id AS id, u.username AS username "
            "FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )
    if row is None:
        return None
    return int(row["id"]), str(row["username"])


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return fail("Authentication required.", 401)
        g.user_id, g.username = user
        return view(*args, **kwargs)

    return wrapped


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def customer_dict(row: sqlite3.Row) -> dict[str, Any]:
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


def interaction_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by"],
    }


def read_text(data: dict[str, Any], key: str, label: str, required: bool,
              errors: dict[str, str]) -> str | None:
    value = data.get(key)
    if value is None or value == "":
        if required:
            errors[key] = f"{label} is required."
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            if required:
                errors[key] = f"{label} is required."
            return None
        return text
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    errors[key] = f"{label} must be text."
    return None


def read_customer_payload(data: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    errors: dict[str, str] = {}
    values: dict[str, Any] = {}

    name = read_text(data, "name", "Name", True, errors)
    if name is not None:
        values["name"] = name

    email = read_text(data, "email", "Email", True, errors)
    if email is not None:
        if EMAIL_RE.match(email):
            values["email"] = email
        else:
            errors["email"] = "Enter a valid email address."

    for key, label in (("phone", "Phone"), ("company", "Company"), ("notes", "Notes")):
        values[key] = read_text(data, key, label, False, errors)

    return values, errors


def email_taken(email: str, exclude_id: int | None = None) -> bool:
    if exclude_id is None:
        row = get_db().execute(
            "SELECT id FROM customers WHERE LOWER(email) = LOWER(?)", (email,)
        ).fetchone()
    else:
        row = get_db().execute(
            "SELECT id FROM customers WHERE id != ? AND LOWER(email) = LOWER(?)",
            (exclude_id, email),
        ).fetchone()
    return row is not None


def fetch_customer(customer_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)
    ).fetchone()


def fetch_interaction(interaction_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT id, customer_id, kind, summary, occurred_at, logged_by "
        "FROM interactions WHERE id = ?",
        (interaction_id,),
    ).fetchone()


# ---------------------------------------------------------------------------
# Auth


@app.post("/api/auth/register")
def register():
    data = payload()
    if data is None:
        return fail("Request body must be a JSON object.")

    errors: dict[str, str] = {}
    username = read_text(data, "username", "Username", True, errors)
    password = data.get("password")
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    if errors:
        return invalid(errors)

    db = get_db()
    taken = db.execute(
        "SELECT id FROM users WHERE LOWER(username) = LOWER(?)", (username,)
    ).fetchone()
    if taken is not None:
        return invalid({"username": "Username already taken."})

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    return jsonify({"message": "Account created."}), 201


@app.post("/api/auth/login")
def login():
    data = payload()
    if data is None:
        return fail("Request body must be a JSON object.")

    errors: dict[str, str] = {}
    username = read_text(data, "username", "Username", True, errors)
    password = data.get("password")
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required."
    if errors:
        return invalid(errors)

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users "
        "WHERE LOWER(username) = LOWER(?)",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return fail("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, int(row["id"]), now_iso()),
    )
    return jsonify({"token": token})


# ---------------------------------------------------------------------------
# Customers


@app.get("/api/customers")
@login_required
def list_customers():
    q = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()
    page_arg = request.args.get("page", str(DEFAULT_PAGE))
    size_arg = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(page_arg)
        page_size = int(size_arg)
    except (TypeError, ValueError):
        return fail("page and page_size must be integers.")
    if page < 1 or page_size < 1:
        return fail("page and page_size must be at least 1.")

    clauses: list[str] = []
    params: list[Any] = []
    if q:
        pattern = f"%{escape_like(q)}%"
        clauses.append(
            "(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' "
            "OR c.company LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' "
            "OR c.notes LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 5)
    if company:
        clauses.append("c.company = ? COLLATE NOCASE")
        params.append(company)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM customers c {where}", params
    ).fetchone()[0]
    rows = db.execute(
        f"{CUSTOMER_SELECT} {where} "
        "ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [customer_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/customers")
@login_required
def create_customer():
    data = payload()
    if data is None:
        return fail("Request body must be a JSON object.")

    values, errors = read_customer_payload(data)
    if "email" in values and email_taken(values["email"]):
        errors["email"] = DUPLICATE_EMAIL_MESSAGE
    if errors:
        return invalid(errors)

    cursor = get_db().execute(
        "INSERT INTO customers (name, email, phone, company, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            values["name"],
            values["email"],
            values.get("phone"),
            values.get("company"),
            values.get("notes"),
            now_iso(),
        ),
    )
    row = fetch_customer(int(cursor.lastrowid))
    return jsonify(customer_dict(row)), 201


@app.get("/api/customers/<int:customer_id>")
@login_required
def get_customer(customer_id: int):
    row = fetch_customer(customer_id)
    if row is None:
        return fail("Customer not found.", 404)
    return jsonify(customer_dict(row))


@app.put("/api/customers/<int:customer_id>")
@login_required
def replace_customer(customer_id: int):
    if fetch_customer(customer_id) is None:
        return fail("Customer not found.", 404)

    data = payload()
    if data is None:
        return fail("Request body must be a JSON object.")

    values, errors = read_customer_payload(data)
    if "email" in values and email_taken(values["email"], exclude_id=customer_id):
        errors["email"] = DUPLICATE_EMAIL_MESSAGE
    if errors:
        return invalid(errors)

    get_db().execute(
        "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, "
        "notes = ? WHERE id = ?",
        (
            values["name"],
            values["email"],
            values.get("phone"),
            values.get("company"),
            values.get("notes"),
            customer_id,
        ),
    )
    return jsonify(customer_dict(fetch_customer(customer_id)))


@app.delete("/api/customers/<int:customer_id>")
@login_required
def delete_customer(customer_id: int):
    if fetch_customer(customer_id) is None:
        return fail("Customer not found.", 404)
    get_db().execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    return "", 204


# ---------------------------------------------------------------------------
# Interactions


@app.get("/api/customers/<int:customer_id>/interactions")
@login_required
def list_interactions(customer_id: int):
    if fetch_customer(customer_id) is None:
        return fail("Customer not found.", 404)
    rows = get_db().execute(
        "SELECT id, customer_id, kind, summary, occurred_at, logged_by "
        "FROM interactions WHERE customer_id = ? "
        "ORDER BY occurred_at DESC, id DESC",
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [interaction_dict(row) for row in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
@login_required
def create_interaction(customer_id: int):
    if fetch_customer(customer_id) is None:
        return fail("Customer not found.", 404)

    data = payload()
    if data is None:
        return fail("Request body must be a JSON object.")

    errors: dict[str, str] = {}
    values: dict[str, Any] = {}

    kind = read_text(data, "kind", "Kind", True, errors)
    if kind is not None:
        if kind.lower() in INTERACTION_KINDS:
            values["kind"] = kind.lower()
        else:
            errors["kind"] = "Kind must be one of: call, email, meeting."

    summary = read_text(data, "summary", "Summary", True, errors)
    if summary is not None:
        values["summary"] = summary

    occurred = data.get("occurred_at")
    if occurred is None or occurred == "":
        values["occurred_at"] = now_iso()
    elif isinstance(occurred, str):
        try:
            parsed = datetime.fromisoformat(occurred.replace("Z", "+00:00"))
        except ValueError:
            errors["occurred_at"] = "occurred_at must be an ISO 8601 timestamp."
        else:
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            values["occurred_at"] = format_ts(parsed.astimezone(timezone.utc))
    else:
        errors["occurred_at"] = "occurred_at must be an ISO 8601 timestamp."

    if errors:
        return invalid(errors)

    cursor = get_db().execute(
        "INSERT INTO interactions (customer_id, kind, summary, occurred_at, "
        "logged_by) VALUES (?, ?, ?, ?, ?)",
        (
            customer_id,
            values["kind"],
            values["summary"],
            values["occurred_at"],
            g.username,
        ),
    )
    row = fetch_interaction(int(cursor.lastrowid))
    return jsonify(interaction_dict(row)), 201


# ---------------------------------------------------------------------------
# Companies


@app.get("/api/companies")
@login_required
def list_companies():
    rows = get_db().execute(
        "SELECT DISTINCT company FROM customers "
        "WHERE company IS NOT NULL AND company != '' "
        "ORDER BY company COLLATE NOCASE ASC"
    ).fetchall()
    return jsonify({"items": [row["company"] for row in rows]})


# ---------------------------------------------------------------------------
# Health and hosting


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route(
    "/api/<path:path>",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
)
def api_unknown(path: str):
    return fail("Not found.", 404)


@app.errorhandler(404)
def not_found(err):
    if request.path == "/api" or request.path.startswith("/api/"):
        return fail("Not found.", 404)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return err


@app.errorhandler(405)
def method_not_allowed(err):
    if request.path == "/api" or request.path.startswith("/api/"):
        return fail("Method not allowed.", 405)
    return err


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return fail("Not found.", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return fail("Frontend build not found.", 404)
