"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
import sys
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import auth  # noqa: E402
import db  # noqa: E402

DIST = BACKEND_DIR.parent / "frontend" / "dist"

SLOT_CAPACITY = 20
ADMIN_USERNAME = "admin"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 200

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    """An error that is rendered as a JSON payload with a status code."""

    def __init__(self, message: str, status: int = 400, **extra):
        super().__init__(message)
        self.message = message
        self.status = status
        self.extra = extra


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    payload = {"error": error.message}
    payload.update(error.extra)
    return jsonify(payload), error.status


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found."}), 404
    return frontend_index()


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed."}), 405
    return frontend_index()


@app.errorhandler(500)
def handle_server_error(_error):  # pragma: no cover - defensive
    if request.path.startswith("/api/"):
        return jsonify({"error": "Internal server error."}), 500
    return frontend_index()


# --------------------------------------------------------------------------- #
# database helpers
# --------------------------------------------------------------------------- #


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = db.connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --------------------------------------------------------------------------- #
# request helpers
# --------------------------------------------------------------------------- #


def json_body() -> dict:
    body = request.get_json(silent=True, force=True)
    if body is None:
        return {}
    if not isinstance(body, dict):
        raise ApiError("Request body must be a JSON object.")
    return body


def clean_text(value, field: str, max_length: int = 500) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    value = value.strip()
    if len(value) > max_length:
        raise ApiError(f"{field} is too long (max {max_length} characters).")
    return value


def parse_date(value, field: str = "date") -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{field} is required (format YYYY-MM-DD).")
    raw = value.strip()
    try:
        parsed = datetime.strptime(raw, "%Y-%m-%d")
    except ValueError:
        try:
            parsed = datetime.strptime(raw, "%Y/%m/%d")
        except ValueError:
            raise ApiError(f"{field} must be a valid date (format YYYY-MM-DD).")
    return parsed.strftime("%Y-%m-%d")


_TIME_RE = re.compile(r"^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$", re.IGNORECASE)


def parse_time(value, field: str = "time") -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{field} is required (format HH:MM).")
    raw = value.strip()
    match = _TIME_RE.match(raw)
    if not match:
        raise ApiError(f"{field} must be a valid time (format HH:MM).")
    hour = int(match.group(1))
    minute = int(match.group(2) or 0)
    meridiem = (match.group(3) or "").replace(".", "").lower()
    if meridiem == "pm" and hour < 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    if hour > 23 or minute > 59:
        raise ApiError(f"{field} must be a valid time (format HH:MM).")
    return f"{hour:02d}:{minute:02d}"


def parse_party_size(value) -> int:
    if value is None or isinstance(value, bool):
        raise ApiError("party_size is required.")
    try:
        size = int(value)
    except (TypeError, ValueError):
        raise ApiError("party_size must be a whole number.")
    if size < 1:
        raise ApiError("party_size must be at least 1.")
    if size > SLOT_CAPACITY:
        raise ApiError(f"party_size cannot be more than {SLOT_CAPACITY} guests.")
    return size


def parse_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise ApiError(f"{name} must be a whole number.")
    return max(minimum, min(maximum, value))


def validate_reservation_payload(body: dict) -> dict:
    """Build the reservation fields from a request body.

    ``notes`` (and the other optional fields) default to an empty value so
    that replacing a reservation clears whatever was not sent.
    """
    if "date" not in body or body.get("date") in (None, ""):
        raise ApiError("date is required (format YYYY-MM-DD).")
    if "time" not in body or body.get("time") in (None, ""):
        raise ApiError("time is required (format HH:MM).")
    if "party_size" not in body or body.get("party_size") in (None, ""):
        raise ApiError("party_size is required.")

    return {
        "name": clean_text(body.get("name"), "name", 200),
        "email": clean_text(body.get("email"), "email", 320),
        "date": parse_date(body.get("date")),
        "time": parse_time(body.get("time")),
        "party_size": parse_party_size(body.get("party_size")),
        "notes": clean_text(body.get("notes"), "notes", 2000),
    }


def serialize_reservation(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "date": row["date"],
        "time": row["time"],
        "party_size": row["party_size"],
        "notes": row["notes"],
        "created_at": row["created_at"],
    }


def slot_booked(conn: sqlite3.Connection, date: str, time: str, exclude_id: int | None = None) -> int:
    sql = "SELECT COALESCE(SUM(party_size), 0) AS booked FROM reservations WHERE date = ? AND time = ?"
    params: list = [date, time]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    row = conn.execute(sql, params).fetchone()
    return int(row["booked"] or 0)


# --------------------------------------------------------------------------- #
# authentication
# --------------------------------------------------------------------------- #


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "") or ""
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def require_user(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError("Authentication required: sign in to continue.", 401)
        g.user = user
        return func(*args, **kwargs)

    return wrapper


def require_admin(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError("Authentication required: sign in to continue.", 401)
        if not user["is_admin"]:
            raise ApiError("Admin privileges are required for this resource.", 403)
        g.user = user
        return func(*args, **kwargs)

    return wrapper


def admin_password_enabled() -> bool:
    return bool((os.environ.get("ADMIN_PASSWORD") or "").strip())


def sync_admin_account() -> None:
    """Create/refresh the single admin account from ``ADMIN_PASSWORD``."""
    password = (os.environ.get("ADMIN_PASSWORD") or "").strip()
    conn = db.connect()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
        if row is None:
            password_hash = auth.hash_password(password or secrets.token_urlsafe(32))
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                (ADMIN_USERNAME, password_hash, now_iso()),
            )
        else:
            if password:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (auth.hash_password(password), row["id"]),
                )
            else:
                conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# routes: health & auth
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = clean_text(body.get("username"), "username", 64)
    password = body.get("password")
    if not username:
        raise ApiError("username is required.")
    if not isinstance(password, str) or not password:
        raise ApiError("password is required.")
    if username.lower() == ADMIN_USERNAME:
        raise ApiError("That username is reserved.", 409)

    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, auth.hash_password(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        raise ApiError("That username is already taken.", 409)
    return jsonify({"id": cursor.lastrowid, "username": username, "is_admin": False}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = clean_text(body.get("username"), "username", 64)
    password = body.get("password")
    if not username or not isinstance(password, str) or not password:
        raise ApiError("username and password are required.")

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None:
        raise ApiError("Invalid username or password.", 401)
    if user["is_admin"] and not admin_password_enabled():
        raise ApiError("Admin sign-in is disabled.", 403)
    if not auth.verify_password(user["password_hash"], password):
        raise ApiError("Invalid username or password.", 401)

    token = auth.new_token()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    return jsonify({"token": token, "username": user["username"], "is_admin": bool(user["is_admin"])})


@app.post("/api/auth/logout")
@require_user
def logout():
    header = request.headers.get("Authorization", "") or ""
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if token:
        get_db().execute("DELETE FROM tokens WHERE token = ?", (token,))
    return jsonify({"status": "signed out"})


@app.get("/api/auth/me")
@require_user
def whoami():
    user = g.user
    return jsonify({"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])})


# --------------------------------------------------------------------------- #
# routes: reservations
# --------------------------------------------------------------------------- #


@app.post("/api/reservations")
@require_user
def create_reservation():
    body = json_body()
    payload = validate_reservation_payload(body)
    conn = get_db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        booked = slot_booked(conn, payload["date"], payload["time"])
        if booked + payload["party_size"] > SLOT_CAPACITY:
            raise ApiError(
                f"Slot is full: {SLOT_CAPACITY - booked} seat(s) left for "
                f"{payload['time']} on {payload['date']}.",
                409,
            )
        cursor = conn.execute(
            "INSERT INTO reservations (user_id, name, email, date, time, party_size, notes, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                g.user["id"],
                payload["name"],
                payload["email"],
                payload["date"],
                payload["time"],
                payload["party_size"],
                payload["notes"],
                now_iso(),
            ),
        )
        row = conn.execute("SELECT * FROM reservations WHERE id = ?", (cursor.lastrowid,)).fetchone()
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    return jsonify(serialize_reservation(row)), 201


@app.get("/api/reservations")
@require_user
def list_reservations():
    date_filter = request.args.get("date")
    sql = "SELECT * FROM reservations WHERE user_id = ?"
    params: list = [g.user["id"]]
    if date_filter:
        sql += " AND date = ?"
        params.append(parse_date(date_filter))
    sql += " ORDER BY date ASC, time ASC, id ASC"
    rows = get_db().execute(sql, params).fetchall()
    return jsonify({"items": [serialize_reservation(row) for row in rows], "total": len(rows)})


@app.get("/api/reservations/<int:reservation_id>")
@require_user
def get_reservation(reservation_id: int):
    row = get_db().execute(
        "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
        (reservation_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError("Reservation not found.", 404)
    return jsonify(serialize_reservation(row))


@app.put("/api/reservations/<int:reservation_id>")
@require_user
def replace_reservation(reservation_id: int):
    body = json_body()
    payload = validate_reservation_payload(body)
    conn = get_db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
            (reservation_id, g.user["id"]),
        ).fetchone()
        if row is None:
            conn.execute("ROLLBACK")
            raise ApiError("Reservation not found.", 404)
        booked = slot_booked(conn, payload["date"], payload["time"], exclude_id=reservation_id)
        if booked + payload["party_size"] > SLOT_CAPACITY:
            raise ApiError(
                f"Slot is full: {SLOT_CAPACITY - booked} seat(s) left for "
                f"{payload['time']} on {payload['date']}.",
                409,
            )
        conn.execute(
            "UPDATE reservations SET name = ?, email = ?, date = ?, time = ?, party_size = ?,"
            " notes = ? WHERE id = ? AND user_id = ?",
            (
                payload["name"],
                payload["email"],
                payload["date"],
                payload["time"],
                payload["party_size"],
                payload["notes"],
                reservation_id,
                g.user["id"],
            ),
        )
        updated = conn.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)).fetchone()
        conn.execute("COMMIT")
    except Exception:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    return jsonify(serialize_reservation(updated))


@app.delete("/api/reservations/<int:reservation_id>")
@require_user
def cancel_reservation(reservation_id: int):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
        (reservation_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError("Reservation not found.", 404)
    conn.execute("DELETE FROM reservations WHERE id = ? AND user_id = ?", (reservation_id, g.user["id"]))
    return jsonify({"status": "cancelled", "id": reservation_id})


# --------------------------------------------------------------------------- #
# routes: availability & admin
# --------------------------------------------------------------------------- #


@app.get("/api/availability")
def availability():
    date_filter = request.args.get("date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    date_filter = parse_date(date_filter)
    rows = get_db().execute(
        "SELECT time, COALESCE(SUM(party_size), 0) AS booked FROM reservations"
        " WHERE date = ? GROUP BY time ORDER BY time ASC",
        (date_filter,),
    ).fetchall()
    items = [
        {
            "time": row["time"],
            "booked": int(row["booked"] or 0),
            "remaining": max(0, SLOT_CAPACITY - int(row["booked"] or 0)),
        }
        for row in rows
        if int(row["booked"] or 0) > 0
    ]
    return jsonify({"items": items})


@app.get("/api/admin/reservations")
@require_admin
def admin_reservations():
    date_filter = request.args.get("date")
    page = parse_int_arg("page", 1, 1, 1_000_000)
    page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    where = ""
    params: list = []
    if date_filter:
        where = " WHERE date = ?"
        params.append(parse_date(date_filter))

    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) AS count FROM reservations{where}", params).fetchone()["count"]
    rows = conn.execute(
        f"SELECT * FROM reservations{where} ORDER BY date ASC, time ASC, id ASC LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_reservation(row) for row in rows],
            "total": int(total),
            "page": page,
            "page_size": page_size,
        }
    )


# --------------------------------------------------------------------------- #
# frontend
# --------------------------------------------------------------------------- #


def frontend_index():
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    candidate = DIST / path
    if path and candidate.is_file():
        return send_from_directory(DIST, path)
    return frontend_index()


db.init_db()
sync_admin_account()
