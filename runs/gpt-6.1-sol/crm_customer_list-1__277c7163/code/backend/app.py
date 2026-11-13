import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
CUSTOMER_SELECT = """
    SELECT c.*, COUNT(i.id) AS interaction_count,
           MAX(i.occurred_at) AS last_contacted_at
    FROM customers c LEFT JOIN interactions i ON i.customer_id = c.id
"""
SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
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
    kind TEXT NOT NULL CHECK(kind IN ('call', 'email', 'meeting')),
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS customer_name ON customers(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS customer_company ON customers(company COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS interaction_customer ON interactions(customer_id, occurred_at DESC);
"""


def timestamp(value=None):
    return (
        (value or datetime.now(timezone.utc))
        .astimezone(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def get_db():
    if "db" not in g:
        from flask import current_app

        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=30)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def error(message, status=400, errors=None):
    result = {"error": message}
    if errors:
        result["errors"] = errors
    return result, status


def authenticated(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        parts = request.headers.get("Authorization", "").split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return error("Please sign in to continue.", 401)
        token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
        user = (
            get_db()
            .execute(
                """SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ? AND s.expires_at > ?""",
                (token_hash, timestamp()),
            )
            .fetchone()
        )
        if user is None:
            return error("Your session has expired. Please sign in again.", 401)
        g.user = user
        g.token_hash = token_hash
        return view(*args, **kwargs)

    return wrapped


def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def validate_text(body, field, errors, required=False, limit=255):
    value = body.get(field)
    label = field.replace("_", " ").capitalize()
    if value is None and not required:
        return None
    if not isinstance(value, str):
        errors[field] = (
            f"{label} must be text." if value is not None else f"{label} is required."
        )
        return None
    value = value.strip()
    if not value:
        if required:
            errors[field] = f"{label} is required."
        return None
    if len(value) > limit:
        errors[field] = f"{label} must be {limit} characters or fewer."
    return value


def credentials(body, registering=False):
    errors = {}
    username = validate_text(body, "username", errors, required=True, limit=50)
    password = body.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > 256:
        errors["password"] = "Password must be 256 characters or fewer."
    elif registering and len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    if registering and username and len(username) < 3:
        errors["username"] = "Username must be at least 3 characters."
    return username, password, errors


def customer_fields(body):
    errors = {}
    fields = {
        key: validate_text(
            body,
            key,
            errors,
            required=key == "name",
            limit=10000 if key == "notes" else 255,
        )
        for key in ("name", "email", "phone", "company", "notes")
    }
    if fields["email"] and not re.fullmatch(
        r"[^\s@]+@[^\s@]+\.[^\s@]+", fields["email"]
    ):
        errors["email"] = "Enter a valid email address."
    return fields, errors


def find_customer(customer_id):
    row = (
        get_db()
        .execute(CUSTOMER_SELECT + " WHERE c.id = ? GROUP BY c.id", (customer_id,))
        .fetchone()
    )
    return dict(row) if row else None


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=os.environ.get(
            "DATABASE_PATH", str(Path.cwd() / "data" / "directory.sqlite3")
        ),
        MAX_CONTENT_LENGTH=128 * 1024,
    )
    if config:
        app.config.update(config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db = get_db()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.close()
        g.pop("db", None)

    @app.teardown_appcontext
    def close_db(exception=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(HTTPException)
    def http_error(exception):
        if request.path.startswith("/api"):
            return error(exception.description, exception.code)
        return exception

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        username, password, errors = credentials(body, registering=True)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        try:
            with db:
                cursor = db.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (username, generate_password_hash(password), timestamp()),
                )
        except sqlite3.IntegrityError:
            return error(
                "This username is already taken.",
                409,
                {"username": "This username is already taken."},
            )
        return {"id": cursor.lastrowid, "username": username}, 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        username, password, errors = credentials(body)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        user = db.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        if (
            not check_password_hash(
                user["password_hash"] if user else app.config["DUMMY_HASH"], password
            )
            or user is None
        ):
            return error("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("DELETE FROM sessions WHERE expires_at <= ?", (timestamp(),))
            db.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (
                    hashlib.sha256(token.encode()).hexdigest(),
                    user["id"],
                    timestamp(datetime.now(timezone.utc) + timedelta(days=30)),
                ),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return dict(g.user)

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = get_db()
        with db:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.get("/api/overview")
    @authenticated
    def overview():
        db = get_db()
        stats = db.execute(
            """SELECT COUNT(*) AS customers, COUNT(DISTINCT NULLIF(LOWER(company), '')) AS companies,
               (SELECT COUNT(*) FROM interactions) AS interactions,
               (SELECT COUNT(DISTINCT customer_id) FROM interactions WHERE occurred_at >= ?) AS contacted
               FROM customers""",
            (timestamp(datetime.now(timezone.utc) - timedelta(days=30)),),
        ).fetchone()
        companies = db.execute(
            "SELECT MIN(company) AS company FROM customers WHERE company IS NOT NULL GROUP BY company COLLATE NOCASE ORDER BY company COLLATE NOCASE"
        ).fetchall()
        return {**dict(stats), "company_options": [row["company"] for row in companies]}

    @app.get("/api/customers")
    @authenticated
    def list_customers():
        errors = {}
        paging = {}
        for key, default, maximum in (("page", 1, 1000000), ("page_size", 20, 100)):
            try:
                value = int(request.args.get(key, default))
                if not 1 <= value <= maximum:
                    raise ValueError
                paging[key] = value
            except (TypeError, ValueError):
                errors[key] = (
                    f"{key.replace('_', ' ').capitalize()} must be an integer between 1 and {maximum}."
                )
        if errors:
            return error("Invalid pagination.", errors=errors)
        clauses, params = [], []
        query = request.args.get("q", "").strip()
        company = request.args.get("company", "").strip()
        if query:
            escaped = (
                query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            )
            clauses.append(
                "("
                + " OR ".join(
                    f"c.{field} LIKE ? ESCAPE '\\'"
                    for field in ("name", "email", "phone", "company", "notes")
                )
                + ")"
            )
            params.extend([f"%{escaped}%"] * 5)
        if company:
            clauses.append("c.company = ? COLLATE NOCASE")
            params.append(company)
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        db = get_db()
        total = db.execute(
            "SELECT COUNT(*) FROM customers c" + where, params
        ).fetchone()[0]
        rows = db.execute(
            CUSTOMER_SELECT
            + where
            + " GROUP BY c.id ORDER BY c.name COLLATE NOCASE, c.id LIMIT ? OFFSET ?",
            [*params, paging["page_size"], (paging["page"] - 1) * paging["page_size"]],
        ).fetchall()
        return {"items": [dict(row) for row in rows], "total": total, **paging}

    @app.post("/api/customers")
    @authenticated
    def add_customer():
        return save_customer()

    @app.put("/api/customers/<int:customer_id>")
    @authenticated
    def update_customer(customer_id):
        if find_customer(customer_id) is None:
            return error("Customer not found.", 404)
        return save_customer(customer_id)

    def save_customer(customer_id=None):
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        fields, errors = customer_fields(body)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        try:
            with db:
                if customer_id is None:
                    cursor = db.execute(
                        "INSERT INTO customers (name, email, phone, company, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (*fields.values(), timestamp()),
                    )
                    customer_id = cursor.lastrowid
                    status = 201
                else:
                    cursor = db.execute(
                        "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ? WHERE id = ?",
                        (*fields.values(), customer_id),
                    )
                    if not cursor.rowcount:
                        return error("Customer not found.", 404)
                    status = 200
        except sqlite3.IntegrityError:
            return error(
                "A customer with this email already exists.",
                409,
                {"email": "A customer with this email already exists."},
            )
        return find_customer(customer_id), status

    @app.get("/api/customers/<int:customer_id>")
    @authenticated
    def get_customer(customer_id):
        return find_customer(customer_id) or error("Customer not found.", 404)

    @app.delete("/api/customers/<int:customer_id>")
    @authenticated
    def delete_customer(customer_id):
        db = get_db()
        with db:
            cursor = db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
        if not cursor.rowcount:
            return error("Customer not found.", 404)
        return "", 204

    @app.get("/api/customers/<int:customer_id>/interactions")
    @authenticated
    def list_interactions(customer_id):
        if find_customer(customer_id) is None:
            return error("Customer not found.", 404)
        rows = (
            get_db()
            .execute(
                """SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at, u.username AS logged_by
               FROM interactions i JOIN users u ON u.id = i.user_id WHERE i.customer_id = ?
               ORDER BY i.occurred_at DESC, i.id DESC""",
                (customer_id,),
            )
            .fetchall()
        )
        return {"items": [dict(row) for row in rows]}

    @app.post("/api/customers/<int:customer_id>/interactions")
    @authenticated
    def add_interaction(customer_id):
        if find_customer(customer_id) is None:
            return error("Customer not found.", 404)
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        errors = {}
        kind = validate_text(body, "kind", errors, required=True)
        summary = validate_text(body, "summary", errors, required=True, limit=10000)
        if kind not in ("call", "email", "meeting"):
            errors["kind"] = "Choose call, email, or meeting."
        occurred_at = timestamp()
        if "occurred_at" in body:
            try:
                value = datetime.fromisoformat(body["occurred_at"])
                if value.tzinfo is None:
                    value = value.replace(tzinfo=timezone.utc)
                occurred_at = timestamp(value)
            except (ValueError, TypeError, OverflowError):
                errors["occurred_at"] = "Enter a valid ISO 8601 date and time."
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        try:
            with db:
                cursor = db.execute(
                    "INSERT INTO interactions (customer_id, kind, summary, occurred_at, user_id) VALUES (?, ?, ?, ?, ?)",
                    (customer_id, kind, summary, occurred_at, g.user["id"]),
                )
        except sqlite3.IntegrityError:
            return error("Customer not found.", 404)
        return {
            "id": cursor.lastrowid,
            "customer_id": customer_id,
            "kind": kind,
            "summary": summary,
            "occurred_at": occurred_at,
            "logged_by": g.user["username"],
        }, 201

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    app.config["DUMMY_HASH"] = generate_password_hash(secrets.token_hex(32))
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
