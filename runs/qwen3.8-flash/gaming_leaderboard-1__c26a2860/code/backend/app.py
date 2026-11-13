"""Flask entry point for the game leaderboard API."""

from __future__ import annotations

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
from itsdangerous import BadSignature, URLSafeTimedSerializer

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "leaderboard.db"

PBKDF2_ROUNDS = 120_000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,32}$")
PERIODS = {
    "all": "all",
    "all_time": "all",
    "alltime": "all",
    "week": "week",
    "weekly": "week",
    "this_week": "week",
    "day": "day",
    "today": "day",
}
DEFAULT_PERIOD = "all"

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False


# --------------------------------------------------------------------------- #
# Storage helpers
# --------------------------------------------------------------------------- #

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def fmt_dt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


def parse_dt(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)


def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_database", None)
    if conn is None:
        conn = g._database = connect_db()
    return conn


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    achieved_at TEXT NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id, is_hidden, score);
CREATE INDEX IF NOT EXISTS idx_scores_achieved ON scores(achieved_at);
"""


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ROUNDS).hex()
    return f"pbkdf2-sha256${PBKDF2_ROUNDS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _algo, rounds, salt, digest = stored.split("$", 3)
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(rounds)).hex()
        return hmac.compare_digest(check, digest)
    except (ValueError, TypeError):
        return False


def _load_secret() -> str:
    key_file = DATA_DIR / "secret.key"
    if key_file.is_file():
        value = key_file.read_text().strip()
        if value:
            return value
    value = secrets.token_hex(32)
    key_file.write_text(value)
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return value


def init_storage() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _load_secret()
    conn = connect_db()
    try:
        conn.executescript(SCHEMA)
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        if admin_password:
            row = conn.execute("SELECT id FROM players WHERE username = ?", ("admin",)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO players (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                    ("admin", hash_password(admin_password), fmt_dt(now_utc())),
                )
            else:
                conn.execute(
                    "UPDATE players SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (hash_password(admin_password), row["id"]),
                )
        conn.commit()
    finally:
        conn.close()


init_storage()

_serializer = URLSafeTimedSerializer(_load_secret(), salt="lb-token")


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = getattr(g, "_database", None)
    if conn is not None:
        conn.close()


# --------------------------------------------------------------------------- #
# JSON helpers / auth
# --------------------------------------------------------------------------- #

def error(status: int, message: str):
    return jsonify({"error": message}), status


def get_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[len("Bearer "):].strip() or None
    return None


def user_from_token(token: str | None):
    if not token:
        return None
    try:
        data = _serializer.loads(token)
    except BadSignature:
        return None
    if not isinstance(data, dict):
        return None
    player_id = data.get("uid")
    if player_id is None:
        return None
    return get_db().execute("SELECT * FROM players WHERE id = ?", (player_id,)).fetchone()


def current_user():
    return getattr(g, "_user", None)


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = user_from_token(get_token())
        if user is None:
            return error(401, "Authentication required.")
        g._user = user
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = user_from_token(get_token())
        if user is None:
            return error(401, "Authentication required.")
        if not user["is_admin"]:
            return error(403, "Admin access required.")
        g._user = user
        return fn(*args, **kwargs)

    return wrapper


def score_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["score_id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


SCORE_SELECT = """
SELECT s.id AS score_id, s.score AS score, s.achieved_at AS achieved_at,
       s.is_hidden AS is_hidden, p.username AS username
FROM scores s JOIN players p ON p.id = s.player_id
"""


# --------------------------------------------------------------------------- #
# Leaderboard query
# --------------------------------------------------------------------------- #

def period_conditions(period: str, alias: str = "s") -> tuple[str, list]:
    conds = [f"{alias}.is_hidden = 0"]
    params: list = []
    if period == "week":
        conds.append(f"{alias}.achieved_at >= ?")
        params.append(fmt_dt(now_utc() - timedelta(weeks=1)))
    elif period == "day":
        conds.append(f"{alias}.achieved_at >= ?")
        params.append(fmt_dt(now_utc() - timedelta(days=1)))
    return " AND ".join(conds), params


def compute_leaderboard(conn: sqlite3.Connection, period: str, player: str | None = None) -> list[dict]:
    where, params = period_conditions(period)
    sub_where, sub_params = period_conditions(period, alias="s2")
    sql = f"""
        SELECT t.player_id AS player_id, p.username AS username, t.best AS score,
               (SELECT s2.achieved_at FROM scores s2
                 WHERE s2.player_id = t.player_id AND s2.score = t.best AND {sub_where}
                 ORDER BY s2.achieved_at DESC LIMIT 1) AS achieved_at
        FROM (SELECT player_id, MAX(score) AS best FROM scores AS s WHERE {where} GROUP BY player_id) t
        JOIN players p ON p.id = t.player_id
    """
    full_params = sub_params + params
    if player:
        sql += " WHERE INSTR(LOWER(p.username), LOWER(?)) > 0"
        full_params = full_params + [player]
    sql += " ORDER BY t.best DESC, achieved_at ASC, LOWER(p.username) ASC"
    rows = conn.execute(sql, full_params).fetchall()
    items: list[dict] = []
    prev_score: int | None = None
    prev_rank = 0
    for idx, row in enumerate(rows, start=1):
        score = row["score"]
        if prev_score is not None and score == prev_score:
            rank = prev_rank
        else:
            rank = idx
        prev_score, prev_rank = score, rank
        items.append(
            {
                "rank": rank,
                "player": row["username"],
                "score": score,
                "achieved_at": row["achieved_at"],
            }
        )
    return items


def player_best(conn: sqlite3.Connection, player_id: int) -> int | None:
    row = conn.execute(
        "SELECT MAX(score) AS best FROM scores WHERE player_id = ? AND is_hidden = 0",
        (player_id,),
    ).fetchone()
    return row["best"]


def player_rank(conn: sqlite3.Connection, player_id: int) -> int | None:
    best = player_best(conn, player_id)
    if best is None:
        return None
    where, params = period_conditions("all")
    greater = conn.execute(
        f"SELECT COUNT(*) AS n FROM (SELECT player_id, MAX(score) AS best FROM scores AS s WHERE {where} GROUP BY player_id) t WHERE t.best > ?",
        (*params, best),
    ).fetchone()["n"]
    return greater + 1


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body with 'username' and 'password' is required.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.match(username):
        return error(400, "Username must be 1-32 characters (letters, digits, '_', '.', '-').")
    if not isinstance(password, str) or not password:
        return error(400, "Password is required.")
    if username.lower() == "admin":
        return error(409, "That username is not available.")
    conn = get_db()
    existing = conn.execute("SELECT id FROM players WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error(409, "That username is already taken.")
    conn.execute(
        "INSERT INTO players (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
        (username, hash_password(password), fmt_dt(now_utc())),
    )
    conn.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "A JSON body with 'username' and 'password' is required.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "'username' and 'password' must be strings.")
    if username.lower() == "admin" and not os.environ.get("ADMIN_PASSWORD"):
        return error(401, "Invalid username or password.")
    row = get_db().execute("SELECT * FROM players WHERE username = ?", (username,)).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error(401, "Invalid username or password.")
    token = _serializer.dumps({"uid": row["id"]})
    return jsonify({"token": token})


@app.post("/api/scores")
@require_auth
def create_score():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or "score" not in data:
        return error(400, "A JSON body with 'score' is required.")
    value = data["score"]
    if isinstance(value, bool) or not isinstance(value, int):
        return error(400, "'score' must be an integer.")
    if value < 0 or value > 1_000_000_000:
        return error(400, "'score' must be between 0 and 1000000000.")
    user = current_user()
    conn = get_db()
    achieved_at = fmt_dt(now_utc())
    cur = conn.execute(
        "INSERT INTO scores (player_id, score, achieved_at, is_hidden) VALUES (?, ?, ?, 0)",
        (user["id"], value, achieved_at),
    )
    conn.commit()
    best = player_best(conn, user["id"])
    payload = {
        "id": cur.lastrowid,
        "score": value,
        "achieved_at": achieved_at,
        "is_hidden": False,
        "player": user["username"],
        "rank": player_rank(conn, user["id"]),
        "personal_best": bool(best is not None and best == value),
    }
    return jsonify(payload), 201


@app.get("/api/scores")
@require_auth
def my_scores():
    user = current_user()
    conn = get_db()
    rows = conn.execute(
        SCORE_SELECT + " WHERE s.player_id = ? ORDER BY s.achieved_at DESC, s.id DESC",
        (user["id"],),
    ).fetchall()
    best = conn.execute(
        "SELECT MAX(score) AS best FROM scores WHERE player_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]
    return jsonify({"items": [score_row_to_dict(r) for r in rows], "best_score": best})


@app.get("/api/leaderboard")
def leaderboard():
    period_raw = (request.args.get("period") or DEFAULT_PERIOD).strip().lower()
    period = PERIODS.get(period_raw)
    if period is None:
        return error(400, "Unknown period. Use 'all', 'week' or 'day'.")
    limit = 50
    limit_raw = request.args.get("limit")
    if limit_raw is not None and limit_raw != "":
        try:
            limit = int(limit_raw)
        except ValueError:
            return error(400, "'limit' must be an integer.")
        limit = max(1, min(limit, 100))
    player = request.args.get("player")
    items = compute_leaderboard(get_db(), period, player if player else None)
    total = len(items)
    return jsonify({"items": items[:limit], "total": total})


@app.get("/api/admin/scores")
@require_admin
def admin_scores():
    def bounded(name: str, default: int, maximum: int) -> int:
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except ValueError:
            return default
        return max(1, min(value, maximum))

    page = bounded("page", 1, 1_000_000)
    page_size = bounded("page_size", 20, 200)
    conn = get_db()
    total = conn.execute("SELECT COUNT(*) AS n FROM scores").fetchone()["n"]
    rows = conn.execute(
        SCORE_SELECT + " ORDER BY s.achieved_at DESC, s.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [score_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/scores/<int:score_id>/toggle")
@require_admin
def toggle_score(score_id: int):
    conn = get_db()
    row = conn.execute(SCORE_SELECT + " WHERE s.id = ?", (score_id,)).fetchone()
    if row is None:
        return error(404, "Score not found.")
    new_hidden = 0 if row["is_hidden"] else 1
    conn.execute("UPDATE scores SET is_hidden = ? WHERE id = ?", (new_hidden, score_id))
    conn.commit()
    updated = conn.execute(SCORE_SELECT + " WHERE s.id = ?", (score_id,)).fetchone()
    return jsonify(score_row_to_dict(updated))


@app.errorhandler(404)
def not_found(_err):
    if request.path.startswith("/api"):
        return error(404, "Not found.")
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(_err):
    if request.path.startswith("/api"):
        return error(405, "Method not allowed.")
    return send_from_directory(DIST, "index.html")


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "Not found.")
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
