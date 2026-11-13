"""Flask entry point for the notification center."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

TOKEN_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
TYPE_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
PASSWORD_MIN = 8
PASSWORD_MAX = 256
MESSAGE_MAX = 2000
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_SQLITE_INT = 2**63 - 1

DUMMY_HASH = generate_password_hash(secrets.token_hex(16))

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
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
                password_hash TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
            CREATE TABLE IF NOT EXISTS notifications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                type TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user_created
                ON notifications(user_id, created_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_notifications_user_read
                ON notifications(user_id, read);
            """
        )
        with conn:
            conn.execute(
                "INSERT OR IGNORE INTO users (username, password_hash, created_at) VALUES (?, NULL, ?)",
                (ADMIN_USERNAME, iso(now_utc())),
            )
            admin = conn.execute(
                "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if ADMIN_PASSWORD:
                current = admin["password_hash"]
                if not current or not check_password_hash(current, ADMIN_PASSWORD):
                    conn.execute(
                        "UPDATE users SET password_hash = ? WHERE id = ?",
                        (generate_password_hash(ADMIN_PASSWORD), admin["id"]),
                    )
                    conn.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
            else:
                conn.execute(
                    "UPDATE users SET password_hash = NULL WHERE username = ?",
                    (ADMIN_USERNAME,),
                )
                conn.execute(
                    "DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)",
                    (ADMIN_USERNAME,),
                )
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (iso(now_utc()),))
    finally:
        conn.close()


init_db()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def is_admin(user) -> bool:
    return bool(ADMIN_PASSWORD) and user["username"] == ADMIN_USERNAME


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 512:
        return None
    row = get_db().execute(
        """
        SELECT u.id, u.username, s.expires_at
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
        """,
        (hash_token(token),),
    ).fetchone()
    if row is None:
        return None
    if row["expires_at"] < iso(now_utc()):
        return None
    if row["username"] == ADMIN_USERNAME and not ADMIN_PASSWORD:
        return None
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    @login_required
    def wrapper(*args, **kwargs):
        if not is_admin(g.user):
            raise ApiError(403, "Admin privileges required")
        return fn(*args, **kwargs)

    return wrapper


def serialize(row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def parse_message_and_type(data: dict, default_type: str) -> tuple[str, str]:
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        raise ApiError(400, "message is required and must be a non-empty string")
    if len(message) > MESSAGE_MAX:
        raise ApiError(400, f"message must be at most {MESSAGE_MAX} characters")
    ntype = data.get("type")
    if ntype is None or ntype == "":
        ntype = default_type
    if not isinstance(ntype, str) or not TYPE_RE.match(ntype):
        raise ApiError(400, "type must be 1-32 characters of letters, digits, '_' or '-'")
    return message, ntype


def parse_bool(value: str, name: str) -> bool:
    v = value.strip().lower()
    if v in ("true", "1", "yes"):
        return True
    if v in ("false", "0", "no"):
        return False
    raise ApiError(400, f"{name} must be true or false")


def parse_positive_int(value, name: str, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        n = int(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{name} must be a positive integer")
    if n < 1 or n > 1_000_000_000:
        raise ApiError(400, f"{name} must be a positive integer")
    return n


def get_own_notification(nid: int):
    if nid > MAX_SQLITE_INT:
        raise ApiError(404, "Notification not found")
    row = get_db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (nid, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Notification not found")
    return row


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
    if isinstance(err, HTTPException):
        return handle_http_error(err)
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    )
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        raise ApiError(400, "username must be 1-64 characters of letters, digits, '_', '.' or '-'")
    if not isinstance(password, str) or not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        raise ApiError(400, f"password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters")
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken")
    db = get_db()
    try:
        with db:
            cur = db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), iso(now_utc())),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or len(password) > PASSWORD_MAX:
        raise ApiError(401, "Invalid username or password")
    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    stored = user["password_hash"] if user is not None else None
    if user is not None and user["username"] == ADMIN_USERNAME and not ADMIN_PASSWORD:
        stored = None
    ok = check_password_hash(stored or DUMMY_HASH, password)
    if not stored or not ok:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = now_utc()
    with db:
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (iso(now),))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hash_token(token), user["id"], iso(now + TOKEN_TTL)),
        )
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    db = get_db()
    with db:
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token.strip()),))
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"], "is_admin": is_admin(g.user)}


@app.get("/api/notifications")
@login_required
def list_notifications():
    args = request.args
    page = parse_positive_int(args.get("page"), "page", 1)
    page_size = min(
        parse_positive_int(args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE
    )
    where = ["user_id = ?"]
    params: list = [g.user["id"]]
    read_arg = args.get("read")
    if read_arg is not None and read_arg != "":
        where.append("read = ?")
        params.append(1 if parse_bool(read_arg, "read") else 0)
    type_arg = args.get("type")
    if type_arg is not None and type_arg != "":
        where.append("type = ?")
        params.append(type_arg)
    clause = " AND ".join(where)
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM notifications WHERE {clause}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM notifications WHERE {clause} "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    unread = db.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read = 0", (g.user["id"],)
    ).fetchone()[0]
    return {
        "items": [serialize(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
        "unread_count": unread,
    }


@app.post("/api/notifications")
@login_required
def create_notification():
    message, ntype = parse_message_and_type(json_body(), "info")
    db = get_db()
    with db:
        cur = db.execute(
            "INSERT INTO notifications (user_id, message, type, read, created_at) VALUES (?, ?, ?, 0, ?)",
            (g.user["id"], message, ntype, iso(now_utc())),
        )
    row = db.execute("SELECT * FROM notifications WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize(row)), 201


@app.post("/api/notifications/read-all")
@login_required
def read_all():
    db = get_db()
    with db:
        cur = db.execute(
            "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0", (g.user["id"],)
        )
    return {"updated": cur.rowcount}


@app.get("/api/notifications/<int:nid>")
@login_required
def get_notification(nid: int):
    return serialize(get_own_notification(nid))


@app.patch("/api/notifications/<int:nid>")
@login_required
def update_notification(nid: int):
    get_own_notification(nid)
    read = json_body().get("read")
    if not isinstance(read, bool):
        raise ApiError(400, "read must be a boolean")
    db = get_db()
    with db:
        db.execute(
            "UPDATE notifications SET read = ? WHERE id = ? AND user_id = ?",
            (1 if read else 0, nid, g.user["id"]),
        )
    return serialize(get_own_notification(nid))


@app.delete("/api/notifications/<int:nid>")
@login_required
def delete_notification(nid: int):
    get_own_notification(nid)
    db = get_db()
    with db:
        db.execute("DELETE FROM notifications WHERE id = ? AND user_id = ?", (nid, g.user["id"]))
    return "", 204


@app.post("/api/admin/broadcast")
@admin_required
def broadcast():
    message, ntype = parse_message_and_type(json_body(), "announcement")
    db = get_db()
    with db:
        cur = db.execute(
            "INSERT INTO notifications (user_id, message, type, read, created_at) "
            "SELECT id, ?, ?, 0, ? FROM users ORDER BY id",
            (message, ntype, iso(now_utc())),
        )
    return jsonify({"delivered": cur.rowcount}), 201


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path: str = ""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "Frontend not built"}), 404
    return send_from_directory(DIST, "index.html")
