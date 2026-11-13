"""Flask entry point."""

import hashlib
import hmac
import math
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

LOCK_THRESHOLD = 5
LOCK_SECONDS = 15 * 60
CLIENT_WINDOW_SECONDS = 60
CLIENT_MAX_ATTEMPTS = 20

PBKDF2_ITERATIONS = 120_000
ADMIN_USERNAME = "admin"

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    last_login_at REAL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    success INTEGER NOT NULL,
    at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(username, at DESC);
CREATE TABLE IF NOT EXISTS locks (
    username TEXT PRIMARY KEY,
    failed_count INTEGER NOT NULL DEFAULT 0,
    locked_until REAL
);
CREATE TABLE IF NOT EXISTS client_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_client_attempts ON client_attempts(ip, at);
"""


def now() -> float:
    return datetime.now(timezone.utc).timestamp()


def iso(ts: float | None) -> str | None:
    if ts is None:
        return None
    dt = datetime.fromtimestamp(ts, tz=timezone.utc).replace(microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iterations, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk.hex(), hash_hex)


def init_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.execute("PRAGMA busy_timeout=10000")
    db.executescript(SCHEMA)
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_password:
        stored = hash_password(admin_password)
        db.execute(
            "INSERT INTO users(username, password_hash, is_admin) VALUES(?,?,1) "
            "ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash, is_admin=1",
            (ADMIN_USERNAME, stored),
        )
    else:
        db.execute(
            "DELETE FROM tokens WHERE user_id IN "
            "(SELECT id FROM users WHERE username=? AND is_admin=1)",
            (ADMIN_USERNAME,),
        )
        db.execute("DELETE FROM users WHERE username=? AND is_admin=1", (ADMIN_USERNAME,))
    db.commit()
    db.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=5000")
    return g.db


@app.teardown_appcontext
def close_db(_exception) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def json_error(status: int, error: str, message: str):
    resp = jsonify({"error": error, "message": message})
    resp.status_code = status
    return resp


def client_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.* FROM users u JOIN tokens t ON t.user_id = u.id WHERE t.token=?",
        (token,),
    ).fetchone()


def require_user():
    user = current_user()
    if user is None:
        return None, json_error(401, "unauthorized", "A valid sign-in token is required.")
    return user, None


def require_admin():
    user, err = require_user()
    if err:
        return None, err
    if not user["is_admin"]:
        return None, json_error(403, "forbidden", "Admin access is required.")
    return user, None


def rate_limited_seconds(db: sqlite3.Connection, ip: str, ts: float) -> float | None:
    cutoff = ts - CLIENT_WINDOW_SECONDS
    row = db.execute(
        "SELECT COUNT(*) AS c, MIN(at) AS oldest FROM client_attempts WHERE ip=? AND at>?",
        (ip, cutoff),
    ).fetchone()
    if row["c"] >= CLIENT_MAX_ATTEMPTS and row["oldest"] is not None:
        return max(0.0, row["oldest"] + CLIENT_WINDOW_SECONDS - ts)
    return None


def too_many(wait: float):
    seconds = max(1, math.ceil(wait))
    resp = jsonify(
        {
            "error": "too_many_requests",
            "message": "Too many sign-in attempts from this client. Try again later.",
            "retry_after": seconds,
        }
    )
    resp.status_code = 429
    resp.headers["Retry-After"] = str(seconds)
    return resp


def account_locked(wait: float):
    seconds = max(1, math.ceil(wait))
    resp = jsonify(
        {
            "error": "account_locked",
            "message": "This username is temporarily locked after too many failed sign-ins.",
            "retry_after": seconds,
        }
    )
    resp.status_code = 429
    resp.headers["Retry-After"] = str(seconds)
    return resp


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error(400, "invalid_request", "username is required.")
    if not isinstance(password, str) or not password:
        return json_error(400, "invalid_request", "password is required.")
    username = username.strip()
    if len(username) > 64 or len(password) > 256:
        return json_error(400, "invalid_request", "username or password is too long.")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users(username, password_hash) VALUES(?,?)",
            (username, hash_password(password)),
        )
    except sqlite3.IntegrityError:
        return json_error(409, "username_taken", "This username is already taken.")
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username") if isinstance(data.get("username"), str) else ""
    password = data.get("password") if isinstance(data.get("password"), str) else ""
    username = (username or "").strip()

    db = get_db()
    ts = now()
    ip = client_ip()

    wait = rate_limited_seconds(db, ip, ts)
    if wait is not None:
        return too_many(wait)
    db.execute("INSERT INTO client_attempts(ip, at) VALUES(?,?)", (ip, ts))
    db.execute("DELETE FROM client_attempts WHERE at < ?", (ts - 2 * CLIENT_WINDOW_SECONDS,))

    lock = (
        db.execute("SELECT * FROM locks WHERE username=?", (username,)).fetchone()
        if username
        else None
    )
    if lock is not None:
        if lock["locked_until"] is not None and lock["locked_until"] > ts:
            wait = lock["locked_until"] - ts
            if username:
                db.execute(
                    "INSERT INTO login_attempts(username, success, at) VALUES(?,?,?)",
                    (username, 0, ts),
                )
            db.commit()
            return account_locked(wait)
        if lock["locked_until"] is not None:
            db.execute(
                "UPDATE locks SET failed_count=0, locked_until=NULL WHERE username=?",
                (username,),
            )
            lock = None

    user = (
        db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if username
        else None
    )
    ok = user is not None and bool(password) and verify_password(password, user["password_hash"])

    if ok:
        db.execute("UPDATE users SET last_login_at=? WHERE id=?", (ts, user["id"]))
        db.execute("DELETE FROM locks WHERE username=?", (username,))
        token = secrets.token_urlsafe(32)
        db.execute(
            "INSERT INTO tokens(token, user_id, created_at) VALUES(?,?,?)",
            (token, user["id"], ts),
        )
        db.execute(
            "INSERT INTO login_attempts(username, success, at) VALUES(?,?,?)",
            (username, 1, ts),
        )
        db.commit()
        return jsonify({"token": token})

    if username:
        failed = (lock["failed_count"] if lock is not None else 0) + 1
        locked_until = ts + LOCK_SECONDS if failed >= LOCK_THRESHOLD else None
        db.execute(
            "INSERT INTO locks(username, failed_count, locked_until) VALUES(?,?,?) "
            "ON CONFLICT(username) DO UPDATE SET failed_count=excluded.failed_count, "
            "locked_until=excluded.locked_until",
            (username, failed if locked_until is None else LOCK_THRESHOLD, locked_until),
        )
        db.execute(
            "INSERT INTO login_attempts(username, success, at) VALUES(?,?,?)",
            (username, 0, ts),
        )
    db.commit()
    return json_error(401, "invalid_credentials", "Invalid username or password.")


@app.get("/api/me")
def me():
    user, err = require_user()
    if err:
        return err
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "last_login_at": iso(user["last_login_at"]),
        }
    )


@app.get("/api/me/login-attempts")
def login_attempts():
    user, err = require_user()
    if err:
        return err
    rows = get_db().execute(
        "SELECT at, success FROM login_attempts WHERE username=? "
        "ORDER BY at DESC, id DESC LIMIT 20",
        (user["username"],),
    ).fetchall()
    return jsonify(
        {"items": [{"at": iso(r["at"]), "success": bool(r["success"])} for r in rows]}
    )


@app.get("/api/admin/locks")
def admin_locks():
    _user, err = require_admin()
    if err:
        return err
    ts = now()
    rows = get_db().execute(
        "SELECT username, locked_until FROM locks "
        "WHERE locked_until IS NOT NULL AND locked_until > ? ORDER BY locked_until DESC",
        (ts,),
    ).fetchall()
    return jsonify(
        {"items": [{"username": r["username"], "locked_until": iso(r["locked_until"])} for r in rows]}
    )


@app.post("/api/admin/locks/<username>/unlock")
def admin_unlock(username: str):
    _user, err = require_admin()
    if err:
        return err
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone() is None and (
        db.execute("SELECT 1 FROM locks WHERE username=?", (username,)).fetchone() is None
    ):
        return json_error(404, "not_found", "Unknown username.")
    db.execute(
        "UPDATE locks SET failed_count=0, locked_until=NULL WHERE username=?", (username,)
    )
    db.commit()
    return jsonify({"username": username, "unlocked": True})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error(404, "not_found", "Unknown API endpoint.")
    if DIST.is_dir() and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_storage()
