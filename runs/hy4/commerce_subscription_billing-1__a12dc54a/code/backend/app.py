"""Subscription billing console: JSON API plus the built frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "billing.sqlite3"

MRR_STATUSES = frozenset({"active", "past_due"})
STATUS_ALIASES = {
    "pastdue": "past_due",
    "canceled": "cancelled",
    "cancel": "cancelled",
    "trialing": "trial",
    "trialling": "trial",
    "in_trial": "trial",
}

app = Flask(__name__, static_folder=None)
app.url_map.strict_slashes = False


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def api_error(error: ApiError):
    return jsonify(error=error.message), error.status


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return jsonify(error="not found"), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return jsonify(error="method not allowed"), 405
    return jsonify(error="method not allowed"), 405


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def today_iso() -> str:
    return date.today().isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 15000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_error):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
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
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL DEFAULT '',
                plan TEXT NOT NULL DEFAULT '',
                monthly_amount REAL NOT NULL DEFAULT 0,
                renewal_date TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                failed_payment_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL
                    REFERENCES subscriptions(id) ON DELETE CASCADE,
                amount_due REAL NOT NULL DEFAULT 0,
                due_date TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                paid_at TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_invoices_subscription
                ON invoices(subscription_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_status
                ON subscriptions(status);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def money(value, field: str = "amount") -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str, Decimal)):
        raise ApiError(f"{field} must be a number")
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ApiError(f"{field} must be a number")
    if not number.is_finite() or number < 0:
        raise ApiError(f"{field} must be a non-negative number")
    return float(number.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def text(value, field: str) -> str:
    if not isinstance(value, str):
        raise ApiError(f"{field} must be a string")
    return value.strip()


def date_string(value, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{field} must be a YYYY-MM-DD date")
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise ApiError(f"{field} must be a YYYY-MM-DD date")


def status_string(value) -> str:
    value = text(value, "status").lower().replace("-", "_").replace(" ", "_")
    return STATUS_ALIASES.get(value, value)


def count_value(value, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ApiError(f"{field} must be a non-negative integer")
    try:
        number = int(value)
    except ValueError:
        raise ApiError(f"{field} must be a non-negative integer")
    if number < 0:
        raise ApiError(f"{field} must be a non-negative integer")
    return number


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ApiError("JSON body must be an object")
    return data


def subscription_fields(data: dict) -> dict:
    fields: dict = {}
    if "customer_name" in data:
        fields["customer_name"] = text(data["customer_name"], "customer_name")
    if "plan" in data:
        fields["plan"] = text(data["plan"], "plan")
    if "monthly_amount" in data:
        fields["monthly_amount"] = money(data["monthly_amount"], "monthly_amount")
    if "renewal_date" in data and data["renewal_date"] not in (None, ""):
        fields["renewal_date"] = date_string(data["renewal_date"], "renewal_date")
    if "status" in data:
        status = status_string(data["status"])
        if not status:
            raise ApiError("status must not be empty")
        fields["status"] = status
    if "failed_payment_count" in data:
        fields["failed_payment_count"] = count_value(
            data["failed_payment_count"], "failed_payment_count"
        )
    return fields


def subscription_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": money(row["monthly_amount"], "monthly_amount"),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def invoice_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": money(row["amount_due"], "amount_due"),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def get_subscription_or_404(subscription_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    if row is None:
        raise ApiError("subscription not found", 404)
    return row


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        parts = header.split(None, 1)
        token = parts[1].strip() if len(parts) == 2 and parts[0].lower() == "bearer" else ""
        if token:
            user = get_db().execute(
                "SELECT u.id, u.username FROM tokens t "
                "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (token,),
            ).fetchone()
            if user is not None:
                g.user = user
                return view(*args, **kwargs)
        raise ApiError("authentication required", 401)

    return wrapped


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = text(data.get("username", ""), "username")
    password = data.get("password", "")
    if not username:
        raise ApiError("username is required")
    if not isinstance(password, str) or not password:
        raise ApiError("password is required")
    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError("username already taken", 409)
    with conn:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    return jsonify(id=cursor.lastrowid, username=username), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = text(data.get("username", ""), "username")
    password = data.get("password", "")
    if not username or not isinstance(password, str) or not password:
        raise ApiError("username and password are required", 401)
    conn = get_db()
    user = conn.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    with conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], now_iso()),
        )
    return jsonify(token=token, username=username)


@app.post("/api/auth/logout")
@require_auth
def logout():
    parts = request.headers.get("Authorization", "").split(None, 1)
    with get_db() as conn:
        conn.execute("DELETE FROM tokens WHERE token = ?", (parts[1].strip(),))
    return jsonify(status="ok")


@app.get("/api/public/stats")
def public_stats():
    conn = get_db()
    rows = conn.execute("SELECT status, monthly_amount FROM subscriptions").fetchall()
    mrr = Decimal("0")
    counts: dict[str, int] = {}
    for row in rows:
        status = row["status"]
        counts[status] = counts.get(status, 0) + 1
        if status.lower() in MRR_STATUSES:
            mrr += Decimal(str(row["monthly_amount"]))
    return jsonify(
        mrr=float(mrr.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)),
        counts=counts,
    )


@app.post("/api/subscriptions")
@require_auth
def create_subscription():
    fields = subscription_fields(json_body())
    values = {
        "customer_name": "",
        "plan": "",
        "monthly_amount": 0.0,
        "renewal_date": today_iso(),
        "status": "active",
        "failed_payment_count": 0,
        **fields,
    }
    conn = get_db()
    with conn:
        cursor = conn.execute(
            "INSERT INTO subscriptions "
            "(customer_name, plan, monthly_amount, renewal_date, status, "
            " failed_payment_count, created_at) "
            "VALUES (:customer_name, :plan, :monthly_amount, :renewal_date, "
            "        :status, :failed_payment_count, :created_at)",
            {**values, "created_at": now_iso()},
        )
    row = conn.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(subscription_json(row)), 201


def int_arg(name: str, default: int, minimum: int = 1) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(f"{name} must be an integer")
    if value < minimum:
        raise ApiError(f"{name} must be >= {minimum}")
    return value


@app.get("/api/subscriptions")
@require_auth
def list_subscriptions():
    page = int_arg("page", 1)
    page_size = min(int_arg("page_size", 20), 500)
    clauses: list[str] = []
    params: list = []
    q = request.args.get("q", "").strip()
    if q:
        clauses.append("LOWER(customer_name) LIKE ?")
        params.append(f"%{q.lower()}%")
    status = request.args.get("status", "").strip()
    if status:
        clauses.append("status = ?")
        params.append(status_string(status))
    plan = request.args.get("plan", "").strip()
    if plan:
        clauses.append("plan = ?")
        params.append(plan)
    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM subscriptions" + where, params
    ).fetchone()["n"]
    rows = conn.execute(
        "SELECT * FROM subscriptions" + where
        + " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        items=[subscription_json(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.get("/api/subscriptions/<int:subscription_id>")
@require_auth
def get_subscription(subscription_id: int):
    return jsonify(subscription_json(get_subscription_or_404(subscription_id)))


@app.patch("/api/subscriptions/<int:subscription_id>")
@require_auth
def update_subscription(subscription_id: int):
    get_subscription_or_404(subscription_id)
    fields = subscription_fields(json_body())
    if fields:
        assignments = ", ".join(f"{key} = ?" for key in fields)
        with get_db() as conn:
            conn.execute(
                f"UPDATE subscriptions SET {assignments} WHERE id = ?",
                [*fields.values(), subscription_id],
            )
    return jsonify(
        subscription_json(get_subscription_or_404(subscription_id))
    )


@app.get("/api/subscriptions/<int:subscription_id>/invoices")
@require_auth
def list_invoices(subscription_id: int):
    get_subscription_or_404(subscription_id)
    rows = get_db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? "
        "ORDER BY created_at DESC, id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify(items=[invoice_json(row) for row in rows])


@app.post("/api/subscriptions/<int:subscription_id>/invoices")
@require_auth
def issue_invoice(subscription_id: int):
    subscription = get_subscription_or_404(subscription_id)
    data = json_body()
    amount = (
        money(data["amount_due"], "amount_due")
        if "amount_due" in data
        else money(subscription["monthly_amount"], "monthly_amount")
    )
    due_date = (
        date_string(data["due_date"], "due_date")
        if "due_date" in data
        else (subscription["renewal_date"] or today_iso())
    )
    conn = get_db()
    with conn:
        cursor = conn.execute(
            "INSERT INTO invoices "
            "(subscription_id, amount_due, due_date, status, paid_at, created_at) "
            "VALUES (?, ?, ?, 'open', NULL, ?)",
            (subscription_id, amount, due_date, now_iso()),
        )
    row = conn.execute(
        "SELECT * FROM invoices WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(invoice_json(row)), 201


@app.post("/api/subscriptions/<int:subscription_id>/collections")
@require_auth
def record_collection(subscription_id: int):
    subscription = get_subscription_or_404(subscription_id)
    outcome = json_body().get("outcome")
    if outcome not in ("failed", "succeeded"):
        raise ApiError("outcome must be 'failed' or 'succeeded'")
    conn = get_db()
    status = subscription["status"]
    failures = subscription["failed_payment_count"]
    if outcome == "failed":
        failures += 1
        if status != "cancelled":
            status = "past_due"
    else:
        failures = 0
        if status == "past_due":
            status = "active"
        with conn:
            conn.execute(
                "UPDATE invoices SET status = 'paid', paid_at = ? "
                "WHERE subscription_id = ? AND status = 'open'",
                (now_iso(), subscription_id),
            )
    with conn:
        conn.execute(
            "UPDATE subscriptions SET failed_payment_count = ?, status = ? WHERE id = ?",
            (failures, status, subscription_id),
        )
    row = conn.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    return jsonify(subscription_json(row))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return jsonify(error="not found"), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
