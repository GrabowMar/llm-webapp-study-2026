"""Flask API and frontend host for the table reservation app."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import date as date_cls
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "reservations.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or None

SLOT_CAPACITY = 20
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def init_db() -> None:
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
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

            CREATE INDEX IF NOT EXISTS idx_reservations_slot
                ON reservations (date, time);
            CREATE INDEX IF NOT EXISTS idx_reservations_user
                ON reservations (user_id, date, time);
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, created_at) "
            "VALUES (?, ?, ?)",
            (ADMIN_USERNAME, "!", now_iso()),
        )
        conn.commit()
    finally:
        conn.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def error(message: str, status: int):
    return jsonify({"error": message}), status


def body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def parse_date(value: Any) -> str | None:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        return date_cls.fromisoformat(value).isoformat()
    except ValueError:
        return None


def parse_time(value: Any) -> str | None:
    if not isinstance(value, str) or not TIME_RE.match(value):
        return None
    return value


def parse_party_size(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
        return number if number > 0 else None
    return None


def parse_positive_int(value: Any, default: int, maximum: int | None = None) -> int | None:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    if number < 1:
        return None
    if maximum is not None and number > maximum:
        return None
    return number


def query_date(name: str = "date") -> tuple[str | None, Any]:
    """Return (date, error_response) for an optional date query parameter."""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return None, None
    parsed = parse_date(raw)
    if parsed is None:
        return None, error("Invalid date. Expected YYYY-MM-DD.", 400)
    return parsed, None


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


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    conn = connect()
    try:
        return conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ?",
            (token,),
        ).fetchone()
    finally:
        conn.close()


def login_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        request.user = user  # type: ignore[attr-defined]
        return view(*args, **kwargs)

    return wrapped


def admin_required(view: Callable):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        if user["username"] != ADMIN_USERNAME:
            return error("Admin access required.", 403)
        request.user = user  # type: ignore[attr-defined]
        return view(*args, **kwargs)

    return wrapped


def validate_reservation(data: dict[str, Any]) -> tuple[dict[str, Any] | None, Any]:
    name = clean_text(data.get("name"))
    email = clean_text(data.get("email"))
    date_value = parse_date(data.get("date"))
    time_value = parse_time(data.get("time"))
    party_size = parse_party_size(data.get("party_size"))

    notes_raw = data.get("notes")
    if notes_raw is not None and not isinstance(notes_raw, str):
        return None, error("Notes must be text.", 400)
    notes = clean_text(notes_raw) if notes_raw is not None else None

    if name is None:
        return None, error("Name is required.", 400)
    if email is None:
        return None, error("Email is required.", 400)
    if date_value is None:
        return None, error("A valid date is required (YYYY-MM-DD).", 400)
    if time_value is None:
        return None, error("A valid time is required (HH:MM).", 400)
    if party_size is None:
        return None, error("Party size must be a positive whole number.", 400)

    return {
        "name": name,
        "email": email,
        "date": date_value,
        "time": time_value,
        "party_size": party_size,
        "notes": notes,
    }, None


def capacity_message(booked: int, party_size: int) -> str:
    remaining = SLOT_CAPACITY - booked
    if remaining <= 0:
        return "This time slot is full."
    return f"Only {remaining} seats remain in this time slot."


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = body()
    username = clean_text(data.get("username"))
    password = data.get("password")

    if username is None:
        return error("Username is required.", 400)
    if not isinstance(password, str) or password == "":
        return error("Password is required.", 400)
    if username.lower() == ADMIN_USERNAME:
        return error("That username is not available.", 409)

    conn = connect()
    try:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()
        if existing is not None:
            return error("That username is already taken.", 409)
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
        return jsonify({"id": cur.lastrowid, "username": username}), 201
    except sqlite3.IntegrityError:
        return error("That username is already taken.", 409)
    finally:
        conn.close()


@app.post("/api/auth/login")
def login():
    data = body()
    username = clean_text(data.get("username"))
    password = data.get("password")

    if username is None or not isinstance(password, str) or password == "":
        return error("Invalid username or password.", 401)

    conn = connect()
    try:
        if username == ADMIN_USERNAME:
            if ADMIN_PASSWORD is None or not secrets.compare_digest(
                password, ADMIN_PASSWORD
            ):
                return error("Invalid username or password.", 401)
            user = conn.execute(
                "SELECT * FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        else:
            user = conn.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ).fetchone()
            if user is None or not check_password_hash(
                user["password_hash"], password
            ):
                return error("Invalid username or password.", 401)

        if user is None:
            return error("Invalid username or password.", 401)

        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user["id"], now_iso()),
        )
        conn.commit()
        return jsonify({"token": token})
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------


@app.post("/api/reservations")
@login_required
def create_reservation():
    data, validation_error = validate_reservation(body())
    if validation_error is not None:
        return validation_error

    user_id = request.user["id"]  # type: ignore[attr-defined]
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        booked = conn.execute(
            "SELECT COALESCE(SUM(party_size), 0) AS total FROM reservations "
            "WHERE date = ? AND time = ?",
            (data["date"], data["time"]),
        ).fetchone()["total"]
        if booked + data["party_size"] > SLOT_CAPACITY:
            conn.rollback()
            return error(capacity_message(booked, data["party_size"]), 409)

        cur = conn.execute(
            "INSERT INTO reservations "
            "(user_id, name, email, date, time, party_size, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user_id,
                data["name"],
                data["email"],
                data["date"],
                data["time"],
                data["party_size"],
                data["notes"],
                now_iso(),
            ),
        )
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        conn.commit()
        return jsonify(reservation_json(row)), 201
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.get("/api/reservations")
@login_required
def list_reservations():
    date_value, date_error = query_date()
    if date_error is not None:
        return date_error

    user_id = request.user["id"]  # type: ignore[attr-defined]
    conn = connect()
    try:
        if date_value is None:
            rows = conn.execute(
                "SELECT * FROM reservations WHERE user_id = ? "
                "ORDER BY date, time, created_at, id",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM reservations WHERE user_id = ? AND date = ? "
                "ORDER BY date, time, created_at, id",
                (user_id, date_value),
            ).fetchall()
        items = [reservation_json(row) for row in rows]
        return jsonify({"items": items, "total": len(items)})
    finally:
        conn.close()


@app.get("/api/reservations/<int:reservation_id>")
@login_required
def get_reservation(reservation_id: int):
    user_id = request.user["id"]  # type: ignore[attr-defined]
    conn = connect()
    try:
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
            (reservation_id, user_id),
        ).fetchone()
        if row is None:
            return error("Reservation not found.", 404)
        return jsonify(reservation_json(row))
    finally:
        conn.close()


@app.put("/api/reservations/<int:reservation_id>")
@login_required
def replace_reservation(reservation_id: int):
    data, validation_error = validate_reservation(body())
    if validation_error is not None:
        return validation_error

    user_id = request.user["id"]  # type: ignore[attr-defined]
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        existing = conn.execute(
            "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
            (reservation_id, user_id),
        ).fetchone()
        if existing is None:
            conn.rollback()
            return error("Reservation not found.", 404)

        booked = conn.execute(
            "SELECT COALESCE(SUM(party_size), 0) AS total FROM reservations "
            "WHERE date = ? AND time = ? AND id <> ?",
            (data["date"], data["time"], reservation_id),
        ).fetchone()["total"]
        if booked + data["party_size"] > SLOT_CAPACITY:
            conn.rollback()
            return error(capacity_message(booked, data["party_size"]), 409)

        conn.execute(
            "UPDATE reservations SET name = ?, email = ?, date = ?, time = ?, "
            "party_size = ?, notes = ? WHERE id = ?",
            (
                data["name"],
                data["email"],
                data["date"],
                data["time"],
                data["party_size"],
                data["notes"],
                reservation_id,
            ),
        )
        row = conn.execute(
            "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
        ).fetchone()
        conn.commit()
        return jsonify(reservation_json(row))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@app.delete("/api/reservations/<int:reservation_id>")
@login_required
def delete_reservation(reservation_id: int):
    user_id = request.user["id"]  # type: ignore[attr-defined]
    conn = connect()
    try:
        cur = conn.execute(
            "DELETE FROM reservations WHERE id = ? AND user_id = ?",
            (reservation_id, user_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return error("Reservation not found.", 404)
        return "", 204
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Availability and admin
# ---------------------------------------------------------------------------


@app.get("/api/availability")
def availability():
    raw = request.args.get("date")
    if raw is None or raw == "":
        return error("A date is required (YYYY-MM-DD).", 400)
    date_value = parse_date(raw)
    if date_value is None:
        return error("Invalid date. Expected YYYY-MM-DD.", 400)

    conn = connect()
    try:
        rows = conn.execute(
            "SELECT time, COALESCE(SUM(party_size), 0) AS booked "
            "FROM reservations WHERE date = ? GROUP BY time ORDER BY time",
            (date_value,),
        ).fetchall()
        items = [
            {
                "time": row["time"],
                "booked": row["booked"],
                "remaining": SLOT_CAPACITY - row["booked"],
            }
            for row in rows
        ]
        return jsonify({"items": items})
    finally:
        conn.close()


@app.get("/api/admin/reservations")
@admin_required
def admin_reservations():
    date_value, date_error = query_date()
    if date_error is not None:
        return date_error

    page = parse_positive_int(request.args.get("page"), 1)
    page_size = parse_positive_int(request.args.get("page_size"), 20, maximum=1000)
    if page is None:
        return error("Page must be a positive whole number.", 400)
    if page_size is None:
        return error("Page size must be between 1 and 1000.", 400)

    where = ""
    params: list[Any] = []
    if date_value is not None:
        where = " WHERE date = ?"
        params.append(date_value)

    conn = connect()
    try:
        total = conn.execute(
            f"SELECT COUNT(*) AS count FROM reservations{where}", params
        ).fetchone()["count"]
        rows = conn.execute(
            f"SELECT * FROM reservations{where} "
            "ORDER BY date, time, created_at, id LIMIT ? OFFSET ?",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()
        return jsonify(
            {
                "items": [reservation_json(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        )
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Static frontend and health
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error("Not found.", 404)
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
