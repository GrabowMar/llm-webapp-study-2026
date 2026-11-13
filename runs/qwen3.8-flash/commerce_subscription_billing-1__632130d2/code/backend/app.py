"""Subscription billing console API."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "app.db"

STATUSES = ("trial", "active", "past_due", "cancelled")
PBKDF2_ITERATIONS = 120_000
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- utilities


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def money(value) -> float:
    return round(float(value) + 0.0, 2)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc):
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
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            plan TEXT NOT NULL,
            monthly_amount REAL NOT NULL DEFAULT 0,
            renewal_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'trial',
            failed_payment_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subscription_id INTEGER NOT NULL
                REFERENCES subscriptions(id) ON DELETE CASCADE,
            amount_due REAL NOT NULL,
            due_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            paid_at TEXT
        );
        """
    )
    db.commit()
    db.close()


def hash_password(password: str, salt: bytes) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return dk.hex()


def error(message: str, code: int = 400):
    return jsonify({"error": message}), code


# ------------------------------------------------------------------- auth


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_auth(fn):
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    wrapper.__name__ = fn.__name__
    return wrapper


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not username or not password:
        return error("username and password are required")
    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return error("username already taken", 409)
    salt = secrets.token_hex(16)
    db.execute(
        "INSERT INTO users (username, password_hash, salt, created_at) "
        "VALUES (?, ?, ?, ?)",
        (username, hash_password(password, bytes.fromhex(salt)), salt, now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or hash_password(password, bytes.fromhex(row["salt"])) != row["password_hash"]:
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@require_auth
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer "):].strip()
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    db.commit()
    return jsonify({"ok": True}), 200


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify(g.user), 200


# ---------------------------------------------------------- subscriptions


def subscription_row_to_dict(row) -> dict:
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


def invoice_row_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": money(row["amount_due"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


def validate_subscription_fields(data, partial=False):
    """Return (clean_values, error_message)."""
    clean = {}
    allowed = {
        "customer_name",
        "plan",
        "monthly_amount",
        "renewal_date",
        "status",
        "failed_payment_count",
    }
    unknown = set(data) - allowed
    if unknown:
        return None, f"unknown fields: {', '.join(sorted(unknown))}"
    if not partial:
        for field in ("customer_name", "plan"):
            if not str(data.get(field) or "").strip():
                return None, f"{field} is required"

    if "customer_name" in data:
        name = str(data["customer_name"] or "").strip()
        if not name:
            return None, "customer_name must not be empty"
        clean["customer_name"] = name
    if "plan" in data:
        plan = str(data["plan"] or "").strip()
        if not plan:
            return None, "plan must not be empty"
        clean["plan"] = plan
    if "monthly_amount" in data:
        try:
            amount = money(data["monthly_amount"])
        except (TypeError, ValueError):
            return None, "monthly_amount must be a number"
        if amount < 0:
            return None, "monthly_amount must not be negative"
        clean["monthly_amount"] = amount
    if "renewal_date" in data:
        value = str(data["renewal_date"] or "").strip()
        if not DATE_RE.match(value):
            return None, "renewal_date must be YYYY-MM-DD"
        clean["renewal_date"] = value
    if "status" in data:
        status = str(data["status"] or "").strip()
        if status not in STATUSES:
            return None, f"status must be one of: {', '.join(STATUSES)}"
        clean["status"] = status
    if "failed_payment_count" in data:
        try:
            count = int(data["failed_payment_count"])
        except (TypeError, ValueError):
            return None, "failed_payment_count must be an integer"
        if count < 0:
            return None, "failed_payment_count must not be negative"
        clean["failed_payment_count"] = count
    return clean, None


@app.post("/api/subscriptions")
@require_auth
def create_subscription():
    data = request.get_json(silent=True) or {}
    clean, message = validate_subscription_fields(data)
    if message:
        return error(message)
    clean.setdefault("monthly_amount", 0.0)
    clean.setdefault("status", "trial")
    clean.setdefault("failed_payment_count", 0)
    if "renewal_date" not in clean:
        clean["renewal_date"] = date.today().isoformat()
    db = get_db()
    created = now_iso()
    cur = db.execute(
        "INSERT INTO subscriptions (customer_name, plan, monthly_amount, "
        "renewal_date, status, failed_payment_count, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            clean["customer_name"],
            clean["plan"],
            clean["monthly_amount"],
            clean["renewal_date"],
            clean["status"],
            clean["failed_payment_count"],
            created,
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(subscription_row_to_dict(row)), 201


@app.get("/api/subscriptions")
@require_auth
def list_subscriptions():
    db = get_db()
    clauses, params = [], []
    q = (request.args.get("q") or "").strip()
    if q:
        clauses.append("LOWER(customer_name) LIKE ?")
        params.append(f"%{q.lower()}%")
    status = (request.args.get("status") or "").strip()
    if status:
        if status not in STATUSES:
            return error(f"status must be one of: {', '.join(STATUSES)}")
        clauses.append("status = ?")
        params.append(status)
    plan = (request.args.get("plan") or "").strip()
    if plan:
        clauses.append("LOWER(plan) = ?")
        params.append(plan.lower())

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    total = db.execute(
        f"SELECT COUNT(*) FROM subscriptions {where}", params
    ).fetchone()[0]

    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        return error("page must be an integer")
    try:
        page_size = int(request.args.get("page_size", 10))
    except ValueError:
        return error("page_size must be an integer")
    page_size = min(max(1, page_size), 100)

    rows = db.execute(
        f"SELECT * FROM subscriptions {where} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    items = [subscription_row_to_dict(r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


def get_subscription_or_404(db, subscription_id):
    try:
        sid = int(subscription_id)
    except (TypeError, ValueError):
        return None, error("invalid subscription id", 404)
    row = db.execute(
        "SELECT * FROM subscriptions WHERE id = ?", (sid,)
    ).fetchone()
    if row is None:
        return None, error("subscription not found", 404)
    return row, None


@app.get("/api/subscriptions/<subscription_id>")
@require_auth
def get_subscription(subscription_id):
    row, err = get_subscription_or_404(get_db(), subscription_id)
    if err:
        return err
    return jsonify(subscription_row_to_dict(row))


@app.patch("/api/subscriptions/<subscription_id>")
@require_auth
def patch_subscription(subscription_id):
    db = get_db()
    row, err = get_subscription_or_404(db, subscription_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    clean, message = validate_subscription_fields(data, partial=True)
    if message:
        return error(message)
    if not clean:
        return error("no valid fields provided")
    sets = ", ".join(f"{k} = ?" for k in clean)
    db.execute(
        f"UPDATE subscriptions SET {sets} WHERE id = ?",
        list(clean.values()) + [row["id"]],
    )
    db.commit()
    row = db.execute("SELECT * FROM subscriptions WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(subscription_row_to_dict(row))


# ------------------------------------------------------------------ money


@app.get("/api/subscriptions/<subscription_id>/invoices")
@require_auth
def list_invoices(subscription_id):
    db = get_db()
    row, err = get_subscription_or_404(db, subscription_id)
    if err:
        return err
    rows = db.execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC",
        (row["id"],),
    ).fetchall()
    return jsonify({"items": [invoice_row_to_dict(r) for r in rows]})


@app.post("/api/subscriptions/<subscription_id>/invoices")
@require_auth
def create_invoice(subscription_id):
    db = get_db()
    row, err = get_subscription_or_404(db, subscription_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    unknown = set(data) - {"amount_due", "due_date"}
    if unknown:
        return error(f"unknown fields: {', '.join(sorted(unknown))}")
    amount = row["monthly_amount"]
    if "amount_due" in data:
        try:
            amount = money(data["amount_due"])
        except (TypeError, ValueError):
            return error("amount_due must be a number")
        if amount < 0:
            return error("amount_due must not be negative")
    due_date = row["renewal_date"]
    if "due_date" in data:
        value = str(data["due_date"] or "").strip()
        if not DATE_RE.match(value):
            return error("due_date must be YYYY-MM-DD")
        due_date = value
    cur = db.execute(
        "INSERT INTO invoices (subscription_id, amount_due, due_date, status, paid_at) "
        "VALUES (?, ?, ?, 'open', NULL)",
        (row["id"], amount, due_date),
    )
    db.commit()
    inv = db.execute("SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(invoice_row_to_dict(inv)), 201


@app.post("/api/subscriptions/<subscription_id>/collections")
@require_auth
def record_collection(subscription_id):
    db = get_db()
    row, err = get_subscription_or_404(db, subscription_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    outcome = str(data.get("outcome") or "").strip()
    if outcome not in ("failed", "succeeded"):
        return error("outcome must be 'failed' or 'succeeded'")
    open_invoices = db.execute(
        "SELECT id FROM invoices WHERE subscription_id = ? AND status = 'open'",
        (row["id"],),
    ).fetchall()
    if outcome == "succeeded":
        stamp = now_iso()
        for inv in open_invoices:
            db.execute(
                "UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?",
                (stamp, inv["id"]),
            )
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = 0, "
            "status = CASE WHEN status = 'past_due' THEN 'active' ELSE status END "
            "WHERE id = ?",
            (row["id"],),
        )
    else:
        db.execute(
            "UPDATE subscriptions SET failed_payment_count = failed_payment_count + 1, "
            "status = CASE WHEN status = 'active' THEN 'past_due' ELSE status END "
            "WHERE id = ?",
            (row["id"],),
        )
    db.commit()
    row = db.execute("SELECT * FROM subscriptions WHERE id = ?", (row["id"],)).fetchone()
    count = db.execute(
        "SELECT COUNT(*) FROM invoices WHERE subscription_id = ? AND status = 'open'",
        (row["id"],),
    ).fetchone()[0]
    return jsonify(
        {
            "outcome": outcome,
            "processed_invoices": len(open_invoices),
            "open_invoices": count,
            "subscription": subscription_row_to_dict(row),
        }
    ), 201


# ------------------------------------------------------------------ stats


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    mrr = db.execute(
        "SELECT COALESCE(SUM(monthly_amount), 0) FROM subscriptions "
        "WHERE status IN ('active', 'past_due')"
    ).fetchone()[0]
    counts = {status: 0 for status in STATUSES}
    for row in db.execute(
        "SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status"
    ):
        counts[row["status"]] = row["n"]
    return jsonify({"mrr": money(mrr), "counts": counts})


# --------------------------------------------------------------- frontend


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if DIST.is_dir() and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True)
