"""Flask entry point for the bank transfer app."""

import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "bank.db"

STARTING_BALANCE_CENTS = 100_000

app = Flask(__name__, static_folder=None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                balance_cents INTEGER NOT NULL DEFAULT 100000,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                csrf_token TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS transfers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                from_user_id INTEGER NOT NULL REFERENCES users(id),
                to_user_id INTEGER NOT NULL REFERENCES users(id),
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                memo TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_user_id, id DESC);
            CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_user_id, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("Authentication required", 401)
        token = header[7:].strip()
        if not token:
            return error("Authentication required", 401)

        db = get_db()
        row = db.execute(
            """
            SELECT u.id AS user_id, u.username, u.balance_cents,
                   s.token_hash, s.csrf_token
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token_hash = ?
            """,
            (hash_token(token),),
        ).fetchone()
        if row is None:
            return error("Invalid or expired token", 401)

        g.user = row
        g.token = token
        return fn(*args, **kwargs)

    return wrapper


def transfer_to_dict(row: sqlite3.Row, viewer_id: int) -> dict:
    return {
        "id": row["id"],
        "to_username": row["to_username"],
        "from_username": row["from_username"],
        "amount": row["amount_cents"] / 100.0,
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": "out" if row["from_user_id"] == viewer_id else "in",
    }


def parse_credentials():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, None, error("Expected a JSON object", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, None, error("Username is required", 400)
    if not isinstance(password, str) or not password:
        return None, None, error("Password is required", 400)
    username = username.strip()
    if len(username) > 50:
        return None, None, error("Username must be at most 50 characters", 400)
    return username, password, None


def parse_amount(value) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount <= 0:
        return None
    cents = int(amount * 100)
    if cents <= 0 or cents > 10**15:
        return None
    return cents


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password, err = parse_credentials()
    if err is not None:
        return err

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, balance_cents, created_at) VALUES (?, ?, ?, ?)",
            (username, generate_password_hash(password), STARTING_BALANCE_CENTS, utc_now()),
        )
    except sqlite3.IntegrityError:
        return error("Username is already taken", 409)

    row = db.execute(
        "SELECT id, username, balance_cents FROM users WHERE username = ?", (username,)
    ).fetchone()
    return (
        jsonify(
            {
                "id": row["id"],
                "username": row["username"],
                "balance": row["balance_cents"] / 100.0,
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    username, password, err = parse_credentials()
    if err is not None:
        return err

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    csrf_token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], csrf_token, utc_now()),
    )
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@auth_required
def logout():
    db = get_db()
    db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.user["token_hash"],))
    return jsonify({"status": "ok"})


@app.get("/api/auth/csrf")
@auth_required
def csrf():
    return jsonify({"csrf_token": g.user["csrf_token"]})


@app.get("/api/account")
@auth_required
def account():
    return jsonify(
        {
            "username": g.user["username"],
            "balance": g.user["balance_cents"] / 100.0,
        }
    )


@app.post("/api/transfers")
@auth_required
def create_transfer():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Expected a JSON object", 400)

    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error("Recipient username is required", 400)
    to_username = to_username.strip()

    amount_cents = parse_amount(data.get("amount"))
    if amount_cents is None:
        return error("Amount must be a positive number", 400)

    memo = data.get("memo")
    if memo is not None and not isinstance(memo, str):
        return error("Memo must be a string", 400)
    if isinstance(memo, str):
        memo = memo.strip() or None
        if memo is not None and len(memo) > 500:
            return error("Memo must be at most 500 characters", 400)

    db = get_db()
    try:
        db.execute("BEGIN IMMEDIATE")

        recipient = db.execute(
            "SELECT id, username FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if recipient is None:
            db.execute("ROLLBACK")
            return error("Recipient not found", 400)
        if recipient["id"] == g.user["user_id"]:
            db.execute("ROLLBACK")
            return error("You cannot send money to yourself", 400)

        sender = db.execute(
            "SELECT balance_cents FROM users WHERE id = ?", (g.user["user_id"],)
        ).fetchone()
        if sender["balance_cents"] < amount_cents:
            db.execute("ROLLBACK")
            return error("Insufficient balance", 400)

        created_at = utc_now()
        db.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?",
            (amount_cents, g.user["user_id"]),
        )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, recipient["id"]),
        )
        cur = db.execute(
            """
            INSERT INTO transfers (from_user_id, to_user_id, amount_cents, memo, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (g.user["user_id"], recipient["id"], amount_cents, memo, created_at),
        )
        transfer_id = cur.lastrowid
        db.execute("COMMIT")
    except Exception:
        try:
            db.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise

    row = db.execute(
        """
        SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at,
               fu.username AS from_username, tu.username AS to_username
        FROM transfers t
        JOIN users fu ON fu.id = t.from_user_id
        JOIN users tu ON tu.id = t.to_user_id
        WHERE t.id = ?
        """,
        (transfer_id,),
    ).fetchone()
    return jsonify(transfer_to_dict(row, g.user["user_id"])), 201


@app.get("/api/transfers")
@auth_required
def list_transfers():
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        return error("page and page_size must be integers", 400)

    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    db = get_db()
    user_id = g.user["user_id"]
    total = db.execute(
        "SELECT COUNT(*) AS n FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (user_id, user_id),
    ).fetchone()["n"]

    rows = db.execute(
        """
        SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at,
               fu.username AS from_username, tu.username AS to_username
        FROM transfers t
        JOIN users fu ON fu.id = t.from_user_id
        JOIN users tu ON tu.id = t.to_user_id
        WHERE t.from_user_id = ? OR t.to_user_id = ?
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT ? OFFSET ?
        """,
        (user_id, user_id, page_size, offset),
    ).fetchall()

    return jsonify(
        {
            "items": [transfer_to_dict(row, user_id) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/transfers/<int:transfer_id>")
@auth_required
def get_transfer(transfer_id: int):
    db = get_db()
    user_id = g.user["user_id"]
    row = db.execute(
        """
        SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at,
               fu.username AS from_username, tu.username AS to_username
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


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
