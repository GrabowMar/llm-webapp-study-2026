"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.security import check_password_hash, generate_password_hash

from seed import SEED_QUESTIONS

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "quiz.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
OPTIONS = ("A", "B", "C", "D")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    position INTEGER NOT NULL,
    selected TEXT NOT NULL
);
"""


def init_db() -> None:
    """Create the schema, seed questions and mirror the admin account."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    try:
        db.executescript(SCHEMA)
        count = db.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"]
        if count == 0:
            db.executemany(
                "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                SEED_QUESTIONS,
            )
        if ADMIN_PASSWORD:
            pw_hash = generate_password_hash(ADMIN_PASSWORD)
            row = db.execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if row is None:
                db.execute(
                    "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                    (ADMIN_USERNAME, pw_hash),
                )
            else:
                db.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (pw_hash, row["id"]),
                )
        db.commit()
    finally:
        db.close()


init_db()

app = Flask(__name__, static_folder=None)


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _error(message: str, status: int):
    return jsonify({"error": message}), status


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exception) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def current_user():
    """Return the signed-in user row, or None when the token is missing/invalid."""
    if "user" in g:
        return g.user
    user = None
    header = request.headers.get("Authorization", "")
    if header[:7].lower() == "bearer ":
        token = header[7:].strip()
        if token:
            user = get_db().execute(
                "SELECT u.id, u.username, u.is_admin FROM tokens t"
                " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (token,),
            ).fetchone()
    g.user = user
    return user


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return _error("authentication required", 401)
        return view(*args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return _error("authentication required", 401)
        if not user["is_admin"]:
            return _error("admin access required", 403)
        return view(*args, **kwargs)

    return wrapped


def _score_value(correct: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round(correct * 100.0 / total, 1)


def _answer_payload(question: sqlite3.Row, selected: str) -> dict:
    return {
        "question_id": question["id"],
        "text": question["text"],
        "option_a": question["option_a"],
        "option_b": question["option_b"],
        "option_c": question["option_c"],
        "option_d": question["option_d"],
        "selected": selected,
        "correct_option": question["correct_option"],
        "is_correct": selected == question["correct_option"],
    }


def _attempt_payload(
    attempt_id, correct: int, total: int, submitted_at: str, answers: list
) -> dict:
    return {
        "id": attempt_id,
        "score": _score_value(correct, total),
        "correct": correct,
        "total_questions": total,
        "submitted_at": submitted_at,
        "answers": answers,
    }


def _load_attempt(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    answers = [
        _answer_payload(r, r["selected"])
        for r in db.execute(
            "SELECT q.*, aq.selected FROM attempt_answers aq"
            " JOIN questions q ON q.id = aq.question_id"
            " WHERE aq.attempt_id = ? ORDER BY aq.position",
            (row["id"],),
        ).fetchall()
    ]
    return _attempt_payload(
        row["id"], row["correct"], row["total_questions"], row["submitted_at"], answers
    )


# --------------------------------------------------------------------- health


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


# ----------------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return _error("username is required", 400)
    if not isinstance(password, str) or not password:
        return _error("password is required", 400)
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        return _error("username is reserved", 409)
    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return _error("username already taken", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return _error("username is required", 400)
    if not isinstance(password, str) or not password:
        return _error("password is required", 400)
    username = username.strip()
    if username == ADMIN_USERNAME and not ADMIN_PASSWORD:
        return _error("admin sign-in is disabled", 401)
    user = get_db().execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return _error("invalid username or password", 401)
    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], _now()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return jsonify({"username": user["username"], "is_admin": bool(user["is_admin"])})


# ----------------------------------------------------------------------- quiz


@app.get("/api/quiz")
def quiz():
    raw = request.args.get("count", "5")
    try:
        count = int(raw)
    except (TypeError, ValueError):
        return _error("count must be an integer", 400)
    if count < 1 or count > 100:
        return _error("count must be between 1 and 100", 400)
    rows = get_db().execute(
        "SELECT id, text, option_a, option_b, option_c, option_d FROM questions"
        " WHERE active = 1 ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    return jsonify({"items": [dict(row) for row in rows]})


# ------------------------------------------------------------------- attempts


@app.post("/api/attempts")
def create_attempt():
    data = request.get_json(silent=True) or {}
    answers = data.get("answers")
    if not isinstance(answers, list):
        return _error("answers must be a list", 400)
    db = get_db()
    review = []
    for index, item in enumerate(answers):
        if not isinstance(item, dict):
            return _error(f"answers[{index}] must be an object", 400)
        question_id = item.get("question_id")
        selected = item.get("selected")
        if isinstance(question_id, bool) or not isinstance(question_id, int):
            return _error(f"answers[{index}].question_id must be an integer", 400)
        if not isinstance(selected, str) or selected.strip().upper() not in OPTIONS:
            return _error(
                f"answers[{index}].selected must be one of A, B, C, D", 400
            )
        question = db.execute(
            "SELECT * FROM questions WHERE id = ?", (question_id,)
        ).fetchone()
        if question is None:
            return _error(f"answers[{index}].question_id does not exist", 400)
        review.append(_answer_payload(question, selected.strip().upper()))
    correct = sum(1 for answer in review if answer["is_correct"])
    total = len(review)
    submitted_at = _now()
    attempt_id = None
    user = current_user()
    if user is not None:
        cursor = db.execute(
            "INSERT INTO attempts (user_id, correct, total_questions, submitted_at)"
            " VALUES (?, ?, ?, ?)",
            (user["id"], correct, total, submitted_at),
        )
        attempt_id = cursor.lastrowid
        db.executemany(
            "INSERT INTO attempt_answers (attempt_id, question_id, position, selected)"
            " VALUES (?, ?, ?, ?)",
            [
                (attempt_id, answer["question_id"], position, answer["selected"])
                for position, answer in enumerate(review)
            ],
        )
        db.commit()
    return (
        jsonify(
            _attempt_payload(attempt_id, correct, total, submitted_at, review)
        ),
        200,
    )


@app.get("/api/attempts")
@login_required
def list_attempts():
    user = current_user()
    rows = get_db().execute(
        "SELECT * FROM attempts WHERE user_id = ?"
        " ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    db = get_db()
    return jsonify({"items": [_load_attempt(db, row) for row in rows]})


@app.get("/api/attempts/<int:attempt_id>")
@login_required
def get_attempt(attempt_id: int):
    user = current_user()
    row = get_db().execute(
        "SELECT * FROM attempts WHERE id = ?", (attempt_id,)
    ).fetchone()
    if row is None or row["user_id"] != user["id"]:
        return _error("attempt not found", 404)
    return jsonify(_load_attempt(get_db(), row))


# ---------------------------------------------------------------------- admin


@app.post("/api/admin/questions")
@admin_required
def create_question():
    data = request.get_json(silent=True) or {}
    values = {}
    for field in ("text", "option_a", "option_b", "option_c", "option_d"):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            return _error(f"{field} is required", 400)
        values[field] = value.strip()
    correct = data.get("correct_option")
    if not isinstance(correct, str) or correct.strip().upper() not in OPTIONS:
        return _error("correct_option must be one of A, B, C, D", 400)
    values["correct_option"] = correct.strip().upper()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            values["text"],
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
            values["correct_option"],
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT id, text, option_a, option_b, option_c, option_d, correct_option"
        " FROM questions WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(dict(row)), 201


@app.get("/api/admin/questions")
@admin_required
def list_questions():
    raw_page = request.args.get("page", "1")
    raw_size = request.args.get("page_size", "10")
    try:
        page = int(raw_page)
    except ValueError:
        return _error("page must be an integer", 400)
    try:
        page_size = int(raw_size)
    except ValueError:
        return _error("page_size must be an integer", 400)
    if page < 1:
        return _error("page must be at least 1", 400)
    if page_size < 1 or page_size > 100:
        return _error("page_size must be between 1 and 100", 400)
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"]
    rows = db.execute(
        "SELECT id, text, option_a, option_b, option_c, option_d, correct_option"
        " FROM questions ORDER BY id ASC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


# ------------------------------------------------------------------ frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return _error("not found", 404)
    try:
        return send_from_directory(DIST, path)
    except NotFound:
        pass
    try:
        return send_from_directory(DIST, "index.html")
    except NotFound:
        return _error("frontend not built", 404)


@app.errorhandler(404)
def not_found(_error_obj):
    if request.path.startswith("/api/"):
        return _error("not found", 404)
    return "Not Found", 404


@app.errorhandler(405)
def method_not_allowed(_error_obj):
    if request.path.startswith("/api/"):
        return _error("method not allowed", 405)
    return "Method Not Allowed", 405


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
