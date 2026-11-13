"""Game leaderboard: Flask JSON API plus the built frontend."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "leaderboard.db"

ADMIN_USERNAME = "admin"
TOKEN_TTL = timedelta(days=30)
TS_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128
MAX_SCORE = 1_000_000_000_000
PERIODS = ("all", "week", "today")
DUMMY_HASH = generate_password_hash("dummy-password-for-timing")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


def now() -> datetime:
    return datetime.now(timezone.utc)


def fmt(ts: datetime) -> str:
    return ts.strftime(TS_FORMAT)


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
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
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL REFERENCES users(id),
                score INTEGER NOT NULL,
                achieved_at TEXT NOT NULL,
                is_hidden INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
            CREATE INDEX IF NOT EXISTS idx_scores_achieved ON scores(achieved_at);
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


def error(status: int, message: str):
    return jsonify({"error": message}), status


def admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        return parts[1].strip()
    return None


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    token = bearer_token()
    if token:
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        row = db().execute(
            "SELECT u.id, u.username, t.expires_at FROM tokens t "
            "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
            (token_hash,),
        ).fetchone()
        if row and row["expires_at"] > fmt(now()):
            is_admin = row["username"] == ADMIN_USERNAME
            if not is_admin or admin_password():
                g.user = {
                    "id": row["id"],
                    "username": row["username"],
                    "is_admin": is_admin,
                }
    return g.user


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (fmt(now()),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hashlib.sha256(token.encode()).hexdigest(), user_id, fmt(now() + TOKEN_TTL)),
    )
    return token


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def credentials(data):
    if data is None:
        return None, None
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = credentials(json_body())
    if username is None:
        return error(400, "username and password are required strings")
    if not USERNAME_RE.match(username):
        return error(
            400, "username must be 3-32 characters: letters, digits, '_', '.', '-'"
        )
    if not PASSWORD_MIN <= len(password) <= PASSWORD_MAX:
        return error(
            400, f"password must be {PASSWORD_MIN}-{PASSWORD_MAX} characters long"
        )
    if username.lower() == ADMIN_USERNAME:
        return error(409, "username is already taken")
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), fmt(now())),
        )
    except sqlite3.IntegrityError:
        return error(409, "username is already taken")
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials(json_body())
    if username is None:
        return error(400, "username and password are required strings")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if username.lower() == ADMIN_USERNAME:
        expected = admin_password()
        ok = bool(expected) and hmac.compare_digest(
            password.encode(), expected.encode()
        )
        if not ok:
            return error(401, "invalid username or password")
        if row is None:
            try:
                conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) "
                    "VALUES (?, NULL, ?)",
                    (ADMIN_USERNAME, fmt(now())),
                )
            except sqlite3.IntegrityError:
                pass
            row = conn.execute(
                "SELECT id, username FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        return jsonify({"token": issue_token(row["id"])})
    stored = row["password_hash"] if row else None
    ok = check_password_hash(stored or DUMMY_HASH, password)
    if row is None or not stored or not ok:
        return error(401, "invalid username or password")
    return jsonify({"token": issue_token(row["id"])})


def require_user():
    user = current_user()
    if user is None:
        return None, error(401, "authentication required")
    return user, None


def require_admin():
    user, err = require_user()
    if err:
        return None, err
    if not user["is_admin"]:
        return None, error(403, "admin only")
    return user, None


def score_dict(row) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


def int_param(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, error(400, f"{name} must be an integer")
    if value < 1:
        return None, error(400, f"{name} must be at least 1")
    return value, None


def period_start(period: str) -> str | None:
    current = now()
    if period == "today":
        return fmt(current.replace(hour=0, minute=0, second=0, microsecond=0))
    if period == "week":
        return fmt(current - timedelta(days=7))
    return None


def like_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/leaderboard")
def leaderboard():
    period = request.args.get("period", "all") or "all"
    if period not in PERIODS:
        return error(400, "period must be one of: all, week, today")
    limit, err = int_param("limit", 50)
    if err:
        return err
    limit = min(limit, 100)
    player = request.args.get("player", "").strip()
    since = period_start(period)

    query = """
        WITH best AS (
            SELECT s.id, s.player_id, s.score, s.achieved_at,
                   ROW_NUMBER() OVER (
                       PARTITION BY s.player_id
                       ORDER BY s.score DESC, s.achieved_at ASC, s.id ASC
                   ) AS rn
            FROM scores s
            WHERE s.is_hidden = 0 AND (? IS NULL OR s.achieved_at >= ?)
        ),
        ranked AS (
            SELECT b.id, u.username, b.score, b.achieved_at,
                   RANK() OVER (ORDER BY b.score DESC) AS rank
            FROM best b JOIN users u ON u.id = b.player_id
            WHERE b.rn = 1
        )
        SELECT {cols} FROM ranked
        WHERE (? = '' OR username LIKE ? ESCAPE '\\')
    """
    params = [since, since, player, f"%{like_escape(player)}%"]
    conn = db()
    total = conn.execute(query.format(cols="COUNT(*)"), params).fetchone()[0]
    rows = conn.execute(
        query.format(cols="rank, username, score, achieved_at")
        + " ORDER BY score DESC, achieved_at ASC, id ASC LIMIT ?",
        params + [limit],
    ).fetchall()
    items = [
        {
            "rank": r["rank"],
            "player": r["username"],
            "score": r["score"],
            "achieved_at": r["achieved_at"],
        }
        for r in rows
    ]
    return jsonify({"items": items, "total": total})


def best_visible(conn, user_id: int):
    return conn.execute(
        "SELECT MAX(score) FROM scores WHERE player_id = ? AND is_hidden = 0",
        (user_id,),
    ).fetchone()[0]


@app.post("/api/scores")
def submit_score():
    user, err = require_user()
    if err:
        return err
    data = json_body()
    value = data.get("score") if data else None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if not isinstance(value, int) or isinstance(value, bool):
        return error(400, "score must be an integer")
    if not 0 <= value <= MAX_SCORE:
        return error(400, f"score must be between 0 and {MAX_SCORE}")

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        previous = best_visible(conn, user["id"])
        achieved_at = fmt(now())
        cur = conn.execute(
            "INSERT INTO scores (player_id, score, achieved_at) VALUES (?, ?, ?)",
            (user["id"], value, achieved_at),
        )
        best = best_visible(conn, user["id"])
        rank = 1 + conn.execute(
            "SELECT COUNT(*) FROM (SELECT MAX(score) AS m FROM scores "
            "WHERE is_hidden = 0 GROUP BY player_id) WHERE m > ?",
            (best,),
        ).fetchone()[0]
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    body = {
        "id": cur.lastrowid,
        "score": value,
        "achieved_at": achieved_at,
        "is_hidden": False,
        "player": user["username"],
        "rank": rank,
        "personal_best": previous is None or value > previous,
    }
    return jsonify(body), 201


@app.get("/api/scores")
def my_scores():
    user, err = require_user()
    if err:
        return err
    conn = db()
    rows = conn.execute(
        "SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.player_id "
        "WHERE s.player_id = ? ORDER BY s.achieved_at DESC, s.id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify(
        {
            "items": [score_dict(r) for r in rows],
            "best_score": best_visible(conn, user["id"]),
        }
    )


@app.get("/api/admin/scores")
def admin_scores():
    _, err = require_admin()
    if err:
        return err
    page, err = int_param("page", 1)
    if err:
        return err
    page_size, err = int_param("page_size", 20)
    if err:
        return err
    page_size = min(page_size, 100)
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
    rows = conn.execute(
        "SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.player_id "
        "ORDER BY s.achieved_at DESC, s.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [score_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/scores/<int:score_id>/toggle")
def toggle_score(score_id: int):
    _, err = require_admin()
    if err:
        return err
    conn = db()
    cur = conn.execute(
        "UPDATE scores SET is_hidden = 1 - is_hidden WHERE id = ?", (score_id,)
    )
    if cur.rowcount == 0:
        return error(404, "score not found")
    row = conn.execute(
        "SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.player_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return jsonify(score_dict(row))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.code or 500, exc.name)
    return exc


@app.errorhandler(Exception)
def unexpected(exc: Exception):
    app.logger.exception("unhandled error")
    return error(500, "internal server error")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error(404, "Not Found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
