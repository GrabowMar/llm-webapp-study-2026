"""Flask entry point for the game leaderboard."""

from __future__ import annotations

import hashlib
import hmac
import os
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

TOKEN_TTL = timedelta(days=30)
USERNAME_MIN, USERNAME_MAX = 3, 64
PASSWORD_MIN, PASSWORD_MAX = 6, 256
SCORE_MAX = 2**53 - 1
LEADERBOARD_DEFAULT_LIMIT, LEADERBOARD_MAX_LIMIT = 10, 100
PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX = 20, 100

PERIODS = {
    "all": "all",
    "alltime": "all",
    "all-time": "all",
    "all_time": "all",
    "week": "week",
    "weekly": "week",
    "this_week": "week",
    "this-week": "week",
    "day": "day",
    "daily": "day",
    "today": "day",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    achieved_at TEXT NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, is_hidden, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_achieved ON scores(achieved_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def fmt_ts(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
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
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if ADMIN_PASSWORD:
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                    (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), fmt_ts(now_utc())),
                )
            elif not check_password_hash(row["password_hash"], ADMIN_PASSWORD):
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (generate_password_hash(ADMIN_PASSWORD), row["id"]),
                )
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
            else:
                conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
        elif row is not None:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (row["id"],))
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (fmt_ts(now_utc()),))
        conn.execute("COMMIT")
    finally:
        conn.close()


def error(status: int, message: str):
    resp = jsonify({"error": message})
    resp.status_code = status
    return resp


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return error(exc.status, exc.message)


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    app.logger.exception("Unhandled error")
    return error(500, "Internal server error")


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


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
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token or len(token) > 512:
        return None
    row = get_db().execute(
        """SELECT u.id, u.username, u.is_admin, s.expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ?""",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < fmt_ts(now_utc()):
        return None
    if row["is_admin"] and not ADMIN_PASSWORD:
        return None
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


def parse_int_arg(name: str, default: int, minimum: int, maximum: int | None = None) -> int:
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw.strip())
    except ValueError:
        raise ApiError(400, f"'{name}' must be an integer")
    if value < minimum:
        raise ApiError(400, f"'{name}' must be at least {minimum}")
    if maximum is not None and value > maximum:
        value = maximum
    return value


def score_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


def period_start(period: str) -> str | None:
    now = now_utc()
    if period == "day":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:
        return None
    return fmt_ts(start)


def ranked_rows(db: sqlite3.Connection, since: str | None):
    where = "s.is_hidden = 0"
    params: list = []
    if since is not None:
        where += " AND s.achieved_at >= ?"
        params.append(since)
    sql = f"""
        WITH best AS (
            SELECT s.id, s.user_id, s.score, s.achieved_at,
                   ROW_NUMBER() OVER (
                       PARTITION BY s.user_id
                       ORDER BY s.score DESC, s.achieved_at ASC, s.id ASC
                   ) AS rn
            FROM scores s
            WHERE {where}
        )
        SELECT b.id, b.user_id, b.score, b.achieved_at, u.username,
               ROW_NUMBER() OVER (ORDER BY b.score DESC, b.achieved_at ASC, b.id ASC) AS rank
        FROM best b JOIN users u ON u.id = b.user_id
        WHERE b.rn = 1
        ORDER BY rank
    """
    return db.execute(sql, params).fetchall()


def best_visible(db: sqlite3.Connection, user_id: int):
    return db.execute(
        """SELECT id, score FROM scores WHERE user_id = ? AND is_hidden = 0
           ORDER BY score DESC, achieved_at ASC, id ASC LIMIT 1""",
        (user_id,),
    ).fetchone()


# --- routes -----------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "'username' and 'password' are required strings")
    if not (USERNAME_MIN <= len(username) <= USERNAME_MAX):
        raise ApiError(400, f"Username must be {USERNAME_MIN}-{USERNAME_MAX} characters")
    if any(ch.isspace() or not ch.isprintable() for ch in username):
        raise ApiError(400, "Username must not contain spaces or control characters")
    if not (PASSWORD_MIN <= len(password) <= PASSWORD_MAX):
        raise ApiError(400, f"Password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters")
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), fmt_ts(now_utc())),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username, "is_admin": False}), 201


_DUMMY_HASH = generate_password_hash(secrets.token_hex(16))


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "'username' and 'password' are required strings")
    if len(username) > USERNAME_MAX or len(password) > PASSWORD_MAX:
        raise ApiError(401, "Invalid username or password")
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None:
        check_password_hash(_DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if row["is_admin"]:
        if not ADMIN_PASSWORD or not hmac.compare_digest(
            password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
        ):
            raise ApiError(401, "Invalid username or password")
    elif not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = now_utc()
    db.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (hash_token(token), row["id"], fmt_ts(now), fmt_ts(now + TOKEN_TTL)),
    )
    return {
        "token": token,
        "user": {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])},
    }


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    get_db().execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(token.strip()),))
    return {"status": "ok"}


@app.get("/api/auth/me")
@login_required
def me():
    return dict(current_user())


@app.get("/api/leaderboard")
def leaderboard():
    period_raw = (request.args.get("period") or "all").strip().lower()
    period = PERIODS.get(period_raw)
    if period is None:
        raise ApiError(400, "'period' must be one of: all, week, day")
    limit = parse_int_arg("limit", LEADERBOARD_DEFAULT_LIMIT, 1, LEADERBOARD_MAX_LIMIT)
    player = (request.args.get("player") or "").strip().lower()
    rows = ranked_rows(get_db(), period_start(period))
    if player:
        rows = [r for r in rows if player in r["username"].lower()]
    items = [
        {
            "rank": r["rank"],
            "player": r["username"],
            "score": r["score"],
            "achieved_at": r["achieved_at"],
        }
        for r in rows[:limit]
    ]
    return {"items": items, "total": len(rows), "period": period}


@app.post("/api/scores")
@login_required
def submit_score():
    user = current_user()
    data = json_body()
    value = data.get("score")
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError(400, "'score' must be an integer")
    if value < 0 or value > SCORE_MAX:
        raise ApiError(400, f"'score' must be between 0 and {SCORE_MAX}")
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        previous = best_visible(db, user["id"])
        cur = db.execute(
            "INSERT INTO scores (user_id, score, achieved_at, is_hidden) VALUES (?, ?, ?, 0)",
            (user["id"], value, fmt_ts(now_utc())),
        )
        score_id = cur.lastrowid
        row = db.execute(
            """SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username
               FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?""",
            (score_id,),
        ).fetchone()
        rank = next(
            (r["rank"] for r in ranked_rows(db, None) if r["user_id"] == user["id"]), None
        )
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise
    result = score_to_dict(row)
    result["rank"] = rank
    result["personal_best"] = previous is None or value > previous["score"]
    return jsonify(result), 201


@app.get("/api/scores")
@login_required
def my_scores():
    user = current_user()
    db = get_db()
    rows = db.execute(
        """SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username
           FROM scores s JOIN users u ON u.id = s.user_id
           WHERE s.user_id = ?
           ORDER BY s.achieved_at DESC, s.id DESC""",
        (user["id"],),
    ).fetchall()
    best = best_visible(db, user["id"])
    return {
        "items": [score_to_dict(r) for r in rows],
        "best_score": best["score"] if best else None,
    }


@app.get("/api/admin/scores")
@admin_required
def admin_scores():
    page = parse_int_arg("page", 1, 1)
    page_size = parse_int_arg("page_size", PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX)
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
    rows = db.execute(
        """SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username
           FROM scores s JOIN users u ON u.id = s.user_id
           ORDER BY s.achieved_at DESC, s.id DESC
           LIMIT ? OFFSET ?""",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [score_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/admin/scores/<int:score_id>/toggle")
@admin_required
def admin_toggle(score_id: int):
    db = get_db()
    row = db.execute("SELECT id, is_hidden FROM scores WHERE id = ?", (score_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Score not found")
    data = request.get_json(silent=True)
    if isinstance(data, dict) and isinstance(data.get("is_hidden"), bool):
        new_value = data["is_hidden"]
    else:
        new_value = not bool(row["is_hidden"])
    db.execute("UPDATE scores SET is_hidden = ? WHERE id = ?", (int(new_value), score_id))
    updated = db.execute(
        """SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username
           FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?""",
        (score_id,),
    ).fetchone()
    return score_to_dict(updated)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return error(404, "Frontend not built")
    return send_from_directory(DIST, "index.html")


init_db()
