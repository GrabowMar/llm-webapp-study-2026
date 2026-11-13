"""Subscription billing console."""

from __future__ import annotations

import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

STATUSES = ("trial", "active", "past_due", "cancelled")
MRR_STATUSES = ("active", "past_due")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
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

CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    outcome TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""

app = Flask(__name__, static_folder=None)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    try:
        con.executescript(SCHEMA)
        con.commit()
    finally:
        con.close()


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_iso() -> str:
    return date.today().isoformat()


def money(value) -> float:
    return round(float(value), 2)


def normalize_status(value: str) -> str:
    status = re.sub(r"[\s\-]+", "_", value.strip().lower())
    if status == "canceled":
        status = "cancelled"
    return status


def status_variants(status: str) -> list[str]:
    variants = {status, status.replace("_", "-"), status.replace("_", " ")}
    if status == "cancelled":
        variants.add("canceled")
    return sorted(variants)


def sub_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": money(row["monthly_amount"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def inv_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": money(row["amount_due"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def run_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "outcome": row["outcome"],
        "created_at": row["created_at"],
    }


def error(message: str, status_code: int):
    return jsonify({"error": message}), status_code


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("authentication required", 401)
        token = header[len("Bearer "):].strip()
        row = None
        if token:
            row = get_db().execute(
                "SELECT u.id AS id, u.username AS username FROM tokens t"
                " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (token,),
            ).fetchone()
        if row is None:
            return error("authentication required", 401)
        g.user_id = row["id"]
        g.username = row["username"]
        return view(*args, **kwargs)

    return wrapped


def get_json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def parse_amount(value, field: str):
    if isinstance(value, bool):
        return None, f"{field} must be a number"
    if isinstance(value, (int, float)):
        amount = float(value)
    elif isinstance(value, str):
        try:
            amount = float(value)
        except ValueError:
            return None, f"{field} must be a number"
    else:
        return None, f"{field} must be a number"
    if amount != amount or amount in (float("inf"), float("-inf")) or amount < 0:
        return None, f"{field} must be a non-negative number"
    return money(amount), None


def parse_count(value, field: str):
    if isinstance(value, bool):
        return None, f"{field} must be an integer"
    if isinstance(value, int):
        count = value
    elif isinstance(value, float) and value.is_integer():
        count = int(value)
    elif isinstance(value, str):
        try:
            count = int(value)
        except ValueError:
            return None, f"{field} must be an integer"
    else:
        return None, f"{field} must be an integer"
    if count < 0:
        return None, f"{field} must be a non-negative integer"
    return count, None


def parse_text(value, field: str, allow_empty: bool = False):
    if not isinstance(value, str):
        return None, f"{field} must be a string"
    text = value.strip()
    if not text and not allow_empty:
        return None, f"{field} must not be empty"
    return text, None


def parse_status(value, field: str = "status"):
    if not isinstance(value, str):
        return None, f"{field} must be a string"
    if normalize_status(value) not in STATUSES:
        return None, f"{field} must be one of: {', '.join(STATUSES)}"
    return value.strip(), None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = get_json_body()
    username, err = parse_text(data.get("username"), "username")
    if err:
        return error(err, 400)
    password = data.get("password")
    if not isinstance(password, str) or not password:
        return error("password must be a non-empty string", 400)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username must be a non-empty string", 400)
    if not isinstance(password, str) or not password:
        return error("password must be a non-empty string", 400)
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


def subscription_or_404(subscription_id: int):
    row = get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    return row


def build_subscription(data: dict):
    fields = {}
    if "customer_name" in data:
        value, err = parse_text(data.get("customer_name"), "customer_name")
        if err:
            return None, err
        fields["customer_name"] = value
    if "plan" in data:
        value, err = parse_text(data.get("plan"), "plan")
        if err:
            return None, err
        fields["plan"] = value
    if "monthly_amount" in data:
        value, err = parse_amount(data.get("monthly_amount"), "monthly_amount")
        if err:
            return None, err
        fields["monthly_amount"] = value
    if "renewal_date" in data:
        value, err = parse_text(data.get("renewal_date"), "renewal_date")
        if err:
            return None, err
        fields["renewal_date"] = value
    if "status" in data:
        value, err = parse_status(data.get("status"))
        if err:
            return None, err
        fields["status"] = value
    if "failed_payment_count" in data:
        value, err = parse_count(data.get("failed_payment_count"), "failed_payment_count")
        if err:
            return None, err
        fields["failed_payment_count"] = value
    return fields, None


@app.post("/api/subscriptions")
@login_required
def create_subscription():
    data = get_json_body()
    fields, err = build_subscription(data)
    if err:
        return error(err, 400)
    if "customer_name" not in fields:
        return error("customer_name is required", 400)
    if "plan" not in fields:
        return error("plan is required", 400)
    if "monthly_amount" not in fields:
        return error("monthly_amount is required", 400)
    fields.setdefault("renewal_date", (date.today() + timedelta(days=30)).isoformat())
    fields.setdefault("status", "active")
    fields.setdefault("failed_payment_count", 0)
    fields["created_at"] = now_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO subscriptions"
        " (customer_name, plan, monthly_amount, renewal_date, status,"
        "  failed_payment_count, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            fields["customer_name"],
            fields["plan"],
            fields["monthly_amount"],
            fields["renewal_date"],
            fields["status"],
            fields["failed_payment_count"],
            fields["created_at"],
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(sub_dict(row)), 201


@app.get("/api/subscriptions")
@login_required
def list_subscriptions():
    try:
        page = int(request.args.get("page", "1") or "1")
        page_size = int(request.args.get("page_size", "20") or "20")
    except ValueError:
        return error("page and page_size must be integers", 400)
    if page < 1 or page_size < 1:
        return error("page and page_size must be positive integers", 400)
    where = []
    params = []
    q = (request.args.get("q") or "").strip()
    if q:
        needle = (
            q.lower()
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        where.append("LOWER(customer_name) LIKE ? ESCAPE '\\'")
        params.append(f"%{needle}%")
    status = (request.args.get("status") or "").strip()
    if status:
        normalized = normalize_status(status)
        variants = [v.lower() for v in status_variants(normalized)]
        where.append(f"LOWER(status) IN ({', '.join('?' * len(variants))})")
        params.extend(variants)
    plan = (request.args.get("plan") or "").strip()
    if plan:
        where.append("LOWER(plan) = ?")
        params.append(plan.lower())
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM subscriptions{clause}", params
    ).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM subscriptions{clause}"
        " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [sub_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/subscriptions/<int:subscription_id>")
@login_required
def get_subscription(subscription_id: int):
    row = subscription_or_404(subscription_id)
    if row is None:
        return error("subscription not found", 404)
    return jsonify(sub_dict(row))


@app.patch("/api/subscriptions/<int:subscription_id>")
@login_required
def update_subscription(subscription_id: int):
    row = subscription_or_404(subscription_id)
    if row is None:
        return error("subscription not found", 404)
    data = get_json_body()
    fields, err = build_subscription(data)
    if err:
        return error(err, 400)
    if fields:
        assignments = ", ".join(f"{name} = ?" for name in fields)
        db = get_db()
        db.execute(
            f"UPDATE subscriptions SET {assignments} WHERE id = ?",
            list(fields.values()) + [subscription_id],
        )
        db.commit()
    row = subscription_or_404(subscription_id)
    return jsonify(sub_dict(row))


@app.get("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def list_invoices(subscription_id: int):
    if subscription_or_404(subscription_id) is None:
        return error("subscription not found", 404)
    rows = get_db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify({"items": [inv_dict(row) for row in rows]})


@app.post("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def issue_invoice(subscription_id: int):
    sub = subscription_or_404(subscription_id)
    if sub is None:
        return error("subscription not found", 404)
    data = get_json_body()
    if "amount_due" in data:
        raw_amount = data.get("amount_due")
    elif "amount" in data:
        raw_amount = data.get("amount")
    else:
        raw_amount = sub["monthly_amount"]
    amount_due, err = parse_amount(raw_amount, "amount_due")
    if err:
        return error(err, 400)
    if "due_date" in data:
        due_date, err = parse_text(data.get("due_date"), "due_date")
        if err:
            return error(err, 400)
    else:
        due_date = today_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO invoices (subscription_id, amount_due, due_date, status, paid_at)"
        " VALUES (?, ?, ?, 'open', NULL)",
        (subscription_id, amount_due, due_date),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(inv_dict(row)), 201


@app.post("/api/subscriptions/<int:subscription_id>/collections")
@login_required
def record_collection(subscription_id: int):
    sub = subscription_or_404(subscription_id)
    if sub is None:
        return error("subscription not found", 404)
    data = get_json_body()
    outcome = data.get("outcome")
    if outcome not in ("failed", "succeeded"):
        return error("outcome must be 'failed' or 'succeeded'", 400)
    db = get_db()
    timestamp = now_iso()
    if outcome == "succeeded":
        db.execute(
            "UPDATE invoices SET status = 'paid', paid_at = ?"
            " WHERE subscription_id = ? AND status = 'open'",
            (timestamp, subscription_id),
        )
        new_count = 0
        new_status = "active" if normalize_status(sub["status"]) == "past_due" else sub["status"]
    else:
        new_count = sub["failed_payment_count"] + 1
        new_status = "past_due" if normalize_status(sub["status"]) == "active" else sub["status"]
    db.execute(
        "UPDATE subscriptions SET failed_payment_count = ?, status = ? WHERE id = ?",
        (new_count, new_status, subscription_id),
    )
    cur = db.execute(
        "INSERT INTO collection_runs (subscription_id, outcome, created_at)"
        " VALUES (?, ?, ?)",
        (subscription_id, outcome, timestamp),
    )
    db.commit()
    run = db.execute(
        "SELECT * FROM collection_runs WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    sub = subscription_or_404(subscription_id)
    invoices = db.execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC",
        (subscription_id,),
    ).fetchall()
    return (
        jsonify(
            {
                "run": run_dict(run),
                "subscription": sub_dict(sub),
                "invoices": [inv_dict(row) for row in invoices],
            }
        ),
        201,
    )


@app.get("/api/public/stats")
def public_stats():
    rows = get_db().execute(
        "SELECT status, monthly_amount FROM subscriptions"
    ).fetchall()
    counts = {status: 0 for status in STATUSES}
    total = 0.0
    for row in rows:
        key = normalize_status(row["status"])
        counts[key] = counts.get(key, 0) + 1
        if key in MRR_STATUSES:
            total += row["monthly_amount"]
    return jsonify({"mrr": money(total), "counts": counts})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
