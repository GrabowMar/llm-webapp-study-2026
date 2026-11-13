"""Subscription billing console: JSON API under /api and frontend server."""

from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
DIST_DIR = BASE_DIR / "frontend" / "dist"

STATUSES = ("trial", "active", "past_due", "cancelled")
STATUS_ALIASES = {"past-due": "past_due"}
MRR_STATUSES = ("active", "past_due")
SUBSCRIPTION_FIELDS = frozenset(
    {
        "customer_name",
        "plan",
        "monthly_amount",
        "renewal_date",
        "status",
        "failed_payment_count",
    }
)
REQUIRED_CREATE_FIELDS = ("customer_name", "plan", "monthly_amount")
DEFAULT_PAGE_SIZE = 50
ALLOWED_STATUSES = frozenset(STATUSES) | frozenset(STATUS_ALIASES)


def canonical_status(value: str) -> str:
    return STATUS_ALIASES.get(value, value)


SCHEMA = """
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
    customer_name TEXT NOT NULL,
    plan TEXT NOT NULL,
    monthly_amount REAL NOT NULL,
    renewal_date TEXT NOT NULL,
    status TEXT NOT NULL,
    failed_payment_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_due REAL NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL,
    paid_at TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL
        REFERENCES subscriptions(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    invoices_affected INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_recent
    ON subscriptions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription
    ON invoices(subscription_id, created_at DESC, id DESC);
"""


class ValidationError(Exception):
    """Raised for invalid request payloads."""


# ---------------------------------------------------------------- database


def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


def close_db(exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        if exc is not None:
            try:
                db.rollback()
            except sqlite3.Error:
                pass
        db.close()


# ---------------------------------------------------------------- helpers


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def money(value: Any) -> float:
    """Round a stored amount to at most two decimals."""
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return 0.0
    if not amount.is_finite():
        return 0.0
    return float(amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def parse_money(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValidationError(f"{field} must be a number")
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValidationError(f"{field} must be a number") from None
    if not amount.is_finite():
        raise ValidationError(f"{field} must be a number")
    return float(amount)


def json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    if data is None:
        raw = request.get_data(as_text=True).strip()
        if raw:
            try:
                data = json.loads(raw)
            except ValueError:
                data = None
    return data if isinstance(data, dict) else {}


def subscription_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": money(row["monthly_amount"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": int(row["failed_payment_count"]),
        "created_at": row["created_at"],
    }


def invoice_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": money(row["amount_due"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def get_subscription_or_404(sub_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (sub_id,)
    ).fetchone()
    if row is None:
        raise NotFound("subscription not found")
    return row


class NotFound(Exception):
    pass


# ---------------------------------------------------------------- auth


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return get_db().execute(
        """
        SELECT u.id, u.username
        FROM tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = ?
        """,
        (token,),
    ).fetchone()


def require_auth(view):
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------- app


app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)


@app.errorhandler(ValidationError)
def handle_validation_error(exc: ValidationError):
    return jsonify({"error": str(exc)}), 400


@app.errorhandler(NotFound)
def handle_not_found(exc: NotFound):
    return jsonify({"error": str(exc)}), 404


# ---------------------------------------------------------------- auth routes


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ValidationError("username is required")
    if not isinstance(password, str) or not password:
        raise ValidationError("password is required")
    username = username.strip()
    if len(username) > 150:
        raise ValidationError("username is too long")

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "invalid credentials"}), 401

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- subscriptions


def validate_subscription_fields(data: dict[str, Any]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for key, value in data.items():
        if key not in SUBSCRIPTION_FIELDS:
            continue
        if key in ("customer_name", "plan"):
            if not isinstance(value, str) or not value.strip():
                raise ValidationError(f"{key} must be a non-empty string")
            updates[key] = value.strip()
        elif key == "monthly_amount":
            updates[key] = parse_money(value, key)
        elif key == "renewal_date":
            if not isinstance(value, str) or not value.strip():
                raise ValidationError("renewal_date must be a string")
            updates[key] = value.strip()
        elif key == "status":
            if not isinstance(value, str) or value.strip() not in ALLOWED_STATUSES:
                raise ValidationError(
                    "status must be one of: " + ", ".join(STATUSES)
                )
            updates[key] = value.strip()
        elif key == "failed_payment_count":
            if (
                isinstance(value, bool)
                or not isinstance(value, int)
                or value < 0
            ):
                raise ValidationError(
                    "failed_payment_count must be a non-negative integer"
                )
            updates[key] = value
    return updates


@app.post("/api/subscriptions")
@require_auth
def create_subscription():
    data = json_body()
    for field in REQUIRED_CREATE_FIELDS:
        if field not in data:
            raise ValidationError(f"{field} is required")
    updates = validate_subscription_fields(data)
    for field in REQUIRED_CREATE_FIELDS:
        if field not in updates:
            raise ValidationError(f"{field} is required")

    if "renewal_date" not in updates:
        default_due = (datetime.now(timezone.utc) + timedelta(days=30)).date()
        updates["renewal_date"] = default_due.isoformat()
    if "status" not in updates:
        updates["status"] = "trial"
    updates["failed_payment_count"] = updates.get("failed_payment_count", 0)
    updates["created_at"] = utcnow()

    columns = ", ".join(updates)
    placeholders = ", ".join("?" for _ in updates)
    db = get_db()
    cursor = db.execute(
        f"INSERT INTO subscriptions ({columns}) VALUES ({placeholders})",
        tuple(updates.values()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(subscription_dict(row)), 201


@app.get("/api/subscriptions")
@require_auth
def list_subscriptions():
    args = request.args
    clauses: list[str] = []
    params: list[Any] = []

    query = args.get("q", "").strip()
    if query:
        escaped = (
            query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        clauses.append("customer_name LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")

    status = args.get("status", "").strip()
    if status:
        clauses.append("REPLACE(status, '-', '_') = ?")
        params.append(canonical_status(status))

    plan = args.get("plan", "").strip()
    if plan:
        clauses.append("plan = ?")
        params.append(plan)

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    try:
        page = int(args.get("page", 1))
        page_size = int(args.get("page_size", DEFAULT_PAGE_SIZE))
    except ValueError:
        raise ValidationError("page and page_size must be integers") from None
    if page < 1:
        raise ValidationError("page must be at least 1")
    if page_size < 1:
        raise ValidationError("page_size must be at least 1")

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM subscriptions {where}", tuple(params)
    ).fetchone()["n"]
    rows = db.execute(
        f"""
        SELECT * FROM subscriptions
        {where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
        """,
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [subscription_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/subscriptions/<int:sub_id>")
@require_auth
def get_subscription(sub_id: int):
    return jsonify(subscription_dict(get_subscription_or_404(sub_id)))


@app.patch("/api/subscriptions/<int:sub_id>")
@require_auth
def patch_subscription(sub_id: int):
    updates = validate_subscription_fields(json_body())
    if not updates:
        raise ValidationError("no updatable fields given")
    get_subscription_or_404(sub_id)

    assignments = ", ".join(f"{field} = ?" for field in updates)
    db = get_db()
    db.execute(
        f"UPDATE subscriptions SET {assignments} WHERE id = ?",
        (*updates.values(), sub_id),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (sub_id,)
    ).fetchone()
    return jsonify(subscription_dict(row))


# ---------------------------------------------------------------- invoices


@app.get("/api/subscriptions/<int:sub_id>/invoices")
@require_auth
def list_invoices(sub_id: int):
    get_subscription_or_404(sub_id)
    rows = get_db().execute(
        """
        SELECT * FROM invoices
        WHERE subscription_id = ?
        ORDER BY created_at DESC, id DESC
        """,
        (sub_id,),
    ).fetchall()
    return jsonify({"items": [invoice_dict(row) for row in rows]})


@app.post("/api/subscriptions/<int:sub_id>/invoices")
@require_auth
def issue_invoice(sub_id: int):
    sub = get_subscription_or_404(sub_id)
    data = json_body()

    if "amount_due" in data:
        amount_due = parse_money(data["amount_due"], "amount_due")
        if amount_due < 0:
            raise ValidationError("amount_due must not be negative")
    else:
        amount_due = float(sub["monthly_amount"])

    if "due_date" in data:
        due_date = data["due_date"]
        if not isinstance(due_date, str) or not due_date.strip():
            raise ValidationError("due_date must be a string")
        due_date = due_date.strip()
    else:
        due_date = sub["renewal_date"]

    now = utcnow()
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO invoices
            (subscription_id, amount_due, due_date, status, paid_at, created_at)
        VALUES (?, ?, ?, 'open', NULL, ?)
        """,
        (sub_id, amount_due, due_date, now),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM invoices WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(invoice_dict(row)), 201


# ---------------------------------------------------------------- collections


@app.post("/api/subscriptions/<int:sub_id>/collections")
@require_auth
def record_collection(sub_id: int):
    get_subscription_or_404(sub_id)
    data = json_body()
    outcome = data.get("outcome")
    if outcome not in ("failed", "succeeded"):
        raise ValidationError("outcome must be 'failed' or 'succeeded'")

    now = utcnow()
    db = get_db()
    open_rows = db.execute(
        "SELECT id FROM invoices WHERE subscription_id = ? AND status = 'open'",
        (sub_id,),
    ).fetchall()

    if outcome == "succeeded":
        db.execute(
            """
            UPDATE invoices
            SET status = 'paid', paid_at = ?
            WHERE subscription_id = ? AND status = 'open'
            """,
            (now, sub_id),
        )
    else:
        db.execute(
            """
            UPDATE subscriptions
            SET failed_payment_count = failed_payment_count + 1
            WHERE id = ?
            """,
            (sub_id,),
        )

    cursor = db.execute(
        """
        INSERT INTO collections
            (subscription_id, outcome, invoices_affected, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (sub_id, outcome, len(open_rows), now),
    )
    db.commit()

    return (
        jsonify(
            {
                "id": cursor.lastrowid,
                "subscription_id": sub_id,
                "outcome": outcome,
                "invoices_affected": len(open_rows),
                "created_at": now,
            }
        ),
        201,
    )


# ---------------------------------------------------------------- public stats


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    counts: dict[str, int] = {status: 0 for status in STATUSES}
    aliases: dict[str, int] = {}
    total = Decimal("0")
    for row in db.execute(
        "SELECT status, COUNT(*) AS n, COALESCE(SUM(monthly_amount), 0) AS s "
        "FROM subscriptions GROUP BY status"
    ):
        status = row["status"]
        key = canonical_status(status)
        counts[key] = counts.get(key, 0) + int(row["n"])
        if status != key:
            aliases[status] = int(row["n"])
        if key in MRR_STATUSES:
            total += Decimal(str(row["s"]))
    counts.update(aliases)

    mrr = float(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return jsonify({"mrr": mrr, "counts": counts})


# ---------------------------------------------------------------- misc / frontend


@app.get("/api/health")
def health():
    return {"status": "ok"}


API_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]


@app.route("/", methods=API_METHODS)
@app.route("/<path:path>", methods=API_METHODS)
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return jsonify({"error": "not found"}), 404
    target = DIST_DIR / path
    if path != "index.html" and target.is_file() and target.is_relative_to(DIST_DIR):
        return send_from_directory(DIST_DIR, path)
    index = DIST_DIR / "index.html"
    if index.is_file():
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"error": "frontend build not found"}), 404


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=False)
