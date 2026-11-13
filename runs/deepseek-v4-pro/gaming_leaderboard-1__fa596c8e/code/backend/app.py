"""Flask entry point for the game leaderboard."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "leaderboard.db"

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            player_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (player_id) REFERENCES players(id)
        );
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            score INTEGER NOT NULL,
            achieved_at TEXT NOT NULL,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (player_id) REFERENCES players(id)
        );
        CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
        CREATE INDEX IF NOT EXISTS idx_scores_hidden ON scores(is_hidden);
        """
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Password / tokens
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000
    )
    return secrets.compare_digest(check.hex(), digest)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def current_player():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    row = get_db().execute(
        "SELECT p.* FROM tokens t JOIN players p ON p.id = t.player_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_player(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        player = current_player()
        if player is None:
            return jsonify({"error": "authentication required"}), 401
        g.player = player
        return f(*args, **kwargs)

    return wrapper


def require_admin(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        player = current_player()
        if player is None:
            return jsonify({"error": "authentication required"}), 401
        if not player["is_admin"]:
            return jsonify({"error": "admin access required"}), 403
        g.player = player
        return f(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Leaderboard / ranking
# ---------------------------------------------------------------------------

PERIODS = {"all_time", "all", "all-time", "week", "today"}


def normalize_period(period):
    if not period:
        return "all_time"
    p = period.strip().lower().replace("-", "_")
    if p in ("all", "all_time", "all-time"):
        return "all_time"
    if p == "week":
        return "week"
    if p == "today":
        return "today"
    return "all_time"


def period_cutoff(period):
    now = datetime.now(timezone.utc)
    if period == "today":
        return now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == "week":
        monday = now - timedelta(days=now.weekday())
        return monday.replace(hour=0, minute=0, second=0, microsecond=0)
    return None


def visible_scores():
    return get_db().execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.is_hidden = 0 "
        "ORDER BY s.score DESC, s.achieved_at ASC, s.id ASC"
    ).fetchall()


def build_ranking(period="all_time", player_filter=None):
    cutoff = period_cutoff(period)
    ranking = []
    seen = set()
    for row in visible_scores():
        if cutoff is not None and parse_dt(row["achieved_at"]) < cutoff:
            continue
        if row["player_id"] in seen:
            continue
        seen.add(row["player_id"])
        ranking.append(
            {
                "player_id": row["player_id"],
                "username": row["username"],
                "score": row["score"],
                "achieved_at": row["achieved_at"],
            }
        )
    if player_filter:
        needle = player_filter.strip().lower()
        if needle:
            ranking = [
                r for r in ranking if needle in r["username"].lower()
            ]
    for i, entry in enumerate(ranking):
        entry["rank"] = i + 1
    return ranking


def player_rank(player_id):
    ranking = build_ranking("all_time")
    for entry in ranking:
        if entry["player_id"] == player_id:
            return entry["rank"]
    return None


def best_visible_score(player_id):
    row = get_db().execute(
        "SELECT MAX(score) AS best FROM scores WHERE player_id = ? "
        "AND is_hidden = 0",
        (player_id,),
    ).fetchone()
    return row["best"]


def score_to_dict(row):
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    username = username.strip()
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if username.lower() == "admin":
        return jsonify({"error": "username already taken"}), 409

    db = get_db()
    exists = db.execute(
        "SELECT id FROM players WHERE username = ?", (username,)
    ).fetchone()
    if exists:
        return jsonify({"error": "username already taken"}), 409

    cur = db.execute(
        "INSERT INTO players (username, password_hash, is_admin, created_at) "
        "VALUES (?, ?, 0, ?)",
        (username, hash_password(password), utcnow()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "invalid credentials"}), 401
    username = username.strip()

    db = get_db()
    player = db.execute(
        "SELECT * FROM players WHERE username = ?", (username,)
    ).fetchone()
    if player is None or not verify_password(password, player["password_hash"]):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, player_id, created_at) VALUES (?, ?, ?)",
        (token, player["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/leaderboard")
def leaderboard():
    period = normalize_period(request.args.get("period"))
    player_filter = request.args.get("player")
    ranking = build_ranking(period, player_filter)

    limit = request.args.get("limit")
    items = ranking
    if limit is not None:
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = None
        if limit is not None and limit > 0:
            items = ranking[:limit]

    payload = [
        {
            "rank": entry["rank"],
            "player": entry["username"],
            "score": entry["score"],
            "achieved_at": entry["achieved_at"],
        }
        for entry in items
    ]
    return jsonify({"items": payload, "total": len(ranking)})


@app.post("/api/scores")
@require_player
def submit_score():
    data = request.get_json(silent=True) or {}
    raw = data.get("score")
    if isinstance(raw, bool) or not isinstance(raw, (int, float)):
        return jsonify({"error": "score must be a number"}), 400
    try:
        score = int(raw)
    except (TypeError, ValueError):
        return jsonify({"error": "score must be a number"}), 400

    player = g.player
    prev_best = best_visible_score(player["id"])
    achieved_at = utcnow()
    db = get_db()
    cur = db.execute(
        "INSERT INTO scores (player_id, score, achieved_at, is_hidden) "
        "VALUES (?, ?, ?, 0)",
        (player["id"], score, achieved_at),
    )
    db.commit()

    row = db.execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.id = ?",
        (cur.lastrowid,),
    ).fetchone()

    result = score_to_dict(row)
    result["rank"] = player_rank(player["id"])
    result["personal_best"] = prev_best is None or score > prev_best
    return jsonify(result), 201


@app.get("/api/scores")
@require_player
def list_scores():
    player = g.player
    rows = get_db().execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.player_id = ? ORDER BY s.id DESC",
        (player["id"],),
    ).fetchall()
    items = [score_to_dict(r) for r in rows]
    best = best_visible_score(player["id"])
    return jsonify({"items": items, "best_score": best})


@app.get("/api/admin/scores")
@require_admin
def admin_scores():
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page = max(page, 1)
    page_size = max(page_size, 1)

    db = get_db()
    total = db.execute("SELECT COUNT(*) AS c FROM scores").fetchone()["c"]
    offset = (page - 1) * page_size
    rows = db.execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "ORDER BY s.id DESC LIMIT ? OFFSET ?",
        (page_size, offset),
    ).fetchall()
    return jsonify(
        {
            "items": [score_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/scores/<int:score_id>/toggle")
@require_admin
def toggle_score(score_id):
    db = get_db()
    row = db.execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "score not found"}), 404
    new_hidden = 0 if row["is_hidden"] else 1
    db.execute(
        "UPDATE scores SET is_hidden = ? WHERE id = ?", (new_hidden, score_id)
    )
    db.commit()
    row = db.execute(
        "SELECT s.id, s.player_id, s.score, s.achieved_at, s.is_hidden, "
        "p.username AS username "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return jsonify(score_to_dict(row))


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

def seed_admin():
    password = os.environ.get("ADMIN_PASSWORD", "")
    if not password:
        return
    db = sqlite3.connect(DB_PATH)
    existing = db.execute(
        "SELECT id FROM players WHERE username = 'admin'"
    ).fetchone()
    pw_hash = hash_password(password)
    if existing:
        db.execute(
            "UPDATE players SET password_hash = ?, is_admin = 1 "
            "WHERE username = 'admin'",
            (pw_hash,),
        )
    else:
        db.execute(
            "INSERT INTO players (username, password_hash, is_admin, created_at) "
            "VALUES ('admin', ?, 1, ?)",
            (pw_hash, utcnow()),
        )
    db.commit()
    db.close()


init_db()
seed_admin()
