"""Subscription billing console: Flask API and static frontend."""

import hashlib
import math
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "billing.db"

STATUSES = ("trial", "active", "past_due", "cancelled")
MRR_STATUSES = ("active", "past_due")
TOKEN_TTL = timedelta(days=7)
MAX_CENTS = 100_000_000_000
MAX_ID = 2**63 - 1
DUMMY_HASH = generate_password_hash("dummy-password-for-timing")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


class ApiError(Exception):
    def __init__(self, status, message):
        self.status = status
        self.message = message


def connect():
    conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_name TEXT NOT NULL,
                plan TEXT NOT NULL,
                monthly_cents INTEGER NOT NULL CHECK (monthly_cents >= 0),
                renewal_date TEXT NOT NULL,
                status TEXT NOT NULL
                    CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')),
                failed_payment_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subscription_id INTEGER NOT NULL
                    REFERENCES subscriptions(id) ON DELETE CASCADE,
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                due_date TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('open', 'paid')),
                paid_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_invoices_sub ON invoices(subscription_id, status);
            """
        )
    finally:
        conn.close()


init_db()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def money(cents):
    return cents / 100


def sub_json(row):
    return {
        "id": row["id"],
        "customer_name": row["customer_name"],
        "plan": row["plan"],
        "monthly_amount": money(row["monthly_cents"]),
        "renewal_date": row["renewal_date"],
        "status": row["status"],
        "failed_payment_count": row["failed_payment_count"],
        "created_at": row["created_at"],
    }


def invoice_json(row):
    return {
        "id": row["id"],
        "subscription_id": row["subscription_id"],
        "amount_due": money(row["amount_cents"]),
        "due_date": row["due_date"],
        "status": row["status"],
        "paid_at": row["paid_at"],
    }


@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api"):
        return jsonify({"error": err.name}), err.code
    return err


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token_hash = hashlib.sha256(parts[1].strip().encode()).hexdigest()
    row = db().execute(
        "SELECT u.id, u.username, s.expires_at FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (token_hash,),
    ).fetchone()
    if row is None or row["expires_at"] <= now_iso():
        return None
    return row


@app.before_request
def require_auth():
    path = request.path
    if request.method == "OPTIONS" or not path.startswith("/api"):
        return None
    public = (
        "/api/health",
        "/api/public/stats",
        "/api/auth/register",
        "/api/auth/login",
    )
    if path in public:
        return None
    user = current_user()
    if user is None:
        return jsonify({"error": "Authentication required"}), 401
    g.user = user
    return None


def clean_text(data, key, max_len, required=True):
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{key} must be a non-empty string")
    value = value.strip()
    if len(value) > max_len:
        raise ApiError(400, f"{key} must be at most {max_len} characters")
    return value


def clean_cents(data, key, allow_zero):
    value = data.get(key)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ApiError(400, f"{key} must be a number")
    if isinstance(value, float) and not math.isfinite(value):
        raise ApiError(400, f"{key} must be a number")
    try:
        dec = Decimal(str(value))
    except InvalidOperation:
        raise ApiError(400, f"{key} must be a number")
    cents = dec * 100
    if cents != cents.to_integral_value():
        raise ApiError(400, f"{key} must have at most two decimals")
    cents = int(cents)
    if cents < 0 or (cents == 0 and not allow_zero):
        raise ApiError(400, f"{key} must be {'non-negative' if allow_zero else 'positive'}")
    if cents > MAX_CENTS:
        raise ApiError(400, f"{key} is too large")
    return cents


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def clean_date(data, key):
    value = data.get(key)
    if not isinstance(value, str) or not DATE_RE.match(value):
        raise ApiError(400, f"{key} must be a date in YYYY-MM-DD format")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise ApiError(400, f"{key} must be a valid date")
    return value


def clean_status(value):
    if value not in STATUSES:
        raise ApiError(400, f"status must be one of: {', '.join(STATUSES)}")
    return value


def get_sub_or_404(sub_id):
    row = None
    if 0 < sub_id <= MAX_ID:
        row = db().execute("SELECT * FROM subscriptions WHERE id = ?", (sub_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Subscription not found")
    return row


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not 3 <= len(username.strip()) <= 50:
        raise ApiError(400, "username must be 3 to 50 characters")
    if not isinstance(password, str) or not 8 <= len(password) <= 200:
        raise ApiError(400, "password must be 8 to 200 characters")
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username.strip(), generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username already taken")
    return jsonify({"username": username.strip()}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    ok = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
    if row is None or not ok:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_iso(),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hashlib.sha256(token.encode()).hexdigest(), row["id"], expires),
    )
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


@app.post("/api/auth/logout")
def logout():
    token = request.headers["Authorization"].split(None, 1)[1].strip()
    db().execute(
        "DELETE FROM sessions WHERE token_hash = ?",
        (hashlib.sha256(token.encode()).hexdigest(),),
    )
    return "", 204


@app.get("/api/public/stats")
def public_stats():
    rows = db().execute(
        "SELECT status, COUNT(*) AS n, SUM(monthly_cents) AS cents "
        "FROM subscriptions GROUP BY status"
    ).fetchall()
    counts = {s: 0 for s in STATUSES}
    cents = 0
    for r in rows:
        counts[r["status"]] = r["n"]
        if r["status"] in MRR_STATUSES:
            cents += r["cents"] or 0
    return {"mrr": money(cents), "counts": counts}


def int_param(name, default, minimum, maximum):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    if not re.fullmatch(r"\d{1,9}", raw):
        raise ApiError(400, f"{name} must be a positive integer")
    value = int(raw)
    if value < minimum or value > maximum:
        raise ApiError(400, f"{name} must be between {minimum} and {maximum}")
    return value


@app.get("/api/subscriptions")
def list_subscriptions():
    page = int_param("page", 1, 1, 10**9)
    page_size = int_param("page_size", 20, 1, 100)
    where, params = [], []
    q = request.args.get("q", "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("customer_name LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    status = request.args.get("status", "").strip()
    if status:
        where.append("status = ?")
        params.append(clean_status(status))
    plan = request.args.get("plan", "").strip()
    if plan:
        where.append("plan = ? COLLATE NOCASE")
        params.append(plan)
    clause = f" WHERE {' AND '.join(where)}" if where else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM subscriptions{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM subscriptions{clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [sub_json(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/subscriptions")
def create_subscription():
    data = body()
    name = clean_text(data, "customer_name", 200)
    plan = clean_text(data, "plan", 100)
    cents = clean_cents(data, "monthly_amount", True)
    renewal = clean_date(data, "renewal_date")
    status = clean_status(data["status"]) if "status" in data else "trial"
    conn = db()
    cur = conn.execute(
        "INSERT INTO subscriptions (customer_name, plan, monthly_cents, renewal_date, "
        "status, failed_payment_count, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        (name, plan, cents, renewal, status, now_iso()),
    )
    row = conn.execute("SELECT * FROM subscriptions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(sub_json(row)), 201


@app.get("/api/subscriptions/<int:sub_id>")
def get_subscription(sub_id):
    return jsonify(sub_json(get_sub_or_404(sub_id)))


@app.patch("/api/subscriptions/<int:sub_id>")
def update_subscription(sub_id):
    data = body()
    get_sub_or_404(sub_id)
    sets, params = [], []
    if "customer_name" in data:
        sets.append("customer_name = ?")
        params.append(clean_text(data, "customer_name", 200))
    if "plan" in data:
        sets.append("plan = ?")
        params.append(clean_text(data, "plan", 100))
    if "monthly_amount" in data:
        sets.append("monthly_cents = ?")
        params.append(clean_cents(data, "monthly_amount", True))
    if "renewal_date" in data:
        sets.append("renewal_date = ?")
        params.append(clean_date(data, "renewal_date"))
    if "status" in data:
        sets.append("status = ?")
        params.append(clean_status(data["status"]))
    conn = db()
    if sets:
        conn.execute(
            f"UPDATE subscriptions SET {', '.join(sets)} WHERE id = ?", [*params, sub_id]
        )
    return jsonify(sub_json(get_sub_or_404(sub_id)))


@app.get("/api/subscriptions/<int:sub_id>/invoices")
def list_invoices(sub_id):
    get_sub_or_404(sub_id)
    rows = db().execute(
        "SELECT * FROM invoices WHERE subscription_id = ? ORDER BY id DESC", (sub_id,)
    ).fetchall()
    return {"items": [invoice_json(r) for r in rows]}


@app.post("/api/subscriptions/<int:sub_id>/invoices")
def issue_invoice(sub_id):
    data = body()
    sub = get_sub_or_404(sub_id)
    if "amount_due" in data:
        cents = clean_cents(data, "amount_due", False)
    elif sub["monthly_cents"] > 0:
        cents = sub["monthly_cents"]
    else:
        raise ApiError(400, "amount_due must be a number")
    if data.get("due_date") is None:
        due = date.today().isoformat()
    else:
        due = clean_date(data, "due_date")
    conn = db()
    cur = conn.execute(
        "INSERT INTO invoices (subscription_id, amount_cents, due_date, status, paid_at) "
        "VALUES (?, ?, ?, 'open', NULL)",
        (sub_id, cents, due),
    )
    row = conn.execute("SELECT * FROM invoices WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(invoice_json(row)), 201


@app.post("/api/subscriptions/<int:sub_id>/collections")
def record_collection(sub_id):
    data = body()
    outcome = data.get("outcome")
    if outcome not in ("failed", "succeeded"):
        raise ApiError(400, "outcome must be 'failed' or 'succeeded'")
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        sub = get_sub_or_404(sub_id)
        open_count = conn.execute(
            "SELECT COUNT(*) FROM invoices WHERE subscription_id = ? AND status = 'open'",
            (sub_id,),
        ).fetchone()[0]
        if open_count:
            if outcome == "succeeded":
                conn.execute(
                    "UPDATE invoices SET status = 'paid', paid_at = ? "
                    "WHERE subscription_id = ? AND status = 'open'",
                    (now_iso(), sub_id),
                )
                status = "active" if sub["status"] == "past_due" else sub["status"]
                conn.execute(
                    "UPDATE subscriptions SET failed_payment_count = 0, status = ? WHERE id = ?",
                    (status, sub_id),
                )
            else:
                status = "past_due" if sub["status"] == "active" else sub["status"]
                conn.execute(
                    "UPDATE subscriptions SET failed_payment_count = failed_payment_count + 1, "
                    "status = ? WHERE id = ?",
                    (status, sub_id),
                )
        row = conn.execute("SELECT * FROM subscriptions WHERE id = ?", (sub_id,)).fetchone()
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    return jsonify(sub_json(row))


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_rest):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target is not None and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
