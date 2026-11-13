"""Game leaderboard API and frontend server."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "leaderboard.db"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "").strip()

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp(value: datetime | None = None) -> str:
    value = value or utc_now()
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def cutoff_for_period(period: str | None) -> str | None:
    key = (period or "all").strip().lower().replace("_", "-")
    if key in {"", "all", "all-time", "alltime"}:
        return None
    now = utc_now()
    if key in {"today", "day", "daily"}:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif key in {"week", "weekly", "this-week"}:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(
            days=now.weekday()
        )
    else:
        raise ValueError("invalid period")
    return start.strftime("%Y-%m-%d %H:%M:%S")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_error: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    try:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                score INTEGER NOT NULL,
                achieved_at TEXT NOT NULL,
                is_hidden INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS scores_user_idx ON scores(user_id);
            CREATE INDEX IF NOT EXISTS scores_visible_idx ON scores(is_hidden, score);
            """
        )
        admin = connection.execute(
            "SELECT id FROM users WHERE lower(username) = 'admin'"
        ).fetchone()
        if ADMIN_PASSWORD:
            password_hash = generate_password_hash(ADMIN_PASSWORD)
            if admin is None:
                connection.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at) "
                    "VALUES (?, ?, 1, ?)",
                    ("admin", password_hash, timestamp()),
                )
            else:
                connection.execute(
                    "UPDATE users SET username = 'admin', password_hash = ?, is_admin = 1 "
                    "WHERE id = ?",
                    (password_hash, admin["id"]),
                )
        elif admin is not None:
            # No configured password: make sure any previously configured admin
            # credentials and sessions can no longer be used.
            connection.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (generate_password_hash(secrets.token_urlsafe(32)), admin["id"]),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
        connection.commit()
    finally:
        connection.close()


def json_error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def request_json() -> dict[str, Any] | None:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return None
    return payload


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return token.strip()


def current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if token is None:
        return None
    return get_db().execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()


def require_user() -> sqlite3.Row | None:
    return current_user()


def admin_guard():
    """Return (user, None) for an admin, otherwise (None, error response)."""
    user = current_user()
    if user is None:
        return None, json_error("authentication required", 401)
    if not user["is_admin"]:
        return None, json_error("admin access required", 403)
    return user, None


def parse_score(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        try:
            return int(text)
        except ValueError:
            return None
    return None


def score_dict(row: sqlite3.Row, **extra: Any) -> dict[str, Any]:
    item = {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["username"],
    }
    item.update(extra)
    return item


def leaderboard_rows(period: str | None) -> list[sqlite3.Row]:
    cutoff = cutoff_for_period(period)
    sql = [
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username",
        "FROM scores s JOIN users u ON u.id = s.user_id",
        "WHERE s.is_hidden = 0",
    ]
    params: list[Any] = []
    if cutoff is not None:
        sql.append("AND datetime(s.achieved_at) >= datetime(?)")
        params.append(cutoff)
    sql.append("ORDER BY s.score DESC, datetime(s.achieved_at) ASC, s.id ASC")
    rows = get_db().execute(" ".join(sql), params).fetchall()

    best_by_user: list[sqlite3.Row] = []
    seen: set[int] = set()
    for row in rows:
        if row["user_id"] in seen:
            continue
        seen.add(row["user_id"])
        best_by_user.append(row)
    return best_by_user


def compose_leaderboard(period: str | None, player: str | None, limit: int | None):
    best = leaderboard_rows(period)
    ranked = [
        {
            "rank": index + 1,
            "player": row["username"],
            "score": row["score"],
            "achieved_at": row["achieved_at"],
        }
        for index, row in enumerate(best)
    ]
    if player:
        needle = player.casefold()
        ranked = [item for item in ranked if needle in item["player"].casefold()]
    total = len(ranked)
    if limit is not None:
        ranked = ranked[:limit]
    return ranked, total


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = request_json()
    if payload is None:
        return json_error("invalid JSON body")
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("username is required")
    if not isinstance(password, str) or not password:
        return json_error("password is required")
    username = username.strip()
    if username.lower() == "admin":
        return json_error("username is reserved", 409)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return json_error("username already taken", 409)

    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) "
            "VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), timestamp()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return json_error("username already taken", 409)

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = request_json()
    if payload is None:
        return json_error("invalid JSON body")
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("username and password are required")
    username = username.strip()

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("invalid credentials", 401)
    if user["is_admin"] and not ADMIN_PASSWORD:
        return json_error("admin sign-in is disabled", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], timestamp()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return json_error("authentication required", 401)
    return jsonify({"username": user["username"], "is_admin": bool(user["is_admin"])})


@app.post("/api/auth/logout")
def logout():
    token = bearer_token()
    if token is not None:
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"})


@app.get("/api/leaderboard")
def leaderboard():
    period = request.args.get("period", "all")
    player = request.args.get("player")
    if player is not None:
        player = player.strip() or None
    limit_value = request.args.get("limit")
    limit: int | None = None
    if limit_value is not None and limit_value != "":
        try:
            limit = int(limit_value)
        except ValueError:
            return json_error("limit must be an integer")
        if limit < 0:
            return json_error("limit must be non-negative")
    try:
        items, total = compose_leaderboard(period, player, limit)
    except ValueError:
        return json_error("invalid period")
    return jsonify({"items": items, "total": total})


@app.post("/api/scores")
def create_score():
    user = require_user()
    if user is None:
        return json_error("authentication required", 401)

    payload = request_json()
    if payload is None:
        return json_error("invalid JSON body")
    score = parse_score(payload.get("score"))
    if score is None:
        return json_error("score must be an integer")

    db = get_db()
    existing_best = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]
    cursor = db.execute(
        "INSERT INTO scores (user_id, score, achieved_at, is_hidden) VALUES (?, ?, ?, 0)",
        (user["id"], score, timestamp()),
    )
    db.commit()
    row = db.execute(
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    personal_best = existing_best is None or score >= existing_best
    items, _total = compose_leaderboard("all", None, None)
    rank = next(
        (item["rank"] for item in items if item["player"] == user["username"]),
        None,
    )
    return jsonify(score_dict(row, rank=rank, personal_best=personal_best)), 201


@app.get("/api/scores")
def my_scores():
    user = require_user()
    if user is None:
        return json_error("authentication required", 401)

    db = get_db()
    rows = db.execute(
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id "
        "WHERE s.user_id = ? "
        "ORDER BY datetime(s.achieved_at) DESC, s.id DESC",
        (user["id"],),
    ).fetchall()
    best = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE user_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]
    return jsonify(
        {"items": [score_dict(row) for row in rows], "best_score": best}
    )


@app.get("/api/admin/scores")
def admin_scores():
    _user, error = admin_guard()
    if error is not None:
        return error

    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        return json_error("page and page_size must be integers")
    page = max(page, 1)
    if page_size < 1:
        return json_error("page_size must be positive")
    page_size = min(page_size, 200)

    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM scores").fetchone()["n"]
    rows = db.execute(
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id "
        "ORDER BY datetime(s.achieved_at) DESC, s.id DESC "
        "LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [score_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/scores/<int:score_id>/toggle")
def toggle_score(score_id: int):
    _user, error = admin_guard()
    if error is not None:
        return error

    db = get_db()
    row = db.execute(
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    if row is None:
        return json_error("score not found", 404)

    db.execute(
        "UPDATE scores SET is_hidden = ? WHERE id = ?",
        (0 if row["is_hidden"] else 1, score_id),
    )
    db.commit()
    updated = db.execute(
        "SELECT s.id, s.user_id, s.score, s.achieved_at, s.is_hidden, u.username "
        "FROM scores s JOIN users u ON u.id = s.user_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return jsonify(score_dict(updated))


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
