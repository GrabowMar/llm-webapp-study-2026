"""Restaurant reservation API (Flask + SQLite)."""

import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DIST = BASE_DIR / "frontend" / "dist"
DB_PATH = DATA_DIR / "app.db"
SECRET_PATH = DATA_DIR / "secret_key"

MAX_GUESTS = 20
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^\d{2}:\d{2}$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

DATA_DIR.mkdir(parents=True, exist_ok=True)

if SECRET_PATH.exists():
    SECRET_KEY = SECRET_PATH.read_text().strip()
else:
    SECRET_KEY = os.urandom(32).hex()
    SECRET_PATH.write_text(SECRET_KEY)

serializer = URLSafeTimedSerializer(SECRET_KEY, salt="reservation-auth")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
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

        CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
        CREATE INDEX IF NOT EXISTS idx_reservations_slot ON reservations(date, time);
        """
    )
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_password:
        existing = conn.execute(
            "SELECT id FROM users WHERE username = ?", ("admin",)
        ).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) "
                "VALUES (?, ?, 1, ?)",
                ("admin", generate_password_hash(admin_password), now_iso()),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ?",
                (generate_password_hash(admin_password), "admin"),
            )
    conn.commit()
    conn.close()


init_db()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def get_current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    try:
        user_id = int(serializer.loads(token, max_age=60 * 60 * 24 * 30))
    except (BadSignature, ValueError, TypeError):
        return None
    return get_db().execute(
        "SELECT * FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def require_user():
    user = get_current_user()
    if user is None:
        return None, error("Authentication required", 401)
    return user, None


def require_admin():
    user, err = require_user()
    if err is not None:
        return None, err
    if not user["is_admin"]:
        return None, error("Admin access required", 403)
    return user, None


def serialize_reservation(row) -> dict:
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


def validate_slot_fields(data: dict, partial: bool = False):
    name = data.get("name")
    email = data.get("email")
    date = data.get("date")
    time = data.get("time")
    party_size = data.get("party_size")

    if not partial or name is not None:
        if not isinstance(name, str) or not name.strip():
            return None, "name is required"
    if not partial or email is not None:
        if not isinstance(email, str) or not email.strip():
            return None, "email is required"
    if not partial or date is not None:
        if not isinstance(date, str) or not DATE_RE.match(date):
            return None, "date must be YYYY-MM-DD"
    if not partial or time is not None:
        if not isinstance(time, str) or not TIME_RE.match(time):
            return None, "time must be HH:MM"
    if not partial or party_size is not None:
        if isinstance(party_size, bool) or not isinstance(party_size, int) or party_size < 1:
            return None, "party_size must be a positive integer"
        if party_size > MAX_GUESTS:
            return None, f"party_size cannot exceed {MAX_GUESTS}"

    return {
        "name": name.strip() if isinstance(name, str) else name,
        "email": email.strip() if isinstance(email, str) else email,
        "date": date,
        "time": time,
        "party_size": party_size,
    }, None


def slot_booked(db, date: str, time: str, exclude_id=None) -> int:
    if exclude_id is None:
        row = db.execute(
            "SELECT COALESCE(SUM(party_size), 0) AS total FROM reservations "
            "WHERE date = ? AND time = ?",
            (date, time),
        ).fetchone()
    else:
        row = db.execute(
            "SELECT COALESCE(SUM(party_size), 0) AS total FROM reservations "
            "WHERE date = ? AND time = ? AND id != ?",
            (date, time, exclude_id),
        ).fetchone()
    return row["total"]


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Invalid JSON body")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required")
    if not isinstance(password, str) or not password:
        return error("password is required")
    username = username.strip()
    if username == "admin":
        return error("username is not available", 409)
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username is already taken", 409)
    db.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) "
        "VALUES (?, ?, 0, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Invalid JSON body")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username:
        return error("username is required")
    if not isinstance(password, str) or not password:
        return error("password is required")
    username = username.strip()
    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None:
        return error("Invalid username or password", 401)
    if user["is_admin"]:
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if not admin_password:
            return error("Admin sign-in is disabled", 401)
    if not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password", 401)
    token = serializer.dumps(str(user["id"]))
    return jsonify({"token": token})


@app.post("/api/reservations")
def create_reservation():
    user, err = require_user()
    if err is not None:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Invalid JSON body")
    fields, msg = validate_slot_fields(data)
    if msg:
        return error(msg)
    db = get_db()
    booked = slot_booked(db, fields["date"], fields["time"])
    if booked + fields["party_size"] > MAX_GUESTS:
        remaining = MAX_GUESTS - booked
        return error(
            f"Slot is full: {booked} of {MAX_GUESTS} seats already booked "
            f"({remaining} remaining)",
            409,
        )
    notes = data.get("notes")
    if notes is not None and not isinstance(notes, str):
        return error("notes must be a string")
    cur = db.execute(
        "INSERT INTO reservations "
        "(user_id, name, email, date, time, party_size, notes, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            fields["name"],
            fields["email"],
            fields["date"],
            fields["time"],
            fields["party_size"],
            notes,
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(serialize_reservation(row)), 201


@app.get("/api/reservations")
def list_reservations():
    user, err = require_user()
    if err is not None:
        return err
    db = get_db()
    date = request.args.get("date")
    query = "SELECT * FROM reservations WHERE user_id = ?"
    params: list = [user["id"]]
    if date:
        query += " AND date = ?"
        params.append(date)
    query += " ORDER BY date ASC, time ASC, id ASC"
    rows = db.execute(query, params).fetchall()
    items = [serialize_reservation(r) for r in rows]
    return jsonify({"items": items, "total": len(items)})


@app.get("/api/reservations/<int:reservation_id>")
def get_reservation(reservation_id: int):
    user, err = require_user()
    if err is not None:
        return err
    row = get_db().execute(
        "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
    ).fetchone()
    if row is None or (not user["is_admin"] and row["user_id"] != user["id"]):
        return error("Reservation not found", 404)
    return jsonify(serialize_reservation(row))


@app.put("/api/reservations/<int:reservation_id>")
def update_reservation(reservation_id: int):
    user, err = require_user()
    if err is not None:
        return err
    db = get_db()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return error("Reservation not found", 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("Invalid JSON body")
    fields, msg = validate_slot_fields(data)
    if msg:
        return error(msg)
    booked = slot_booked(db, fields["date"], fields["time"], exclude_id=reservation_id)
    if booked + fields["party_size"] > MAX_GUESTS:
        remaining = MAX_GUESTS - booked
        return error(
            f"Slot is full: {booked} of {MAX_GUESTS} seats already booked "
            f"({remaining} remaining)",
            409,
        )
    notes = data.get("notes")
    if notes is not None and not isinstance(notes, str):
        return error("notes must be a string")
    db.execute(
        "UPDATE reservations SET name = ?, email = ?, date = ?, time = ?, "
        "party_size = ?, notes = ? WHERE id = ?",
        (
            fields["name"],
            fields["email"],
            fields["date"],
            fields["time"],
            fields["party_size"],
            notes,
            reservation_id,
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
    ).fetchone()
    return jsonify(serialize_reservation(row))


@app.delete("/api/reservations/<int:reservation_id>")
def delete_reservation(reservation_id: int):
    user, err = require_user()
    if err is not None:
        return err
    db = get_db()
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ?", (reservation_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return error("Reservation not found", 404)
    db.execute("DELETE FROM reservations WHERE id = ?", (reservation_id,))
    db.commit()
    return "", 204


@app.get("/api/availability")
def availability():
    date = request.args.get("date")
    if not date or not DATE_RE.match(date):
        return error("date query parameter (YYYY-MM-DD) is required")
    rows = get_db().execute(
        "SELECT time, COALESCE(SUM(party_size), 0) AS booked "
        "FROM reservations WHERE date = ? GROUP BY time ORDER BY time ASC",
        (date,),
    ).fetchall()
    items = [
        {
            "time": r["time"],
            "booked": r["booked"],
            "remaining": MAX_GUESTS - r["booked"],
        }
        for r in rows
    ]
    return jsonify({"items": items})


@app.get("/api/admin/reservations")
def admin_reservations():
    _admin, err = require_admin()
    if err is not None:
        return err
    db = get_db()
    date = request.args.get("date")
    page = request.args.get("page", "1")
    page_size = request.args.get("page_size", "50")
    try:
        page = int(page)
        page_size = int(page_size)
    except ValueError:
        return error("page and page_size must be integers")
    if page < 1:
        return error("page must be at least 1")
    if page_size < 1 or page_size > 500:
        return error("page_size must be between 1 and 500")

    where = ""
    params: list = []
    if date:
        where = " WHERE date = ?"
        params.append(date)

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM reservations{where}", params
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM reservations{where} "
        "ORDER BY date ASC, time ASC, id ASC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()
    items = [serialize_reservation(r) for r in rows]
    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
