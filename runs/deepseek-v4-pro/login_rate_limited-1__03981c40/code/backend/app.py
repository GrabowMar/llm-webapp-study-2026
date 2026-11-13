"""Account service with sign-in lockout and rate limiting."""

import os
import math
import sqlite3
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
LOCKOUT_SECONDS = 15 * 60
MAX_CONSECUTIVE_FAILURES = 5
RATE_LIMIT = 20
RATE_WINDOW_SECONDS = 60
TOKEN_MAX_AGE = 60 * 60 * 24 * 30

app = Flask(__name__, static_folder=None)

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _iso(epoch):
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _secret_key():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = DATA_DIR / "secret_key"
    if key_file.exists():
        return key_file.read_text().strip()
    key = os.urandom(32).hex()
    key_file.write_text(key)
    return key


serializer = URLSafeTimedSerializer(_secret_key(), salt="auth-service")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until REAL,
    created_at REAL NOT NULL,
    last_login_at REAL
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    at REAL NOT NULL,
    success INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON login_attempts (user_id, id);
"""


def _connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATA_DIR / "app.db")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _connect()
    conn.executescript(_SCHEMA)
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_password:
        conn.execute(
            """
            INSERT INTO users (username, password_hash, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash
            """,
            ("admin", generate_password_hash(admin_password), time.time()),
        )
    conn.commit()
    conn.close()


def get_db():
    if "db" not in g:
        g.db = _connect()
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# Client rate limiting (in-memory)
# ---------------------------------------------------------------------------

_rate_lock = threading.Lock()
_rate_buckets = defaultdict(deque)


def _rate_limit_status(client_id):
    now = time.time()
    with _rate_lock:
        bucket = _rate_buckets[client_id]
        while bucket and bucket[0] <= now - RATE_WINDOW_SECONDS:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return max(1, math.ceil(bucket[0] + RATE_WINDOW_SECONDS - now))
        return None


def _record_rate_limit(client_id):
    with _rate_lock:
        _rate_buckets[client_id].append(time.time())


def _client_id():
    return request.headers.get("X-Forwarded-For", request.remote_addr or "unknown")


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def _current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    try:
        data = serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    uid = data.get("uid")
    if uid is None:
        return None
    return get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()


def _require_user():
    user = _current_user()
    if user is None:
        return None
    return user


def _json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def _record_attempt(db, user_id, success):
    db.execute(
        "INSERT INTO login_attempts (user_id, at, success) VALUES (?, ?, ?)",
        (user_id, time.time(), 1 if success else 0),
    )


def _retry_after_response(seconds):
    resp = jsonify({"error": "too_many_attempts"})
    resp.status_code = 429
    resp.headers["Retry-After"] = str(math.ceil(seconds))
    return resp


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = _json_body()
    if data is None:
        return jsonify({"error": "invalid_json"}), 400
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username_and_password_required"}), 400
    if username == "admin":
        return jsonify({"error": "username_taken"}), 409

    db = get_db()
    existing = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify({"error": "username_taken"}), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), time.time()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = _json_body()
    if data is None:
        return jsonify({"error": "invalid_json"}), 400
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username_and_password_required"}), 400

    client_id = _client_id()
    wait = _rate_limit_status(client_id)
    if wait is not None:
        return _retry_after_response(wait)
    _record_rate_limit(client_id)

    db = get_db()
    now = time.time()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()

    if user is None:
        return jsonify({"error": "invalid_credentials"}), 401

    locked_until = user["locked_until"]
    if locked_until is not None and locked_until > now:
        _record_attempt(db, user["id"], False)
        db.commit()
        return _retry_after_response(locked_until - now)

    if locked_until is not None:
        db.execute(
            "UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = ?",
            (user["id"],),
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()

    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if username == "admin" and not admin_password:
        _record_attempt(db, user["id"], False)
        db.commit()
        return jsonify({"error": "invalid_credentials"}), 401

    if check_password_hash(user["password_hash"], password):
        db.execute(
            "UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ? WHERE id = ?",
            (now, user["id"]),
        )
        _record_attempt(db, user["id"], True)
        db.commit()
        token = serializer.dumps({"uid": user["id"]})
        return jsonify({"token": token}), 200

    failures = user["failed_attempts"] + 1
    new_locked_until = None
    if failures >= MAX_CONSECUTIVE_FAILURES:
        new_locked_until = now + LOCKOUT_SECONDS
    db.execute(
        "UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
        (failures, new_locked_until, user["id"]),
    )
    _record_attempt(db, user["id"], False)
    db.commit()
    return jsonify({"error": "invalid_credentials"}), 401


@app.get("/api/me")
def me():
    user = _require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "last_login_at": _iso(user["last_login_at"]),
        }
    )


@app.get("/api/me/login-attempts")
def login_attempts():
    user = _require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    rows = get_db().execute(
        "SELECT at, success FROM login_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 20",
        (user["id"],),
    ).fetchall()
    items = [
        {"at": _iso(row["at"]), "success": bool(row["success"])} for row in rows
    ]
    return jsonify({"items": items})


def _require_admin():
    user = _require_user()
    if user is None or user["username"] != "admin":
        return None
    return user


@app.get("/api/admin/locks")
def admin_locks():
    admin = _require_admin()
    if admin is None:
        return jsonify({"error": "unauthorized"}), 401
    now = time.time()
    rows = get_db().execute(
        "SELECT username, locked_until FROM users WHERE locked_until > ? ORDER BY username",
        (now,),
    ).fetchall()
    items = [
        {"username": row["username"], "locked_until": _iso(row["locked_until"])}
        for row in rows
    ]
    return jsonify({"items": items})


@app.post("/api/admin/locks/<username>/unlock")
def admin_unlock(username):
    admin = _require_admin()
    if admin is None:
        return jsonify({"error": "unauthorized"}), 401
    db = get_db()
    cur = db.execute(
        "UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE username = ?",
        (username,),
    )
    if cur.rowcount == 0:
        return jsonify({"error": "not_found"}), 404
    db.commit()
    return jsonify({"unlocked": username})


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    from flask import send_from_directory

    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
