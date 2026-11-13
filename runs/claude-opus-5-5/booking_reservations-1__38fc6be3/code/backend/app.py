"""Flask entry point."""

from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

SLOT_CAPACITY = 20
ADMIN_USERNAME = "admin"
TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.@+-]{3,64}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024


class ApiError(Exception):
    def __init__(self, status: int, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.details = details


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id, date, time);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, NULL, 1, ?)",
                (ADMIN_USERNAME, iso(now_utc())),
            )
            row = conn.execute(
                "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        else:
            conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
        current = row["password_hash"]
        if admin_password:
            if not current or not check_password_hash(current, admin_password):
                conn.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (generate_password_hash(admin_password), row["id"]),
                )
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        else:
            conn.execute("UPDATE users SET password_hash = NULL WHERE id = ?", (row["id"],))
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (iso(now_utc()),))
        conn.execute("COMMIT")
    finally:
        conn.close()


init_db()


# ---------------------------------------------------------------- errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.details:
        body["details"] = err.details
    resp = jsonify(body)
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        if err.code == 405 and err.valid_methods:
            resp.headers["Allow"] = ", ".join(err.valid_methods)
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    if request.path.startswith("/api"):
        return jsonify({"error": "Internal server error"}), 500
    return "Internal server error", 500


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


# ---------------------------------------------------------------- helpers


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        token = parts[1].strip()
        row = get_db().execute(
            """SELECT u.id, u.username, u.is_admin, u.password_hash, s.expires_at
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token_hash = ?""",
            (hash_token(token),),
        ).fetchone()
        if row and row["expires_at"] > iso(now_utc()) and row["password_hash"]:
            g.user = {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required")
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        if not user["is_admin"]:
            raise ApiError(403, "Admin access required")
        return fn(*args, **kwargs)

    return wrapper


def parse_date(value, field: str = "date") -> str:
    if not isinstance(value, str) or not DATE_RE.match(value.strip()):
        raise ApiError(400, f"{field} must be a date in YYYY-MM-DD format", {field: "invalid"})
    try:
        return date_cls.fromisoformat(value.strip()).isoformat()
    except ValueError:
        raise ApiError(400, f"{field} must be a valid date", {field: "invalid"}) from None


def parse_time(value, field: str = "time") -> str:
    m = TIME_RE.match(value.strip()) if isinstance(value, str) else None
    if not m:
        raise ApiError(400, f"{field} must be a time in HH:MM format", {field: "invalid"})
    hour, minute, second = int(m.group(1)), int(m.group(2)), int(m.group(3) or 0)
    if hour > 23 or minute > 59 or second != 0:
        raise ApiError(400, f"{field} must be a valid time in HH:MM format", {field: "invalid"})
    return f"{hour:02d}:{minute:02d}"


def parse_int_param(name: str, default: int, minimum: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be an integer") from None
    if value < minimum or (maximum is not None and value > maximum):
        bound = f"between {minimum} and {maximum}" if maximum is not None else f"at least {minimum}"
        raise ApiError(400, f"{name} must be {bound}")
    return value


def optional_date_param() -> str | None:
    raw = request.args.get("date")
    if raw is None or raw == "":
        return None
    return parse_date(raw)


def validate_reservation(data: dict) -> dict:
    errors: dict[str, str] = {}
    out: dict = {}

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors["name"] = "name is required"
    elif len(name.strip()) > 100:
        errors["name"] = "name must be at most 100 characters"
    else:
        out["name"] = name.strip()

    email = data.get("email")
    if not isinstance(email, str) or not email.strip():
        errors["email"] = "email is required"
    elif len(email.strip()) > 254 or not EMAIL_RE.match(email.strip()):
        errors["email"] = "email must be a valid email address"
    else:
        out["email"] = email.strip()

    for field, parser in (("date", parse_date), ("time", parse_time)):
        if data.get(field) is None:
            errors[field] = f"{field} is required"
            continue
        try:
            out[field] = parser(data.get(field))
        except ApiError as e:
            errors[field] = e.message

    party_size = data.get("party_size")
    if party_size is None:
        errors["party_size"] = "party_size is required"
    elif isinstance(party_size, bool) or not isinstance(party_size, (int, float)):
        errors["party_size"] = "party_size must be a whole number"
    elif isinstance(party_size, float) and not party_size.is_integer():
        errors["party_size"] = "party_size must be a whole number"
    elif int(party_size) < 1:
        errors["party_size"] = "party_size must be at least 1"
    else:
        out["party_size"] = int(party_size)

    notes = data.get("notes")
    if notes is None:
        out["notes"] = None
    elif not isinstance(notes, str):
        errors["notes"] = "notes must be a string"
    elif len(notes) > 1000:
        errors["notes"] = "notes must be at most 1000 characters"
    else:
        out["notes"] = notes.strip() or None

    if errors:
        first = next(iter(errors.values()))
        raise ApiError(400, first, errors)
    return out


def serialize(row: sqlite3.Row) -> dict:
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


def ensure_capacity(db: sqlite3.Connection, day: str, time: str, party_size: int, exclude_id: int | None):
    booked = db.execute(
        "SELECT COALESCE(SUM(party_size), 0) FROM reservations WHERE date = ? AND time = ? AND id IS NOT ?",
        (day, time, exclude_id),
    ).fetchone()[0]
    remaining = SLOT_CAPACITY - booked
    if party_size > remaining:
        if remaining <= 0:
            msg = f"The {time} slot on {day} is fully booked."
        else:
            msg = (
                f"Not enough seats left at {time} on {day}: "
                f"{remaining} of {SLOT_CAPACITY} remaining, {party_size} requested."
            )
        raise ApiError(409, msg, {"remaining": max(remaining, 0), "capacity": SLOT_CAPACITY})


def own_reservation(db: sqlite3.Connection, reservation_id: int):
    row = db.execute(
        "SELECT * FROM reservations WHERE id = ? AND user_id = ?",
        (reservation_id, current_user()["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Reservation not found")
    return row


# ---------------------------------------------------------------- routes


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        raise ApiError(
            400,
            "username must be 3-64 characters: letters, digits and . _ - @ +",
            {"username": "invalid"},
        )
    username = username.strip()
    if not isinstance(password, str) or len(password) < 8:
        raise ApiError(400, "password must be at least 8 characters", {"password": "invalid"})
    if len(password) > 256:
        raise ApiError(400, "password must be at most 256 characters", {"password": "invalid"})
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken")
    db = get_db()
    pw_hash = generate_password_hash(password)
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, pw_hash, iso(now_utc())),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken") from None
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "username and password are required")
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is not None and row["is_admin"]:
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        ok = bool(admin_password) and bool(row["password_hash"]) and hmac.compare_digest(
            password.encode("utf-8"), admin_password.encode("utf-8")
        )
    elif row is not None and row["password_hash"]:
        ok = check_password_hash(row["password_hash"], password)
    else:
        check_password_hash(_DUMMY_HASH, password)
        ok = False
    if not ok:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    created = now_utc()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], iso(created), iso(created + TOKEN_TTL)),
    )
    return {
        "token": token,
        "username": row["username"],
        "is_admin": bool(row["is_admin"]),
    }


_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "").split(None, 1)[1].strip()
    get_db().execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return {"id": user["id"], "username": user["username"], "is_admin": user["is_admin"]}


@app.post("/api/reservations")
@login_required
def create_reservation():
    fields = validate_reservation(json_body())
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        ensure_capacity(db, fields["date"], fields["time"], fields["party_size"], None)
        cur = db.execute(
            """INSERT INTO reservations (user_id, name, email, date, time, party_size, notes, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                current_user()["id"],
                fields["name"],
                fields["email"],
                fields["date"],
                fields["time"],
                fields["party_size"],
                fields["notes"],
                iso(now_utc()),
            ),
        )
        row = db.execute("SELECT * FROM reservations WHERE id = ?", (cur.lastrowid,)).fetchone()
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    resp = jsonify(serialize(row))
    resp.status_code = 201
    resp.headers["Location"] = f"/api/reservations/{row['id']}"
    return resp


@app.get("/api/reservations")
@login_required
def list_reservations():
    day = optional_date_param()
    sql = "SELECT * FROM reservations WHERE user_id = ?"
    params: list = [current_user()["id"]]
    if day:
        sql += " AND date = ?"
        params.append(day)
    sql += " ORDER BY date, time, id"
    rows = get_db().execute(sql, params).fetchall()
    return {"items": [serialize(r) for r in rows], "total": len(rows)}


@app.get("/api/reservations/<int:reservation_id>")
@login_required
def get_reservation(reservation_id: int):
    return serialize(own_reservation(get_db(), reservation_id))


@app.put("/api/reservations/<int:reservation_id>")
@login_required
def update_reservation(reservation_id: int):
    data = json_body()
    db = get_db()
    own_reservation(db, reservation_id)
    fields = validate_reservation(data)
    db.execute("BEGIN IMMEDIATE")
    try:
        own_reservation(db, reservation_id)
        ensure_capacity(db, fields["date"], fields["time"], fields["party_size"], reservation_id)
        db.execute(
            """UPDATE reservations SET name = ?, email = ?, date = ?, time = ?, party_size = ?, notes = ?
               WHERE id = ? AND user_id = ?""",
            (
                fields["name"],
                fields["email"],
                fields["date"],
                fields["time"],
                fields["party_size"],
                fields["notes"],
                reservation_id,
                current_user()["id"],
            ),
        )
        row = db.execute("SELECT * FROM reservations WHERE id = ?", (reservation_id,)).fetchone()
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    return serialize(row)


@app.delete("/api/reservations/<int:reservation_id>")
@login_required
def delete_reservation(reservation_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM reservations WHERE id = ? AND user_id = ?",
        (reservation_id, current_user()["id"]),
    )
    if cur.rowcount == 0:
        raise ApiError(404, "Reservation not found")
    return "", 204


@app.get("/api/availability")
def availability():
    day = optional_date_param() or date_cls.today().isoformat()
    rows = get_db().execute(
        """SELECT time, SUM(party_size) AS booked FROM reservations
           WHERE date = ? GROUP BY time HAVING SUM(party_size) > 0 ORDER BY time""",
        (day,),
    ).fetchall()
    return {
        "date": day,
        "capacity": SLOT_CAPACITY,
        "items": [
            {
                "time": r["time"],
                "booked": r["booked"],
                "remaining": max(SLOT_CAPACITY - r["booked"], 0),
            }
            for r in rows
        ],
    }


@app.get("/api/admin/reservations")
@admin_required
def admin_reservations():
    day = optional_date_param()
    page = parse_int_param("page", 1, 1)
    page_size = parse_int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    where = ""
    params: list = []
    if day:
        where = " WHERE r.date = ?"
        params.append(day)
    db = get_db()
    total, guests = db.execute(
        f"SELECT COUNT(*), COALESCE(SUM(r.party_size), 0) FROM reservations r{where}", params
    ).fetchone()
    rows = db.execute(
        f"""SELECT r.*, u.username FROM reservations r JOIN users u ON u.id = r.user_id{where}
            ORDER BY r.date, r.time, r.id LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    items = []
    for r in rows:
        item = serialize(r)
        item["username"] = r["username"]
        items.append(item)
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_guests": guests,
    }


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built", 404
    return send_from_directory(DIST, "index.html")
