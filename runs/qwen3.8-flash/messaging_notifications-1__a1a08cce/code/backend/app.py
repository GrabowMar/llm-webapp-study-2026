"""Flask entry point for the notification center."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, abort, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "notifications.db"

ADMIN_USERNAME = "admin"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- database


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
        """
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
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user
            ON notifications(user_id, created_at DESC, id DESC);
        """
    )
    db.commit()


# ---------------------------------------------------------------- passwords


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
        check = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt), 120_000
        ).hex()
    except ValueError:
        return False
    return secrets.compare_digest(check, digest)


ADMIN_DISABLED_HASH = "!disabled!"


def ensure_admin():
    """Create/update the admin account from ADMIN_PASSWORD at startup.

    With ADMIN_PASSWORD unset/empty the stored hash is an impossible value,
    which disables admin sign-in. The hash is only rewritten when the
    configured password actually changes, so restarts keep active sessions.
    """
    password = os.environ.get("ADMIN_PASSWORD", "")
    db = get_db()
    db.execute(
        "INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?) "
        "ON CONFLICT(username) DO NOTHING",
        (ADMIN_USERNAME, ADMIN_DISABLED_HASH, now_iso()),
    )
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if password:
        if verify_password(password, row["password_hash"]):
            db.commit()
            return
        stored = hash_password(password)
    else:
        if row["password_hash"] == ADMIN_DISABLED_HASH:
            db.commit()
            return
        stored = ADMIN_DISABLED_HASH
    db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (stored, row["id"]))
    db.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
    db.commit()


@app.before_request
def prepare():
    db = get_db()
    if not getattr(app, "_db_ready", False):
        init_db()
        ensure_admin()
        app._db_ready = True


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- auth


def create_token(user_id: int) -> str:
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens(token, user_id, created_at) VALUES(?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return token


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.* FROM users u JOIN tokens t ON t.user_id = u.id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            abort(401, description="authentication required")
        g.user = user
        return f(*args, **kwargs)

    return wrapper


def body_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, description="request body must be a JSON object")
    return data


def clean_credentials(data: dict) -> tuple[str, str]:
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        abort(400, description="username is required")
    if not isinstance(password, str) or not password:
        abort(400, description="password is required")
    return username.strip(), password


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password = clean_credentials(body_json())
    if username.lower() == ADMIN_USERNAME:
        abort(409, description="username not available")
    db = get_db()
    exists = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        abort(409, description="username already taken")
    db.execute(
        "INSERT INTO users(username, password_hash, created_at) VALUES(?, ?, ?)",
        (username, hash_password(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = clean_credentials(body_json())
    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        abort(401, description="invalid credentials")
    if username == ADMIN_USERNAME and not os.environ.get("ADMIN_PASSWORD", ""):
        abort(401, description="invalid credentials")
    return jsonify({"token": create_token(row["id"])})


@app.get("/api/auth/me")
@require_user
def me():
    return jsonify(
        {
            "username": g.user["username"],
            "is_admin": g.user["username"] == ADMIN_USERNAME,
        }
    )


# ---------------------------------------------------------------- notifications


def notification_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "message": row["message"],
        "type": row["type"],
        "read": bool(row["read"]),
        "created_at": row["created_at"],
    }


def parse_bool(value, name: str):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1"):
            return True
        if lowered in ("false", "0"):
            return False
    abort(400, description=f"{name} must be a boolean")


def parse_int(value, name: str, default: int) -> int:
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        abort(400, description=f"{name} must be an integer")


@app.get("/api/notifications")
@require_user
def list_notifications():
    db = get_db()
    user_id = g.user["id"]

    where = ["user_id = ?"]
    params: list = [user_id]

    read_raw = request.args.get("read")
    if read_raw not in (None, ""):
        where.append("read = ?")
        params.append(1 if parse_bool(read_raw, "read") else 0)

    type_raw = request.args.get("type")
    if type_raw not in (None, ""):
        where.append("type = ?")
        params.append(type_raw)

    clause = " AND ".join(where)
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM notifications WHERE {clause}", params
    ).fetchone()["n"]

    unread_count = db.execute(
        "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0",
        (user_id,),
    ).fetchone()["n"]

    page = parse_int(request.args.get("page"), "page", 1)
    page_size = parse_int(request.args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE)
    if page < 1:
        abort(400, description="page must be >= 1")
    if page_size < 1 or page_size > MAX_PAGE_SIZE:
        abort(400, description=f"page_size must be between 1 and {MAX_PAGE_SIZE}")

    rows = db.execute(
        f"SELECT * FROM notifications WHERE {clause} "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [notification_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "unread_count": unread_count,
        }
    )


@app.post("/api/notifications")
@require_user
def create_notification():
    data = body_json()
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        abort(400, description="message is required")
    ntype = data.get("type")
    if ntype is None:
        ntype = "general"
    if not isinstance(ntype, str) or not ntype.strip():
        abort(400, description="type must be a non-empty string")
    db = get_db()
    cur = db.execute(
        "INSERT INTO notifications(user_id, message, type, read, created_at) "
        "VALUES(?, ?, ?, 0, ?)",
        (g.user["id"], message, ntype.strip(), now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM notifications WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(notification_to_dict(row)), 201


@app.post("/api/notifications/read-all")
@require_user
def read_all():
    db = get_db()
    cur = db.execute(
        "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0",
        (g.user["id"],),
    )
    db.commit()
    return jsonify({"updated": cur.rowcount})


def get_owned_notification(notification_id: int) -> sqlite3.Row:
    row = get_db().execute(
        "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
        (notification_id, g.user["id"]),
    ).fetchone()
    if row is None:
        abort(404, description="notification not found")
    return row


@app.get("/api/notifications/<int:notification_id>")
@require_user
def get_notification(notification_id: int):
    return jsonify(notification_to_dict(get_owned_notification(notification_id)))


@app.patch("/api/notifications/<int:notification_id>")
@require_user
def patch_notification(notification_id: int):
    row = get_owned_notification(notification_id)
    read = parse_bool(body_json().get("read"), "read")
    db = get_db()
    db.execute(
        "UPDATE notifications SET read = ? WHERE id = ?", (1 if read else 0, row["id"])
    )
    db.commit()
    return jsonify(notification_to_dict(get_owned_notification(notification_id)))


@app.delete("/api/notifications/<int:notification_id>")
@require_user
def delete_notification(notification_id: int):
    row = get_owned_notification(notification_id)
    db = get_db()
    db.execute("DELETE FROM notifications WHERE id = ?", (row["id"],))
    db.commit()
    return "", 204


# ---------------------------------------------------------------- admin


@app.post("/api/admin/broadcast")
@require_user
def broadcast():
    if g.user["username"] != ADMIN_USERNAME:
        abort(403, description="admin only")
    data = body_json()
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        abort(400, description="message is required")
    ntype = data.get("type")
    if ntype is None:
        ntype = "announcement"
    if not isinstance(ntype, str) or not ntype.strip():
        abort(400, description="type must be a non-empty string")
    db = get_db()
    created = now_iso()
    ntype = ntype.strip()
    users = db.execute("SELECT id FROM users").fetchall()
    db.executemany(
        "INSERT INTO notifications(user_id, message, type, read, created_at) "
        "VALUES(?, ?, ?, 0, ?)",
        [(u["id"], message, ntype, created) for u in users],
    )
    db.commit()
    return jsonify({"delivered": len(users)})


# ---------------------------------------------------------------- errors


@app.errorhandler(400)
@app.errorhandler(401)
@app.errorhandler(403)
@app.errorhandler(404)
@app.errorhandler(409)
def handle_error(err):
    return jsonify({"error": getattr(err, "description", "error")}), err.code


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
def unknown_api(_rest):
    abort(404, description="not found")


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
