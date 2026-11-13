"""Flask entry point."""

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

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data")).resolve()
DB_PATH = DATA_DIR / "bank.sqlite3"

INITIAL_BALANCE_CENTS = 100_000
MAX_AMOUNT_CENTS = 100_000_000_000
TOKEN_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 256
MEMO_MAX = 200
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
_DUMMY_HASH = generate_password_hash("not-a-real-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    balance_cents INTEGER NOT NULL CHECK (balance_cents >= 0),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL REFERENCES users(id),
    to_user_id INTEGER NOT NULL REFERENCES users(id),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    memo TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_user_id, id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_user_id, id);
"""


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def cents_to_amount(cents: int) -> float:
    return float(Decimal(cents) / 100)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def current_session():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 200:
        return None
    row = db().execute(
        "SELECT s.token_hash, s.csrf_token, s.expires_at, u.id AS user_id, u.username "
        "FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    if datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00")) <= now_utc():
        db().execute("DELETE FROM sessions WHERE token_hash = ?", (row["token_hash"],))
        return None
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        session = current_session()
        if session is None:
            raise ApiError(401, "Authentication required.")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            supplied = request.headers.get("X-CSRF-Token")
            if supplied is not None and not hmac.compare_digest(
                supplied.encode(), session["csrf_token"].encode()
            ):
                raise ApiError(403, "Invalid CSRF token.")
        g.session = session
        g.user_id = session["user_id"]
        return view(*args, **kwargs)

    return wrapper


def parse_amount(value) -> int:
    if isinstance(value, bool) or value is None:
        raise ApiError(400, "Amount must be a number.")
    if isinstance(value, (int, float)):
        text = repr(value) if isinstance(value, float) else str(value)
    elif isinstance(value, str):
        text = value.strip()
    else:
        raise ApiError(400, "Amount must be a number.")
    try:
        amount = Decimal(text)
    except (InvalidOperation, ValueError):
        raise ApiError(400, "Amount must be a number.")
    if not amount.is_finite():
        raise ApiError(400, "Amount must be a number.")
    if amount <= 0:
        raise ApiError(400, "Amount must be greater than zero.")
    if amount != amount.quantize(Decimal("0.01")):
        raise ApiError(400, "Amount can have at most two decimal places.")
    cents = int(amount * 100)
    if cents > MAX_AMOUNT_CENTS:
        raise ApiError(400, "Amount is too large.")
    return cents


def parse_positive_int(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    if not raw.isdigit() or len(raw) > 9:
        raise ApiError(400, f"'{name}' must be a positive integer.")
    value = int(raw)
    if value < 1:
        raise ApiError(400, f"'{name}' must be a positive integer.")
    return value


def serialize_transfer(row, user_id: int) -> dict:
    return {
        "id": row["id"],
        "from_username": row["from_username"],
        "to_username": row["to_username"],
        "amount": cents_to_amount(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": "out" if row["from_user_id"] == user_id else "in",
    }


TRANSFER_SELECT = (
    "SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at, "
    "fu.username AS from_username, tu.username AS to_username "
    "FROM transfers t JOIN users fu ON fu.id = t.from_user_id "
    "JOIN users tu ON tu.id = t.to_user_id "
)


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error."}), 500


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    )
    if request.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "Username and password are required.")
    username = username.strip()
    if not USERNAME_RE.fullmatch(username):
        raise ApiError(
            400,
            "Username must be 3-64 characters: letters, digits, '.', '_' or '-'.",
        )
    if len(password) < PASSWORD_MIN:
        raise ApiError(400, f"Password must be at least {PASSWORD_MIN} characters.")
    if len(password) > PASSWORD_MAX:
        raise ApiError(400, f"Password must be at most {PASSWORD_MAX} characters.")
    try:
        cur = db().execute(
            "INSERT INTO users (username, password_hash, balance_cents, created_at) "
            "VALUES (?, ?, ?, ?)",
            (username, generate_password_hash(password), INITIAL_BALANCE_CENTS, iso(now_utc())),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken.")
    return (
        jsonify(
            {
                "id": cur.lastrowid,
                "username": username,
                "balance": cents_to_amount(INITIAL_BALANCE_CENTS),
            }
        ),
        201,
    )


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "Username and password are required.")
    if len(password) > PASSWORD_MAX or len(username) > 64:
        raise ApiError(401, "Invalid username or password.")
    user = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None:
        check_password_hash(_DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password.")
    if not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    created = now_utc()
    conn = db()
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (iso(created),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at, expires_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            hash_token(token),
            user["id"],
            secrets.token_urlsafe(32),
            iso(created),
            iso(created + TOKEN_TTL),
        ),
    )
    return {"token": token, "username": user["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.session["token_hash"],))
    return {"status": "ok"}


@app.get("/api/auth/csrf")
@login_required
def csrf():
    return {"csrf_token": g.session["csrf_token"]}


@app.get("/api/account")
@login_required
def account():
    row = db().execute(
        "SELECT username, balance_cents FROM users WHERE id = ?", (g.user_id,)
    ).fetchone()
    if row is None:
        raise ApiError(401, "Authentication required.")
    return {"username": row["username"], "balance": cents_to_amount(row["balance_cents"])}


@app.post("/api/transfers")
@login_required
def create_transfer():
    data = json_body()
    to_username = data.get("to_username")
    if not isinstance(to_username, str) or not to_username.strip():
        raise ApiError(400, "Recipient username is required.")
    to_username = to_username.strip()
    if len(to_username) > 64:
        raise ApiError(404, "Recipient not found.")
    cents = parse_amount(data.get("amount"))
    memo = data.get("memo")
    if memo is None:
        memo = ""
    if not isinstance(memo, str):
        raise ApiError(400, "Memo must be a string.")
    memo = memo.strip()
    if len(memo) > MEMO_MAX:
        raise ApiError(400, f"Memo must be at most {MEMO_MAX} characters.")
    if any(ord(c) < 32 or ord(c) == 127 for c in memo):
        raise ApiError(400, "Memo contains invalid characters.")

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        recipient = conn.execute(
            "SELECT id FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if recipient is None:
            raise ApiError(404, "Recipient not found.")
        if recipient["id"] == g.user_id:
            raise ApiError(400, "You cannot send money to yourself.")
        debited = conn.execute(
            "UPDATE users SET balance_cents = balance_cents - ? "
            "WHERE id = ? AND balance_cents >= ?",
            (cents, g.user_id, cents),
        ).rowcount
        if debited != 1:
            raise ApiError(400, "Insufficient balance.")
        conn.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (cents, recipient["id"]),
        )
        cur = conn.execute(
            "INSERT INTO transfers (from_user_id, to_user_id, amount_cents, memo, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (g.user_id, recipient["id"], cents, memo, iso(now_utc())),
        )
        transfer_id = cur.lastrowid
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    row = conn.execute(TRANSFER_SELECT + "WHERE t.id = ?", (transfer_id,)).fetchone()
    return jsonify(serialize_transfer(row, g.user_id)), 201


@app.get("/api/transfers")
@login_required
def list_transfers():
    page = parse_positive_int("page", 1)
    page_size = min(parse_positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        "SELECT COUNT(*) FROM transfers WHERE from_user_id = ? OR to_user_id = ?",
        (g.user_id, g.user_id),
    ).fetchone()[0]
    rows = conn.execute(
        TRANSFER_SELECT
        + "WHERE t.from_user_id = ? OR t.to_user_id = ? "
        "ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        (g.user_id, g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [serialize_transfer(r, g.user_id) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.get("/api/transfers/<transfer_id>")
@login_required
def get_transfer(transfer_id: str):
    if not transfer_id.isdigit() or len(transfer_id) > 18:
        raise ApiError(404, "Transfer not found.")
    row = db().execute(
        TRANSFER_SELECT + "WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)",
        (int(transfer_id), g.user_id, g.user_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Transfer not found.")
    return serialize_transfer(row, g.user_id)


@app.route("/api", defaults={"path": ""}, methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
