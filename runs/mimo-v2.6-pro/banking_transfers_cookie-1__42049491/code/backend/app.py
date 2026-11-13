"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import Response
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data")
DB_PATH = DATA_DIR / "bank.db"

STARTING_BALANCE_CENTS = 100_000
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
MAX_USERNAME_LENGTH = 64

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 100000,
    csrf_token TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    memo TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers (from_user_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers (to_user_id);
"""

app = Flask(__name__, static_folder=None)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.isolation_level = None
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error_response(message: str, status: int) -> tuple[Response, int]:
    return jsonify({"error": message, "message": message}), status


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def parse_amount_cents(value: object) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        raise ValueError("amount must be a number")
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        raise ValueError("amount must be a number") from None
    if not amount.is_finite() or amount <= 0:
        raise ValueError("amount must be a positive number")
    if amount > Decimal("100000000000"):
        raise ValueError("amount is too large")
    try:
        if amount != amount.quantize(Decimal("0.01")):
            raise ValueError("amount must have at most two decimal places")
        cents = int(amount * 100)
    except (InvalidOperation, OverflowError):
        raise ValueError("amount is too large") from None
    return cents


def money(cents: int) -> float:
    return round(cents / 100, 2)


def get_request_json() -> dict | None:
    data = request.get_json(silent=True, force=True)
    if isinstance(data, dict):
        return data
    if request.form:
        return request.form.to_dict()
    return None


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            return error_response("authentication required", 401)
        token = token.strip()
        user = get_db().execute(
            "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        if user is None:
            return error_response("invalid or expired token", 401)
        g.user = user
        g.token = token
        return view(*args, **kwargs)

    return wrapped


def current_account_payload() -> dict:
    return {"username": g.user["username"], "balance": money(g.user["balance_cents"])}


def serialize_transfer(row: sqlite3.Row, viewer_id: int) -> dict:
    return {
        "id": row["id"],
        "from_username": row["from_username"],
        "to_username": row["to_username"],
        "amount": money(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": "out" if row["from_user_id"] == viewer_id else "in",
    }


TRANSFER_SELECT = """
SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at,
       f.username AS from_username, tt.username AS to_username
FROM transfers t
JOIN users f ON f.id = t.from_user_id
JOIN users tt ON tt.id = t.to_user_id
"""


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = get_request_json()
    if data is None:
        return error_response("request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error_response("username is required", 400)
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        return error_response(f"username must be at most {MAX_USERNAME_LENGTH} characters", 400)
    if not isinstance(password, str) or not password:
        return error_response("password is required", 400)
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, balance_cents, csrf_token) VALUES (?, ?, ?, ?)",
            (username, generate_password_hash(password), STARTING_BALANCE_CENTS, secrets.token_hex(32)),
        )
    except sqlite3.IntegrityError:
        return error_response("username already taken", 409)
    return (
        jsonify(
            {
                "username": username,
                "balance": money(STARTING_BALANCE_CENTS),
                "id": cursor.lastrowid,
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    data = get_request_json()
    if data is None:
        return error_response("request body must be a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error_response("username is required", 400)
    if not isinstance(password, str) or not password:
        return error_response("password is required", 400)
    user = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error_response("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    get_db().execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, user["id"]))
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@require_auth
def logout():
    get_db().execute("DELETE FROM tokens WHERE token = ?", (g.token,))
    return jsonify({"message": "logged out"}), 200


@app.get("/api/auth/csrf")
@require_auth
def csrf_token():
    return jsonify({"csrf_token": g.user["csrf_token"]}), 200


@app.get("/api/account")
@require_auth
def account():
    return jsonify(current_account_payload()), 200


@app.post("/api/transfers")
@require_auth
def create_transfer():
    csrf_header = request.headers.get("X-CSRF-Token")
    if csrf_header is not None and not secrets.compare_digest(csrf_header, g.user["csrf_token"]):
        return error_response("invalid CSRF token", 403)
    data = get_request_json()
    if data is None:
        return error_response("request body must be a JSON object", 400)
    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error_response("to_username is required", 400)
    to_username = to_username.strip()
    try:
        amount_cents = parse_amount_cents(data.get("amount"))
    except ValueError as exc:
        return error_response(str(exc), 400)
    memo = data.get("memo")
    if memo is None:
        memo = None
    elif isinstance(memo, str):
        memo = memo.strip() or None
    else:
        return error_response("memo must be a string", 400)

    conn = get_db()
    try:
        conn.execute("BEGIN IMMEDIATE")
        recipient = conn.execute(
            "SELECT * FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if recipient is None:
            conn.execute("ROLLBACK")
            return error_response("recipient not found", 404)
        if recipient["id"] == g.user["id"]:
            conn.execute("ROLLBACK")
            return error_response("cannot transfer money to yourself", 400)
        moved = conn.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ? AND balance_cents >= ?",
            (amount_cents, g.user["id"], amount_cents),
        )
        if moved.rowcount != 1:
            conn.execute("ROLLBACK")
            return error_response("insufficient balance", 400)
        conn.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, recipient["id"]),
        )
        created_at = now_iso()
        cursor = conn.execute(
            "INSERT INTO transfers (from_user_id, to_user_id, amount_cents, memo, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (g.user["id"], recipient["id"], amount_cents, memo, created_at),
        )
        transfer_id = cursor.lastrowid
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    return (
        jsonify(
            {
                "id": transfer_id,
                "from_username": g.user["username"],
                "to_username": recipient["username"],
                "amount": money(amount_cents),
                "memo": memo,
                "created_at": created_at,
                "direction": "out",
            }
        ),
        201,
    )


@app.get("/api/transfers")
@require_auth
def list_transfers():
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", str(DEFAULT_PAGE_SIZE)))
    except ValueError:
        return error_response("page and page_size must be integers", 400)
    if page < 1:
        return error_response("page must be at least 1", 400)
    if page_size < 1:
        return error_response("page_size must be at least 1", 400)
    page_size = min(page_size, MAX_PAGE_SIZE)

    conn = get_db()
    user_id = g.user["id"]
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (user_id, user_id),
    ).fetchone()["n"]
    rows = conn.execute(
        TRANSFER_SELECT
        + " WHERE t.from_user_id = ? OR t.to_user_id = ?"
        + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        (user_id, user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return (
        jsonify(
            {
                "items": [serialize_transfer(row, user_id) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        ),
        200,
    )


@app.get("/api/transfers/<int:transfer_id>")
@require_auth
def get_transfer(transfer_id: int):
    row = get_db().execute(
        TRANSFER_SELECT + " WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)",
        (transfer_id, g.user["id"], g.user["id"]),
    ).fetchone()
    if row is None:
        return error_response("transfer not found", 404)
    return jsonify(serialize_transfer(row, g.user["id"])), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
