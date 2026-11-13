"""Table reservations: Flask JSON API plus the built frontend."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request
from flask import send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "reservations.db"

SLOT_CAPACITY = 20
ADMIN_USERNAME = "admin"
TOKEN_TTL = timedelta(days=7)
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DUMMY_HASH = generate_password_hash("dummy-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    return jsonify({"error": err.description or err.name}), err.code or 500


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS reservations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                email TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                party_size INTEGER NOT NULL CHECK (party_size BETWEEN 1 AND 20),
                notes TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_res_slot ON reservations(date, time);
            CREATE INDEX IF NOT EXISTS idx_res_user ON reservations(user_id, date, time);
            """
        )
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


@contextmanager
def write_tx():
    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def is_admin_name(username: str) -> bool:
    return username.lower() == ADMIN_USERNAME


def current_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Authentication required")
    row = db().execute(
        """
        SELECT u.id, u.username, s.expires_at FROM sessions s
        JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?
        """,
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        raise ApiError(401, "Invalid or expired token")
    if is_admin_name(row["username"]) and not admin_password():
        raise ApiError(401, "Invalid or expired token")
    g.token_hash = hash_token(token)
    return row


def require_admin() -> sqlite3.Row:
    user = current_user()
    if not is_admin_name(user["username"]):
        raise ApiError(403, "Admin access required")
    return user


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = db()
    conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now_iso(),))
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, expires),
    )
    return token


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    if not username or len(username) > 64:
        raise ApiError(400, "username must be 1-64 characters")
    if not password or len(password) > 256:
        raise ApiError(400, "password must be 1-256 characters")
    if is_admin_name(username):
        raise ApiError(409, "Username is already taken")
    try:
        with write_tx() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), now_iso()),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "username and password are required")
    username = username.strip()
    invalid = ApiError(401, "Invalid username or password")

    if is_admin_name(username):
        configured = admin_password()
        if not configured or not hmac.compare_digest(
            password.encode(), configured.encode()
        ):
            raise invalid
        with write_tx() as conn:
            row = conn.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if row is None:
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (ADMIN_USERNAME, "!", now_iso()),
                )
                user_id = cur.lastrowid
            else:
                user_id = row["id"]
            token = issue_token(user_id)
        return jsonify({"token": token})

    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise invalid
    if not check_password_hash(row["password_hash"], password):
        raise invalid
    with write_tx():
        token = issue_token(row["id"])
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = current_user()
    return jsonify(
        {"username": user["username"], "is_admin": is_admin_name(user["username"])}
    )


@app.post("/api/auth/logout")
def logout():
    current_user()
    db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
    return "", 204


def parse_date(value) -> str:
    if not isinstance(value, str) or not DATE_RE.match(value):
        raise ApiError(400, "date must be formatted YYYY-MM-DD")
    try:
        date_type.fromisoformat(value)
    except ValueError:
        raise ApiError(400, "date is not a valid calendar date")
    return value


def parse_time(value) -> str:
    if not isinstance(value, str) or not TIME_RE.match(value):
        raise ApiError(400, "time must be formatted HH:MM (24-hour)")
    return value


def parse_reservation(data: dict) -> dict:
    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ApiError(400, "name is required")
    name = name.strip()
    if len(name) > 100:
        raise ApiError(400, "name must be at most 100 characters")

    email = data.get("email")
    if not isinstance(email, str) or not EMAIL_RE.match(email.strip()):
        raise ApiError(400, "a valid email is required")
    email = email.strip()
    if len(email) > 254:
        raise ApiError(400, "email must be at most 254 characters")

    if "date" not in data:
        raise ApiError(400, "date is required")
    if "time" not in data:
        raise ApiError(400, "time is required")
    day = parse_date(data.get("date"))
    time = parse_time(data.get("time"))

    size = data.get("party_size")
    if isinstance(size, bool) or not isinstance(size, int):
        raise ApiError(400, "party_size must be an integer")
    if size < 1 or size > SLOT_CAPACITY:
        raise ApiError(400, f"party_size must be between 1 and {SLOT_CAPACITY}")

    notes = data.get("notes")
    if notes is not None:
        if not isinstance(notes, str):
            raise ApiError(400, "notes must be a string")
        notes = notes.strip() or None
        if notes is not None and len(notes) > 1000:
            raise ApiError(400, "notes must be at most 1000 characters")

    return {
        "name": name,
        "email": email,
        "date": day,
        "time": time,
        "party_size": size,
        "notes": notes,
    }


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


COLUMNS = "id, name, email, date, time, party_size, notes, created_at"


def ensure_capacity(conn, day: str, time: str, size: int, exclude_id=None) -> None:
    row = conn.execute(
        """
        SELECT COALESCE(SUM(party_size), 0) AS booked FROM reservations
        WHERE date = ? AND time = ? AND id IS NOT ?
        """,
        (day, time, exclude_id),
    ).fetchone()
    remaining = SLOT_CAPACITY - row["booked"]
    if size > remaining:
        if remaining <= 0:
            raise ApiError(409, "That time slot is full")
        raise ApiError(
            409,
            f"That time slot only has {remaining} seat{'s' if remaining != 1 else ''} left",
        )


def own_reservation(conn, user_id: int, res_id: int) -> sqlite3.Row:
    row = conn.execute(
        f"SELECT {COLUMNS} FROM reservations WHERE id = ? AND user_id = ?",
        (res_id, user_id),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Reservation not found")
    return row


@app.post("/api/reservations")
def create_reservation():
    user = current_user()
    fields = parse_reservation(json_body())
    with write_tx() as conn:
        ensure_capacity(conn, fields["date"], fields["time"], fields["party_size"])
        cur = conn.execute(
            """
            INSERT INTO reservations
                (user_id, name, email, date, time, party_size, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                fields["name"],
                fields["email"],
                fields["date"],
                fields["time"],
                fields["party_size"],
                fields["notes"],
                now_iso(),
            ),
        )
        row = conn.execute(
            f"SELECT {COLUMNS} FROM reservations WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return jsonify(serialize(row)), 201


@app.get("/api/reservations")
def list_reservations():
    user = current_user()
    where = "user_id = ?"
    params: list = [user["id"]]
    if "date" in request.args:
        where += " AND date = ?"
        params.append(parse_date(request.args["date"]))
    conn = db()
    rows = conn.execute(
        f"SELECT {COLUMNS} FROM reservations WHERE {where} ORDER BY date, time, id",
        params,
    ).fetchall()
    return jsonify({"items": [serialize(r) for r in rows], "total": len(rows)})


@app.get("/api/reservations/<int:res_id>")
def get_reservation(res_id: int):
    user = current_user()
    return jsonify(serialize(own_reservation(db(), user["id"], res_id)))


@app.put("/api/reservations/<int:res_id>")
def replace_reservation(res_id: int):
    user = current_user()
    fields = parse_reservation(json_body())
    with write_tx() as conn:
        own_reservation(conn, user["id"], res_id)
        ensure_capacity(
            conn, fields["date"], fields["time"], fields["party_size"], res_id
        )
        conn.execute(
            """
            UPDATE reservations
            SET name = ?, email = ?, date = ?, time = ?, party_size = ?, notes = ?
            WHERE id = ?
            """,
            (
                fields["name"],
                fields["email"],
                fields["date"],
                fields["time"],
                fields["party_size"],
                fields["notes"],
                res_id,
            ),
        )
        row = conn.execute(
            f"SELECT {COLUMNS} FROM reservations WHERE id = ?", (res_id,)
        ).fetchone()
    return jsonify(serialize(row))


@app.delete("/api/reservations/<int:res_id>")
def cancel_reservation(res_id: int):
    user = current_user()
    with write_tx() as conn:
        own_reservation(conn, user["id"], res_id)
        conn.execute("DELETE FROM reservations WHERE id = ?", (res_id,))
    return "", 204


@app.get("/api/availability")
def availability():
    if "date" not in request.args:
        raise ApiError(400, "date is required")
    day = parse_date(request.args["date"])
    rows = db().execute(
        """
        SELECT time, SUM(party_size) AS booked FROM reservations
        WHERE date = ? GROUP BY time ORDER BY time
        """,
        (day,),
    ).fetchall()
    items = [
        {
            "time": r["time"],
            "booked": r["booked"],
            "remaining": max(SLOT_CAPACITY - r["booked"], 0),
        }
        for r in rows
    ]
    return jsonify({"items": items})


def int_arg(name: str, default: int, maximum=None) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer")
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer")
    if maximum is not None and value > maximum:
        raise ApiError(400, f"{name} must be at most {maximum}")
    return value


@app.get("/api/admin/reservations")
def admin_reservations():
    require_admin()
    where = "1 = 1"
    params: list = []
    if "date" in request.args:
        where += " AND date = ?"
        params.append(parse_date(request.args["date"]))
    page = int_arg("page", 1)
    page_size = int_arg("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) AS n FROM reservations WHERE {where}", params
    ).fetchone()["n"]
    rows = conn.execute(
        f"""
        SELECT {COLUMNS} FROM reservations WHERE {where}
        ORDER BY date, time, id LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target is not None and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
