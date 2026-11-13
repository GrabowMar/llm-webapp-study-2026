"""Account service: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import hashlib
import math
import os
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.sqlite3"

LOCK_SECONDS = 15 * 60
MAX_FAILURES = 5
RATE_WINDOW = 60
RATE_LIMIT = 20

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

app = Flask(__name__, static_folder=None)

_login_lock = threading.Lock()
_DUMMY_HASH = generate_password_hash("not-a-real-password")


def iso(ts: float | None = None) -> str:
    if ts is None:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                username       TEXT NOT NULL UNIQUE,
                password_hash  TEXT,
                is_admin       INTEGER NOT NULL DEFAULT 0,
                last_login_at  TEXT,
                created_at     TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token_hash  TEXT PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS login_attempts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
                username    TEXT NOT NULL,
                client_key  TEXT NOT NULL,
                at          TEXT NOT NULL,
                at_ts       REAL NOT NULL,
                success     INTEGER NOT NULL,
                outcome     TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_attempts_user
                ON login_attempts (user_id, id DESC);

            CREATE TABLE IF NOT EXISTS username_state (
                username              TEXT PRIMARY KEY,
                consecutive_failures  INTEGER NOT NULL DEFAULT 0,
                locked_until          REAL
            );

            CREATE TABLE IF NOT EXISTS rate_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                client_key  TEXT NOT NULL,
                at_ts       REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rate_events
                ON rate_events (client_key, at_ts);
            """
        )
        conn.execute(
            """
            INSERT INTO users (username, password_hash, is_admin, created_at)
            VALUES (?, NULL, 1, ?)
            ON CONFLICT(username) DO UPDATE SET is_admin = 1
            """,
            (ADMIN_USERNAME, iso()),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_admin() -> None:
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            """
            INSERT INTO users (username, password_hash, is_admin, created_at)
            VALUES (?, ?, 1, ?)
            ON CONFLICT(username) DO UPDATE SET
                password_hash = excluded.password_hash,
                is_admin = 1
            """,
            (
                ADMIN_USERNAME,
                generate_password_hash(ADMIN_PASSWORD) if ADMIN_PASSWORD else None,
                iso(),
            ),
        )
        conn.execute(
            "DELETE FROM tokens WHERE user_id = "
            "(SELECT id FROM users WHERE username = ?)",
            (ADMIN_USERNAME,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def client_key() -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded and forwarded.split(",")[0].strip():
        return "xff:" + forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip and real_ip.strip():
        return "xri:" + real_ip.strip()
    client_id = request.headers.get("X-Client-Id")
    if client_id and client_id.strip():
        return "cid:" + client_id.strip()
    return "ip:" + (request.remote_addr or "unknown")


def normalize_username(value) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    return value.strip()


def error(status: int, code: str, message: str, **extra):
    payload = {"error": code, "message": message, **extra}
    response = jsonify(payload)
    response.status_code = status
    return response


def too_many(status_wait: float, code: str, message: str, **extra):
    retry = max(1, math.ceil(status_wait))
    response = error(
        429, code, message, retry_after=retry, **extra
    )
    response.headers["Retry-After"] = str(retry)
    return response


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return get_db().execute(
        """
        SELECT u.id, u.username, u.is_admin, u.last_login_at
        FROM tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
        """,
        (digest,),
    ).fetchone()


def require_user():
    user = current_user()
    if user is None:
        return None, error(401, "unauthorized", "A valid bearer token is required.")
    return user, None


def require_admin():
    user, failure = require_user()
    if failure is not None:
        return None, failure
    if not user["is_admin"]:
        return None, error(403, "forbidden", "Admin access is required.")
    return user, None


def record_attempt(conn, username, user_id, client, now, outcome):
    conn.execute(
        """
        INSERT INTO login_attempts
            (user_id, username, client_key, at, at_ts, success, outcome)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            username,
            client,
            iso(now),
            now,
            1 if outcome == "success" else 0,
            outcome,
        ),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error(400, "invalid_request", "A JSON object is required.")
    username = normalize_username(body.get("username"))
    password = body.get("password")
    if (
        username is None
        or not isinstance(password, str)
        or not password
    ):
        return error(400, "invalid_request", "username and password are required.")
    if username == ADMIN_USERNAME:
        return error(409, "username_taken", "That username is reserved.")
    if len(username) > 150:
        return error(400, "invalid_request", "username is too long.")

    conn = get_db()
    try:
        with _login_lock:
            conn.execute("BEGIN IMMEDIATE")
            cursor = conn.execute(
                """
                INSERT INTO users (username, password_hash, is_admin, created_at)
                VALUES (?, ?, 0, ?)
                """,
                (username, generate_password_hash(password), iso()),
            )
            conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        return error(409, "username_taken", "That username is already taken.")
    except Exception:
        conn.rollback()
        raise
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return error(400, "invalid_request", "A JSON object is required.")
    username = normalize_username(body.get("username"))
    password = body.get("password")
    if (
        username is None
        or not isinstance(password, str)
        or not password
    ):
        return error(400, "invalid_request", "username and password are required.")

    client = client_key()
    now = time.time()
    conn = get_db()
    with _login_lock:
        conn.execute("BEGIN IMMEDIATE")
        try:
            recent = conn.execute(
                """
                SELECT at_ts FROM rate_events
                WHERE client_key = ? AND at_ts > ?
                ORDER BY at_ts ASC
                """,
                (client, now - RATE_WINDOW),
            ).fetchall()
            if len(recent) >= RATE_LIMIT:
                wait = recent[0]["at_ts"] + RATE_WINDOW - now
                user = conn.execute(
                    "SELECT id FROM users WHERE username = ?", (username,)
                ).fetchone()
                record_attempt(
                    conn, username, user["id"] if user else None,
                    client, now, "rate_limited",
                )
                conn.commit()
                return too_many(
                    wait,
                    "too_many_attempts",
                    "Too many sign-in attempts. Please try again later.",
                )
            conn.execute(
                "INSERT INTO rate_events (client_key, at_ts) VALUES (?, ?)",
                (client, now),
            )

            user = conn.execute(
                """
                SELECT id, username, password_hash, is_admin
                FROM users WHERE username = ?
                """,
                (username,),
            ).fetchone()
            user_id = user["id"] if user else None

            state = conn.execute(
                """
                SELECT consecutive_failures, locked_until
                FROM username_state WHERE username = ?
                """,
                (username,),
            ).fetchone()
            failures = state["consecutive_failures"] if state else 0
            locked_until = state["locked_until"] if state else None

            if locked_until is not None and locked_until <= now:
                locked_until = None
                failures = 0
                conn.execute(
                    """
                    UPDATE username_state
                    SET consecutive_failures = 0, locked_until = NULL
                    WHERE username = ?
                    """,
                    (username,),
                )

            if locked_until is not None and locked_until > now:
                wait = locked_until - now
                record_attempt(conn, username, user_id, client, now, "locked")
                conn.commit()
                return too_many(
                    wait,
                    "account_locked",
                    "This username is locked after too many failed sign-ins.",
                    locked_until=iso(locked_until),
                )

            stored_hash = user["password_hash"] if user else None
            if check_password_hash(stored_hash or _DUMMY_HASH, password) and stored_hash:
                token = secrets.token_urlsafe(32)
                digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
                conn.execute(
                    "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
                    (digest, user_id, iso(now)),
                )
                conn.execute(
                    "UPDATE users SET last_login_at = ? WHERE id = ?",
                    (iso(now), user_id),
                )
                conn.execute(
                    """
                    INSERT INTO username_state
                        (username, consecutive_failures, locked_until)
                    VALUES (?, 0, NULL)
                    ON CONFLICT(username) DO UPDATE SET
                        consecutive_failures = 0, locked_until = NULL
                    """,
                    (username,),
                )
                record_attempt(conn, username, user_id, client, now, "success")
                conn.commit()
                return jsonify({"token": token}), 200

            failures += 1
            if failures >= MAX_FAILURES:
                locked_until = now + LOCK_SECONDS
            conn.execute(
                """
                INSERT INTO username_state
                    (username, consecutive_failures, locked_until)
                VALUES (?, ?, ?)
                ON CONFLICT(username) DO UPDATE SET
                    consecutive_failures = excluded.consecutive_failures,
                    locked_until = excluded.locked_until
                """,
                (username, failures, locked_until),
            )
            record_attempt(conn, username, user_id, client, now, "invalid")
            conn.commit()
            return error(401, "invalid_credentials", "Invalid username or password.")
        except Exception:
            conn.rollback()
            raise


@app.post("/api/auth/logout")
def logout():
    user, failure = require_user()
    if failure is not None:
        return failure
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer ") :].strip()
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    conn = get_db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (digest,))
    return jsonify({"signed_out": True})


@app.get("/api/me")
def me():
    user, failure = require_user()
    if failure is not None:
        return failure
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "last_login_at": user["last_login_at"],
        }
    )


@app.get("/api/me/login-attempts")
def login_attempts():
    user, failure = require_user()
    if failure is not None:
        return failure
    rows = get_db().execute(
        """
        SELECT at, success FROM login_attempts
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 20
        """,
        (user["id"],),
    ).fetchall()
    return jsonify(
        {"items": [{"at": row["at"], "success": bool(row["success"])} for row in rows]}
    )


@app.get("/api/admin/locks")
def admin_locks():
    _user, failure = require_admin()
    if failure is not None:
        return failure
    now = time.time()
    rows = get_db().execute(
        """
        SELECT username, locked_until FROM username_state
        WHERE locked_until IS NOT NULL AND locked_until > ?
        ORDER BY username ASC
        """,
        (now,),
    ).fetchall()
    return jsonify(
        {
            "items": [
                {"username": row["username"], "locked_until": iso(row["locked_until"])}
                for row in rows
            ]
        }
    )


@app.post("/api/admin/locks/<path:username>/unlock")
def admin_unlock(username: str):
    _user, failure = require_admin()
    if failure is not None:
        return failure
    conn = get_db()
    conn.execute(
        """
        INSERT INTO username_state (username, consecutive_failures, locked_until)
        VALUES (?, 0, NULL)
        ON CONFLICT(username) DO UPDATE SET
            consecutive_failures = 0, locked_until = NULL
        """,
        (username,),
    )
    return jsonify({"username": username, "locked": False})


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error(404, "not_found", "No such API endpoint.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "not_found", "No such API endpoint.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return Response("Frontend build is missing.", status=503, mimetype="text/plain")
    return send_from_directory(DIST, "index.html")


init_db()
init_admin()
