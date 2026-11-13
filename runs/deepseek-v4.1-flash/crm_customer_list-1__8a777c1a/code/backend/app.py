"""Flask entry point for the customer directory API and frontend."""

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
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT COLLATE NOCASE UNIQUE,
    phone TEXT,
    company TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
);

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

CUSTOMER_SELECT = """
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
       (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id)
           AS interaction_count,
       (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id)
           AS last_contacted_at
FROM customers c
"""

INTERACTION_SELECT = """
SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at,
       u.username AS logged_by
FROM interactions i
JOIN users u ON u.id = i.logged_by
"""


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15)
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def error(message: str, status: int, field: str | None = None):
    body: dict[str, Any] = {"error": message, "message": message}
    body["errors"] = {field: message} if field else {}
    return jsonify(body), status


def required_text(payload: dict[str, Any], field: str, label: str) -> str | None:
    value = payload.get(field)
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def optional_text(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        return str(value)
    value = value.strip()
    return value or None


def parse_occurred_at(value: Any) -> str:
    if value is None or value == "":
        return iso(utcnow())
    if not isinstance(value, str):
        raise ValueError("Occurred at must be a valid date.")
    text = value.strip()
    if not text:
        return iso(utcnow())
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError as exc:
        raise ValueError("Occurred at must be a valid date.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return iso(parsed)


def customer_by_id(customer_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)
    ).fetchone()


def serialize_customer(row: sqlite3.Row) -> dict[str, Any]:
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


def serialize_interaction(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by"],
    }


def auth_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        header = request.headers.get("Authorization", "")
        token = ""
        if header.lower().startswith("bearer "):
            token = header[7:].strip()
        if not token:
            return error("Authentication required.", 401)
        row = get_db().execute(
            """
            SELECT u.id, u.username
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return error("Invalid or expired token.", 401)
        g.user = row
        return view(*args, **kwargs)

    return wrapped


def validate_customer(
    payload: dict[str, Any], customer_id: int | None = None
) -> tuple[dict[str, Any] | None, tuple[Any, int] | None]:
    name = required_text(payload, "name", "Name")
    if name is None:
        return None, error("Name is required.", 400, "name")

    email = optional_text(payload.get("email"))
    if email is not None:
        duplicate = get_db().execute(
            "SELECT id FROM customers WHERE email = ? COLLATE NOCASE AND id != ?",
            (email, customer_id if customer_id is not None else -1),
        ).fetchone()
        if duplicate is not None:
            message = "A customer with this email already exists."
            return None, error(message, 400, "email")

    return (
        {
            "name": name,
            "email": email,
            "phone": optional_text(payload.get("phone")),
            "company": optional_text(payload.get("company")),
            "notes": optional_text(payload.get("notes")),
        },
        None,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = json_body()
    username = required_text(payload, "username", "Username")
    password = payload.get("password")
    if username is None:
        return error("Username is required.", 400, "username")
    if not isinstance(password, str) or not password:
        return error("Password is required.", 400, "password")

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing is not None:
        return error("That username is already taken.", 400, "username")

    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso(utcnow())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error("That username is already taken.", 400, "username")

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = json_body()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Invalid username or password.", 401)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], iso(utcnow())),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/customers")
@auth_required
def list_customers():
    db = get_db()
    q = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()

    try:
        page = int(request.args.get("page", "1"))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        page_size = 20
    page = max(page, 1)
    page_size = min(max(page_size, 1), 1000)

    clauses: list[str] = []
    params: list[Any] = []
    if q:
        pattern = f"%{q}%"
        clauses.append(
            "(c.name LIKE ? OR c.email LIKE ? OR c.company LIKE ? OR c.phone LIKE ? OR c.notes LIKE ?)"
        )
        params.extend([pattern] * 5)
    if company:
        clauses.append("c.company = ? COLLATE NOCASE")
        params.append(company)

    where = (" WHERE " + " AND ".join(clauses)) if clauses else ""

    total = db.execute(
        "SELECT COUNT(*) FROM customers c" + where, params
    ).fetchone()[0]

    items = db.execute(
        CUSTOMER_SELECT
        + where
        + " ORDER BY c.name COLLATE NOCASE ASC, c.id ASC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_customer(row) for row in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/companies")
@auth_required
def list_companies():
    rows = get_db().execute(
        """
        SELECT DISTINCT company FROM customers
        WHERE company IS NOT NULL AND TRIM(company) != ''
        ORDER BY company COLLATE NOCASE ASC
        """
    ).fetchall()
    return jsonify({"items": [row["company"] for row in rows]})


@app.post("/api/customers")
@auth_required
def create_customer():
    values, validation_error = validate_customer(json_body())
    if validation_error is not None:
        return validation_error

    db = get_db()
    try:
        cursor = db.execute(
            """
            INSERT INTO customers (name, email, phone, company, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                values["name"],
                values["email"],
                values["phone"],
                values["company"],
                values["notes"],
                iso(utcnow()),
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error(
            "A customer with this email already exists.", 400, "email"
        )

    return jsonify(serialize_customer(customer_by_id(cursor.lastrowid))), 201


@app.get("/api/customers/<int:customer_id>")
@auth_required
def get_customer(customer_id: int):
    row = customer_by_id(customer_id)
    if row is None:
        return error("Customer not found.", 404)
    return jsonify(serialize_customer(row))


@app.put("/api/customers/<int:customer_id>")
@auth_required
def update_customer(customer_id: int):
    if customer_by_id(customer_id) is None:
        return error("Customer not found.", 404)

    values, validation_error = validate_customer(json_body(), customer_id)
    if validation_error is not None:
        return validation_error

    db = get_db()
    try:
        db.execute(
            """
            UPDATE customers
            SET name = ?, email = ?, phone = ?, company = ?, notes = ?
            WHERE id = ?
            """,
            (
                values["name"],
                values["email"],
                values["phone"],
                values["company"],
                values["notes"],
                customer_id,
            ),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return error(
            "A customer with this email already exists.", 400, "email"
        )

    return jsonify(serialize_customer(customer_by_id(customer_id)))


@app.delete("/api/customers/<int:customer_id>")
@auth_required
def delete_customer(customer_id: int):
    db = get_db()
    row = db.execute(
        "SELECT id FROM customers WHERE id = ?", (customer_id,)
    ).fetchone()
    if row is None:
        return error("Customer not found.", 404)

    db.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
    db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db.commit()
    return "", 204


@app.get("/api/customers/<int:customer_id>/interactions")
@auth_required
def list_interactions(customer_id: int):
    if customer_by_id(customer_id) is None:
        return error("Customer not found.", 404)

    rows = get_db().execute(
        INTERACTION_SELECT
        + " WHERE i.customer_id = ? ORDER BY i.occurred_at DESC, i.id DESC",
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [serialize_interaction(row) for row in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
@auth_required
def create_interaction(customer_id: int):
    if customer_by_id(customer_id) is None:
        return error("Customer not found.", 404)

    payload = json_body()
    kind = optional_text(payload.get("kind"))
    summary = required_text(payload, "summary", "Summary")
    if kind is None:
        return error("Kind is required.", 400, "kind")
    if summary is None:
        return error("Summary is required.", 400, "summary")
    try:
        occurred_at = parse_occurred_at(payload.get("occurred_at"))
    except ValueError as exc:
        return error(str(exc), 400, "occurred_at")

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO interactions
            (customer_id, kind, summary, occurred_at, logged_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            customer_id,
            kind,
            summary,
            occurred_at,
            g.user["id"],
            iso(utcnow()),
        ),
    )
    db.commit()

    row = db.execute(
        INTERACTION_SELECT + " WHERE i.id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_interaction(row)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
