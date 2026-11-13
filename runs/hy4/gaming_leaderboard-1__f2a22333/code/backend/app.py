"""Game leaderboard Flask application."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = BASE / "data"
DB_PATH = DATA_DIR / "leaderboard.db"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,32}$")
PERIODS = {"all": None, "week": 7, "today": 1}
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(DB_PATH, timeout=30)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")
        g.db.execute("PRAGMA busy_timeout=30000")
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    try:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA busy_timeout=30000")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token_hash TEXT PRIMARY KEY,
                player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                achieved_at TEXT NOT NULL,
                is_hidden INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_scores_visible
                ON scores(is_hidden, achieved_at, score);
            CREATE INDEX IF NOT EXISTS idx_scores_player
                ON scores(player_id, achieved_at);
            """
        )
        db.execute(
            "INSERT OR IGNORE INTO players (username, password_hash, is_admin) "
            "VALUES ('admin', '', 1)"
        )
        db.execute(
            "UPDATE players SET password_hash = ?, is_admin = 1 "
            "WHERE username = 'admin'",
            (generate_password_hash(ADMIN_PASSWORD) if ADMIN_PASSWORD else "",),
        )
        db.commit()
    finally:
        db.close()


with app.app_context():
    init_db()


def json_error(message, status):
    return jsonify({"error": message}), status


def body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def token_hash_for(raw):
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def current_player():
    if hasattr(g, "player"):
        return g.player
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        g.player = None
        return None
    raw = auth[7:].strip()
    if not raw:
        g.player = None
        return None
    row = get_db().execute(
        "SELECT p.* FROM tokens t JOIN players p ON p.id = t.player_id "
        "WHERE t.token_hash = ?",
        (token_hash_for(raw),),
    ).fetchone()
    g.player = row
    return row


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        player = current_player()
        if player is None:
            return json_error("authentication required", 401)
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    @require_auth
    def wrapper(*args, **kwargs):
        if not current_player()["is_admin"]:
            return json_error("admin access required", 403)
        return fn(*args, **kwargs)

    return wrapper


def serialize_score(row):
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }


def period_start(period):
    days = PERIODS[period]
    if days is None:
        return None
    now = datetime.now(timezone.utc)
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    return start.isoformat(timespec="microseconds")


def ranked_leaderboard(db, period, limit, player_filter):
    """Return all ranked rows (one per player) for a period, ordered by rank."""
    params = []
    where = ["s.is_hidden = 0"]
    start = period_start(period)
    if start is not None:
        where.append("s.achieved_at >= ?")
        params.append(start)

    # One best visible score per player.
    query = (
        "SELECT p.username AS player, s.id, s.score, s.achieved_at "
        "FROM scores s JOIN players p ON p.id = s.player_id "
        f"WHERE {' AND '.join(where)} AND s.score = ("
        "SELECT MAX(s2.score) FROM scores s2 WHERE s2.player_id = s.player_id "
        "AND s2.is_hidden = 0"
        + (" AND s2.achieved_at >= ?" if start is not None else "")
        + ") ORDER BY s.achieved_at ASC, s.id ASC"
    )
    query_params = params + (params if start is not None else [])
    best_rows = db.execute(query, query_params).fetchall()

    by_name = {}
    for row in best_rows:
        name = row["player"]
        if name not in by_name:
            by_name[name] = (row["score"], row["achieved_at"])

    ranked = [
        {"rank": i + 1, "player": name, "score": val[0], "achieved_at": val[1]}
        for i, (name, val) in enumerate(
            sorted(by_name.items(), key=lambda kv: (-kv[1][0], kv[1][1], kv[0]))
        )
    ]
    if player_filter:
        needle = player_filter.lower()
        ranked = [r for r in ranked if needle in r["player"].lower()]
    total = len(ranked)
    if limit is not None:
        ranked = ranked[:limit]
    return ranked, total


def safe_int(value, default=None, minimum=None, maximum=None):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None and n < minimum:
        return default
    if maximum is not None and n > maximum:
        return default
    return n


@app.post("/api/auth/register")
def register():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        return json_error(
            "username must be 1-32 characters: letters, digits, _, ., -", 400
        )
    if username.lower() == "admin":
        return json_error("username is reserved", 409)
    if not isinstance(password, str) or len(password) < 1:
        return json_error("password is required", 400)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO players (username, password_hash, is_admin) VALUES (?, ?, 0)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return json_error("username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("username and password are required", 400)
    row = get_db().execute(
        "SELECT * FROM players WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if row is None or not row["password_hash"] or not check_password_hash(
        row["password_hash"], password
    ):
        return json_error("invalid credentials", 401)
    raw = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token_hash, player_id, created_at) VALUES (?, ?, ?)",
        (token_hash_for(raw), row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": raw})


@app.get("/api/leaderboard")
def leaderboard():
    period = request.args.get("period", "all")
    if period not in PERIODS:
        return json_error("period must be all, week or today", 400)
    limit = safe_int(request.args.get("limit"), None, minimum=1)
    player_filter = (request.args.get("player") or "").strip()
    items, total = ranked_leaderboard(get_db(), period, limit, player_filter)
    return jsonify({"items": items, "total": total})


@app.post("/api/scores")
@require_auth
def create_score():
    data = body()
    score = data.get("score")
    if isinstance(score, bool) or not isinstance(score, int) or score < 0:
        return json_error("score must be a non-negative integer", 400)
    player = current_player()
    achieved_at = now_iso()
    db = get_db()
    cur = db.execute(
        "INSERT INTO scores (player_id, score, achieved_at, is_hidden) "
        "VALUES (?, ?, ?, 0)",
        (player["id"], score, achieved_at),
    )
    db.commit()
    previous_best = db.execute(
        "SELECT MAX(score) AS best FROM scores "
        "WHERE player_id = ? AND is_hidden = 0 AND id != ?",
        (player["id"], cur.lastrowid),
    ).fetchone()["best"]
    row = db.execute(
        "SELECT s.*, p.username FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    result = serialize_score(row)

    ranked, _ = ranked_leaderboard(db, "all", None, None)
    rank = next(
        (r["rank"] for r in ranked if r["player"] == player["username"]),
        len(ranked) + 1,
    )
    result["rank"] = rank
    result["personal_best"] = previous_best is None or score > previous_best
    return jsonify(result), 201


@app.get("/api/scores")
@require_auth
def my_scores():
    player = current_player()
    db = get_db()
    rows = db.execute(
        "SELECT s.*, p.username FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.player_id = ? ORDER BY s.achieved_at DESC, s.id DESC",
        (player["id"],),
    ).fetchall()
    best = db.execute(
        "SELECT MAX(score) AS best FROM scores "
        "WHERE player_id = ? AND is_hidden = 0",
        (player["id"],),
    ).fetchone()["best"]
    return jsonify(
        {"items": [serialize_score(r) for r in rows], "best_score": best}
    )


@app.get("/api/admin/scores")
@require_admin
def admin_scores():
    page = safe_int(request.args.get("page"), 1, minimum=1)
    page_size = safe_int(request.args.get("page_size"), 20, minimum=1, maximum=100)
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM scores").fetchone()["n"]
    rows = db.execute(
        "SELECT s.*, p.username FROM scores s JOIN players p ON p.id = s.player_id "
        "ORDER BY s.achieved_at DESC, s.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_score(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/scores/<int:score_id>/toggle")
@require_admin
def toggle_score(score_id):
    db = get_db()
    row = db.execute("SELECT * FROM scores WHERE id = ?", (score_id,)).fetchone()
    if row is None:
        return json_error("score not found", 404)
    db.execute(
        "UPDATE scores SET is_hidden = ? WHERE id = ?",
        (0 if row["is_hidden"] else 1, score_id),
    )
    db.commit()
    updated = db.execute(
        "SELECT s.*, p.username FROM scores s JOIN players p ON p.id = s.player_id "
        "WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return jsonify(serialize_score(updated))


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
