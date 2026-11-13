"""Flask entry point: JSON API under /api and the frontend build."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, abort, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "bank.db"

START_BALANCE = 100000
MAX_AMOUNT = 1_000_000_00
TOKEN_TTL = timedelta(hours=12)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MAX_MEMO = 200
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024

DUMMY_HASH = generate_password_hash("dummy-password-for-timing")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 100000 CHECK (balance >= 0),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    amount INTEGER NOT NULL CHECK (amount > 0),
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_user_id, id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_user_id, id);
"""


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
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


def now():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def error(message, status):
    return jsonify({"error": message}), status


def money(cents):
    return cents / 100


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "Request body must be a JSON object.")
    return data


@app.errorhandler(HTTPException)
def http_error(exc):
    if request.path.startswith("/api/"):
        messages = {
            404: "Not found.",
            405: "Method not allowed.",
            413: "Request too large.",
        }
        message = exc.description if exc.code == 400 else messages.get(exc.code, exc.name)
        return error(message, exc.code)
    return exc


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            return error("Authentication required.", 401)
        row = db().execute(
            "SELECT s.token_hash, s.csrf_token, s.expires_at, u.id, u.username "
            "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row is None:
            return error("Authentication required.", 401)
        if row["expires_at"] <= iso(now()):
            db().execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
            return error("Authentication required.", 401)
        g.user_id = row["id"]
        g.username = row["username"]
        g.token_hash = row["token_hash"]
        g.csrf_token = row["csrf_token"]
        return fn(*args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        return error(
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-'.", 400
        )
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        return error("Password must be 8-128 characters.", 400)
    pw_hash = generate_password_hash(password)
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, balance, created_at) "
            "VALUES (?, ?, ?, ?)",
            (username, pw_hash, START_BALANCE, iso(now())),
        )
    except sqlite3.IntegrityError:
        return error("Username is already taken.", 409)
    return jsonify({"username": username, "balance": money(START_BALANCE)}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 400)
    user = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None:
        check_password_hash(DUMMY_HASH, password[:128])
        return error("Invalid username or password.", 401)
    if not check_password_hash(user["password_hash"], password[:128]):
        return error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (iso(now()),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (hash_token(token), user["id"], secrets.token_urlsafe(32), iso(now() + TOKEN_TTL)),
    )
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@auth_required
def logout():
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
    return jsonify({"status": "ok"})


@app.get("/api/auth/csrf")
@auth_required
def csrf():
    return jsonify({"csrf_token": g.csrf_token})


@app.get("/api/account")
@auth_required
def account():
    row = db().execute("SELECT balance FROM users WHERE id = ?", (g.user_id,)).fetchone()
    return jsonify({"username": g.username, "balance": money(row["balance"])})


def parse_amount(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        d = Decimal(str(value).strip())
    except InvalidOperation:
        return None
    if not d.is_finite():
        return None
    return d


def transfer_json(row, user_id):
    return {
        "id": row["id"],
        "from_username": row["from_username"],
        "to_username": row["to_username"],
        "amount": money(row["amount"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": "out" if row["from_user_id"] == user_id else "in",
    }


TRANSFER_SELECT = (
    "SELECT t.id, t.from_user_id, t.to_user_id, t.amount, t.memo, t.created_at, "
    "f.username AS from_username, r.username AS to_username "
    "FROM transfers t JOIN users f ON f.id = t.from_user_id "
    "JOIN users r ON r.id = t.to_user_id "
)


@app.post("/api/transfers")
@auth_required
def create_transfer():
    data = body()
    supplied_csrf = request.headers.get("X-CSRF-Token")
    if supplied_csrf is not None and not hmac.compare_digest(supplied_csrf, g.csrf_token):
        return error("Invalid anti-forgery token.", 403)

    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        return error("Recipient is required.", 400)
    to_username = to_username.strip()

    d = parse_amount(data.get("amount"))
    if d is None:
        return error("Amount must be a number.", 400)
    if d <= 0:
        return error("Amount must be greater than zero.", 400)
    if d != d.quantize(Decimal("0.01")):
        return error("Amount can have at most two decimal places.", 400)
    cents = int(d * 100)
    if cents > MAX_AMOUNT:
        return error("Amount is too large.", 400)

    memo = data.get("memo")
    if memo is None:
        memo = ""
    if not isinstance(memo, str):
        return error("Memo must be text.", 400)
    memo = memo.strip()
    if len(memo) > MAX_MEMO:
        return error(f"Memo can be at most {MAX_MEMO} characters.", 400)

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        recipient = conn.execute(
            "SELECT id, username FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if recipient is None:
            conn.execute("ROLLBACK")
            return error("Recipient not found.", 404)
        if recipient["id"] == g.user_id:
            conn.execute("ROLLBACK")
            return error("You cannot send money to yourself.", 400)
        debited = conn.execute(
            "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?",
            (cents, g.user_id, cents),
        )
        if debited.rowcount != 1:
            conn.execute("ROLLBACK")
            return error("Insufficient balance.", 400)
        conn.execute(
            "UPDATE users SET balance = balance + ? WHERE id = ?", (cents, recipient["id"])
        )
        cur = conn.execute(
            "INSERT INTO transfers (from_user_id, to_user_id, amount, memo, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (g.user_id, recipient["id"], cents, memo, iso(now())),
        )
        transfer_id = cur.lastrowid
        conn.execute("COMMIT")
    except BaseException:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        raise
    row = conn.execute(TRANSFER_SELECT + "WHERE t.id = ?", (transfer_id,)).fetchone()
    return jsonify(transfer_json(row, g.user_id)), 201


def int_param(name, default, minimum=1):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    if not re.fullmatch(r"\d{1,9}", raw) or int(raw) < minimum:
        abort(400, f"'{name}' must be an integer of at least {minimum}.")
    return int(raw)


@app.get("/api/transfers")
@auth_required
def list_transfers():
    page = int_param("page", 1)
    page_size = min(int_param("page_size", 20), MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (g.user_id, g.user_id),
    ).fetchone()[0]
    rows = conn.execute(
        TRANSFER_SELECT
        + "WHERE t.from_user_id = ? OR t.to_user_id = ? "
        "ORDER BY t.id DESC LIMIT ? OFFSET ?",
        (g.user_id, g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [transfer_json(r, g.user_id) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/transfers/<int:transfer_id>")
@auth_required
def get_transfer(transfer_id):
    row = db().execute(
        TRANSFER_SELECT
        + "WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)",
        (transfer_id, g.user_id, g.user_id),
    ).fetchone()
    if row is None:
        return error("Transfer not found.", 404)
    return jsonify(transfer_json(row, g.user_id))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found.", 404)
    target = (DIST / path).resolve()
    if target.is_relative_to(DIST.resolve()) and target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
