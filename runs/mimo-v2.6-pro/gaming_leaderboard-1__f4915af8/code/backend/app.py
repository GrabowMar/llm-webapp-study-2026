"""Game leaderboard: JSON API under /api and the built web frontend."""

from __future__ import annotations

import hashlib
import math
import os
import secrets
import sqlite3
from datetime import datetime, time, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("DATA_DIR") or (BASE_DIR / "data"))
DB_PATH = DATA_DIR / "app.db"
DIST = BASE_DIR / "frontend" / "dist"

ADMIN_USERNAME = "admin"
RESERVED_USERNAMES = {ADMIN_USERNAME}

PERIOD_ALIASES = {
    "all": "all",
    "all-time": "all",
    "alltime": "all",
    "all_time": "all",
    "week": "week",
    "weekly": "week",
    "this-week": "week",
    "this_week": "week",
    "today": "today",
    "daily": "today",
    "day": "today",
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score NUMERIC NOT NULL,
    achieved_at TEXT NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_scores_player ON scores (player_id);
CREATE INDEX IF NOT EXISTS idx_scores_achieved ON scores (achieved_at);
"""

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.isoformat(timespec="microseconds")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.executescript(SCHEMA)
        db.commit()
        ensure_admin(db)
    finally:
        db.close()


def ensure_admin(db: sqlite3.Connection) -> bool:
    """Create/update the admin account when ADMIN_PASSWORD is set."""
    password = os.environ.get("ADMIN_PASSWORD") or ""
    if not password:
        return False
    password_hash = generate_password_hash(password)
    row = db.execute(
        "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if row:
        db.execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
            (password_hash, row["id"]),
        )
    else:
        db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at)"
            " VALUES (?, ?, 1, ?)",
            (ADMIN_USERNAME, password_hash, iso(utcnow())),
        )
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_token(db: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, iso(utcnow())),
    )
    db.commit()
    return token


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    db = get_db()
    return db.execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token.strip()),),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return {"error": "authentication required"}, 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None or not user["is_admin"]:
            return {"error": "admin access required"}, 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------

def score_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


def fetch_score(db: sqlite3.Connection, score_id: int) -> sqlite3.Row | None:
    return db.execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, u.username"
        " FROM scores s JOIN users u ON u.id = s.player_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()


def compute_leaderboard(db: sqlite3.Connection, since: str | None = None) -> list[dict]:
    """Rank players by their best visible score (competition ranking)."""
    sql = (
        "SELECT s.id, s.player_id, s.score, s.achieved_at, u.username"
        " FROM scores s JOIN users u ON u.id = s.player_id"
        " WHERE s.is_hidden = 0"
    )
    params: list = []
    if since is not None:
        sql += " AND s.achieved_at >= ?"
        params.append(since)
    sql += " ORDER BY s.score DESC, s.achieved_at ASC, s.id ASC"
    best: dict[str, dict] = {}
    for row in db.execute(sql, params):
        best.setdefault(
            row["username"],
            {
                "player": row["username"],
                "score": row["score"],
                "achieved_at": row["achieved_at"],
            },
        )
    ranked: list[dict] = []
    previous_score = object()
    rank = 0
    for position, item in enumerate(best.values(), start=1):
        if item["score"] != previous_score:
            rank = position
            previous_score = item["score"]
        ranked.append({"rank": rank, **item})
    return ranked


def period_start(period: str) -> str | None:
    now = utcnow()
    if period == "today":
        start = datetime.combine(now.date(), time.min, tzinfo=timezone.utc)
        return iso(start)
    if period == "week":
        monday = now.date() - timedelta(days=now.weekday())
        start = datetime.combine(monday, time.min, tzinfo=timezone.utc)
        return iso(start)
    return None


def parse_int(raw: str | None) -> int | None:
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def parse_score_value(raw) -> int | float | None:
    if isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return raw if math.isfinite(raw) else None
    if isinstance(raw, str):
        text = raw.strip()
        try:
            return int(text)
        except ValueError:
            pass
        try:
            value = float(text)
        except ValueError:
            return None
        return value if math.isfinite(value) else None
    return None


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return {"error": "username and password are required"}, 400
    username = username.strip()
    if not username or not password:
        return {"error": "username and password are required"}, 400
    if username.lower() in RESERVED_USERNAMES:
        return {"error": "username is reserved"}, 400
    db = get_db()
    if db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone():
        return {"error": "username already taken"}, 409
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at)"
        " VALUES (?, ?, 0, ?)",
        (username, generate_password_hash(password), iso(utcnow())),
    )
    db.commit()
    user_id = cursor.lastrowid
    token = issue_token(db, user_id)
    return {"id": user_id, "username": username, "token": token}, 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return {"error": "username and password are required"}, 400
    username = username.strip()
    db = get_db()
    if username == ADMIN_USERNAME:
        admin_password = os.environ.get("ADMIN_PASSWORD") or ""
        if not admin_password:
            return {"error": "admin sign-in is disabled"}, 401
        if password != admin_password:
            return {"error": "invalid credentials"}, 401
        ensure_admin(db)
    else:
        user = db.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return {"error": "invalid credentials"}, 401
    user = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    token = issue_token(db, user["id"])
    return {"token": token}


# ---------------------------------------------------------------------------
# Score routes
# ---------------------------------------------------------------------------

@app.post("/api/scores")
@login_required
def create_score():
    body = json_body()
    score = parse_score_value(body.get("score"))
    if score is None:
        return {"error": "score must be a number"}, 400
    db = get_db()
    user = g.user
    achieved_at = iso(utcnow())
    cursor = db.execute(
        "INSERT INTO scores (player_id, score, achieved_at, is_hidden)"
        " VALUES (?, ?, ?, 0)",
        (user["id"], score, achieved_at),
    )
    db.commit()
    score_id = cursor.lastrowid
    row = fetch_score(db, score_id)
    previous_best = db.execute(
        "SELECT MAX(score) AS best FROM scores"
        " WHERE player_id = ? AND is_hidden = 0 AND id != ?",
        (user["id"], score_id),
    ).fetchone()["best"]
    personal_best = previous_best is None or score >= previous_best
    rank = next(
        (
            item["rank"]
            for item in compute_leaderboard(db)
            if item["player"] == user["username"]
        ),
        None,
    )
    return {
        **score_to_dict(row),
        "rank": rank,
        "personal_best": bool(personal_best),
    }, 201


@app.get("/api/scores")
@login_required
def list_my_scores():
    db = get_db()
    user = g.user
    rows = db.execute(
        "SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username"
        " FROM scores s JOIN users u ON u.id = s.player_id"
        " WHERE s.player_id = ?"
        " ORDER BY s.achieved_at DESC, s.id DESC",
        (user["id"],),
    ).fetchall()
    best = db.execute(
        "SELECT MAX(score) AS best FROM scores"
        " WHERE player_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]
    return {
        "items": [score_to_dict(row) for row in rows],
        "best_score": best,
    }


# ---------------------------------------------------------------------------
# Leaderboard
# ---------------------------------------------------------------------------

@app.get("/api/leaderboard")
def leaderboard():
    db = get_db()
    raw_period = (request.args.get("period") or "all").strip().lower()
    period = PERIOD_ALIASES.get(raw_period, "all")
    ranked = compute_leaderboard(db, period_start(period))
    player = (request.args.get("player") or "").strip().lower()
    if player:
        ranked = [item for item in ranked if player in item["player"].lower()]
    total = len(ranked)
    limit = parse_int(request.args.get("limit"))
    if limit is not None and limit >= 1:
        ranked = ranked[:limit]
    return {"items": ranked, "total": total}


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@app.get("/api/admin/scores")
@admin_required
def admin_list_scores():
    db = get_db()
    page = parse_int(request.args.get("page")) or 1
    page = max(page, 1)
    page_size = parse_int(request.args.get("page_size")) or 100
    page_size = max(page_size, 1)
    total = db.execute("SELECT COUNT(*) AS n FROM scores").fetchone()["n"]
    rows = db.execute(
        "SELECT s.id, s.score, s.achieved_at, s.is_hidden, u.username"
        " FROM scores s JOIN users u ON u.id = s.player_id"
        " ORDER BY s.achieved_at DESC, s.id DESC"
        " LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [score_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/admin/scores/<int:score_id>/toggle")
@admin_required
def admin_toggle_score(score_id: int):
    db = get_db()
    row = fetch_score(db, score_id)
    if row is None:
        return {"error": "score not found"}, 404
    hidden = 0 if row["is_hidden"] else 1
    db.execute("UPDATE scores SET is_hidden = ? WHERE id = ?", (hidden, score_id))
    db.commit()
    return score_to_dict(fetch_score(db, score_id))


# ---------------------------------------------------------------------------
# Health and frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return {"error": "not found"}, 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return {"error": "not found"}, 404
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return {"error": "not found"}, 404


@app.errorhandler(405)
def method_not_allowed(error):
    return {"error": "method not allowed"}, 405


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
