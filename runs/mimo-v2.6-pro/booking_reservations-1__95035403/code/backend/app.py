"""Flask entry point: reservation API and frontend."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import date as date_cls
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"
SLOT_CAPACITY = 20

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------

def connect_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def init_db() -> None:
    db = connect_db()
    try:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
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
                notes TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_reservations_slot
                ON reservations (date, time);
            CREATE INDEX IF NOT EXISTS idx_reservations_user
                ON reservations (user_id);
            """
        )
        if ADMIN_ENABLED:
            db.execute(
                """
                INSERT INTO users (username, password_hash, is_admin, created_at)
                VALUES ('admin', ?, 1, ?)
                ON CONFLICT(username) DO UPDATE SET
                    password_hash = excluded.password_hash,
                    is_admin = 1
                """,
                (generate_password_hash(ADMIN_PASSWORD), now_iso()),
            )
    finally:
        db.close()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def error(message: str, status: int, **extra):
    body = {"error": message, "message": message}
    body.update(extra)
    return jsonify(body), status


def get_json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def valid_date(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not DATE_RE.match(value):
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value


def valid_time(value) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not TIME_RE.match(value):
        return None
    return value[:5]


def valid_party_size(value) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        size = value
    elif isinstance(value, float) and value.is_integer():
        size = int(value)
    elif isinstance(value, str) and re.fullmatch(r"\d+", value.strip()):
        size = int(value.strip())
    else:
        return None
    if size < 1 or size > SLOT_CAPACITY:
        return None
    return size


def parse_reservation(data: dict):
    """Validate the writable fields of a reservation.

    Returns (fields, error_message). ``notes`` is optional and cleared when
    omitted.
    """
    name = data.get("name")
    email = data.get("email")
    date_s = data.get("date")
    time_s = data.get("time")
    party = data.get("party_size")
    notes = data.get("notes", "")

    if not isinstance(name, str) or not name.strip():
        return None, "name is required"
    name = name.strip()

    if not isinstance(email, str) or not email.strip():
        return None, "email is required"
    email = email.strip()
    if "@" not in email:
        return None, "email must be a valid email address"

    date_norm = valid_date(date_s)
    if date_norm is None:
        return None, "date must be a date in YYYY-MM-DD format"

    time_norm = valid_time(time_s)
    if time_norm is None:
        return None, "time must be a time in HH:MM format"

    party_norm = valid_party_size(party)
    if party_norm is None:
        return None, "party_size must be an integer between 1 and 20"

    if notes is None:
        notes = ""
    if not isinstance(notes, str):
        return None, "notes must be a string"

    return {
        "name": name,
        "email": email,
        "date": date_norm,
        "time": time_norm,
        "party_size": party_norm,
        "notes": notes,
    }, None


def reservation_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "date": row["date"],
        "time": row["time"],
        "party_size": row["party_size"],
        "notes": row["notes"] or "",
        "created_at": row["created_at"],
    }


def slot_booked(db: sqlite3.Connection, date_s: str, time_s: str,
                exclude_id: int | None = None) -> int:
    sql = ("SELECT COALESCE(SUM(party_size), 0) AS booked FROM reservations"
           " WHERE date = ? AND time = ?")
    params: list = [date_s, time_s]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    return db.execute(sql, params).fetchone()["booked"]


def capacity_error(booked: int):
    remaining = max(SLOT_CAPACITY - booked, 0)
    if remaining <= 0:
        message = "Slot is fully booked"
    else:
        message = (f"Not enough seats in this slot: only {remaining} of "
                   f"{SLOT_CAPACITY} seats are still free")
    return error(message, 400, code="slot_full", remaining=remaining)


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token = ?",
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        return view(user, *args, **kwargs)

    return wrapped


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    username = username.strip() if isinstance(username, str) else ""

    if not username or not isinstance(password, str) or not password:
        return error("username and password are required", 400)
    if username.lower() == "admin":
        return error("This username is reserved", 400)

    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at)"
            " VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        return error("Username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    username = username.strip() if isinstance(username, str) else ""

    if not username or not isinstance(password, str) or not password:
        return error("username and password are required", 400)

    if username == "admin" and not ADMIN_ENABLED:
        return error("Invalid username or password", 401)

    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    return jsonify({"token": token}), 200


# --------------------------------------------------------------------------
# reservations
# --------------------------------------------------------------------------

@app.post("/api/reservations")
@login_required
def create_reservation(user):
    fields, err = parse_reservation(get_json_body())
    if err:
        return error(err, 400)

    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        booked = slot_booked(db, fields["date"], fields["time"])
        if booked + fields["party_size"] > SLOT_CAPACITY:
            db.execute("ROLLBACK")
            return capacity_error(booked)
        cur = db.execute(
            "INSERT INTO reservations"
            " (user_id, name, email, date, time, party_size, notes, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user["id"], fields["name"], fields["email"], fields["date"],
             fields["time"], fields["party_size"], fields["notes"], now_iso()),
        )
        res_id = cur.lastrowid
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (res_id,)
    ).fetchone()
    return jsonify(reservation_dict(row)), 201


@app.get("/api/reservations")
@login_required
def list_reservations(user):
    date_s = request.args.get("date")
    if date_s is not None:
        date_s = valid_date(date_s)
        if date_s is None:
            return error("date must be a date in YYYY-MM-DD format", 400)

    sql = "SELECT * FROM reservations WHERE user_id = ?"
    params: list = [user["id"]]
    if date_s is not None:
        sql += " AND date = ?"
        params.append(date_s)
    sql += " ORDER BY date, time, id"

    rows = get_db().execute(sql, params).fetchall()
    items = [reservation_dict(r) for r in rows]
    return jsonify({"items": items, "total": len(items)}), 200


@app.get("/api/reservations/<int:res_id>")
@login_required
def get_reservation(user, res_id):
    row = get_db().execute(
        "SELECT * FROM reservations WHERE id = ?", (res_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return error("Reservation not found", 404)
    return jsonify(reservation_dict(row)), 200


@app.put("/api/reservations/<int:res_id>")
@login_required
def update_reservation(user, res_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (res_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return error("Reservation not found", 404)

    fields, err = parse_reservation(get_json_body())
    if err:
        return error(err, 400)

    db.execute("BEGIN IMMEDIATE")
    try:
        booked = slot_booked(db, fields["date"], fields["time"],
                             exclude_id=res_id)
        if booked + fields["party_size"] > SLOT_CAPACITY:
            db.execute("ROLLBACK")
            return capacity_error(booked)
        db.execute(
            "UPDATE reservations"
            " SET name = ?, email = ?, date = ?, time = ?, party_size = ?,"
            " notes = ? WHERE id = ?",
            (fields["name"], fields["email"], fields["date"], fields["time"],
             fields["party_size"], fields["notes"], res_id),
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (res_id,)
    ).fetchone()
    return jsonify(reservation_dict(row)), 200


@app.delete("/api/reservations/<int:res_id>")
@login_required
def delete_reservation(user, res_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (res_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return error("Reservation not found", 404)
    db.execute("DELETE FROM reservations WHERE id = ?", (res_id,))
    return jsonify({"ok": True}), 200


# --------------------------------------------------------------------------
# availability
# --------------------------------------------------------------------------

@app.get("/api/availability")
def availability():
    date_s = request.args.get("date")
    if date_s is None:
        date_s = date_cls.today().isoformat()
    else:
        date_s = valid_date(date_s)
        if date_s is None:
            return error("date must be a date in YYYY-MM-DD format", 400)

    rows = get_db().execute(
        "SELECT time, SUM(party_size) AS booked FROM reservations"
        " WHERE date = ? GROUP BY time ORDER BY time",
        (date_s,),
    ).fetchall()
    items = [
        {
            "time": r["time"],
            "booked": r["booked"],
            "remaining": max(SLOT_CAPACITY - r["booked"], 0),
        }
        for r in rows
        if r["booked"] > 0
    ]
    return jsonify({"items": items}), 200


# --------------------------------------------------------------------------
# admin
# --------------------------------------------------------------------------

@app.get("/api/admin/reservations")
@login_required
def admin_reservations(user):
    if not user["is_admin"]:
        return error("Admin access required", 403)

    date_s = request.args.get("date")
    if date_s is not None:
        date_s = valid_date(date_s)
        if date_s is None:
            return error("date must be a date in YYYY-MM-DD format", 400)

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 50))
    except ValueError:
        return error("page and page_size must be integers", 400)
    if page < 1 or page_size < 1:
        return error("page and page_size must be positive integers", 400)

    where = ""
    params: list = []
    if date_s is not None:
        where = " WHERE date = ?"
        params.append(date_s)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM reservations" + where, params
    ).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM reservations" + where
        + " ORDER BY date, time, id LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify({
        "items": [reservation_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }), 200


# --------------------------------------------------------------------------
# health + frontend
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
