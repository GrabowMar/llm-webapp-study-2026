"""Subscription billing console API."""

import secrets
import sqlite3
from datetime import datetime
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

ACTIVE_STATUSES = ("active", "past_due")
SUBSCRIPTION_STATUSES = ("active", "past_due", "trial", "cancelled")
INVOICE_STATUSES = ("open", "paid")


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        );

        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            plan TEXT NOT NULL,
            monthly_amount REAL NOT NULL,
            renewal_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            failed_payment_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL,
            amount_due REAL NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            paid_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (subscription_id) REFERENCES subscriptions (id)
        );
        """
    )
    db.commit()
    db.close()


def now_iso():
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def round2(value):
    return round(float(value), 2)


def subscription_row(row):
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": round2(row["monthly_amount"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def invoice_row(row):
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": round2(row["amount_due"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return jsonify({"error": "username already taken"}), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_hex(32)
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token})


@app.post("/api/subscriptions")
@login_required
def create_subscription():
    data = request.get_json(silent=True) or {}
    customer_name = (data.get("customer_name") or "").strip()
    plan = (data.get("plan") or "").strip()
    if not customer_name:
        return jsonify({"error": "customer_name is required"}), 400
    if not plan:
        return jsonify({"error": "plan is required"}), 400

    monthly_amount = data.get("monthly_amount")
    if monthly_amount is None:
        monthly_amount = 0
    try:
        monthly_amount = round2(float(monthly_amount))
    except (TypeError, ValueError):
        return jsonify({"error": "monthly_amount must be a number"}), 400

    renewal_date = data.get("renewal_date") or datetime.utcnow().date().isoformat()
    status = data.get("status") or "active"
    if status not in SUBSCRIPTION_STATUSES:
        return jsonify({"error": "invalid status"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO subscriptions (customer_name, plan, monthly_amount, "
        "renewal_date, status, failed_payment_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, 0, ?)",
        (customer_name, plan, monthly_amount, renewal_date, status, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(subscription_row(row)), 201


@app.get("/api/subscriptions")
@login_required
def list_subscriptions():
    q = (request.args.get("q") or "").strip()
    status = (request.args.get("status") or "").strip()
    plan = (request.args.get("plan") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = max(1, int(request.args.get("page_size", 20)))
    except ValueError:
        page_size = 20

    where = []
    params = []
    if q:
        where.append("customer_name LIKE ?")
        params.append(f"%{q}%")
    if status:
        where.append("status = ?")
        params.append(status)
    if plan:
        where.append("plan = ?")
        params.append(plan)

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS c FROM subscriptions{clause}", params
    ).fetchone()["c"]
    rows = db.execute(
        f"SELECT * FROM subscriptions{clause} "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [subscription_row(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def get_subscription_or_404(subscription_id):
    row = get_db().execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    if row is None:
        return None
    return row


@app.get("/api/subscriptions/<int:subscription_id>")
@login_required
def get_subscription(subscription_id):
    row = get_subscription_or_404(subscription_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(subscription_row(row))


@app.patch("/api/subscriptions/<int:subscription_id>")
@login_required
def patch_subscription(subscription_id):
    row = get_subscription_or_404(subscription_id)
    if row is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}
    updates = {}
    if "customer_name" in data:
        name = (data.get("customer_name") or "").strip()
        if not name:
            return jsonify({"error": "customer_name is required"}), 400
        updates["customer_name"] = name
    if "plan" in data:
        plan = (data.get("plan") or "").strip()
        if not plan:
            return jsonify({"error": "plan is required"}), 400
        updates["plan"] = plan
    if "monthly_amount" in data:
        try:
            updates["monthly_amount"] = round2(float(data["monthly_amount"]))
        except (TypeError, ValueError):
            return jsonify({"error": "monthly_amount must be a number"}), 400
    if "renewal_date" in data:
        updates["renewal_date"] = data["renewal_date"]
    if "status" in data:
        if data["status"] not in SUBSCRIPTION_STATUSES:
            return jsonify({"error": "invalid status"}), 400
        updates["status"] = data["status"]

    if not updates:
        return jsonify(subscription_row(row))

    db = get_db()
    assignments = ", ".join(f"{k} = ?" for k in updates)
    db.execute(
        f"UPDATE subscriptions SET {assignments} WHERE id = ?",
        list(updates.values()) + [subscription_id],
    )
    db.commit()
    updated = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    return jsonify(subscription_row(updated))


@app.get("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def list_invoices(subscription_id):
    if get_subscription_or_404(subscription_id) is None:
        return jsonify({"error": "not found"}), 404
    rows = get_db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? "
        "ORDER BY created_at DESC, id DESC",
        (subscription_id,),
    ).fetchall()
    return jsonify({"items": [invoice_row(r) for r in rows]})


@app.post("/api/subscriptions/<int:subscription_id>/invoices")
@login_required
def issue_invoice(subscription_id):
    sub = get_subscription_or_404(subscription_id)
    if sub is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}
    amount_due = data.get("amount_due")
    if amount_due is None:
        amount_due = sub["monthly_amount"]
    try:
        amount_due = round2(float(amount_due))
    except (TypeError, ValueError):
        return jsonify({"error": "amount_due must be a number"}), 400
    due_date = data.get("due_date") or datetime.utcnow().date().isoformat()

    db = get_db()
    cur = db.execute(
        "INSERT INTO invoices (subscription_id, amount_due, due_date, status, "
        "paid_at, created_at) VALUES (?, ?, ?, 'open', NULL, ?)",
        (subscription_id, amount_due, due_date, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(invoice_row(row)), 201


@app.post("/api/subscriptions/<int:subscription_id>/collections")
@login_required
def record_collection(subscription_id):
    sub = get_subscription_or_404(subscription_id)
    if sub is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}
    outcome = data.get("outcome")
    if outcome not in ("failed", "succeeded"):
        return jsonify({"error": "outcome must be 'failed' or 'succeeded'"}), 400

    db = get_db()
    if outcome == "succeeded":
        db.execute(
            "UPDATE invoices SET status = 'paid', paid_at = ? "
            "WHERE subscription_id = ? AND status = 'open'",
            (now_iso(), subscription_id),
        )
        new_status = "active" if sub["status"] == "past_due" else sub["status"]
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = 0, status = ? "
            "WHERE id = ?",
            (new_status, subscription_id),
        )
    else:
        new_count = sub["failed_payment_count"] + 1
        new_status = (
            "past_due" if sub["status"] in ACTIVE_STATUSES else sub["status"]
        )
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = ?, status = ? "
            "WHERE id = ?",
            (new_count, new_status, subscription_id),
        )
    db.commit()

    updated = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (subscription_id,)
    ).fetchone()
    return jsonify(subscription_row(updated))


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    mrr = db.execute(
        "SELECT COALESCE(SUM(monthly_amount), 0) AS s FROM subscriptions "
        "WHERE status IN ('active', 'past_due')"
    ).fetchone()["s"]
    counts = {}
    for row in db.execute(
        "SELECT status, COUNT(*) AS c FROM subscriptions GROUP BY status"
    ).fetchall():
        counts[row["status"]] = row["c"]
    for status in SUBSCRIPTION_STATUSES:
        counts.setdefault(status, 0)
    return jsonify({"mrr": round2(mrr), "counts": counts})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
