"""Small online bank: Flask JSON API under /api, serving the React frontend build."""

import hashlib
import hmac
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "bank.db"

STARTING_BALANCE_CENTS = 100_000  # 1000.00
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
PBKDF2_ITERATIONS = 120_000
MAX_MEMO_LENGTH = 200
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{2,64}$")

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    username       TEXT PRIMARY KEY COLLATE NOCASE,
    password_hash  TEXT NOT NULL,
    salt           TEXT NOT NULL,
    balance_cents  INTEGER NOT NULL,
    csrf_token     TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token     TEXT PRIMARY KEY,
    username  TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transfers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    from_username  TEXT NOT NULL REFERENCES users(username),
    to_username    TEXT NOT NULL REFERENCES users(username),
    amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
    memo           TEXT NOT NULL DEFAULT '',
    created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_username);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_username);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(DB_PATH, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA busy_timeout=10000")
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("_database", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------- helpers


def hash_password(password: str, salt: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    )
    return digest.hex()


def error(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


def current_username() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT username FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    return row["username"] if row else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        username = current_username()
        if username is None:
            return error("authentication required", 401)
        g.user = username
        return view(*args, **kwargs)

    return wrapped


def csrf_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_db().execute(
            "SELECT csrf_token FROM users WHERE username = ?", (g.user,)
        ).fetchone()
        token = request.headers.get("X-CSRF-Token", "")
        if not token or not hmac.compare_digest(token, user["csrf_token"]):
            return error("invalid or missing CSRF token", 403)
        return view(*args, **kwargs)

    return wrapped


def parse_amount_cents(value) -> int | None:
    """Return the amount in cents, or None if it is not a valid positive
    money amount with at most two decimals."""
    if isinstance(value, bool) or value is None:
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        return None
    if not amount.is_finite():
        return None
    if amount != amount.quantize(Decimal("0.01")):
        return None
    cents = int(amount * 100)
    return cents if cents > 0 else None


def cents_to_amount(cents: int) -> float:
    return round(cents / 100, 2)


def serialize_transfer(row: sqlite3.Row, viewer: str) -> dict:
    direction = "out" if row["from_username"].lower() == viewer.lower() else "in"
    return {
        "id": row["id"],
        "to_username": row["to_username"],
        "from_username": row["from_username"],
        "amount": cents_to_amount(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": direction,
    }


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not USERNAME_RE.fullmatch(username):
        return error(
            "username must be 2-64 characters (letters, digits, '_', '-', '.')", 400
        )
    if not password:
        return error("password must not be empty", 400)

    salt = secrets.token_hex(16)
    db = get_db()
    try:
        with db:
            db.execute(
                "INSERT INTO users (username, password_hash, salt, balance_cents, csrf_token)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    username,
                    hash_password(password, salt),
                    salt,
                    STARTING_BALANCE_CENTS,
                    secrets.token_hex(32),
                ),
            )
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"username": username, "balance": cents_to_amount(STARTING_BALANCE_CENTS)}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT password_hash, salt FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not hmac.compare_digest(
        row["password_hash"], hash_password(password, row["salt"])
    ):
        return error("invalid username or password", 401)
    token = secrets.token_hex(32)
    db = get_db()
    with db:
        db.execute("INSERT INTO sessions (token, username) VALUES (?, ?)", (token, username.strip()))
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer ") :].strip()
    db = get_db()
    with db:
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return jsonify({"ok": True}), 200


@app.get("/api/auth/csrf")
@login_required
def csrf_token():
    row = get_db().execute(
        "SELECT csrf_token FROM users WHERE username = ?", (g.user,)
    ).fetchone()
    return jsonify({"csrf_token": row["csrf_token"]}), 200


# ---------------------------------------------------------------- account


@app.get("/api/account")
@login_required
def account():
    row = get_db().execute(
        "SELECT username, balance_cents FROM users WHERE username = ?", (g.user,)
    ).fetchone()
    return jsonify({"username": row["username"], "balance": cents_to_amount(row["balance_cents"])}), 200


# ---------------------------------------------------------------- transfers


@app.post("/api/transfers")
@login_required
@csrf_required
def create_transfer():
    body = json_body()
    sender = g.user
    to_username = body.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error("to_username is required", 400)
    to_username = to_username.strip()

    cents = parse_amount_cents(body.get("amount"))
    if cents is None:
        return error("amount must be a positive number with at most two decimals", 400)

    memo = body.get("memo", "")
    if memo is None:
        memo = ""
    if not isinstance(memo, str):
        return error("memo must be a string", 400)
    memo = memo.strip()
    if len(memo) > MAX_MEMO_LENGTH:
        return error(f"memo must be at most {MAX_MEMO_LENGTH} characters", 400)

    db = get_db()
    recipient = db.execute(
        "SELECT username FROM users WHERE username = ?", (to_username,)
    ).fetchone()
    if recipient is None:
        return error("recipient does not exist", 404)

    created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    # One transaction: both balances change, or nothing at all.
    db.execute("BEGIN IMMEDIATE")
    try:
        sender_row = db.execute(
            "SELECT balance_cents FROM users WHERE username = ?", (sender,)
        ).fetchone()
        if sender_row is None:
            db.rollback()
            return error("account not found", 401)
        if sender_row["balance_cents"] < cents:
            db.rollback()
            return error(
                "insufficient balance",
                400,
            )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE username = ?",
            (cents, sender),
        )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE username = ?",
            (cents, recipient["username"]),
        )
        cursor = db.execute(
            "INSERT INTO transfers (from_username, to_username, amount_cents, memo, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (sender, recipient["username"], cents, memo, created_at),
        )
        row = db.execute(
            "SELECT * FROM transfers WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        db.commit()
    except sqlite3.Error:
        db.rollback()
        raise

    return jsonify(serialize_transfer(row, sender)), 201


def query_int(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be an integer"
    return value, None


@app.get("/api/transfers")
@login_required
def list_transfers():
    page, err = query_int("page", 1)
    if err or page is None or page < 1:
        return error(err or "page must be a positive integer", 400)
    page_size, err = query_int("page_size", DEFAULT_PAGE_SIZE)
    if err or page_size is None or page_size < 1 or page_size > MAX_PAGE_SIZE:
        return error(err or f"page_size must be between 1 and {MAX_PAGE_SIZE}", 400)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM transfers WHERE from_username = ? OR to_username = ?",
        (g.user, g.user),
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM transfers WHERE from_username = ? OR to_username = ?"
        " ORDER BY id DESC LIMIT ? OFFSET ?",
        (g.user, g.user, page_size, (page - 1) * page_size),
    ).fetchall()
    items = [serialize_transfer(row, g.user) for row in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    ), 200


@app.get("/api/transfers/<int:transfer_id>")
@login_required
def get_transfer(transfer_id: int):
    row = get_db().execute(
        "SELECT * FROM transfers WHERE id = ? AND (from_username = ? OR to_username = ?)",
        (transfer_id, g.user, g.user),
    ).fetchone()
    if row is None:
        return error("transfer not found", 404)
    return jsonify(serialize_transfer(row, g.user)), 200


# ---------------------------------------------------------------- misc


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    if request.path.startswith("/api"):
        message = exc.description
        if exc.code in (401,):
            message = "authentication required"
        elif exc.code in (404,):
            message = "not found"
        elif exc.code in (405,):
            message = "method not allowed"
        return jsonify({"error": message, "message": message}), exc.code
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    app.logger.exception("unhandled error")
    if request.path.startswith("/api"):
        return jsonify({"error": "internal server error", "message": "internal server error"}), 500
    return "internal server error", 500


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found", "message": "not found"}), 404
    candidate = DIST / path
    if path and candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
