"""Flask entry point: leaderboard API and frontend hosting."""

from __future__ import annotations

import math
import os
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "leaderboard.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "") or ""

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    achieved_ts REAL NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_ts ON scores(achieved_ts);
"""

PERIOD_ALIASES = {
    "all": "all",
    "alltime": "all",
    "all_time": "all",
    "all-time": "all",
    "lifetime": "all",
    "total": "all",
    "ever": "all",
    "overall": "all",
    "global": "all",
    "week": "week",
    "weekly": "week",
    "this_week": "week",
    "this-week": "week",
    "7d": "week",
    "today": "today",
    "daily": "today",
    "day": "today",
    "this_day": "today",
}


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.executescript(SCHEMA)
        if ADMIN_PASSWORD:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1) "
                "ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, "
                "is_admin = 1",
                (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD)),
            )
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    conn = g.get("db")
    if conn is None:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        g.db = conn
    return conn


@app.teardown_appcontext
def _close_db(_exc: object) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def _err(message: str, status: int):
    return {"error": message}, status


def _json_body() -> dict | None:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else None


def _as_number(value):
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def format_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def score_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "score": _as_number(row["score"]),
        "achieved_at": format_ts(row["achieved_ts"]),
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


def normalize_period(raw: str | None) -> str:
    if raw is None or not raw.strip():
        return "all"
    return PERIOD_ALIASES.get(raw.strip().lower(), "all")


def period_cutoff(period: str) -> float | None:
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return start.timestamp()
    if period == "week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        start = start - timedelta(days=start.weekday())
        return start.timestamp()
    return None


def _optional_positive_int(name: str) -> int | None:
    raw = request.args.get(name)
    if raw is None or str(raw).strip() == "":
        return None
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if value < 1:
        return None
    return value


def authenticate():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = authenticate()
        if user is None:
            return _err("authentication required", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = authenticate()
        if user is None:
            return _err("authentication required", 401)
        if not user["is_admin"]:
            return _err("admin access required", 403)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def compute_leaderboard(period: str, player: str | None) -> list[dict]:
    cutoff = period_cutoff(period)
    sql = (
        "SELECT s.score, s.achieved_ts, u.id AS uid, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.is_hidden = 0"
    )
    params: list = []
    if cutoff is not None:
        sql += " AND s.achieved_ts >= ?"
        params.append(cutoff)
    if player:
        escaped = (
            player.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        sql += " AND u.username LIKE ? ESCAPE '\\'"
        params.append(f"%{escaped}%")
    rows = get_db().execute(sql, params).fetchall()

    best: dict[int, dict] = {}
    for row in rows:
        uid = row["uid"]
        entry = best.get(uid)
        if (
            entry is None
            or row["score"] > entry["score"]
            or (row["score"] == entry["score"] and row["achieved_ts"] < entry["achieved_ts"])
        ):
            best[uid] = {
                "username": row["username"],
                "score": row["score"],
                "achieved_ts": row["achieved_ts"],
            }

    ordered = sorted(
        best.items(), key=lambda kv: (-kv[1]["score"], kv[1]["achieved_ts"], kv[0])
    )
    items: list[dict] = []
    for rank, (_uid, entry) in enumerate(ordered, start=1):
        items.append(
            {
                "rank": rank,
                "player": entry["username"],
                "score": _as_number(entry["score"]),
                "achieved_at": format_ts(entry["achieved_ts"]),
            }
        )
    return items


def all_time_rank(username: str) -> int | None:
    for item in compute_leaderboard("all", None):
        if item["player"].lower() == username.lower():
            return item["rank"]
    return None


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = _json_body()
    if data is None:
        return _err("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return _err("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return _err("username and password are required", 400)
    if username.lower() == ADMIN_USERNAME:
        return _err("username not available", 409)

    db = get_db()
    existing = db.execute(
        "SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing is not None:
        return _err("username not available", 409)

    db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, generate_password_hash(password)),
    )
    try:
        db.commit()
    except sqlite3.IntegrityError:
        return _err("username not available", 409)
    return {"username": username}, 201


@app.post("/api/auth/login")
def login():
    data = _json_body()
    if data is None:
        return _err("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return _err("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return _err("username and password are required", 400)

    if username.lower() == ADMIN_USERNAME and not ADMIN_PASSWORD:
        return _err("admin sign-in is disabled", 401)

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return _err("invalid credentials", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], time.time()),
    )
    db.commit()
    return {"token": token}, 200


@app.get("/api/auth/me")
@login_required
def me():
    return {"username": g.user["username"], "is_admin": bool(g.user["is_admin"])}, 200


# --------------------------------------------------------------------------
# leaderboard and scores
# --------------------------------------------------------------------------


@app.get("/api/leaderboard")
def leaderboard():
    period = normalize_period(request.args.get("period"))
    player = request.args.get("player") or None
    if player is not None:
        player = player.strip() or None
    limit = _optional_positive_int("limit")

    items = compute_leaderboard(period, player)
    total = len(items)
    if limit is not None:
        items = items[:limit]
    return {"items": items, "total": total}, 200


@app.post("/api/scores")
@login_required
def submit_score():
    data = _json_body()
    if data is None:
        return _err("invalid JSON body", 400)
    value = data.get("score")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return _err("score must be a number", 400)
    try:
        numeric = float(value)
    except (OverflowError, ValueError):
        return _err("score must be a number", 400)
    if not math.isfinite(numeric):
        return _err("score must be a number", 400)

    db = get_db()
    user_id = g.user["id"]
    previous = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND is_hidden = 0",
        (user_id,),
    ).fetchone()["best"]
    now = time.time()
    cursor = db.execute(
        "INSERT INTO scores (user_id, score, achieved_ts, is_hidden) VALUES (?, ?, ?, 0)",
        (user_id, numeric, now),
    )
    db.commit()

    personal_best = previous is None or numeric > float(previous)
    row = db.execute(
        "SELECT s.id, s.score, s.achieved_ts, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    payload = score_to_dict(row)
    payload["rank"] = all_time_rank(g.user["username"])
    payload["personal_best"] = personal_best
    return payload, 200


@app.get("/api/scores")
@login_required
def my_scores():
    db = get_db()
    rows = db.execute(
        "SELECT s.id, s.score, s.achieved_ts, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id "
        "WHERE s.user_id = ? ORDER BY s.achieved_ts DESC, s.id DESC",
        (g.user["id"],),
    ).fetchall()
    best = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND is_hidden = 0",
        (g.user["id"],),
    ).fetchone()["best"]
    return {"items": [score_to_dict(r) for r in rows], "best_score": _as_number(best)}, 200


# --------------------------------------------------------------------------
# admin
# --------------------------------------------------------------------------


@app.get("/api/admin/scores")
@admin_required
def admin_scores():
    db = get_db()
    page = _optional_positive_int("page") or 1
    page_size = _optional_positive_int("page_size") or 20

    total = db.execute("SELECT COUNT(*) AS n FROM scores").fetchone()["n"]
    rows = db.execute(
        "SELECT s.id, s.score, s.achieved_ts, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id "
        "ORDER BY s.achieved_ts DESC, s.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [score_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }, 200


@app.post("/api/admin/scores/<int:score_id>/toggle")
@admin_required
def toggle_score(score_id: int):
    db = get_db()
    row = db.execute("SELECT id FROM scores WHERE id = ?", (score_id,)).fetchone()
    if row is None:
        return _err("score not found", 404)
    db.execute(
        "UPDATE scores SET is_hidden = 1 - is_hidden WHERE id = ?", (score_id,)
    )
    db.commit()
    updated = db.execute(
        "SELECT s.id, s.score, s.achieved_ts, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return score_to_dict(updated), 200


# --------------------------------------------------------------------------
# frontend hosting
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return _err("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(_error):
    return _err("not found", 404)


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return _err("method not allowed", 405)
    return _err("method not allowed", 405)
