"""Flask entry point for the subscription billing console."""

from __future__ import annotations

import hashlib
import math
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

STATUSES = ("trial", "active", "past_due", "cancelled")
MRR_STATUSES = ("active", "past_due")
TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MAX_CENTS = 100_000_000_000
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@-]{3,64}$")
DUMMY_HASH = generate_password_hash("dummy-password-for-timing")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

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
CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    plan TEXT NOT NULL,
    monthly_amount_cents INTEGER NOT NULL,
    renewal_date TEXT NOT NULL,
    status TEXT NOT NULL,
    failed_payment_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_due_cents INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL,
    paid_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id);
CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    invoice_count INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL,
    recorded_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
);
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        if conn.in_transaction:
            conn.rollback()
        conn.close()


class transaction:
    """BEGIN IMMEDIATE ... COMMIT, serialising writers."""

    def __enter__(self):
        self.conn = db()
        self.conn.execute("BEGIN IMMEDIATE")
        return self.conn

    def __exit__(self, exc_type, _exc, _tb):
        if exc_type is None:
            self.conn.execute("COMMIT")
        else:
            self.conn.execute("ROLLBACK")
        return False


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def cents_to_number(cents: int):
    if cents % 100 == 0:
        return cents // 100
    return float(Decimal(cents) / Decimal(100))


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def parse_money(value, field: str, *, allow_zero: bool = True) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ApiError(400, f"{field} must be a number", {field: "must be a number"})
    if isinstance(value, float) and not math.isfinite(value):
        raise ApiError(400, f"{field} must be a finite number", {field: "must be finite"})
    try:
        amount = Decimal(str(value).strip())
    except InvalidOperation:
        raise ApiError(400, f"{field} must be a number", {field: "must be a number"}) from None
    if not amount.is_finite():
        raise ApiError(400, f"{field} must be a finite number", {field: "must be finite"})
    cents = amount * 100
    if cents != cents.to_integral_value():
        raise ApiError(400, f"{field} must have at most two decimals", {field: "at most two decimals"})
    cents = int(cents)
    if cents < 0 or (cents == 0 and not allow_zero):
        msg = "must not be negative" if allow_zero else "must be greater than zero"
        raise ApiError(400, f"{field} {msg}", {field: msg})
    if cents > MAX_CENTS:
        raise ApiError(400, f"{field} is too large", {field: "too large"})
    return cents


def parse_date(value, field: str) -> str:
    if not isinstance(value, str) or not DATE_RE.match(value.strip()):
        raise ApiError(400, f"{field} must be a date (YYYY-MM-DD)", {field: "must be YYYY-MM-DD"})
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise ApiError(400, f"{field} is not a valid date", {field: "invalid date"}) from None


def parse_text(value, field: str, max_len: int) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{field} is required", {field: "required"})
    value = value.strip()
    if len(value) > max_len:
        raise ApiError(400, f"{field} is too long", {field: f"at most {max_len} characters"})
    return value


def parse_status(value) -> str:
    if value not in STATUSES:
        raise ApiError(400, f"status must be one of {', '.join(STATUSES)}", {"status": "invalid"})
    return value


def add_month(d: date) -> date:
    year, month = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    for day in (d.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    raise AssertionError("unreachable")


def serialize_subscription(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": cents_to_number(row["monthly_amount_cents"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def serialize_invoice(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": cents_to_number(row["amount_due_cents"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
        "created_at": row["created_at"],
    }


def get_subscription_row(conn: sqlite3.Connection, sub_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM subscriptions WHERE id = ?", (sub_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Subscription not found")
    return row


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 512:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= now_iso():
        return None
    return {"id": row["id"], "username": row["username"]}


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


# --------------------------------------------------------------------------
# Error handling and headers
# --------------------------------------------------------------------------


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.details:
        body["details"] = err.details
    resp = jsonify(body)
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        if err.code == 405 and hasattr(err, "valid_methods") and err.valid_methods:
            resp.headers["Allow"] = ", ".join(err.valid_methods)
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error", exc_info=err)
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


# --------------------------------------------------------------------------
# Routes: health and auth
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        raise ApiError(
            400,
            "username must be 3-64 characters (letters, digits, _ . @ -)",
            {"username": "invalid"},
        )
    if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
        raise ApiError(400, "password must be 8-256 characters", {"password": "invalid"})
    username = username.strip()
    pw_hash = generate_password_hash(password)
    try:
        with transaction() as conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, pw_hash, now_iso()),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "taken"}) from None
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    with transaction() as conn:
        conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (now_iso(),))
        conn.execute(
            "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (
                hash_token(token),
                row["id"],
                now_iso(),
                (now + TOKEN_TTL).isoformat(timespec="microseconds").replace("+00:00", "Z"),
            ),
        )
    return {"token": token, "username": row["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    with transaction() as conn:
        conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


# --------------------------------------------------------------------------
# Routes: public
# --------------------------------------------------------------------------


@app.get("/api/public/stats")
def public_stats():
    rows = db().execute(
        "SELECT status, COUNT(*) AS n, COALESCE(SUM(monthly_amount_cents), 0) AS cents "
        "FROM subscriptions GROUP BY status"
    ).fetchall()
    counts = {s: 0 for s in STATUSES}
    mrr_cents = 0
    for row in rows:
        counts[row["status"]] = row["n"]
        if row["status"] in MRR_STATUSES:
            mrr_cents += row["cents"]
    return {"mrr": cents_to_number(mrr_cents), "counts": counts, "total": sum(counts.values())}


# --------------------------------------------------------------------------
# Routes: subscriptions
# --------------------------------------------------------------------------


def parse_positive_int(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer", {name: "invalid"}) from None
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer", {name: "invalid"})
    return value


@app.get("/api/subscriptions")
@login_required
def list_subscriptions():
    page = parse_positive_int("page", 1)
    page_size = min(parse_positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    clauses, params = [], []
    q = (request.args.get("q") or "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append("customer_name LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    status = (request.args.get("status") or "").strip()
    if status and status != "all":
        clauses.append("status = ?")
        params.append(parse_status(status))
    plan = (request.args.get("plan") or "").strip()
    if plan:
        clauses.append("plan = ? COLLATE NOCASE")
        params.append(plan)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM subscriptions {where}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM subscriptions {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [serialize_subscription(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/plans")
@login_required
def list_plans():
    rows = db().execute("SELECT DISTINCT plan FROM subscriptions ORDER BY plan COLLATE NOCASE").fetchall()
    return {"items": [r["plan"] for r in rows]}


@app.post("/api/subscriptions")
@login_required
def create_subscription():
    data = json_body()
    customer_name = parse_text(data.get("customer_name"), "customer_name", 200)
    plan = parse_text(data.get("plan"), "plan", 100)
    if "monthly_amount" not in data or data.get("monthly_amount") is None:
        raise ApiError(400, "monthly_amount is required", {"monthly_amount": "required"})
    amount = parse_money(data["monthly_amount"], "monthly_amount")
    if data.get("renewal_date") is not None:
        renewal = parse_date(data["renewal_date"], "renewal_date")
    else:
        renewal = add_month(datetime.now(timezone.utc).date()).isoformat()
    status = parse_status(data["status"]) if data.get("status") is not None else "active"
    with transaction() as conn:
        cur = conn.execute(
            "INSERT INTO subscriptions (customer_name, plan, monthly_amount_cents, renewal_date, "
            "status, failed_payment_count, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
            (customer_name, plan, amount, renewal, status, now_iso()),
        )
        row = get_subscription_row(conn, cur.lastrowid)
    return serialize_subscription(row), 201


@app.get("/api/subscriptions/<int:sub_id>")
@login_required
def get_subscription(sub_id: int):
    return serialize_subscription(get_subscription_row(db(), sub_id))


@app.patch("/api/subscriptions/<int:sub_id>")
@login_required
def update_subscription(sub_id: int):
    data = json_body()
    updates: dict[str, object] = {}
    if "customer_name" in data:
        updates["customer_name"] = parse_text(data["customer_name"], "customer_name", 200)
    if "plan" in data:
        updates["plan"] = parse_text(data["plan"], "plan", 100)
    if "monthly_amount" in data:
        if data["monthly_amount"] is None:
            raise ApiError(400, "monthly_amount is required", {"monthly_amount": "required"})
        updates["monthly_amount_cents"] = parse_money(data["monthly_amount"], "monthly_amount")
    if "renewal_date" in data:
        updates["renewal_date"] = parse_date(data["renewal_date"], "renewal_date")
    if "status" in data:
        updates["status"] = parse_status(data["status"])
    with transaction() as conn:
        get_subscription_row(conn, sub_id)
        if updates:
            assignments = ", ".join(f"{col} = ?" for col in updates)
            conn.execute(
                f"UPDATE subscriptions SET {assignments} WHERE id = ?",
                [*updates.values(), sub_id],
            )
        row = get_subscription_row(conn, sub_id)
    return serialize_subscription(row)


# --------------------------------------------------------------------------
# Routes: invoices and collections
# --------------------------------------------------------------------------


@app.get("/api/subscriptions/<int:sub_id>/invoices")
@login_required
def list_invoices(sub_id: int):
    conn = db()
    get_subscription_row(conn, sub_id)
    rows = conn.execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY created_at DESC, id DESC",
        (sub_id,),
    ).fetchall()
    return {"items": [serialize_invoice(r) for r in rows]}


@app.post("/api/subscriptions/<int:sub_id>/invoices")
@login_required
def issue_invoice(sub_id: int):
    data = request.get_json(silent=True)
    if data is None and not request.get_data():
        data = {}
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    with transaction() as conn:
        sub = get_subscription_row(conn, sub_id)
        if sub["status"] == "cancelled":
            raise ApiError(409, "Cannot issue an invoice for a cancelled subscription")
        if data.get("amount_due") is not None:
            amount = parse_money(data["amount_due"], "amount_due", allow_zero=False)
        else:
            amount = sub["monthly_amount_cents"]
            if amount <= 0:
                raise ApiError(400, "amount_due must be greater than zero", {"amount_due": "required"})
        if data.get("due_date") is not None:
            due = parse_date(data["due_date"], "due_date")
        else:
            due = sub["renewal_date"]
        cur = conn.execute(
            "INSERT INTO invoices (subscription_id, amount_due_cents, due_date, status, paid_at, "
            "created_at) VALUES (?, ?, ?, 'open', NULL, ?)",
            (sub_id, amount, due, now_iso()),
        )
        row = conn.execute("SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)).fetchone()
    return serialize_invoice(row), 201


@app.post("/api/subscriptions/<int:sub_id>/collections")
@login_required
def record_collection(sub_id: int):
    data = json_body()
    outcome = data.get("outcome")
    if outcome not in ("failed", "succeeded"):
        raise ApiError(400, "outcome must be 'failed' or 'succeeded'", {"outcome": "invalid"})
    with transaction() as conn:
        sub = get_subscription_row(conn, sub_id)
        open_invoices = conn.execute(
            "SELECT * FROM invoices WHERE subscription_id = ? AND status = 'open' ORDER BY id",
            (sub_id,),
        ).fetchall()
        if not open_invoices:
            raise ApiError(409, "Subscription has no open invoices to collect")
        invoice_ids = [r["id"] for r in open_invoices]
        total_cents = sum(r["amount_due_cents"] for r in open_invoices)
        ts = now_iso()
        if outcome == "succeeded":
            conn.executemany(
                "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'open'",
                [(ts, i) for i in invoice_ids],
            )
            new_status = "active" if sub["status"] == "past_due" else sub["status"]
            conn.execute(
                "UPDATE subscriptions SET failed_payment_count = 0, status = ? WHERE id = ?",
                (new_status, sub_id),
            )
        else:
            new_status = "past_due" if sub["status"] == "active" else sub["status"]
            conn.execute(
                "UPDATE subscriptions SET failed_payment_count = failed_payment_count + 1, "
                "status = ? WHERE id = ?",
                (new_status, sub_id),
            )
        conn.execute(
            "INSERT INTO collection_runs (subscription_id, outcome, invoice_count, amount_cents, "
            "recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (sub_id, outcome, len(invoice_ids), total_cents, g.user["id"], ts),
        )
        sub = get_subscription_row(conn, sub_id)
        placeholders = ",".join("?" * len(invoice_ids))
        invoices = conn.execute(
            f"SELECT * FROM invoices WHERE id IN ({placeholders}) ORDER BY created_at DESC, id DESC",
            invoice_ids,
        ).fetchall()
    body = serialize_subscription(sub)
    body["outcome"] = outcome
    body["subscription"] = serialize_subscription(sub)
    body["invoices"] = [serialize_invoice(r) for r in invoices]
    return body


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "Frontend not built"}), 404
    resp = send_from_directory(DIST, "index.html")
    resp.headers["Cache-Control"] = "no-cache"
    return resp


init_db()
