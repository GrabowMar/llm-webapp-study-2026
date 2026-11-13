"""JSON API blueprint served under /api."""

from __future__ import annotations

import hmac
import sqlite3
from decimal import Decimal, InvalidOperation

from flask import Blueprint, jsonify, request

from . import security
from .db import (
    INITIAL_BALANCE_CENTS,
    cents_to_amount,
    get_db,
    now_iso,
    transaction,
)

api = Blueprint("api", __name__, url_prefix="/api")

MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 256
MAX_MEMO_LENGTH = 280
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
AMOUNT_TOLERANCE = Decimal("0.000001")


class ApiError(Exception):
    """Error carrying an HTTP status and a message shown to the user."""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def error_response(status: int, message: str):
    response = jsonify({"error": message, "message": message})
    response.status_code = status
    return response


def body() -> dict:
    """Parsed JSON body; empty dict when the body is missing or not JSON."""
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def required_str(data: dict, field: str) -> str:
    value = data.get(field)
    if value is None or not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"'{field}' is required")
    return value


def parse_amount(raw) -> int:
    """Parse a user supplied amount into integer cents."""
    if isinstance(raw, bool) or raw is None:
        raise ApiError(400, "Amount must be a number")
    if not isinstance(raw, (int, float, str)):
        raise ApiError(400, "Amount must be a number")
    try:
        value = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        raise ApiError(400, "Amount must be a number")
    if not value.is_finite():
        raise ApiError(400, "Amount must be a number")
    if value <= 0:
        raise ApiError(400, "Amount must be greater than zero")
    cents = int(value.scaleb(2).to_integral_value(rounding="ROUND_HALF_UP"))
    if cents <= 0:
        raise ApiError(400, "Amount must be greater than zero")
    exact = value == Decimal(cents).scaleb(-2)
    if not exact and abs(value - Decimal(cents).scaleb(-2)) > AMOUNT_TOLERANCE:
        raise ApiError(400, "Amount must have at most two decimal places")
    return cents


def authenticate() -> tuple[sqlite3.Row, sqlite3.Row]:
    """Return the signed-in user and its session, or raise 401."""
    header = request.headers.get("Authorization", "")
    token = ""
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
    if not token:
        raise ApiError(401, "Authentication required")
    db = get_db()
    session = db.execute(
        "SELECT token_hash, csrf_token, user_id FROM sessions WHERE token_hash = ?",
        (security.token_hash(token),),
    ).fetchone()
    if session is None:
        raise ApiError(401, "Invalid or expired token")
    user = db.execute("SELECT * FROM users WHERE id = ?", (session["user_id"],)).fetchone()
    if user is None:
        raise ApiError(401, "Invalid or expired token")
    return user, session


def check_csrf(session: sqlite3.Row) -> None:
    """Validate the anti-forgery token when the client sends one."""
    provided = request.headers.get("X-CSRF-Token")
    if provided is None:
        payload = request.get_json(silent=True)
        if isinstance(payload, dict):
            provided = payload.get("csrf_token")
    if provided is None:
        return
    if not isinstance(provided, str) or not hmac.compare_digest(
        provided, session["csrf_token"]
    ):
        raise ApiError(403, "Invalid CSRF token")


def serialize_transfer(row: sqlite3.Row, user_id: int) -> dict:
    direction = "out" if row["from_user_id"] == user_id else "in"
    return {
        "id": row["id"],
        "from_username": row["from_username"],
        "to_username": row["to_username"],
        "amount": cents_to_amount(row["amount_cents"]),
        "memo": row["memo"],
        "created_at": row["created_at"],
        "direction": direction,
    }


TRANSFER_SELECT = """
SELECT t.id, t.from_user_id, t.to_user_id, t.amount_cents, t.memo, t.created_at,
       fu.username AS from_username, tu.username AS to_username
FROM transfers t
JOIN users fu ON fu.id = t.from_user_id
JOIN users tu ON tu.id = t.to_user_id
"""


def create_session(db: sqlite3.Connection, user_id: int) -> tuple[str, str]:
    token = security.new_token()
    csrf_token = security.new_csrf_token()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, csrf_token, created_at) VALUES (?, ?, ?, ?)",
        (security.token_hash(token), user_id, csrf_token, now_iso()),
    )
    return token, csrf_token


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.post("/auth/register")
def register():
    data = body()
    username = required_str(data, "username").strip()
    password = required_str(data, "password")
    if len(username) > MAX_USERNAME_LENGTH:
        raise ApiError(400, "Username is too long")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ApiError(400, "Password is too long")

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError(409, "That username is already taken")

    password_hash = security.hash_password(password)
    try:
        with transaction(db):
            cursor = db.execute(
                "INSERT INTO users (username, password_hash, balance_cents, created_at)"
                " VALUES (?, ?, ?, ?)",
                (username, password_hash, INITIAL_BALANCE_CENTS, now_iso()),
            )
            user_id = int(cursor.lastrowid)
            token, csrf_token = create_session(db, user_id)
    except sqlite3.IntegrityError:
        raise ApiError(409, "That username is already taken")

    return (
        jsonify(
            {
                "username": username,
                "balance": cents_to_amount(INITIAL_BALANCE_CENTS),
                "token": token,
                "csrf_token": csrf_token,
            }
        ),
        201,
    )


@api.post("/auth/login")
def login():
    data = body()
    username = required_str(data, "username").strip()
    password = required_str(data, "password")

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not security.verify_password(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password")

    with transaction(db):
        token, csrf_token = create_session(db, int(user["id"]))

    return jsonify(
        {
            "token": token,
            "csrf_token": csrf_token,
            "username": user["username"],
            "balance": cents_to_amount(int(user["balance_cents"])),
        }
    )


@api.post("/auth/logout")
def logout():
    _user, session = authenticate()
    db = get_db()
    with transaction(db):
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (session["token_hash"],))
    return jsonify({"ok": True})


@api.get("/auth/csrf")
def csrf():
    _user, session = authenticate()
    return jsonify({"csrf_token": session["csrf_token"]})


@api.get("/account")
def account():
    user, _session = authenticate()
    return jsonify(
        {
            "username": user["username"],
            "balance": cents_to_amount(int(user["balance_cents"])),
        }
    )


@api.post("/transfers")
def create_transfer():
    user, session = authenticate()
    check_csrf(session)
    data = body()

    amount_cents = parse_amount(data.get("amount"))
    to_username = required_str(data, "to_username").strip()
    memo = data.get("memo")
    if memo is None:
        memo = ""
    if not isinstance(memo, str):
        raise ApiError(400, "Memo must be a string")
    memo = memo.strip()
    if len(memo) > MAX_MEMO_LENGTH:
        raise ApiError(400, f"Memo must be at most {MAX_MEMO_LENGTH} characters")

    db = get_db()
    with transaction(db):
        recipient = db.execute(
            "SELECT * FROM users WHERE username = ?", (to_username,)
        ).fetchone()
        if recipient is None:
            raise ApiError(404, "Recipient not found")
        if int(recipient["id"]) == int(user["id"]):
            raise ApiError(400, "You cannot transfer money to yourself")

        sender = db.execute(
            "SELECT * FROM users WHERE id = ?", (int(user["id"]),)
        ).fetchone()
        balance_cents = int(sender["balance_cents"])
        if balance_cents < amount_cents:
            raise ApiError(
                400,
                "Insufficient funds: your balance is too low for this transfer",
            )

        db.execute(
            "UPDATE users SET balance_cents = balance_cents - ? WHERE id = ?",
            (amount_cents, int(sender["id"])),
        )
        db.execute(
            "UPDATE users SET balance_cents = balance_cents + ? WHERE id = ?",
            (amount_cents, int(recipient["id"])),
        )
        cursor = db.execute(
            "INSERT INTO transfers (from_user_id, to_user_id, amount_cents, memo, created_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (
                int(sender["id"]),
                int(recipient["id"]),
                amount_cents,
                memo,
                now_iso(),
            ),
        )
        transfer_id = int(cursor.lastrowid)

    row = db.execute(
        TRANSFER_SELECT + " WHERE t.id = ?", (transfer_id,)
    ).fetchone()
    return jsonify(serialize_transfer(row, int(user["id"])))


@api.get("/transfers")
def list_transfers():
    user, _session = authenticate()
    db = get_db()

    page = request.args.get("page", default=1, type=int)
    page_size = request.args.get("page_size", default=DEFAULT_PAGE_SIZE, type=int)
    if page is None or page < 1:
        page = 1
    if page_size is None or page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    page_size = min(page_size, MAX_PAGE_SIZE)

    user_id = int(user["id"])
    where = "WHERE t.from_user_id = ? OR t.to_user_id = ?"
    params = (user_id, user_id)

    total = db.execute(
        f"SELECT COUNT(*) AS total FROM transfers t {where}", params
    ).fetchone()["total"]

    rows = db.execute(
        TRANSFER_SELECT
        + f" {where} ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        params + (page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_transfer(row, user_id) for row in rows],
            "total": int(total),
            "page": page,
            "page_size": page_size,
        }
    )


@api.get("/transfers/<int:transfer_id>")
def get_transfer(transfer_id: int):
    user, _session = authenticate()
    db = get_db()
    user_id = int(user["id"])
    row = db.execute(
        TRANSFER_SELECT
        + " WHERE t.id = ? AND (t.from_user_id = ? OR t.to_user_id = ?)",
        (transfer_id, user_id, user_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Transfer not found")
    return jsonify(serialize_transfer(row, user_id))
