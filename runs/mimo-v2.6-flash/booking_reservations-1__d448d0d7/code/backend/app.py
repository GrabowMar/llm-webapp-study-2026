"""Flask entry point: reservation JSON API and frontend hosting."""

from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import date as Date
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Iterator

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "reservations.db"

SEATS_PER_SLOT = 20
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}(?::\d{2})?$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    party_size INTEGER NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_slot ON reservations(date, time);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
"""

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    """A JSON error response with a specific HTTP status."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def write_transaction() -> Iterator[sqlite3.Connection]:
    """Run a write atomically so capacity checks and changes commit together."""
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except BaseException:
        try:
            conn.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    finally:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    if data is None:
        raw = request.get_data(as_text=True)
        if raw.strip():
            try:
                data = json.loads(raw)
            except ValueError:
                data = None
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def reservation_json(row: sqlite3.Row) -> dict[str, Any]:
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


def slot_booked(
    conn: sqlite3.Connection, date: str, time: str, exclude_id: int | None = None
) -> int:
    sql = "SELECT COALESCE(SUM(party_size), 0) FROM reservations WHERE date = ? AND time = ?"
    params: list[Any] = [date, time]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    return int(conn.execute(sql, params).fetchone()[0])


def capacity_error(remaining: int) -> ApiError:
    if remaining > 0:
        return ApiError(
            409,
            f"This time slot is full: only {remaining} seats remaining",
        )
    return ApiError(409, "This time slot is full")


def build_reservation(
    data: dict[str, Any], existing: sqlite3.Row | None = None
) -> dict[str, Any]:
    """Validate a payload; missing fields fall back to `existing` (notes never do)."""

    def pick(key: str) -> Any:
        if key in data:
            return data[key]
        if existing is not None:
            return existing[key]
        return None

    name = pick("name")
    if not isinstance(name, str) or not name.strip():
        raise ApiError(400, "name is required")

    email = pick("email")
    if not isinstance(email, str) or not email.strip():
        raise ApiError(400, "email is required")

    raw_date = pick("date")
    if not isinstance(raw_date, str) or not DATE_PATTERN.match(raw_date):
        raise ApiError(400, "date must be in YYYY-MM-DD format")
    try:
        date = Date.fromisoformat(raw_date).isoformat()
    except ValueError:
        raise ApiError(400, "date must be a valid calendar date") from None

    raw_time = pick("time")
    if not isinstance(raw_time, str) or not TIME_PATTERN.match(raw_time):
        raise ApiError(400, "time must be in HH:MM format")
    parts = [int(part) for part in raw_time.split(":")]
    if parts[0] > 23 or parts[1] > 59 or (len(parts) > 2 and parts[2] > 59):
        raise ApiError(400, "time must be a valid time of day")

    party_size = pick("party_size")
    if isinstance(party_size, str):
        try:
            party_size = int(party_size)
        except ValueError:
            raise ApiError(400, "party_size must be a positive integer") from None
    if isinstance(party_size, bool) or not isinstance(party_size, int):
        raise ApiError(400, "party_size must be a positive integer")
    if party_size < 1:
        raise ApiError(400, "party_size must be a positive integer")

    notes: Any = data.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise ApiError(400, "notes must be a string or null")

    return {
        "name": name.strip(),
        "email": email.strip(),
        "date": date,
        "time": raw_time,
        "party_size": party_size,
        "notes": notes or None,
    }


def load_user(token: str) -> dict[str, Any] | None:
    if not token:
        return None
    conn = connect()
    try:
        row = conn.execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
        return dict(row) if row is not None else None
    finally:
        conn.close()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn = connect()
    try:
        conn.execute("INSERT INTO tokens(token, user_id, created_at) VALUES (?, ?, ?)", (token, user_id, now_iso()))
        conn.commit()
    finally:
        conn.close()
    return token


def authenticate() -> None:
    """Attach `g.user` for the request, or refuse with 401."""
    if getattr(g, "user", None) is not None:
        return
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer":
        token = ""
    user = load_user(token.strip())
    if user is None:
        raise ApiError(401, "Sign in required")
    g.user = user


def require_auth(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        authenticate()
        return view(*args, **kwargs)

    return wrapped


@app.before_request
def protect_reservation_routes():
    if request.path == "/api/reservations" or request.path.startswith("/api/reservations/"):
        authenticate()


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify({"error": error.message}), error.status


@app.errorhandler(404)
def handle_not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return error


@app.errorhandler(405)
def handle_method_not_allowed(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed"}), 405
    return error


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError(400, "username is required")
    if not isinstance(password, str) or not password:
        raise ApiError(400, "password is required")
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "username is already taken")
    conn = connect()
    try:
        try:
            conn.execute(
                "INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), now_iso()),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            raise ApiError(409, "username is already taken") from None
    finally:
        conn.close()
    return jsonify({"message": "Account created"}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError(400, "username is required")
    if not isinstance(password, str) or not password:
        raise ApiError(400, "password is required")
    username = username.strip()

    conn = connect()
    try:
        if username == ADMIN_USERNAME:
            if not ADMIN_PASSWORD:
                raise ApiError(401, "Admin sign-in is disabled")
            if not secrets.compare_digest(password, ADMIN_PASSWORD):
                raise ApiError(401, "Invalid username or password")
            row = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if row is None:
                cursor = conn.execute(
                    "INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
                    (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), now_iso()),
                )
                conn.commit()
                user_id = int(cursor.lastrowid)
            else:
                user_id = int(row["id"])
        else:
            row = conn.execute(
                "SELECT id, password_hash FROM users WHERE username = ?", (username,)
            ).fetchone()
            if row is None or not check_password_hash(row["password_hash"], password):
                raise ApiError(401, "Invalid username or password")
            user_id = int(row["id"])
    finally:
        conn.close()

    return jsonify({"token": issue_token(user_id)}), 200


@app.post("/api/reservations")
@require_auth
def create_reservation():
    values = build_reservation(json_body())
    with write_transaction() as conn:
        remaining = SEATS_PER_SLOT - slot_booked(conn, values["date"], values["time"])
        if values["party_size"] > remaining:
            raise capacity_error(remaining)
        cursor = conn.execute(
            "INSERT INTO reservations(user_id, name, email, date, time, party_size, notes, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                g.user["id"],
                values["name"],
                values["email"],
                values["date"],
                values["time"],
                values["party_size"],
                values["notes"],
                now_iso(),
            ),
        )
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    return jsonify(reservation_json(row)), 201


@app.get("/api/reservations")
@require_auth
def list_reservations():
    sql = "SELECT * FROM reservations WHERE user_id = ?"
    params: list[Any] = [g.user["id"]]
    date = request.args.get("date")
    if date:
        sql += " AND date = ?"
        params.append(date)
    sql += " ORDER BY date ASC, time ASC, id ASC"
    conn = connect()
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()
    items = [reservation_json(row) for row in rows]
    return jsonify({"items": items, "total": len(items)})


def own_reservation(conn: sqlite3.Connection, reservation_id: int) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
        (reservation_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Reservation not found")
    return row


@app.get("/api/reservations/<int:reservation_id>")
@require_auth
def get_reservation(reservation_id: int):
    conn = connect()
    try:
        row = own_reservation(conn, reservation_id)
    finally:
        conn.close()
    return jsonify(reservation_json(row))


@app.put("/api/reservations/<int:reservation_id>")
@require_auth
def update_reservation(reservation_id: int):
    data = json_body()
    with write_transaction() as conn:
        existing = own_reservation(conn, reservation_id)
        values = build_reservation(data, existing)
        remaining = SEATS_PER_SLOT - slot_booked(
            conn, values["date"], values["time"], exclude_id=reservation_id
        )
        if values["party_size"] > remaining:
            raise capacity_error(remaining)
        conn.execute(
            "UPDATE reservations SET name = ?, email = ?, date = ?, time = ?,"
            " party_size = ?, notes = ? WHERE id = ? AND user_id = ?",
            (
                values["name"],
                values["email"],
                values["date"],
                values["time"],
                values["party_size"],
                values["notes"],
                reservation_id,
                g.user["id"],
            ),
        )
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
        ).fetchone()
    return jsonify(reservation_json(row))


@app.delete("/api/reservations/<int:reservation_id>")
@require_auth
def delete_reservation(reservation_id: int):
    with write_transaction() as conn:
        own_reservation(conn, reservation_id)
        conn.execute(
            "DELETE FROM reservations WHERE id = ? AND user_id = ?",
            (reservation_id, g.user["id"]),
        )
    return jsonify({"status": "cancelled"})


@app.get("/api/availability")
def availability():
    date = request.args.get("date") or datetime.now(timezone.utc).date().isoformat()
    conn = connect()
    try:
        rows = conn.execute(
            "SELECT time, SUM(party_size) AS booked FROM reservations"
            " WHERE date = ? GROUP BY time ORDER BY time ASC",
            (date,),
        ).fetchall()
    finally:
        conn.close()
    items = [
        {
            "time": row["time"],
            "booked": int(row["booked"]),
            "remaining": SEATS_PER_SLOT - int(row["booked"]),
        }
        for row in rows
    ]
    return jsonify({"items": items})


def query_int(name: str, default: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be an integer") from None
    value = max(1, value)
    if maximum is not None:
        value = min(value, maximum)
    return value


@app.get("/api/admin/reservations")
@require_auth
def admin_reservations():
    if g.user["username"] != ADMIN_USERNAME:
        raise ApiError(403, "Admin access required")

    page = query_int("page", 1)
    page_size = query_int("page_size", 50, maximum=1000)

    where = ""
    params: list[Any] = []
    date = request.args.get("date")
    if date:
        where = " WHERE date = ?"
        params.append(date)

    conn = connect()
    try:
        total = int(
            conn.execute(
                "SELECT COUNT(*) FROM reservations" + where, params
            ).fetchone()[0]
        )
        rows = conn.execute(
            "SELECT * FROM reservations"
            + where
            + " ORDER BY date ASC, time ASC, id ASC LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
    finally:
        conn.close()

    return jsonify(
        {
            "items": [reservation_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError(404, "Not found")
    if path != "index.html" and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
