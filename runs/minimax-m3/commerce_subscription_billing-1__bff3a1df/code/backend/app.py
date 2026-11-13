"""Subscription billing console.

Flask entry point.  Serves the JSON API under ``/api`` and the built
frontend from ``frontend/dist``.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
DIST = PROJECT_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (PROJECT_DIR / "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH") or (DATA_DIR / "billing.db"))

SUBSCRIPTION_STATUSES = ("active", "trial", "past_due", "cancelled")
MRR_STATUSES = ("active", "past_due")
INVOICE_STATUSES = ("open", "paid")
COLLECTION_OUTCOMES = ("failed", "succeeded")

STATUS_ALIASES = {
    "active": "active",
    "trial": "trial",
    "trialing": "trial",
    "past_due": "past_due",
    "pastdue": "past_due",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def utcnow_iso() -> str:
    """Timestamp used for every ``created_at``/``paid_at`` field."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    return now.isoformat().replace("+00:00", "Z")


def to_cents(value: Any, field: str) -> int:
    """Parse a money amount into integer cents."""
    if isinstance(value, bool) or value is None:
        raise ValueError(f"{field} must be a number")
    if not isinstance(value, (int, float, str)):
        raise ValueError(f"{field} must be a number")
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field} must be a number")
    if not amount.is_finite():
        raise ValueError(f"{field} must be a number")
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def to_amount(cents: int) -> float:
    """Render integer cents as a number with at most two decimals."""
    return round(cents / 100, 2)


def to_date(value: Any, field: str) -> str:
    """Normalise a date to ``YYYY-MM-DD``."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()
        if text:
            try:
                return date.fromisoformat(text[:10]).isoformat()
            except ValueError:
                pass
    raise ValueError(f"{field} must be a date (YYYY-MM-DD)")


def normalise_status(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    key = value.strip().lower().replace("-", "_").replace(" ", "_")
    return STATUS_ALIASES.get(key)


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def error(message: str, status: int):
    return jsonify({"error": message}), status


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name         TEXT NOT NULL,
    plan                  TEXT NOT NULL,
    monthly_amount_cents  INTEGER NOT NULL DEFAULT 0,
    renewal_date          TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'active',
    failed_payment_count  INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id     INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_due_cents    INTEGER NOT NULL DEFAULT 0,
    due_date            TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'open',
    paid_at             TEXT,
    created_at          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_runs (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id          INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    outcome                  TEXT NOT NULL,
    invoices_paid            INTEGER NOT NULL DEFAULT 0,
    amount_collected_cents   INTEGER NOT NULL DEFAULT 0,
    created_at               TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_created_at ON subscriptions(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON invoices(subscription_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        try:
            conn.execute("PRAGMA journal_mode = WAL")
        except sqlite3.DatabaseError:  # pragma: no cover - best effort
            pass
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: Any) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------
# serialisers
# --------------------------------------------------------------------------


def user_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "username": row["username"],
        "created_at": row["created_at"],
    }


def subscription_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": to_amount(row["monthly_amount_cents"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def invoice_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": to_amount(row["amount_due_cents"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def collection_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "outcome": row["outcome"],
        "invoices_paid": row["invoices_paid"],
        "amount_collected": to_amount(row["amount_collected_cents"]),
        "created_at": row["created_at"],
    }


# --------------------------------------------------------------------------
# authentication
# --------------------------------------------------------------------------


def current_token() -> str | None:
    header = request.headers.get("Authorization", "").strip()
    if not header:
        return None
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return header


def require_auth(fn: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any):
        token = current_token()
        if not token:
            return error("authentication required", 401)
        row = get_db().execute(
            "SELECT u.id, u.username, u.created_at FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if row is None:
            return error("invalid or expired token", 401)
        g.user = user_json(row)
        g.token = token
        return fn(*args, **kwargs)

    return wrapper


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if len(username) > 64:
        return error("username is too long", 400)
    if len(password) > 256:
        return error("password is too long", 400)

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error("username is already taken", 409)

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), utcnow_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    payload = user_json(row)
    payload["user"] = dict(payload)
    return jsonify(payload), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True) or {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"], "user": user_json(row)}), 200


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify(g.user), 200


@app.post("/api/auth/logout")
@require_auth
def logout():
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (g.token,))
    db.commit()
    return jsonify({"status": "ok"}), 200


# --------------------------------------------------------------------------
# subscriptions
# --------------------------------------------------------------------------


@app.post("/api/subscriptions")
@require_auth
def create_subscription():
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("invalid request body", 400)

    customer_name = body.get("customer_name")
    plan = body.get("plan")
    if not isinstance(customer_name, str) or not customer_name.strip():
        return error("customer_name is required", 400)
    if not isinstance(plan, str) or not plan.strip():
        return error("plan is required", 400)

    try:
        amount_cents = to_cents(body.get("monthly_amount", 0), "monthly_amount")
    except ValueError as exc:
        return error(str(exc), 400)

    renewal_date = body.get("renewal_date")
    if renewal_date is None:
        renewal_raw = date.today().isoformat()
    else:
        try:
            renewal_raw = to_date(renewal_date, "renewal_date")
        except ValueError as exc:
            return error(str(exc), 400)

    status = "active"
    if body.get("status") is not None:
        status = normalise_status(body.get("status"))
        if status is None:
            return error("status must be one of active, trial, past_due, cancelled", 400)

    failed_payment_count = body.get("failed_payment_count", 0)
    if isinstance(failed_payment_count, bool) or not isinstance(failed_payment_count, int):
        try:
            failed_payment_count = int(failed_payment_count)
        except (TypeError, ValueError):
            return error("failed_payment_count must be an integer", 400)
    failed_payment_count = max(0, failed_payment_count)

    db = get_db()
    cursor = db.execute(
        "INSERT INTO subscriptions (customer_name, plan, monthly_amount_cents, renewal_date,"
        " status, failed_payment_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            customer_name.strip(),
            plan.strip(),
            amount_cents,
            renewal_raw,
            status,
            failed_payment_count,
            utcnow_iso(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM subscriptions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(subscription_json(row)), 201


@app.get("/api/subscriptions")
@require_auth
def list_subscriptions():
    q = (request.args.get("q") or "").strip()
    status = request.args.get("status")
    plan = (request.args.get("plan") or "").strip()
    page = request.args.get("page", type=int) or 1
    page_size = request.args.get("page_size", type=int) or 20

    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    where: list[str] = []
    params: list[Any] = []
    if q:
        where.append("LOWER(customer_name) LIKE ?")
        params.append(f"%{q.lower()}%")
    normalised = None
    if status:
        normalised = normalise_status(status)
        if normalised is None:
            if status.strip().lower() in ("all", "any", "*"):
                normalised = None
            else:
                return error("status must be one of active, trial, past_due, cancelled", 400)
    if normalised:
        where.append("status = ?")
        params.append(normalised)
    if plan:
        where.append("LOWER(plan) = ?")
        params.append(plan.lower())

    clause = f" WHERE {' AND '.join(where)}" if where else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) AS c FROM subscriptions{clause}", params).fetchone()["c"]
    rows = db.execute(
        f"SELECT * FROM subscriptions{clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return (
        jsonify(
            {
                "items": [subscription_json(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        ),
        200,
    )


@app.get("/api/subscriptions/plans")
@require_auth
def list_plans():
    rows = get_db().execute(
        "SELECT DISTINCT plan FROM subscriptions ORDER BY plan ASC"
    ).fetchall()
    return jsonify({"items": [row["plan"] for row in rows]}), 200


def fetch_subscription(subscription_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()


@app.get("/api/subscriptions/<int:subscription_id>")
@require_auth
def get_subscription(subscription_id: int):
    row = fetch_subscription(subscription_id)
    if row is None:
        return error("subscription not found", 404)
    return jsonify(subscription_json(row)), 200


@app.patch("/api/subscriptions/<int:subscription_id>")
@app.put("/api/subscriptions/<int:subscription_id>")
@require_auth
def update_subscription(subscription_id: int):
    row = fetch_subscription(subscription_id)
    if row is None:
        return error("subscription not found", 404)

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("invalid request body", 400)

    updates: list[str] = []
    params: list[Any] = []

    if "customer_name" in body:
        value = body.get("customer_name")
        if not isinstance(value, str) or not value.strip():
            return error("customer_name must be a non-empty string", 400)
        updates.append("customer_name = ?")
        params.append(value.strip())

    if "plan" in body:
        value = body.get("plan")
        if not isinstance(value, str) or not value.strip():
            return error("plan must be a non-empty string", 400)
        updates.append("plan = ?")
        params.append(value.strip())

    if "monthly_amount" in body:
        try:
            cents = to_cents(body.get("monthly_amount"), "monthly_amount")
        except ValueError as exc:
            return error(str(exc), 400)
        updates.append("monthly_amount_cents = ?")
        params.append(cents)

    if "renewal_date" in body:
        try:
            renewal = to_date(body.get("renewal_date"), "renewal_date")
        except ValueError as exc:
            return error(str(exc), 400)
        updates.append("renewal_date = ?")
        params.append(renewal)

    if "status" in body:
        status = normalise_status(body.get("status"))
        if status is None:
            return error("status must be one of active, trial, past_due, cancelled", 400)
        updates.append("status = ?")
        params.append(status)

    if "failed_payment_count" in body:
        value = body.get("failed_payment_count")
        if isinstance(value, bool) or not isinstance(value, int):
            try:
                value = int(value)
            except (TypeError, ValueError):
                return error("failed_payment_count must be an integer", 400)
        updates.append("failed_payment_count = ?")
        params.append(max(0, value))

    if updates:
        params.append(subscription_id)
        get_db().execute(
            f"UPDATE subscriptions SET {', '.join(updates)} WHERE id = ?", params
        )
        get_db().commit()

    row = fetch_subscription(subscription_id)
    return jsonify(subscription_json(row)), 200


@app.delete("/api/subscriptions/<int:subscription_id>")
@require_auth
def delete_subscription(subscription_id: int):
    row = fetch_subscription(subscription_id)
    if row is None:
        return error("subscription not found", 404)
    db = get_db()
    db.execute("DELETE FROM invoices WHERE subscription_id = ?", (subscription_id,))
    db.execute("DELETE FROM collection_runs WHERE subscription_id = ?", (subscription_id,))
    db.execute("DELETE FROM subscriptions WHERE id = ?", (subscription_id,))
    db.commit()
    return jsonify({"status": "deleted", "id": subscription_id}), 200


# --------------------------------------------------------------------------
# invoices
# --------------------------------------------------------------------------


@app.get("/api/subscriptions/<int:subscription_id>/invoices")
@require_auth
def list_invoices(subscription_id: int):
    if fetch_subscription(subscription_id) is None:
        return error("subscription not found", 404)
    rows = get_db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY created_at DESC, id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify({"items": [invoice_json(row) for row in rows]}), 200


@app.post("/api/subscriptions/<int:subscription_id>/invoices")
@require_auth
def create_invoice(subscription_id: int):
    subscription = fetch_subscription(subscription_id)
    if subscription is None:
        return error("subscription not found", 404)

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("invalid request body", 400)

    if body.get("amount_due") is None:
        amount_cents = subscription["monthly_amount_cents"]
    else:
        try:
            amount_cents = to_cents(body.get("amount_due"), "amount_due")
        except ValueError as exc:
            return error(str(exc), 400)

    if body.get("due_date") is None:
        due_date = subscription["renewal_date"]
    else:
        try:
            due_date = to_date(body.get("due_date"), "due_date")
        except ValueError as exc:
            return error(str(exc), 400)

    db = get_db()
    cursor = db.execute(
        "INSERT INTO invoices (subscription_id, amount_due_cents, due_date, status, paid_at,"
        " created_at) VALUES (?, ?, ?, 'open', NULL, ?)",
        (subscription_id, amount_cents, due_date, utcnow_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM invoices WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(invoice_json(row)), 201


# --------------------------------------------------------------------------
# collection runs
# --------------------------------------------------------------------------


@app.post("/api/subscriptions/<int:subscription_id>/collections")
@require_auth
def create_collection(subscription_id: int):
    subscription = fetch_subscription(subscription_id)
    if subscription is None:
        return error("subscription not found", 404)

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return error("invalid request body", 400)

    outcome = body.get("outcome")
    if not isinstance(outcome, str) or outcome.strip().lower() not in COLLECTION_OUTCOMES:
        return error("outcome must be 'failed' or 'succeeded'", 400)
    outcome = outcome.strip().lower()

    db = get_db()
    open_invoices = db.execute(
        "SELECT * FROM invoices WHERE subscription_id = ? AND status = 'open' ORDER BY id ASC",
        (subscription_id,),
    ).fetchall()

    invoices_paid = 0
    amount_collected = 0
    failed_payment_count = subscription["failed_payment_count"]
    status = subscription["status"]

    if outcome == "succeeded":
        paid_at = utcnow_iso()
        for invoice in open_invoices:
            db.execute(
                "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?",
                (paid_at, invoice["id"]),
            )
            invoices_paid += 1
            amount_collected += invoice["amount_due_cents"]
        failed_payment_count = 0
        if status == "past_due":
            status = "active"
    else:
        failed_payment_count += 1
        if status != "cancelled":
            status = "past_due"

    cursor = db.execute(
        "INSERT INTO collection_runs (subscription_id, outcome, invoices_paid,"
        " amount_collected_cents, created_at) VALUES (?, ?, ?, ?, ?)",
        (subscription_id, outcome, invoices_paid, amount_collected, utcnow_iso()),
    )
    db.execute(
        "UPDATE subscriptions SET status = ?, failed_payment_count = ? WHERE id = ?",
        (status, failed_payment_count, subscription_id),
    )
    db.commit()

    run = db.execute("SELECT * FROM collection_runs WHERE id = ?", (cursor.lastrowid,)).fetchone()
    row = fetch_subscription(subscription_id)
    payload = subscription_json(row)
    payload["outcome"] = outcome
    payload["invoices_paid"] = invoices_paid
    payload["amount_collected"] = to_amount(amount_collected)
    payload["collection"] = collection_json(run)
    return jsonify(payload), 201


@app.get("/api/subscriptions/<int:subscription_id>/collections")
@require_auth
def list_collections(subscription_id: int):
    if fetch_subscription(subscription_id) is None:
        return error("subscription not found", 404)
    rows = get_db().execute(
        "SELECT * FROM collection_runs WHERE subscription_id = ? ORDER BY created_at DESC, id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify({"items": [collection_json(row) for row in rows]}), 200


# --------------------------------------------------------------------------
# public stats
# --------------------------------------------------------------------------


@app.get("/api/public/stats")
def public_stats():
    rows = get_db().execute(
        "SELECT status, COUNT(*) AS count, SUM(monthly_amount_cents) AS total"
        " FROM subscriptions GROUP BY status"
    ).fetchall()
    counts = {status: 0 for status in SUBSCRIPTION_STATUSES}
    mrr_cents = 0
    for row in rows:
        counts[row["status"]] = row["count"]
        if row["status"] in MRR_STATUSES:
            mrr_cents += row["total"] or 0
    return jsonify({"mrr": to_amount(mrr_cents), "counts": counts}), 200


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------
# frontend
# --------------------------------------------------------------------------


@app.errorhandler(404)
def handle_not_found(_err: Any):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return serve_index()


def serve_index():
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return (
        "<h1>Frontend build missing</h1><p>Run <code>npm run build</code> in frontend/.</p>",
        200,
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return serve_index()


init_db()


if __name__ == "__main__":  # pragma: no cover
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
