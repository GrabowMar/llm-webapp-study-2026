"""Restaurant table reservations: Flask API + frontend host."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "reservations.db"

CAPACITY = 20
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+$")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT
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
CREATE INDEX IF NOT EXISTS idx_res_slot ON reservations (date, time);
CREATE INDEX IF NOT EXISTS idx_res_user ON reservations (user_id);
"""

RES_SELECT = (
    "SELECT id, user_id, name, email, date, time, party_size, notes, created_at "
    "FROM reservations r "
)

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(path, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = connect(DB_PATH)
    return db


@app.teardown_appcontext
def close_db(exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def sync_admin(conn: sqlite3.Connection) -> None:
    password = os.environ.get("ADMIN_PASSWORD") or ""
    hash_ = generate_password_hash(password) if password else None
    conn.execute(
        "INSERT INTO users (username, password_hash) VALUES ('admin', ?) "
        "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash",
        (hash_,),
    )


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        sync_admin(conn)
    finally:
        conn.close()


init_db()


def error(message: str, status: int = 400):
    return jsonify({"error": message, "message": message}), status


def json_body():
    data = request.get_json(force=True, silent=True)
    if not isinstance(data, dict):
        return None, error("A JSON object body is required.")
    return data, None


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def require_user():
    user = current_user()
    if user is None:
        return None, error("Sign-in required.", 401)
    return user, None


def valid_date(value: str) -> bool:
    if not DATE_RE.match(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def validate_reservation(data: dict):
    problems = []

    name = data.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        problems.append("name is required.")

    email_raw = data.get("email")
    email = email_raw.strip() if isinstance(email_raw, str) else ""
    if not email:
        problems.append("email is required.")
    elif not EMAIL_RE.match(email):
        problems.append("email must be a valid address.")

    date = data.get("date")
    date = date.strip() if isinstance(date, str) else ""
    if not date:
        problems.append("date is required.")
    elif not valid_date(date):
        problems.append("date must use the YYYY-MM-DD format.")

    time = data.get("time")
    time = time.strip() if isinstance(time, str) else ""
    if not time:
        problems.append("time is required.")
    elif not TIME_RE.match(time):
        problems.append("time must use the HH:MM 24-hour format.")

    party_size = data.get("party_size")
    if isinstance(party_size, str) and re.fullmatch(r"\s*\d+\s*", party_size):
        party_size = int(party_size.strip())
    if party_size is None:
        problems.append("party_size is required.")
    elif isinstance(party_size, bool) or not isinstance(party_size, int):
        problems.append("party_size must be a whole number.")
    elif party_size < 1:
        problems.append("party_size must be at least 1.")
    elif party_size > CAPACITY:
        problems.append(f"party_size cannot exceed {CAPACITY}.")

    notes = data.get("notes")
    if notes is None:
        notes = ""
    elif isinstance(notes, str):
        pass
    else:
        notes = str(notes)

    if problems:
        return None, error(" ".join(problems))
    return (
        {"name": name, "email": email, "date": date, "time": time,
         "party_size": party_size, "notes": notes},
        None,
    )


def res_dict(row: sqlite3.Row) -> dict:
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


def find_reservation(res_id: int, user: dict, admin_may_view: bool = False):
    row = get_db().execute(RES_SELECT + "WHERE r.id = ?", (res_id,)).fetchone()
    if row is None:
        return None
    if row["user_id"] == user["id"]:
        return row
    if admin_may_view and user["username"] == "admin":
        return row
    return None


def full_slot_error(date: str, time: str, booked: int, needed: int):
    remaining = max(0, CAPACITY - booked)
    return error(
        f"The slot at {time} on {date} has only {remaining} seat(s) left; "
        f"the requested party of {needed} does not fit (maximum {CAPACITY} guests per slot).",
        409,
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data, err = json_body()
    if err:
        return err
    username = str(data.get("username") or "").strip()
    password = data.get("password")
    if not username:
        return error("username is required.")
    if not isinstance(password, str) or not password:
        return error("password is required.")
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
    except sqlite3.IntegrityError:
        return error("That username is already taken.", 409)
    return jsonify({"message": "Account created.", "username": username}), 201


@app.post("/api/auth/login")
def login():
    data, err = json_body()
    if err:
        return err
    username = str(data.get("username") or "").strip()
    password = data.get("password")
    row = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if (
        row is None
        or row["password_hash"] is None
        or not isinstance(password, str)
        or not check_password_hash(row["password_hash"], password)
    ):
        return error("Invalid username or password.", 401)
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    return jsonify({"token": token}), 200


@app.post("/api/reservations")
def create_reservation():
    user, err = require_user()
    if err:
        return err
    data, err = json_body()
    if err:
        return err
    fields, err = validate_reservation(data)
    if err:
        return err
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        booked = db.execute(
            "SELECT COALESCE(SUM(party_size), 0) FROM reservations "
            "WHERE date = ? AND time = ?",
            (fields["date"], fields["time"]),
        ).fetchone()[0]
        if booked + fields["party_size"] > CAPACITY:
            db.execute("ROLLBACK")
            return full_slot_error(
                fields["date"], fields["time"], booked, fields["party_size"]
            )
        cur = db.execute(
            "INSERT INTO reservations "
            "(user_id, name, email, date, time, party_size, notes, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user["id"], fields["name"], fields["email"], fields["date"],
             fields["time"], fields["party_size"], fields["notes"], now_iso()),
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    row = db.execute(RES_SELECT + "WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(res_dict(row)), 201


@app.get("/api/reservations")
def list_reservations():
    user, err = require_user()
    if err:
        return err
    date = request.args.get("date")
    sql = RES_SELECT + "WHERE r.user_id = ?"
    params: list = [user["id"]]
    if date is not None:
        date = date.strip()
        if not valid_date(date):
            return error("The 'date' query parameter must use the YYYY-MM-DD format.")
        sql += " AND r.date = ?"
        params.append(date)
    sql += " ORDER BY r.date, r.time, r.id"
    rows = get_db().execute(sql, params).fetchall()
    items = [res_dict(r) for r in rows]
    return jsonify({"items": items, "total": len(items)})


@app.get("/api/reservations/<int:res_id>")
def get_reservation(res_id: int):
    user, err = require_user()
    if err:
        return err
    row = find_reservation(res_id, user, admin_may_view=True)
    if row is None:
        return error("Reservation not found.", 404)
    return jsonify(res_dict(row))


@app.put("/api/reservations/<int:res_id>")
def update_reservation(res_id: int):
    user, err = require_user()
    if err:
        return err
    row = find_reservation(res_id, user)
    if row is None:
        return error("Reservation not found.", 404)
    data, err = json_body()
    if err:
        return err
    fields, err = validate_reservation(data)
    if err:
        return err
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        booked = db.execute(
            "SELECT COALESCE(SUM(party_size), 0) FROM reservations "
            "WHERE date = ? AND time = ? AND id != ?",
            (fields["date"], fields["time"], res_id),
        ).fetchone()[0]
        if booked + fields["party_size"] > CAPACITY:
            db.execute("ROLLBACK")
            return full_slot_error(
                fields["date"], fields["time"], booked, fields["party_size"]
            )
        db.execute(
            "UPDATE reservations SET name = ?, email = ?, date = ?, time = ?, "
            "party_size = ?, notes = ? WHERE id = ? AND user_id = ?",
            (fields["name"], fields["email"], fields["date"], fields["time"],
             fields["party_size"], fields["notes"], res_id, user["id"]),
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    updated = db.execute(RES_SELECT + "WHERE r.id = ?", (res_id,)).fetchone()
    return jsonify(res_dict(updated))


@app.delete("/api/reservations/<int:res_id>")
def delete_reservation(res_id: int):
    user, err = require_user()
    if err:
        return err
    row = find_reservation(res_id, user)
    if row is None:
        return error("Reservation not found.", 404)
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute(
            "DELETE FROM reservations WHERE id = ? AND user_id = ?",
            (res_id, user["id"]),
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    deleted = res_dict(row)
    return jsonify({"id": deleted["id"], "message": "Reservation cancelled."})


@app.get("/api/availability")
def availability():
    date = (request.args.get("date") or "").strip()
    if not valid_date(date):
        return error("A 'date' query parameter in YYYY-MM-DD format is required.")
    rows = get_db().execute(
        "SELECT time, SUM(party_size) AS booked FROM reservations "
        "WHERE date = ? GROUP BY time ORDER BY time",
        (date,),
    ).fetchall()
    items = [
        {
            "time": r["time"],
            "booked": r["booked"],
            "remaining": max(0, CAPACITY - r["booked"]),
        }
        for r in rows
    ]
    return jsonify({"items": items})


@app.get("/api/admin/reservations")
def admin_reservations():
    user, err = require_user()
    if err:
        return err
    if user["username"] != "admin":
        return error("Admin access is required.", 403)

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        return error("'page' and 'page_size' must be integers.")
    if page < 1:
        return error("'page' must be at least 1.")
    if page_size < 1 or page_size > 100:
        return error("'page_size' must be between 1 and 100.")

    where = ""
    params: list = []
    date = request.args.get("date")
    if date is not None:
        date = date.strip()
        if not valid_date(date):
            return error("The 'date' query parameter must use the YYYY-MM-DD format.")
        where = "WHERE r.date = ?"
        params.append(date)

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM reservations r {where}", params
    ).fetchone()[0]
    rows = db.execute(
        RES_SELECT + f"{where} ORDER BY r.date, r.time, r.id LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    items = [res_dict(r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.errorhandler(404)
def not_found(exc):
    if request.path.startswith("/api/"):
        return error("Not found.", 404)
    return index()


@app.errorhandler(405)
def method_not_allowed(exc):
    if request.path.startswith("/api/"):
        return error("Method not allowed.", 405)
    return index()


@app.get("/api/<path:_ignored>")
def api_not_found(_ignored: str):
    return error("Not found.", 404)


def index():
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return index()
