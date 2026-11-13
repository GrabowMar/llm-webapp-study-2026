"""Online bank: Flask JSON API plus the built React frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "bank.sqlite3"
DIST = BASE_DIR / "frontend" / "dist"

INITIAL_BALANCE_CENTS = 100_000  # 1000.00

SECRET_KEY = os.environ.get("SECRET_KEY", secrets.token_hex(32))
# CSRF token serializer is signed with a stable key so tokens survive restart.
CSRF_SERIALIZER = URLSafeTimedSerializer(SECRET_KEY, salt="bank-csrf")

app = Flask(__name__, static_folder=None)
app.config["SECRET_KEY"] = SECRET_KEY


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
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

        CREATE TABLE IF NOT EXISTS transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user_id INTEGER NOT NULL REFERENCES users(id),
            to_user_id INTEGER NOT NULL REFERENCES users(id),
            amount_cents INTEGER NOT NULL,
            memo TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_user_id);
        CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_user_id);
        """
    )
    conn.commit()
    conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def parse_amount(value) -> int:
    """Parse a monetary amount into integer cents. Raises ValueError on bad input."""
    if value is None:
        raise ValueError("amount is required")
    try:
        if isinstance(value, bool):
            raise ValueError("invalid amount")
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("invalid amount")
    if not amount.is_finite():
        raise ValueError("invalid amount")
    cents = amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if cents <= 0:
        raise ValueError("amount must be greater than zero")
    return int(cents * 100)


def cents_to_number(cents: int) -> float:
    return round(cents / 100, 2)


def user_to_public(row) -> dict:
    return {"username": row["username"], "balance": cents_to_number(row["balance_cents"])}


def transfer_to_dict(row, current_user_id: int) -> dict:
    incoming = row["to_user_id"] == current_user_id
    other_username = row["from_username"] if incoming else row["to_username"]
    return {
        "id": row["id"],
        "from_username": row["from_username"],
        "to_username": row["to_username"],
        "amount": cents_to_number(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": "in" if incoming else "out",
    }


def error(message: str, status: int):
    return jsonify({"error": message}), status


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username:
        return error("username is required", 400)
    if not password:
        return error("password is required", 400)

    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return error("Username already taken", 409)

    password_hash = generate_password_hash(password)
    db.execute(
        "INSERT INTO users (username, password_hash, balance_cents, created_at) "
        "VALUES (?, ?, ?, ?)",
        (username, password_hash, INITIAL_BALANCE_CENTS, now_iso()),
    )
    db.commit()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return jsonify({"username": row["username"], "balance": cents_to_number(row["balance_cents"])}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return error("username and password are required", 400)

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    auth = request.headers.get("Authorization", "")
    token = auth[len("Bearer "):].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"status": "ok"}), 200


@app.get("/api/auth/csrf")
@login_required
def csrf():
    token = CSRF_SERIALIZER.dumps({"uid": g.user["id"]})
    return jsonify({"csrf_token": token})


# --------------------------------------------------------------------------- #
# Account
# --------------------------------------------------------------------------- #
@app.get("/api/account")
@login_required
def account():
    return jsonify(user_to_public(g.user))


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #
@app.post("/api/transfers")
@login_required
def create_transfer():
    data = request.get_json(silent=True) or {}
    to_username = (data.get("to_username") or "").strip()
    memo = data.get("memo") or None
    if memo is not None:
        memo = str(memo)

    try:
        amount_cents = parse_amount(data.get("amount"))
    except ValueError as exc:
        return error(str(exc), 400)

    if not to_username:
        return error("to_username is required", 400)

    db = get_db()
    to_user = db.execute(
        "SELECT * FROM users WHERE username = ?", (to_username,)
    ).fetchone()
    if to_user is None:
        return error("Recipient not found", 404)

    from_user = g.user
    if from_user["id"] == to_user["id"]:
        return error("You cannot send money to yourself", 400)

    if from_user["balance_cents"] < amount_cents:
        return error("Insufficient balance", 400)

    created_at = now_iso()
    with db:  # atomic transaction
        db.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?",
            (amount_cents, from_user["id"]),
        )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, to_user["id"]),
        )
        cursor = db.execute(
            "INSERT INTO transfers (from_user_id, to_user_id, amount_cents, memo, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (from_user["id"], to_user["id"], amount_cents, memo, created_at),
        )
        transfer_id = cursor.lastrowid

    row = db.execute(
        """
        SELECT t.*, fu.username AS from_username, tu.username AS to_username
        FROM transfers t
        JOIN users fu ON fu.id = t.from_user_id
        JOIN users tu ON tu.id = t.to_user_id
        WHERE t.id = ?
        """,
        (transfer_id,),
    ).fetchone()
    return jsonify(transfer_to_dict(row, from_user["id"])), 201


@app.get("/api/transfers")
@login_required
def list_transfers():
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = max(1, int(request.args.get("page_size", 20)))
    except ValueError:
        page_size = 20
    page_size = min(page_size, 100)

    user_id = g.user["id"]
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (user_id, user_id),
    ).fetchone()[0]

    offset = (page - 1) * page_size
    rows = db.execute(
        """
        SELECT t.*, fu.username AS from_username, tu.username AS to_username
        FROM transfers t
        JOIN users fu ON fu.id = t.from_user_id
        JOIN users tu ON tu.id = t.to_user_id
        WHERE t.from_user_id = ? OR t.to_user_id = ?
        ORDER BY t.id DESC
        LIMIT ? OFFSET ?
        """,
        (user_id, user_id, page_size, offset),
    ).fetchall()

    items = [transfer_to_dict(r, user_id) for r in rows]
    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/transfers/<int:transfer_id>")
@login_required
def get_transfer(transfer_id: int):
    user_id = g.user["id"]
    db = get_db()
    row = db.execute(
        """
        SELECT t.*, fu.username AS from_username, tu.username AS to_username
        FROM transfers t
        JOIN users fu ON fu.id = t.from_user_id
        JOIN users tu ON tu.id = t.to_user_id
        WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)
        """,
        (transfer_id, user_id, user_id),
    ).fetchone()
    if row is None:
        return error("Transfer not found", 404)
    return jsonify(transfer_to_dict(row, user_id))


# --------------------------------------------------------------------------- #
# Health & frontend
# --------------------------------------------------------------------------- #
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
