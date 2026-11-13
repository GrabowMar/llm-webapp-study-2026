import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, current_app, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
MAX_SCORE = 9_007_199_254_740_991

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1))
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    score INTEGER NOT NULL CHECK (score >= 0),
    achieved_at TEXT NOT NULL,
    is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1))
);
CREATE INDEX IF NOT EXISTS scores_player ON scores(user_id, achieved_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS scores_visible ON scores(is_hidden, achieved_at, score DESC);
CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
"""

RANKING = """
WITH player_scores AS (
    SELECT s.*, u.username AS player,
           ROW_NUMBER() OVER (
               PARTITION BY s.user_id
               ORDER BY s.score DESC, s.achieved_at ASC, s.id ASC
           ) AS best
    FROM scores s JOIN users u ON u.id = s.user_id
    WHERE s.is_hidden = 0 AND s.achieved_at >= ?
), ranked AS (
    SELECT user_id, player, score, achieved_at,
           ROW_NUMBER() OVER (ORDER BY score DESC, achieved_at ASC, id ASC) AS rank
    FROM player_scores WHERE best = 1
)
"""


def utc_now():
    return datetime.now(UTC)


def timestamp(value):
    return value.isoformat(timespec="microseconds").replace("+00:00", "Z")


def connect_database(path):
    connection = sqlite3.connect(path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def database():
    if "db" not in g:
        g.db = connect_database(current_app.config["DATABASE"])
    return g.db


def error(message, status=400):
    return {"error": message}, status


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None
    return body


def credentials(body):
    if body is None:
        return None
    username, password = body.get("username"), body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None
    username = username.strip()
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,32}", username):
        return None
    if not 1 <= len(password) <= 256:
        return None
    return username, password


def authenticated(admin=False):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            parts = request.headers.get("Authorization", "").split()
            if len(parts) != 2 or parts[0].lower() != "bearer":
                return error("Sign in to continue.", 401)
            token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
            user = (
                database()
                .execute(
                    "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id "
                    "WHERE s.token_hash = ? AND s.expires_at > ?",
                    (token_hash, timestamp(utc_now())),
                )
                .fetchone()
            )
            if user is None or (user["is_admin"] and not user["password_hash"]):
                return error("Your session is invalid or expired. Please sign in again.", 401)
            if admin and not user["is_admin"]:
                return error("Admin access is required.", 403)
            g.user = user
            g.token_hash = token_hash
            return view(*args, **kwargs)

        return wrapped

    return decorator


def score_object(row):
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": row["player"],
    }


def get_score(score_id):
    return (
        database()
        .execute(
            "SELECT s.*, u.username AS player FROM scores s "
            "JOIN users u ON u.id = s.user_id WHERE s.id = ?",
            (score_id,),
        )
        .fetchone()
    )


def integer_param(name, default, maximum):
    value = request.args.get(name, str(default))
    if not re.fullmatch(r"[0-9]{1,10}", value):
        return None
    number = int(value)
    return number if 1 <= number <= maximum else None


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(
        DATABASE=str(Path.cwd() / "data" / "leaderboard.sqlite3"),
        MAX_CONTENT_LENGTH=16 * 1024,
    )
    if config:
        app.config.update(config)

    db_path = Path(app.config["DATABASE"])
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = connect_database(str(db_path))
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(SCHEMA)
        db.execute("BEGIN IMMEDIATE")
        admin_password = os.environ.get("ADMIN_PASSWORD", "")
        admin = db.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
        if admin is None:
            db.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                (generate_password_hash(admin_password) if admin_password else "",),
            )
        elif not admin_password or not check_password_hash(admin["password_hash"], admin_password):
            db.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
            db.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (generate_password_hash(admin_password) if admin_password else "", admin["id"]),
            )
        db.commit()
    finally:
        db.close()

    @app.teardown_appcontext
    def close_database(exception=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.errorhandler(HTTPException)
    def handle_http_error(exception):
        if request.path.startswith("/api"):
            return error(exception.description, exception.code)
        return exception

    @app.after_request
    def response_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        account = credentials(json_body())
        if account is None:
            return error(
                "Use a 1–32 character username (letters, numbers, _, . or -) and a password of 1–256 characters."
            )
        username, password = account
        if username.lower() == "admin":
            return error("This username is reserved.", 409)
        db = database()
        try:
            db.execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return error("That username is already taken.", 409)
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        account = credentials(json_body())
        if account is None:
            return error("Enter a valid username and password.")
        username, password = account
        db = database()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        password_hash = (
            user["password_hash"]
            if user and user["password_hash"]
            else app.config["DUMMY_PASSWORD_HASH"]
        )
        valid_password = check_password_hash(password_hash, password)
        if user is None or not user["password_hash"] or not valid_password:
            return error("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (timestamp(utc_now()),))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (
                hashlib.sha256(token.encode()).hexdigest(),
                user["id"],
                timestamp(utc_now() + timedelta(days=30)),
            ),
        )
        db.commit()
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated()
    def me():
        return {"username": g.user["username"], "is_admin": bool(g.user["is_admin"])}

    @app.post("/api/auth/logout")
    @authenticated()
    def logout():
        database().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        database().commit()
        return {"status": "ok"}

    @app.get("/api/leaderboard")
    def leaderboard():
        period = request.args.get("period", "all")
        now = utc_now()
        day = now.replace(hour=0, minute=0, second=0, microsecond=0)
        if period in ("all", "all_time", "all-time"):
            cutoff = ""
        elif period in ("week", "weekly"):
            cutoff = timestamp(day - timedelta(days=day.weekday()))
        elif period in ("today", "day", "daily"):
            cutoff = timestamp(day)
        else:
            return error("Period must be all, week or today.")
        limit = integer_param("limit", 50, 1000)
        if limit is None:
            return error("Limit must be an integer between 1 and 1000.")
        player = request.args.get("player", "").strip()
        if len(player) > 32:
            return error("Player search must be 32 characters or fewer.")
        db = database()
        items = db.execute(
            RANKING + "SELECT rank, player, score, achieved_at FROM ranked "
            "WHERE instr(lower(player), lower(?)) > 0 ORDER BY rank LIMIT ?",
            (cutoff, player, limit),
        ).fetchall()
        total = db.execute(
            RANKING + "SELECT COUNT(*) FROM ranked WHERE instr(lower(player), lower(?)) > 0",
            (cutoff, player),
        ).fetchone()[0]
        return {"items": [dict(row) for row in items], "total": total}

    @app.post("/api/scores")
    @authenticated()
    def submit_score():
        body = json_body()
        value = body.get("score") if body is not None else None
        if type(value) is not int or not 0 <= value <= MAX_SCORE:
            return error(f"Score must be a whole number between 0 and {MAX_SCORE}.")
        db = database()
        db.execute("BEGIN IMMEDIATE")
        previous_best = db.execute(
            "SELECT MAX(score) FROM scores WHERE user_id = ? AND is_hidden = 0", (g.user["id"],)
        ).fetchone()[0]
        cursor = db.execute(
            "INSERT INTO scores (user_id, score, achieved_at) VALUES (?, ?, ?)",
            (g.user["id"], value, timestamp(utc_now())),
        )
        result = score_object(get_score(cursor.lastrowid))
        result["rank"] = db.execute(
            RANKING + "SELECT rank FROM ranked WHERE user_id = ?", ("", g.user["id"])
        ).fetchone()[0]
        result["personal_best"] = previous_best is None or value > previous_best
        db.commit()
        return result, 201

    @app.get("/api/scores")
    @authenticated()
    def personal_scores():
        db = database()
        items = db.execute(
            "SELECT s.*, u.username AS player FROM scores s JOIN users u ON u.id = s.user_id "
            "WHERE s.user_id = ? ORDER BY s.achieved_at DESC, s.id DESC",
            (g.user["id"],),
        ).fetchall()
        best = db.execute(
            "SELECT MAX(score) FROM scores WHERE user_id = ? AND is_hidden = 0", (g.user["id"],)
        ).fetchone()[0]
        return {"items": [score_object(row) for row in items], "best_score": best}

    @app.get("/api/admin/scores")
    @authenticated(admin=True)
    def admin_scores():
        page = integer_param("page", 1, 2_147_483_647)
        page_size = integer_param("page_size", 50, 100)
        if page is None or page_size is None:
            return error("Page must be a positive integer; page_size must be between 1 and 100.")
        db = database()
        items = db.execute(
            "SELECT s.*, u.username AS player FROM scores s JOIN users u ON u.id = s.user_id "
            "ORDER BY s.achieved_at DESC, s.id DESC LIMIT ? OFFSET ?",
            (page_size, (page - 1) * page_size),
        ).fetchall()
        total = db.execute("SELECT COUNT(*) FROM scores").fetchone()[0]
        return {
            "items": [score_object(row) for row in items],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @app.post("/api/admin/scores/<int:score_id>/toggle")
    @authenticated(admin=True)
    def toggle_score(score_id):
        db = database()
        db.execute("BEGIN IMMEDIATE")
        cursor = db.execute("UPDATE scores SET is_hidden = 1 - is_hidden WHERE id = ?", (score_id,))
        if cursor.rowcount == 0:
            db.rollback()
            return error("Score not found.", 404)
        result = score_object(get_score(score_id))
        db.commit()
        return result

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        if Path(path).suffix:
            return error("File not found.", 404)
        return send_from_directory(DIST, "index.html")

    app.config["DUMMY_PASSWORD_HASH"] = generate_password_hash(secrets.token_urlsafe(32))
    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
