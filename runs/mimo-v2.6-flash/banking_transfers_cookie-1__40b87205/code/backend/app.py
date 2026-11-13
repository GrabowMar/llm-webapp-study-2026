"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "bank.db"
STARTING_BALANCE_CENTS = 100_000
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = _connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                balance_cents INTEGER NOT NULL,
                csrf_token    TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transfers (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                from_id      INTEGER NOT NULL REFERENCES users(id),
                to_id        INTEGER NOT NULL REFERENCES users(id),
                amount_cents INTEGER NOT NULL,
                memo         TEXT,
                created_at   TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_transfers_from
                ON transfers(from_id, created_at, id);
            CREATE INDEX IF NOT EXISTS idx_transfers_to
                ON transfers(to_id, created_at, id);
            """
        )
    finally:
        conn.close()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def error(message: str, status: int):
    body = {"error": message, "message": message}
    return jsonify(body), status


def cents_to_amount(cents: int) -> float:
    return round(cents / 100, 2)


def parse_amount_cents(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        dec = Decimal(str(value))
    except InvalidOperation:
        return None
    if not dec.is_finite():
        return None
    dec = dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(dec * 100)


def json_body() -> dict[str, Any] | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header[:7].lower() != "bearer ":
        return None
    token = header[7:].strip()
    return token or None


def current_user() -> sqlite3.Row | None:
    if "user" in g:
        return g.user
    user: sqlite3.Row | None = None
    token = _bearer_token()
    if token is not None:
        row = get_db().execute(
            """
            SELECT u.*, s.token AS session_token
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
        if row is not None:
            user = row
            g.session_token = row["session_token"]
    g.user = user
    return user


def require_auth(view):
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        if current_user() is None:
            return error("authentication required", 401)
        return view(*args, **kwargs)

    return wrapper


def csrf_guard():
    """Reject a presented CSRF token that does not match the signed-in user."""
    presented = request.headers.get("X-CSRF-Token")
    if not presented:
        return None
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    if not secrets.compare_digest(presented, user["csrf_token"]):
        return error("invalid csrf token", 403)
    return None


TRANSFER_SELECT = """
    SELECT t.*, fu.username AS from_username, tu.username AS to_username
    FROM transfers t
    JOIN users fu ON fu.id = t.from_id
    JOIN users tu ON tu.id = t.to_id
"""


def serialize_transfer(row: sqlite3.Row, user_id: int) -> dict[str, Any]:
    direction = "out" if row["from_id"] == user_id else "in"
    return {
        "id": row["id"],
        "to_username": row["to_username"],
        "amount": cents_to_amount(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "from_username": row["from_username"],
        "direction": direction,
    }


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if len(username) > 64:
        return error("username must be at most 64 characters", 400)
    if len(password) > 256:
        return error("password must be at most 256 characters", 400)

    try:
        get_db().execute(
            """
            INSERT INTO users (username, password_hash, balance_cents, csrf_token, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                username,
                generate_password_hash(password),
                STARTING_BALANCE_CENTS,
                secrets.token_urlsafe(32),
                now_iso(),
            ),
        )
    except sqlite3.IntegrityError:
        return error("username already taken", 409)

    return jsonify({"username": username, "balance": cents_to_amount(STARTING_BALANCE_CENTS)}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)

    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@require_auth
def logout():
    get_db().execute("DELETE FROM sessions WHERE token = ?", (g.session_token,))
    return jsonify({"status": "ok"}), 200


@app.get("/api/auth/csrf")
@require_auth
def csrf():
    return jsonify({"csrf_token": current_user()["csrf_token"]}), 200


# --------------------------------------------------------------------------
# Account
# --------------------------------------------------------------------------


@app.get("/api/account")
@require_auth
def account():
    user = current_user()
    return jsonify({"username": user["username"], "balance": cents_to_amount(user["balance_cents"])}), 200


# --------------------------------------------------------------------------
# Transfers
# --------------------------------------------------------------------------


@app.post("/api/transfers")
@require_auth
def create_transfer():
    guard = csrf_guard()
    if guard is not None:
        return guard

    data = json_body()
    if data is None:
        return error("invalid JSON body", 400)

    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error("to_username is required", 400)
    to_username = to_username.strip()

    if "amount" not in data:
        return error("amount is required", 400)
    amount_cents = parse_amount_cents(data.get("amount"))
    if amount_cents is None:
        return error("invalid amount", 400)
    if amount_cents <= 0:
        return error("amount must be greater than zero", 400)

    memo = data.get("memo")
    if memo is None:
        memo = None
    elif isinstance(memo, str):
        memo = memo or None
    else:
        return error("memo must be a string", 400)

    user = current_user()
    db = get_db()
    recipient = db.execute(
        "SELECT id, username FROM users WHERE username = ?", (to_username,)
    ).fetchone()
    if recipient is None:
        return error("recipient not found", 400)

    db.execute("BEGIN IMMEDIATE")
    try:
        balance = db.execute(
            "SELECT balance_cents FROM users WHERE id = ?", (user["id"],)
        ).fetchone()["balance_cents"]
        if amount_cents > balance:
            db.execute("ROLLBACK")
            return error("insufficient balance", 400)
        db.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?",
            (amount_cents, user["id"]),
        )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, recipient["id"]),
        )
        created_at = now_iso()
        cursor = db.execute(
            """
            INSERT INTO transfers (from_id, to_id, amount_cents, memo, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user["id"], recipient["id"], amount_cents, memo, created_at),
        )
        transfer_id = cursor.lastrowid
        db.execute("COMMIT")
    except sqlite3.Error:
        db.execute("ROLLBACK")
        raise

    row = db.execute(
        TRANSFER_SELECT + " WHERE t.id = ?", (transfer_id,)
    ).fetchone()
    return jsonify(serialize_transfer(row, user["id"])), 201


@app.get("/api/transfers")
@require_auth
def list_transfers():
    user = current_user()
    page = max(int_arg("page", 1), 1)
    page_size = min(max(int_arg("page_size", 10), 1), MAX_PAGE_SIZE)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM transfers WHERE from_id = ? OR to_id = ?",
        (user["id"], user["id"]),
    ).fetchone()[0]
    rows = db.execute(
        TRANSFER_SELECT
        + """
        WHERE t.from_id = ? OR t.to_id = ?
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    items = [serialize_transfer(row, user["id"]) for row in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size}), 200


@app.get("/api/transfers/<int:transfer_id>")
@require_auth
def get_transfer(transfer_id: int):
    user = current_user()
    row = get_db().execute(
        TRANSFER_SELECT + " WHERE t.id = ? AND (t.from_id = ? OR t.to_id = ?)",
        (transfer_id, user["id"], user["id"]),
    ).fetchone()
    if row is None:
        return error("transfer not found", 404)
    return jsonify(serialize_transfer(row, user["id"])), 200


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
