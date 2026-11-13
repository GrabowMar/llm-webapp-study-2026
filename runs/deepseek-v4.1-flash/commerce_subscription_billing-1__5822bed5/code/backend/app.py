"""Subscription billing console API and frontend host."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "billing.db"

STATUSES = ("trial", "active", "past_due", "cancelled")
MRR_STATUSES = ("active", "past_due")

app = Flask(__name__, static_folder=None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def round_money(value: Any) -> float:
    return round(float(value) + 1e-9, 2)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
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
            subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
            amount_due REAL NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            paid_at TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 200_000)
    return hmac.compare_digest(candidate.hex(), digest)


def json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def error(message: str, status: int):
    return jsonify({"error": message}), status


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        if current_user() is None:
            return error("unauthorized", 401)
        return view(*args, **kwargs)

    return wrapped


def normalize_status(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    status = value.strip().lower().replace("-", "_").replace(" ", "_")
    return status if status in STATUSES else None


def serialize_subscription(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": round_money(row["monthly_amount"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def serialize_invoice(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": round_money(row["amount_due"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def get_subscription(subscription_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()


def parse_positive_int(value: Any, default: int, maximum: int | None = None) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    if parsed < 1:
        return default
    if maximum is not None:
        return min(parsed, maximum)
    return parsed


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return error("username already exists", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), utc_now()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utc_now()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@login_required
def logout():
    token = bearer_token()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"status": "ok"})


@app.get("/api/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.get("/api/subscriptions")
@login_required
def list_subscriptions():
    db = get_db()
    clauses: list[str] = []
    params: list[Any] = []

    q = request.args.get("q", "").strip()
    if q:
        clauses.append("customer_name LIKE ?")
        params.append(f"%{q}%")

    status_arg = request.args.get("status", "").strip()
    if status_arg:
        status = normalize_status(status_arg)
        if status is None:
            return jsonify({"items": [], "total": 0, "page": 1, "page_size": 10})
        clauses.append("status = ?")
        params.append(status)

    plan = request.args.get("plan", "").strip()
    if plan:
        clauses.append("plan = ?")
        params.append(plan)

    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM subscriptions{where}", params
    ).fetchone()["n"]

    page = parse_positive_int(request.args.get("page"), 1)
    page_size = parse_positive_int(request.args.get("page_size"), 10, 100)
    offset = (page - 1) * page_size

    rows = db.execute(
        f"SELECT * FROM subscriptions{where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_subscription(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/subscriptions")
@login_required
def create_subscription():
    body = json_body()
    customer_name = body.get("customer_name")
    plan = body.get("plan")
    monthly_amount = body.get("monthly_amount")
    renewal_date = body.get("renewal_date")

    if not isinstance(customer_name, str) or not customer_name.strip():
        return error("customer_name is required", 400)
    if not isinstance(plan, str) or not plan.strip():
        return error("plan is required", 400)
    if isinstance(monthly_amount, bool) or not isinstance(monthly_amount, (int, float)):
        return error("monthly_amount must be a number", 400)
    if not isinstance(renewal_date, str) or not renewal_date.strip():
        return error("renewal_date is required", 400)

    status = normalize_status(body.get("status", "trial"))
    if status is None:
        return error("invalid status", 400)

    db = get_db()
    cur = db.execute(
        """INSERT INTO subscriptions
           (customer_name, plan, monthly_amount, renewal_date, status, failed_payment_count, created_at)
           VALUES (?, ?, ?, ?, ?, 0, ?)""",
        (
            customer_name.strip(),
            plan.strip(),
            round_money(monthly_amount),
            renewal_date.strip(),
            status,
            utc_now(),
        ),
    )
    db.commit()
    row = get_subscription(cur.lastrowid)
    return jsonify(serialize_subscription(row)), 201


@app.get("/api/subscriptions/<int:subscription_id>")
@login_required
def show_subscription(subscription_id: int):
    row = get_subscription(subscription_id)
    if row is None:
        return error("subscription not found", 404)
    return jsonify(serialize_subscription(row))


@app.patch("/api/subscriptions/<int:subscription_id>")
@login_required
def update_subscription(subscription_id: int):
    row = get_subscription(subscription_id)
    if row is None:
        return error("subscription not found", 404)

    body = json_body()
    updates: list[str] = []
    params: list[Any] = []

    if "customer_name" in body:
        value = body["customer_name"]
        if not isinstance(value, str) or not value.strip():
            return error("customer_name must not be empty", 400)
        updates.append("customer_name = ?")
        params.append(value.strip())

    if "plan" in body:
        value = body["plan"]
        if not isinstance(value, str) or not value.strip():
            return error("plan must not be empty", 400)
        updates.append("plan = ?")
        params.append(value.strip())

    if "monthly_amount" in body:
        value = body["monthly_amount"]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return error("monthly_amount must be a number", 400)
        updates.append("monthly_amount = ?")
        params.append(round_money(value))

    if "renewal_date" in body:
        value = body["renewal_date"]
        if not isinstance(value, str) or not value.strip():
            return error("renewal_date must not be empty", 400)
        updates.append("renewal_date = ?")
        params.append(value.strip())

    if "status" in body:
        status = normalize_status(body["status"])
        if status is None:
            return error("invalid status", 400)
        updates.append("status = ?")
        params.append(status)

    if "failed_payment_count" in body:
        value = body["failed_payment_count"]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            return error("failed_payment_count must be a non-negative integer", 400)
        updates.append("failed_payment_count = ?")
        params.append(value)

    if updates:
        params.append(subscription_id)
        db = get_db()
        db.execute(
            f"UPDATE subscriptions SET {', '.join(updates)} WHERE id = ?", params
        )
        db.commit()

    return jsonify(serialize_subscription(get_subscription(subscription_id)))


@app.get("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def list_invoices(subscription_id: int):
    if get_subscription(subscription_id) is None:
        return error("subscription not found", 404)
    rows = get_db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify({"items": [serialize_invoice(row) for row in rows]})


@app.post("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def create_invoice(subscription_id: int):
    sub = get_subscription(subscription_id)
    if sub is None:
        return error("subscription not found", 404)

    body = json_body()
    amount = body.get("amount_due", sub["monthly_amount"])
    if isinstance(amount, bool) or not isinstance(amount, (int, float)):
        return error("amount_due must be a number", 400)
    due_date = body.get("due_date", sub["renewal_date"])
    if not isinstance(due_date, str) or not due_date.strip():
        due_date = date.today().isoformat()

    db = get_db()
    cur = db.execute(
        "INSERT INTO invoices (subscription_id, amount_due, due_date, status, paid_at) VALUES (?, ?, ?, 'open', NULL)",
        (subscription_id, round_money(amount), due_date.strip()),
    )
    db.commit()
    row = db.execute("SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize_invoice(row)), 201


@app.post("/api/subscriptions/<int:subscription_id>/collections")
@login_required
def record_collection(subscription_id: int):
    sub = get_subscription(subscription_id)
    if sub is None:
        return error("subscription not found", 404)

    outcome = json_body().get("outcome")
    if outcome not in ("failed", "succeeded"):
        return error("outcome must be 'failed' or 'succeeded'", 400)

    db = get_db()
    open_invoices = db.execute(
        "SELECT * FROM invoices WHERE subscription_id = ? AND status = 'open'",
        (subscription_id,),
    ).fetchall()

    if outcome == "succeeded":
        paid_at = utc_now()
        db.execute(
            "UPDATE invoices SET status = 'paid', paid_at = ? WHERE subscription_id = ? AND status = 'open'",
            (paid_at, subscription_id),
        )
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = 0 WHERE id = ?",
            (subscription_id,),
        )
        if sub["status"] == "past_due":
            db.execute(
                "UPDATE subscriptions SET status = 'active' WHERE id = ?",
                (subscription_id,),
            )
    else:
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = failed_payment_count + 1 WHERE id = ?",
            (subscription_id,),
        )
        if sub["status"] == "active":
            db.execute(
                "UPDATE subscriptions SET status = 'past_due' WHERE id = ?",
                (subscription_id,),
            )

    db.commit()
    return jsonify(serialize_subscription(get_subscription(subscription_id)))


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    counts = {status: 0 for status in STATUSES}
    for row in db.execute(
        "SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status"
    ).fetchall():
        counts[row["status"]] = row["n"]

    placeholders = ", ".join("?" for _ in MRR_STATUSES)
    mrr_row = db.execute(
        f"SELECT COALESCE(SUM(monthly_amount), 0) AS total FROM subscriptions WHERE status IN ({placeholders})",
        MRR_STATUSES,
    ).fetchone()
    return jsonify({"mrr": round_money(mrr_row["total"]), "counts": counts})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
