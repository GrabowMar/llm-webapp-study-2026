"""Flask entry point: customer directory API and frontend host."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
INTERACTION_KINDS = ("call", "email", "meeting")
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

USERNAME_RE = re.compile(r"^\S{1,64}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PHONE_RE = re.compile(r"^[0-9+()./\-\s]*(?:(?:ext\.?|x)\s*[0-9]+)?$", re.IGNORECASE)

FIELD_LIMITS = {"name": 200, "email": 254, "phone": 50, "company": 200, "notes": 5000}
DUPLICATE_EMAIL_MESSAGE = "A customer with this email already exists."

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
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
    ON customers(email COLLATE NOCASE) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_name ON customers(name COLLATE NOCASE, id);
CREATE TABLE IF NOT EXISTS interactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS interactions_customer
    ON interactions(customer_id, occurred_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def utcnow():
    return datetime.now(timezone.utc)


def fmt_time(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def validation_error(errors):
    raise ApiError(400, " ".join(errors.values()), errors)


# --- errors -----------------------------------------------------------------


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api/") or request.path == "/api":
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error."}), 500


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# --- auth -------------------------------------------------------------------

PUBLIC_API = {"/api/health", "/api/auth/register", "/api/auth/login"}


@app.before_request
def authenticate():
    g.user = None
    path = request.path
    if not (path == "/api" or path.startswith("/api/")) or path in PUBLIC_API:
        return None
    if request.method == "OPTIONS":
        return None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Authentication required.")
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= fmt_time(utcnow()):
        raise ApiError(401, "Your session has expired. Please sign in again.")
    g.user = {"id": row["id"], "username": row["username"]}
    g.token_hash = hash_token(token)
    return None


def read_credentials(data):
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        validation_error(errors)
    return username.strip(), password


@app.post("/api/auth/register")
def register():
    username, password = read_credentials(json_body())
    errors = {}
    if not USERNAME_RE.match(username):
        errors["username"] = (
            "Username must be at most 64 characters and contain no spaces."
        )
    if len(password) < 8:
        errors["password"] = "Password must be at least 8 characters."
    elif len(password) > 256:
        errors["password"] = "Password must be at most 256 characters."
    if errors:
        validation_error(errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), fmt_time(utcnow())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "That username is already taken.", {"username": "That username is already taken."}
        )
    return jsonify({"id": cur.lastrowid, "username": username}), 201


_DUMMY_HASH = generate_password_hash("not-a-real-password")


@app.post("/api/auth/login")
def login():
    username, password = read_credentials(json_body())
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password.")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    now = utcnow()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (fmt_time(now),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], fmt_time(now), fmt_time(now + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.post("/api/auth/logout")
def logout():
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
    conn.commit()
    return "", 204


@app.get("/api/auth/me")
def me():
    return jsonify(g.user)


# --- customers --------------------------------------------------------------

CUSTOMER_SELECT = """
SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
       (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id) AS interaction_count,
       (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id)
           AS last_contacted_at
FROM customers c
"""


def customer_dict(row):
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


def load_customer(customer_id):
    row = db().execute(CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Customer not found.")
    return row


def validate_customer(data):
    errors = {}
    values = {}
    labels = {"name": "Name", "email": "Email", "phone": "Phone", "company": "Company", "notes": "Notes"}
    for field, limit in FIELD_LIMITS.items():
        raw = data.get(field)
        if raw is None:
            values[field] = None
            continue
        if not isinstance(raw, str):
            errors[field] = f"{labels[field]} must be a string."
            continue
        value = raw if field == "notes" else raw.strip()
        if not value.strip():
            values[field] = None
            continue
        if len(value) > limit:
            errors[field] = f"{labels[field]} must be at most {limit} characters."
            continue
        values[field] = value
    if "name" not in errors and not values.get("name"):
        errors["name"] = "Name is required."
    if values.get("email") and "email" not in errors and not EMAIL_RE.match(values["email"]):
        errors["email"] = "Email must be a valid email address."
    if values.get("phone") and "phone" not in errors:
        if not PHONE_RE.match(values["phone"]) or not re.search(r"\d", values["phone"]):
            errors["phone"] = "Phone may only contain digits, spaces and + - ( ) . characters."
    if errors:
        validation_error(errors)
    return values


def ensure_unique_email(email, exclude_id=None):
    if not email:
        return
    row = db().execute(
        "SELECT id FROM customers WHERE email = ? COLLATE NOCASE AND id IS NOT ?",
        (email, exclude_id),
    ).fetchone()
    if row is not None:
        raise_duplicate_email()


def raise_duplicate_email():
    raise ApiError(409, DUPLICATE_EMAIL_MESSAGE, {"email": DUPLICATE_EMAIL_MESSAGE})


def parse_positive_int(name, default):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer.", {name: f"{name} must be a positive integer."})
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer.", {name: f"{name} must be a positive integer."})
    return value


def like_pattern(text):
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@app.get("/api/customers")
def list_customers():
    page = parse_positive_int("page", 1)
    page_size = min(parse_positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    where = []
    params = []
    q = (request.args.get("q") or "").strip()
    if q:
        pattern = like_pattern(q)
        where.append(
            "(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' "
            "OR c.phone LIKE ? ESCAPE '\\' OR c.company LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 4)
    company = (request.args.get("company") or "").strip()
    if company:
        where.append("c.company = ? COLLATE NOCASE")
        params.append(company)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM customers c" + clause, params).fetchone()[0]
    rows = conn.execute(
        CUSTOMER_SELECT + clause + " ORDER BY c.name COLLATE NOCASE, c.id LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [customer_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/companies")
def list_companies():
    rows = db().execute(
        "SELECT company FROM customers WHERE company IS NOT NULL "
        "GROUP BY company COLLATE NOCASE ORDER BY company COLLATE NOCASE"
    ).fetchall()
    return jsonify({"items": [r["company"] for r in rows]})


@app.post("/api/customers")
def create_customer():
    values = validate_customer(json_body())
    ensure_unique_email(values["email"])
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO customers (name, email, phone, company, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                values["name"],
                values["email"],
                values["phone"],
                values["company"],
                values["notes"],
                fmt_time(utcnow()),
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise_duplicate_email()
    return jsonify(customer_dict(load_customer(cur.lastrowid))), 201


@app.get("/api/customers/<int:customer_id>")
def get_customer(customer_id):
    return jsonify(customer_dict(load_customer(customer_id)))


@app.put("/api/customers/<int:customer_id>")
def update_customer(customer_id):
    load_customer(customer_id)
    values = validate_customer(json_body())
    ensure_unique_email(values["email"], exclude_id=customer_id)
    conn = db()
    try:
        conn.execute(
            "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ? "
            "WHERE id = ?",
            (
                values["name"],
                values["email"],
                values["phone"],
                values["company"],
                values["notes"],
                customer_id,
            ),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise_duplicate_email()
    return jsonify(customer_dict(load_customer(customer_id)))


@app.delete("/api/customers/<int:customer_id>")
def delete_customer(customer_id):
    load_customer(customer_id)
    conn = db()
    conn.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
    conn.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    conn.commit()
    return "", 204


# --- interactions -----------------------------------------------------------


def interaction_dict(row):
    return {
        "id": row["id"],
        "customer_id": row["customer_id"],
        "kind": row["kind"],
        "summary": row["summary"],
        "occurred_at": row["occurred_at"],
        "logged_by": row["logged_by"],
    }


INTERACTION_SELECT = """
SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at, u.username AS logged_by
FROM interactions i JOIN users u ON u.id = i.user_id
"""


def parse_occurred_at(raw):
    if not isinstance(raw, str) or not raw.strip():
        return None
    text = raw.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@app.get("/api/customers/<int:customer_id>/interactions")
def list_interactions(customer_id):
    load_customer(customer_id)
    rows = db().execute(
        INTERACTION_SELECT + " WHERE i.customer_id = ? ORDER BY i.occurred_at DESC, i.id DESC",
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [interaction_dict(r) for r in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
def create_interaction(customer_id):
    load_customer(customer_id)
    data = json_body()
    errors = {}
    kind = data.get("kind")
    if isinstance(kind, str):
        kind = kind.strip().lower()
    if not kind:
        errors["kind"] = "Kind is required."
    elif kind not in INTERACTION_KINDS:
        errors["kind"] = "Kind must be one of: call, email, meeting."
    summary = data.get("summary")
    if summary is None or (isinstance(summary, str) and not summary.strip()):
        errors["summary"] = "Summary is required."
    elif not isinstance(summary, str):
        errors["summary"] = "Summary must be a string."
    elif len(summary.strip()) > 5000:
        errors["summary"] = "Summary must be at most 5000 characters."
    raw_occurred = data.get("occurred_at")
    occurred = utcnow()
    if raw_occurred is not None and not (isinstance(raw_occurred, str) and not raw_occurred.strip()):
        parsed = parse_occurred_at(raw_occurred)
        if parsed is None:
            errors["occurred_at"] = "Occurred at must be an ISO 8601 date and time."
        else:
            occurred = parsed
    if errors:
        validation_error(errors)
    conn = db()
    cur = conn.execute(
        "INSERT INTO interactions (customer_id, kind, summary, occurred_at, user_id, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (customer_id, kind, summary.strip(), fmt_time(occurred), g.user["id"], fmt_time(utcnow())),
    )
    conn.commit()
    row = conn.execute(INTERACTION_SELECT + " WHERE i.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(interaction_dict(row)), 201


# --- misc -------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found.")
    if path != "index.html" and (DIST / path).is_file():
        resp = send_from_directory(DIST, path)
        if path.startswith("assets/"):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp
    if not (DIST / "index.html").is_file():
        return "Frontend not built.", 404
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


init_db()
