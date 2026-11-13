"""Online bank: Flask JSON API and static SPA host."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("BANK_DATA_DIR", str(ROOT / "data")))
DB_PATH = DATA_DIR / "bank.sqlite3"

STARTING_BALANCE_CENTS = 100_000
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 10

TRANSFER_SELECT = """
    SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo,
           t.created_at, f.username AS from_username, r.username AS to_username
    FROM transfers t
    JOIN users f ON f.id = t.from_user_id
    JOIN users r ON r.id = t.to_user_id
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def money(cents: int) -> float:
    return cents / 100


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                balance_cents INTEGER NOT NULL DEFAULT 100000,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS csrf_tokens (
                token TEXT PRIMARY KEY,
                csrf_token TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS anon_csrf_tokens (
                csrf_token TEXT PRIMARY KEY,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transfers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user_id INTEGER NOT NULL REFERENCES users(id),
                to_user_id INTEGER NOT NULL REFERENCES users(id),
                amount_cents INTEGER NOT NULL,
                memo TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_transfers_from
                ON transfers(from_user_id, id DESC);
            CREATE INDEX IF NOT EXISTS idx_transfers_to
                ON transfers(to_user_id, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(status: int, message: str, code: str | None = None):
    payload = {"error": message, "message": message}
    if code:
        payload["code"] = code
    return jsonify(payload), status


def body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = bearer_token()
        if token is None:
            return error(401, "Authentication required", "unauthorized")
        row = db().execute(
            "SELECT u.id, u.username, u.balance_cents FROM tokens t "
            "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if row is None:
            return error(401, "Invalid or expired token", "unauthorized")
        g.user = row
        g.token = token
        return fn(*args, **kwargs)

    return wrapper


def credentials(data: dict | None):
    if data is None:
        return None, None, error(400, "A JSON body is required", "invalid_request")
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None, error(400, "Username and password are required", "invalid_request")
    username = username.strip()
    if not username or not password:
        return None, None, error(400, "Username and password are required", "invalid_request")
    if len(username) > 64:
        return None, None, error(400, "Username must be at most 64 characters", "invalid_request")
    if len(password) > 256:
        return None, None, error(400, "Password is too long", "invalid_request")
    return username, password, None


def parse_amount(value) -> tuple[int | None, str | None]:
    if value is None or isinstance(value, bool):
        return None, "Amount is required"
    if not isinstance(value, (int, float, str, Decimal)):
        return None, "Amount must be a number"
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None, "Amount must be a number"
    if not amount.is_finite() or amount <= 0:
        return None, "Amount must be greater than zero"
    cents = amount * 100
    if cents != cents.to_integral_value():
        return None, "Amount cannot have more than two decimal places"
    cents = int(cents)
    if cents > 10**12:
        return None, "Amount is too large"
    return cents, None


def parse_int(value: str | None, default: int, minimum: int, maximum: int) -> int | None:
    if value is None:
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if not minimum <= parsed <= maximum:
        return None
    return parsed


def transfer_json(row: sqlite3.Row, direction: str) -> dict:
    return {
        "id": row["id"],
        "to_username": row["to_username"],
        "amount": money(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "from_username": row["from_username"],
        "direction": direction,
    }


def direction_for(row: sqlite3.Row, user_id: int) -> str:
    return "out" if row["from_user_id"] == user_id else "in"


def csrf_ok(data: dict | None) -> bool:
    supplied = request.headers.get("X-CSRF-Token") or request.headers.get("X-CSRFToken")
    if supplied is None and data is not None:
        supplied = data.get("csrf_token")
    if supplied is None:
        return True
    conn = db()
    row = conn.execute(
        "SELECT csrf_token FROM csrf_tokens WHERE token = ?", (g.token,)
    ).fetchone()
    if row is not None and secrets.compare_digest(row["csrf_token"], str(supplied)):
        return True
    anon = conn.execute(
        "SELECT 1 FROM anon_csrf_tokens WHERE csrf_token = ?", (str(supplied),)
    ).fetchone()
    return anon is not None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password, failure = credentials(body())
    if failure:
        return failure
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, balance_cents, created_at) "
            "VALUES (?, ?, ?, ?)",
            (username, generate_password_hash(password), STARTING_BALANCE_CENTS, utcnow()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error(409, "Username already taken", "username_taken")
    return (
        jsonify({"message": "Account created", "username": username, "balance": money(STARTING_BALANCE_CENTS)}),
        201,
    )


@app.post("/api/auth/login")
def login():
    username, password, failure = credentials(body())
    if failure:
        return failure
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password", "invalid_credentials")
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.post("/api/auth/logout")
@auth_required
def logout():
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token = ?", (g.token,))
    conn.execute("DELETE FROM csrf_tokens WHERE token = ?", (g.token,))
    conn.commit()
    return jsonify({"message": "Signed out"})


@app.get("/api/auth/csrf")
def csrf():
    token = bearer_token()
    conn = db()
    if token is not None and conn.execute(
        "SELECT 1 FROM tokens WHERE token = ?", (token,)
    ).fetchone() is not None:
        row = conn.execute(
            "SELECT csrf_token FROM csrf_tokens WHERE token = ?", (token,)
        ).fetchone()
        value = row["csrf_token"] if row else secrets.token_urlsafe(32)
        if row is None:
            conn.execute(
                "INSERT INTO csrf_tokens (token, csrf_token, created_at) VALUES (?, ?, ?)",
                (token, value, utcnow()),
            )
            conn.commit()
        return jsonify({"csrf_token": value})
    value = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO anon_csrf_tokens (csrf_token, created_at) VALUES (?, ?)",
        (value, utcnow()),
    )
    conn.commit()
    return jsonify({"csrf_token": value})


@app.get("/api/account")
@auth_required
def account():
    row = db().execute(
        "SELECT username, balance_cents FROM users WHERE id = ?", (g.user["id"],)
    ).fetchone()
    return jsonify({"username": row["username"], "balance": money(row["balance_cents"])})


@app.post("/api/transfers")
@auth_required
def create_transfer():
    data = body()
    if data is None:
        return error(400, "A JSON body is required", "invalid_request")
    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error(400, "Recipient username is required", "invalid_request")
    to_username = to_username.strip()
    memo = data.get("memo", "")
    if memo is None:
        memo = ""
    if not isinstance(memo, str) or len(memo) > 500:
        return error(400, "Memo must be a string of at most 500 characters", "invalid_request")
    amount_cents, problem = parse_amount(data.get("amount"))
    if problem:
        return error(400, problem, "invalid_amount")
    if not csrf_ok(data):
        return error(403, "Invalid CSRF token", "invalid_csrf")

    conn = db()
    recipient = conn.execute(
        "SELECT id, username FROM users WHERE username = ?", (to_username,)
    ).fetchone()
    if recipient is None:
        return error(404, "Recipient not found", "recipient_not_found")
    if recipient["id"] == g.user["id"]:
        return error(400, "Cannot transfer to yourself", "self_transfer")

    dry_run = bool(data.get("dry_run")) or data.get("confirm") is False or bool(data.get("preview"))
    if dry_run:
        balance = conn.execute(
            "SELECT balance_cents FROM users WHERE id = ?", (g.user["id"],)
        ).fetchone()["balance_cents"]
        if amount_cents > balance:
            return error(400, "Insufficient balance", "insufficient_balance")
        return jsonify(
            {
                "message": "Transfer is ready to confirm",
                "valid": True,
                "preview": {
                    "to_username": recipient["username"],
                    "amount": money(amount_cents),
                    "memo": memo,
                    "from_username": g.user["username"],
                },
            }
        )

    sender_id = g.user["id"]
    now = utcnow()
    try:
        conn.execute("BEGIN IMMEDIATE")
        updated = conn.execute(
            "UPDATE users SET balance_cents = balance_cents - ? "
            "WHERE id = ? AND balance_cents >= ?",
            (amount_cents, sender_id, amount_cents),
        )
        if updated.rowcount != 1:
            conn.rollback()
            return error(400, "Insufficient balance", "insufficient_balance")
        updated = conn.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, recipient["id"]),
        )
        if updated.rowcount != 1:
            conn.rollback()
            return error(404, "Recipient not found", "recipient_not_found")
        cursor = conn.execute(
            "INSERT INTO transfers "
            "(from_user_id, to_user_id, amount_cents, memo, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (sender_id, recipient["id"], amount_cents, memo, now),
        )
        transfer_id = cursor.lastrowid
        conn.commit()
    except sqlite3.Error:
        conn.rollback()
        return error(500, "Transfer could not be completed", "transfer_failed")

    row = conn.execute(TRANSFER_SELECT + " WHERE t.id = ?", (transfer_id,)).fetchone()
    return jsonify(transfer_json(row, "out")), 201


@app.get("/api/transfers")
@auth_required
def list_transfers():
    page = parse_int(request.args.get("page"), 1, 1, 1_000_000)
    page_size = parse_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    if page is None or page_size is None:
        return error(400, "Invalid pagination parameters", "invalid_pagination")
    user_id = g.user["id"]
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (user_id, user_id),
    ).fetchone()[0]
    rows = conn.execute(
        TRANSFER_SELECT
        + " WHERE t.from_user_id = ? OR t.to_user_id = ? "
        "ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        (user_id, user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [transfer_json(row, direction_for(row, user_id)) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/transfers/<int:transfer_id>")
@auth_required
def get_transfer(transfer_id: int):
    user_id = g.user["id"]
    row = db().execute(
        TRANSFER_SELECT
        + " WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)",
        (transfer_id, user_id, user_id),
    ).fetchone()
    if row is None:
        return error(404, "Transfer not found", "not_found")
    return jsonify(transfer_json(row, direction_for(row, user_id)))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "Not found", "not_found")
    try:
        return send_from_directory(DIST, path)
    except NotFound:
        return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(_exc):
    return api_or_spa_not_found()


def api_or_spa_not_found():
    if request.path.startswith("/api/"):
        return error(404, "Not found", "not_found")
    try:
        return send_from_directory(DIST, "index.html")
    except NotFound:
        return error(404, "Frontend build not found", "not_found")


init_db()
