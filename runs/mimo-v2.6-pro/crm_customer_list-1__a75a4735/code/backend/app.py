"""Customer directory: Flask application serving the JSON API and the frontend."""

from __future__ import annotations

import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db, init_db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

INTERACTION_KINDS = {"call": "call", "calls": "call", "email": "email", "emails": "email",
                     "meeting": "meeting", "meetings": "meeting"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso_z(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds").replace("+00:00", "Z")


def error(status: int, message: str, fields: dict[str, str] | None = None):
    body: dict[str, Any] = {"error": message, "message": message}
    if fields:
        body["errors"] = fields
    return jsonify(body), status


def json_body() -> dict[str, Any]:
    if not request.data:
        return {}
    data = request.get_json(silent=True)
    if data is None:
        raise BadRequest("Request body must be valid JSON")
    if not isinstance(data, dict):
        raise BadRequest("Request body must be a JSON object")
    return data


class BadRequest(Exception):
    def __init__(self, message: str, fields: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        self.fields = fields


@app.errorhandler(BadRequest)
def handle_bad_request(exc: BadRequest):
    return error(400, exc.message, exc.fields)


@app.errorhandler(404)
def handle_not_found(exc):
    if request.path.startswith("/api/"):
        return error(404, "Not found")
    return exc.get_response()


def parse_datetime(raw: str) -> float:
    """Parse an ISO 8601 date-time and return its epoch seconds."""
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError as exc:
        raise BadRequest("occurred_at must be a valid ISO 8601 date and time") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.timestamp()


def clean_str(payload: dict[str, Any], key: str, fields: dict[str, str], required: bool = False) -> str | None:
    """Read an optional string field, normalising empty values to None."""
    value = payload.get(key)
    if value is None:
        if required:
            fields[key] = f"{key} is required"
        return None
    if not isinstance(value, str):
        fields[key] = f"{key} must be a string"
        return None
    value = value.strip()
    if not value:
        if required:
            fields[key] = f"{key} is required"
        return None
    return value


def customer_to_dict(row: sqlite3.Row) -> dict[str, Any]:
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


def interaction_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by"],
    }


CUSTOMER_SELECT = """
SELECT c.*,
       (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
       (SELECT i.occurred_at FROM interactions i WHERE i.customer_id = c.id
        ORDER BY i.occurred_epoch DESC, i.id DESC LIMIT 1) AS last_contacted_at
FROM customers c
"""


# --------------------------------------------------------------------------
# authentication
# --------------------------------------------------------------------------

def current_user() -> sqlite3.Row | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    try:
        return db.execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
    finally:
        db.close()


def login_required(view: Callable) -> Callable:
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error(401, "Authentication required")
        g.user = user
        return view(*args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    payload = json_body()
    fields: dict[str, str] = {}
    username = clean_str(payload, "username", fields, required=True)
    password = payload.get("password")
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        return error(400, next(iter(fields.values())), fields)
    assert username is not None and isinstance(password, str)

    db = get_db()
    try:
        existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing:
            message = f"Duplicate username: an account with the username '{username}' already exists."
            return error(400, message, {"username": message})
        created_at = iso_z(now_utc())
        try:
            cur = db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), created_at),
            )
        except sqlite3.IntegrityError:
            message = f"Duplicate username: an account with the username '{username}' already exists."
            return error(400, message, {"username": message})
        user_id = cur.lastrowid
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, created_at))
        db.commit()
    finally:
        db.close()
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    payload = json_body()
    fields: dict[str, str] = {}
    username = clean_str(payload, "username", fields, required=True)
    password = payload.get("password")
    if not isinstance(password, str) or not password:
        fields["password"] = "password is required"
    if fields:
        return error(400, next(iter(fields.values())), fields)
    assert username is not None and isinstance(password, str)

    db = get_db()
    try:
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return error(401, "Invalid username or password")
        token = secrets.token_urlsafe(32)
        db.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, user["id"], iso_z(now_utc())))
        db.commit()
    finally:
        db.close()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]})


# --------------------------------------------------------------------------
# customers
# --------------------------------------------------------------------------

def read_customer_fields(payload: dict[str, Any]) -> dict[str, str | None]:
    fields: dict[str, str] = {}
    name = clean_str(payload, "name", fields, required=True)
    values = {"name": name}
    for key in ("email", "phone", "company", "notes"):
        values[key] = clean_str(payload, key, fields)
    email = values["email"]
    if email is not None and not EMAIL_RE.match(email):
        fields["email"] = "email must be a valid email address"
    if fields:
        raise BadRequest(next(iter(fields.values())), fields)
    return values


def find_customer_or_404(customer_id: int) -> sqlite3.Row:
    db = get_db()
    try:
        row = db.execute(CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)).fetchone()
    finally:
        db.close()
    if row is None:
        raise NotFound(f"Customer {customer_id} not found")
    return row


class NotFound(Exception):
    pass


@app.errorhandler(NotFound)
def handle_customer_missing(exc: NotFound):
    return error(404, str(exc))


def check_email_available(db: sqlite3.Connection, email: str | None, exclude_id: int | None = None) -> str | None:
    if email is None:
        return None
    query = "SELECT id FROM customers WHERE email = ? COLLATE NOCASE"
    params: list[Any] = [email]
    if exclude_id is not None:
        query += " AND id != ?"
        params.append(exclude_id)
    if db.execute(query, params).fetchone() is not None:
        return f"Duplicate email: a customer with the email '{email}' already exists."
    return None


@app.get("/api/customers")
@login_required
def list_customers():
    fields: dict[str, str] = {}

    def int_arg(name: str, default: int) -> int:
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except ValueError:
            fields[name] = f"{name} must be an integer"
            return default
        if value < 1:
            fields[name] = f"{name} must be at least 1"
            return default
        return value

    page = int_arg("page", 1)
    page_size = int_arg("page_size", 20)
    if fields:
        return error(400, next(iter(fields.values())), fields)

    q = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()

    where = []
    params: list[Any] = []
    if q:
        like = "%" + re.sub(r"([\\%_])", r"\\\1", q) + "%"
        where.append(
            r"(c.name LIKE ? ESCAPE '\'"
            r" OR c.email LIKE ? ESCAPE '\'"
            r" OR c.phone LIKE ? ESCAPE '\'"
            r" OR c.company LIKE ? ESCAPE '\'"
            r" OR c.notes LIKE ? ESCAPE '\')"
        )
        params.extend([like] * 5)
    if company:
        where.append("c.company = ? COLLATE NOCASE")
        params.append(company)

    clause = (" WHERE " + " AND ".join(where)) if where else ""

    db = get_db()
    try:
        total = db.execute("SELECT COUNT(*) AS n FROM customers c" + clause, params).fetchone()["n"]
        rows = db.execute(
            CUSTOMER_SELECT + clause + " ORDER BY c.name COLLATE NOCASE, c.id LIMIT ? OFFSET ?",
            params + [page_size, (page - 1) * page_size],
        ).fetchall()
    finally:
        db.close()
    return jsonify({
        "items": [customer_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.post("/api/customers")
@login_required
def create_customer():
    try:
        values = read_customer_fields(json_body())
    except BadRequest as exc:
        return error(400, exc.message, exc.fields)

    db = get_db()
    try:
        duplicate = check_email_available(db, values["email"])
        if duplicate:
            return error(400, duplicate, {"email": duplicate})
        created_at = iso_z(now_utc())
        try:
            cur = db.execute(
                "INSERT INTO customers (name, email, phone, company, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (values["name"], values["email"], values["phone"], values["company"], values["notes"], created_at),
            )
        except sqlite3.IntegrityError:
            duplicate = f"Duplicate email: a customer with the email '{values['email']}' already exists."
            return error(400, duplicate, {"email": duplicate})
        db.commit()
        row = db.execute(CUSTOMER_SELECT + " WHERE c.id = ?", (cur.lastrowid,)).fetchone()
    finally:
        db.close()
    return jsonify(customer_to_dict(row)), 201


@app.get("/api/customers/<int:customer_id>")
@login_required
def get_customer(customer_id: int):
    return jsonify(customer_to_dict(find_customer_or_404(customer_id)))


@app.put("/api/customers/<int:customer_id>")
@login_required
def replace_customer(customer_id: int):
    find_customer_or_404(customer_id)
    try:
        values = read_customer_fields(json_body())
    except BadRequest as exc:
        return error(400, exc.message, exc.fields)

    db = get_db()
    try:
        duplicate = check_email_available(db, values["email"], exclude_id=customer_id)
        if duplicate:
            return error(400, duplicate, {"email": duplicate})
        try:
            db.execute(
                "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ? WHERE id = ?",
                (values["name"], values["email"], values["phone"], values["company"], values["notes"], customer_id),
            )
        except sqlite3.IntegrityError:
            duplicate = f"Duplicate email: a customer with the email '{values['email']}' already exists."
            return error(400, duplicate, {"email": duplicate})
        db.commit()
        row = db.execute(CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)).fetchone()
    finally:
        db.close()
    return jsonify(customer_to_dict(row))


@app.delete("/api/customers/<int:customer_id>")
@login_required
def delete_customer(customer_id: int):
    find_customer_or_404(customer_id)
    db = get_db()
    try:
        db.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
        db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        db.commit()
    finally:
        db.close()
    return "", 204


# --------------------------------------------------------------------------
# interactions
# --------------------------------------------------------------------------

@app.get("/api/customers/<int:customer_id>/interactions")
@login_required
def list_interactions(customer_id: int):
    find_customer_or_404(customer_id)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM interactions WHERE customer_id = ? ORDER BY occurred_epoch DESC, id DESC",
            (customer_id,),
        ).fetchall()
    finally:
        db.close()
    return jsonify({"items": [interaction_to_dict(r) for r in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
@login_required
def create_interaction(customer_id: int):
    find_customer_or_404(customer_id)
    payload = json_body()
    fields: dict[str, str] = {}

    kind_raw = clean_str(payload, "kind", fields, required=True)
    kind = INTERACTION_KINDS.get(kind_raw.lower()) if kind_raw else None
    if kind_raw and kind is None:
        fields["kind"] = "kind must be one of: call, email, meeting"

    summary = clean_str(payload, "summary", fields, required=True)

    occurred_raw = payload.get("occurred_at")
    occurred_at: str
    occurred_epoch: float
    try:
        if occurred_raw is None or occurred_raw == "":
            occurred_at = iso_z(now_utc())
            occurred_epoch = parse_datetime(occurred_at)
        elif isinstance(occurred_raw, str):
            occurred_at = occurred_raw.strip()
            occurred_epoch = parse_datetime(occurred_at)
        else:
            raise BadRequest("occurred_at must be a valid ISO 8601 date and time",
                             {"occurred_at": "occurred_at must be a valid ISO 8601 date and time"})
    except BadRequest as exc:
        fields["occurred_at"] = exc.message
        occurred_at, occurred_epoch = "", 0.0

    if fields:
        return error(400, next(iter(fields.values())), fields)

    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO interactions (customer_id, kind, summary, occurred_at, occurred_epoch, logged_by, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (customer_id, kind, summary, occurred_at, occurred_epoch, g.user["username"], iso_z(now_utc())),
        )
        db.commit()
        row = db.execute("SELECT * FROM interactions WHERE id = ?", (cur.lastrowid,)).fetchone()
    finally:
        db.close()
    return jsonify(interaction_to_dict(row)), 201


# --------------------------------------------------------------------------
# health & frontend
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8000, debug=True)
