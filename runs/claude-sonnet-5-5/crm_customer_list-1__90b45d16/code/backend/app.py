"""Customer directory: Flask API plus the built React frontend."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadData, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or ROOT / "data")
DB_PATH = DATA_DIR / "directory.db"
TOKEN_MAX_AGE = 7 * 24 * 3600
KINDS = ("call", "email", "meeting")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DUMMY_HASH = generate_password_hash("not-a-real-password")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


def load_secret() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "secret.key"
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        return path.read_text().strip()
    with os.fdopen(fd, "w") as fh:
        fh.write(secrets.token_hex(32))
    return path.read_text().strip()


serializer = URLSafeTimedSerializer(load_secret(), salt="auth-token")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    conn.execute("PRAGMA journal_mode = WAL")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            phone TEXT,
            company TEXT,
            notes TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_customers_name ON customers (name COLLATE NOCASE);
        CREATE TABLE IF NOT EXISTS interactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
            kind TEXT NOT NULL,
            summary TEXT NOT NULL,
            occurred_at TEXT NOT NULL,
            user_id INTEGER NOT NULL REFERENCES users (id)
        );
        CREATE INDEX IF NOT EXISTS idx_interactions_customer
            ON interactions (customer_id, occurred_at);
        """
    )
    conn.commit()
    conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def fmt_time(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def now() -> str:
    return fmt_time(datetime.now(timezone.utc))


def error(message: str, status: int, errors: dict | None = None):
    body: dict = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


@app.errorhandler(HTTPException)
def handle_http(exc: HTTPException):
    if request.path.startswith("/api/"):
        return error(exc.description or exc.name, exc.code or 500)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    app.logger.exception("Unhandled error")
    return error("Internal server error", 500)


def json_object():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    try:
        user_id = serializer.loads(token.strip(), max_age=TOKEN_MAX_AGE)
    except BadData:
        return None
    if not isinstance(user_id, int):
        return None
    return db().execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()


@app.before_request
def require_auth():
    path = request.path
    if not path.startswith("/api/") or request.method == "OPTIONS":
        return None
    if path in ("/api/health", "/api/auth/register", "/api/auth/login"):
        return None
    user = current_user()
    if user is None:
        resp, status = error("Authentication required", 401)
        resp.headers["WWW-Authenticate"] = "Bearer"
        return resp, status
    g.user = user
    return None


@app.get("/api/health")
def health():
    return {"status": "ok"}


def credentials():
    data = json_object()
    if data is None:
        return None, None, error("Request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    return username, password, None


@app.post("/api/auth/register")
def register():
    username, password, err = credentials()
    if err:
        return err
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > 64:
        errors["username"] = "Username must be at most 64 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters"
    elif len(password) > 256:
        errors["password"] = "Password must be at most 256 characters"
    if errors:
        return error("Validation failed", 422, errors)
    username = username.strip()
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now()),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error(
            "Validation failed", 409, {"username": "This username is already taken"}
        )
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, err = credentials()
    if err:
        return err
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Invalid username or password", 401)
    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    stored = row["password_hash"] if row else DUMMY_HASH
    ok = check_password_hash(stored, password)
    if not row or not ok:
        return error("Invalid username or password", 401)
    return jsonify({"token": serializer.dumps(row["id"])})


CUSTOMER_SELECT = """
    SELECT c.id, c.name, c.email, c.phone, c.company, c.notes, c.created_at,
           (SELECT COUNT(*) FROM interactions i WHERE i.customer_id = c.id)
               AS interaction_count,
           (SELECT MAX(i.occurred_at) FROM interactions i WHERE i.customer_id = c.id)
               AS last_contacted_at
    FROM customers c
"""


def customer_dict(row: sqlite3.Row) -> dict:
    return {k: row[k] for k in row.keys()}


def fetch_customer(customer_id: int):
    return db().execute(CUSTOMER_SELECT + " WHERE c.id = ?", (customer_id,)).fetchone()


def clean_text(data, field, label, max_len, required=False):
    value = data.get(field)
    if value is None:
        return (None, f"{label} is required") if required else (None, None)
    if not isinstance(value, str):
        return None, f"{label} must be a string"
    value = value.strip()
    if not value:
        return (None, f"{label} is required") if required else (None, None)
    if len(value) > max_len:
        return None, f"{label} must be at most {max_len} characters"
    return value, None


def validate_customer(data):
    errors = {}
    values = {}
    for field, label, max_len, required in (
        ("name", "Name", 200, True),
        ("email", "Email", 254, True),
        ("phone", "Phone", 50, False),
        ("company", "Company", 200, False),
        ("notes", "Notes", 5000, False),
    ):
        value, msg = clean_text(data, field, label, max_len, required)
        if msg:
            errors[field] = msg
        values[field] = value
    if "email" not in errors and not EMAIL_RE.match(values["email"]):
        errors["email"] = "Email is not a valid email address"
    return values, errors


DUPLICATE = {"email": "A customer with this email already exists"}


def email_taken(email: str, exclude_id: int | None = None) -> bool:
    row = db().execute(
        "SELECT id FROM customers WHERE email = ? COLLATE NOCASE AND id IS NOT ?",
        (email, exclude_id),
    ).fetchone()
    return row is not None


def like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def int_param(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        return int(raw), None
    except ValueError:
        return default, f"{name} must be an integer"


@app.get("/api/customers")
def list_customers():
    errors = {}
    page, msg = int_param("page", 1)
    if msg:
        errors["page"] = msg
    page_size, msg = int_param("page_size", 20)
    if msg:
        errors["page_size"] = msg
    if errors:
        return error("Validation failed", 422, errors)
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)

    where, params = [], []
    q = (request.args.get("q") or "").strip()
    if q:
        pattern = f"%{like_escape(q)}%"
        where.append(
            "(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' "
            "OR c.company LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')"
        )
        params += [pattern] * 4
    company = (request.args.get("company") or "").strip()
    if company:
        where.append("c.company = ? COLLATE NOCASE")
        params.append(company)
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = db().execute(
        "SELECT COUNT(*) FROM customers c" + clause, params
    ).fetchone()[0]
    rows = db().execute(
        CUSTOMER_SELECT
        + clause
        + " ORDER BY c.name COLLATE NOCASE, c.id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
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
        "SELECT DISTINCT company FROM customers WHERE company IS NOT NULL "
        "ORDER BY company COLLATE NOCASE"
    ).fetchall()
    return jsonify({"items": [r["company"] for r in rows]})


@app.post("/api/customers")
def create_customer():
    data = json_object()
    if data is None:
        return error("Request body must be a JSON object", 400)
    values, errors = validate_customer(data)
    if errors:
        return error("Validation failed", 422, errors)
    if email_taken(values["email"]):
        return error("Validation failed", 409, DUPLICATE)
    try:
        cur = db().execute(
            "INSERT INTO customers (name, email, phone, company, notes, created_at) "
            "VALUES (:name, :email, :phone, :company, :notes, :created_at)",
            {**values, "created_at": now()},
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error("Validation failed", 409, DUPLICATE)
    return jsonify(customer_dict(fetch_customer(cur.lastrowid))), 201


@app.get("/api/customers/<int:customer_id>")
def get_customer(customer_id: int):
    row = fetch_customer(customer_id)
    if row is None:
        return error("Customer not found", 404)
    return jsonify(customer_dict(row))


@app.put("/api/customers/<int:customer_id>")
def update_customer(customer_id: int):
    if fetch_customer(customer_id) is None:
        return error("Customer not found", 404)
    data = json_object()
    if data is None:
        return error("Request body must be a JSON object", 400)
    values, errors = validate_customer(data)
    if errors:
        return error("Validation failed", 422, errors)
    if email_taken(values["email"], customer_id):
        return error("Validation failed", 409, DUPLICATE)
    try:
        db().execute(
            "UPDATE customers SET name = :name, email = :email, phone = :phone, "
            "company = :company, notes = :notes WHERE id = :id",
            {**values, "id": customer_id},
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error("Validation failed", 409, DUPLICATE)
    return jsonify(customer_dict(fetch_customer(customer_id)))


@app.delete("/api/customers/<int:customer_id>")
def delete_customer(customer_id: int):
    cur = db().execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    db().commit()
    if cur.rowcount == 0:
        return error("Customer not found", 404)
    return "", 204


INTERACTION_SELECT = """
    SELECT i.id, i.customer_id, i.kind, i.summary, i.occurred_at,
           u.username AS logged_by
    FROM interactions i JOIN users u ON u.id = i.user_id
"""


def parse_time(value):
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return fmt_time(dt)


@app.get("/api/customers/<int:customer_id>/interactions")
def list_interactions(customer_id: int):
    if fetch_customer(customer_id) is None:
        return error("Customer not found", 404)
    rows = db().execute(
        INTERACTION_SELECT
        + " WHERE i.customer_id = ? ORDER BY i.occurred_at DESC, i.id DESC",
        (customer_id,),
    ).fetchall()
    return jsonify({"items": [dict(r) for r in rows]})


@app.post("/api/customers/<int:customer_id>/interactions")
def create_interaction(customer_id: int):
    if fetch_customer(customer_id) is None:
        return error("Customer not found", 404)
    data = json_object()
    if data is None:
        return error("Request body must be a JSON object", 400)
    errors = {}
    kind = data.get("kind")
    if not isinstance(kind, str) or kind.strip().lower() not in KINDS:
        errors["kind"] = "Kind must be one of: " + ", ".join(KINDS)
    summary, msg = clean_text(data, "summary", "Summary", 2000, True)
    if msg:
        errors["summary"] = msg
    occurred_at = now()
    if data.get("occurred_at") not in (None, ""):
        occurred_at = parse_time(data["occurred_at"])
        if occurred_at is None:
            errors["occurred_at"] = "Date must be an ISO 8601 date/time"
    if errors:
        return error("Validation failed", 422, errors)
    try:
        cur = db().execute(
            "INSERT INTO interactions (customer_id, kind, summary, occurred_at, user_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (customer_id, kind.strip().lower(), summary, occurred_at, g.user["id"]),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error("Customer not found", 404)
    row = db().execute(INTERACTION_SELECT + " WHERE i.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(dict(row)), 201


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str):
    return error("Not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
