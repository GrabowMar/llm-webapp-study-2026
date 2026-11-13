"""Flask entry point for the quiz app."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "quiz.db"

OPTIONS = ("A", "B", "C", "D")
DEFAULT_QUIZ_COUNT = 5
MAX_QUIZ_COUNT = 50
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

SEED_QUESTIONS = [
    ("What is the capital of France?", "London", "Berlin", "Paris", "Madrid", "C"),
    ("Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Saturn", "B"),
    ("What is the largest ocean on Earth?", "Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean", "D"),
    ("Who wrote the play 'Romeo and Juliet'?", "Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen", "B"),
    ("What is the chemical symbol for gold?", "Au", "Ag", "Gd", "Go", "A"),
    ("How many continents are there on Earth?", "Five", "Six", "Seven", "Eight", "C"),
    ("What is the tallest mountain above sea level?", "K2", "Kangchenjunga", "Mount Everest", "Lhotse", "C"),
    ("Which gas do plants absorb from the atmosphere?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "C"),
    ("What is the largest living mammal?", "African elephant", "Blue whale", "Giraffe", "White rhinoceros", "B"),
    ("In which country were the ancient Olympic Games first held?", "Italy", "Greece", "Egypt", "Turkey", "B"),
    ("What is the smallest prime number?", "Zero", "One", "Two", "Three", "C"),
    ("Which language has the most native speakers worldwide?", "English", "Hindi", "Spanish", "Mandarin Chinese", "D"),
    ("What is the hardest naturally occurring substance?", "Gold", "Iron", "Diamond", "Quartz", "C"),
    ("Who painted the Mona Lisa?", "Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo", "C"),
    ("Which is the longest river in the world?", "Amazon", "Nile", "Yangtze", "Mississippi", "B"),
    ("Which instrument has 88 keys?", "Violin", "Piano", "Guitar", "Flute", "B"),
    ("What is the freezing point of water in degrees Fahrenheit?", "0", "32", "100", "212", "B"),
    ("How many sides does a hexagon have?", "Five", "Six", "Seven", "Eight", "B"),
    ("What is the largest planet in the Solar System?", "Saturn", "Neptune", "Jupiter", "Earth", "C"),
    ("What is the main ingredient in guacamole?", "Tomato", "Avocado", "Onion", "Cucumber", "B"),
    ("Which country gifted the Statue of Liberty to the United States?", "Spain", "France", "England", "Italy", "B"),
    ("What is the currency of Japan?", "Yuan", "Won", "Yen", "Ringgit", "C"),
    ("How many bones are in the adult human body?", "186", "206", "226", "256", "B"),
    ("Which is the largest hot desert in the world?", "Gobi", "Kalahari", "Sahara", "Arabian", "C"),
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    is_active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempt_answers (
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    selected TEXT NOT NULL,
    is_correct INTEGER NOT NULL,
    position INTEGER NOT NULL
);
"""

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.isolation_level = None
    try:
        db.executescript(SCHEMA)
        db.execute("BEGIN IMMEDIATE")
        try:
            existing = {
                row[0] for row in db.execute("SELECT text FROM questions").fetchall()
            }
            db.executemany(
                "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                [q for q in SEED_QUESTIONS if q[0] not in existing],
            )
            ensure_admin(db)
            db.execute("COMMIT")
        except Exception:
            db.execute("ROLLBACK")
            raise
    finally:
        db.close()


def ensure_admin(db: sqlite3.Connection) -> None:
    password = os.environ.get("ADMIN_PASSWORD", "").strip()
    if password:
        password_hash = generate_password_hash(password)
    else:
        password_hash = generate_password_hash(secrets.token_urlsafe(32))
    row = db.execute("SELECT id FROM users WHERE username = ?", ("admin",)).fetchone()
    if row is None:
        db.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
            ("admin", password_hash),
        )
    else:
        db.execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
            (password_hash, row["id"]),
        )


init_db()


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def question_dict(row: sqlite3.Row, include_correct: bool = True) -> dict:
    data = {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
    }
    if include_correct:
        data["correct_option"] = row["correct_option"]
    return data


def answer_dict(question: sqlite3.Row, selected: str, is_correct: bool) -> dict:
    data = question_dict(question, include_correct=True)
    data["question_id"] = question["id"]
    data["selected"] = selected
    data["is_correct"] = is_correct
    return data


def attempt_dict(row: sqlite3.Row, answers: list) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "correct": row["correct"],
        "total_questions": row["total_questions"],
        "submitted_at": row["submitted_at"],
        "answers": answers,
    }


def attempt_review(db: sqlite3.Connection, attempt_id: int) -> list:
    rows = db.execute(
        "SELECT q.*, a.selected AS selected, a.is_correct AS is_correct"
        " FROM attempt_answers a JOIN questions q ON q.id = a.question_id"
        " WHERE a.attempt_id = ? ORDER BY a.position",
        (attempt_id,),
    ).fetchall()
    return [
        answer_dict(row, row["selected"], bool(row["is_correct"])) for row in rows
    ]


def load_attempt(db: sqlite3.Connection, attempt_id: int, user_id: int):
    row = db.execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?",
        (attempt_id, user_id),
    ).fetchone()
    if row is None:
        return None
    return attempt_dict(row, attempt_review(db, attempt_id))


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        return view(user, *args, **kwargs)

    return wrapped


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        if not user["is_admin"]:
            return error("admin access required", 403)
        return view(user, *args, **kwargs)

    return wrapped


def parse_credentials():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, None, error("request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return None, None, error("username is required")
    if not isinstance(password, str) or not password:
        return None, None, error("password is required")
    return username.strip(), password, None


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    username, password, err = parse_credentials()
    if err is not None:
        return err
    if len(username) > 64:
        return error("username must be at most 64 characters")
    if len(password) > 256:
        return error("password must be at most 256 characters")
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, err = parse_credentials()
    if err is not None:
        return err
    if username == "admin" and not os.environ.get("ADMIN_PASSWORD", "").strip():
        return error("admin sign-in is disabled", 403)
    db = get_db()
    row = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, row["id"]))
    db.commit()
    return jsonify({"token": token}), 200


# --------------------------------------------------------------------------
# Quiz
# --------------------------------------------------------------------------

@app.get("/api/quiz")
def quiz():
    raw = request.args.get("count", str(DEFAULT_QUIZ_COUNT))
    try:
        count = int(raw)
    except (TypeError, ValueError):
        return error("count must be an integer")
    if count < 1:
        return error("count must be a positive integer")
    count = min(count, MAX_QUIZ_COUNT)
    rows = get_db().execute(
        "SELECT id, text, option_a, option_b, option_c, option_d"
        " FROM questions WHERE is_active = 1 ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    return jsonify({"items": [question_dict(row, include_correct=False) for row in rows]})


# --------------------------------------------------------------------------
# Attempts
# --------------------------------------------------------------------------

@app.post("/api/attempts")
def submit_attempt():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error("request body must be a JSON object")
    answers = data.get("answers")
    if not isinstance(answers, list) or not answers:
        return error("answers must be a non-empty list")
    if len(answers) > MAX_QUIZ_COUNT:
        return error(f"answers must contain at most {MAX_QUIZ_COUNT} items")

    parsed = []
    seen = set()
    for index, item in enumerate(answers):
        if not isinstance(item, dict):
            return error(f"answers[{index}] must be an object")
        question_id = item.get("question_id")
        if not isinstance(question_id, int) or isinstance(question_id, bool):
            return error(f"answers[{index}].question_id must be an integer")
        selected = item.get("selected")
        if not isinstance(selected, str) or selected.upper() not in OPTIONS:
            return error(f"answers[{index}].selected must be one of A, B, C, D")
        if question_id in seen:
            return error(f"answers[{index}].question_id is duplicated")
        seen.add(question_id)
        parsed.append((question_id, selected.upper()))

    db = get_db()
    placeholders = ",".join("?" for _ in parsed)
    rows = db.execute(
        f"SELECT * FROM questions WHERE id IN ({placeholders})",
        [question_id for question_id, _ in parsed],
    ).fetchall()
    questions = {row["id"]: row for row in rows}
    for question_id, _ in parsed:
        if question_id not in questions:
            return error(f"question {question_id} not found")

    review = []
    correct = 0
    for question_id, selected in parsed:
        question = questions[question_id]
        is_correct = selected == question["correct_option"]
        if is_correct:
            correct += 1
        review.append(answer_dict(question, selected, is_correct))

    total = len(parsed)
    score = round(correct / total * 100, 2)
    submitted_at = now_iso()
    attempt_id = None

    user = current_user()
    if user is not None:
        cur = db.execute(
            "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (user["id"], score, correct, total, submitted_at),
        )
        attempt_id = cur.lastrowid
        for position, (question_id, selected) in enumerate(parsed):
            db.execute(
                "INSERT INTO attempt_answers (attempt_id, question_id, selected, is_correct, position)"
                " VALUES (?, ?, ?, ?, ?)",
                (
                    attempt_id,
                    question_id,
                    selected,
                    1 if selected == questions[question_id]["correct_option"] else 0,
                    position,
                ),
            )
        db.commit()

    attempt = {
        "id": attempt_id,
        "score": score,
        "correct": correct,
        "total_questions": total,
        "submitted_at": submitted_at,
        "answers": review,
    }
    return jsonify(attempt), 201


@app.get("/api/attempts")
@login_required
def list_attempts(user):
    rows = get_db().execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    db = get_db()
    items = [attempt_dict(row, attempt_review(db, row["id"])) for row in rows]
    return jsonify({"items": items})


@app.get("/api/attempts/<int:attempt_id>")
@login_required
def get_attempt(user, attempt_id: int):
    attempt = load_attempt(get_db(), attempt_id, user["id"])
    if attempt is None:
        return error("attempt not found", 404)
    return jsonify(attempt)


# --------------------------------------------------------------------------
# Admin
# --------------------------------------------------------------------------

def parse_question_payload():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, error("request body must be a JSON object")
    fields = ("text", "option_a", "option_b", "option_c", "option_d")
    values = {}
    for field in fields:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            return None, error(f"{field} is required")
        values[field] = value.strip()
    correct_option = data.get("correct_option")
    if not isinstance(correct_option, str) or correct_option.upper() not in OPTIONS:
        return None, error("correct_option must be one of A, B, C, D")
    values["correct_option"] = correct_option.upper()
    return values, None


@app.post("/api/admin/questions")
@admin_required
def create_question(_user):
    values, err = parse_question_payload()
    if err is not None:
        return err
    db = get_db()
    cur = db.execute(
        "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
        " VALUES (:text, :option_a, :option_b, :option_c, :option_d, :correct_option)",
        values,
    )
    db.commit()
    row = db.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(question_dict(row)), 201


@app.get("/api/admin/questions")
@admin_required
def list_questions(_user):
    raw_page = request.args.get("page", "1")
    raw_page_size = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))
    try:
        page = int(raw_page)
        page_size = int(raw_page_size)
    except (TypeError, ValueError):
        return error("page and page_size must be integers")
    if page < 1:
        return error("page must be a positive integer")
    if page_size < 1:
        return error("page_size must be a positive integer")
    if page_size > MAX_PAGE_SIZE:
        return error(f"page_size must be at most {MAX_PAGE_SIZE}")

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    rows = db.execute(
        "SELECT * FROM questions ORDER BY id LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [question_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


# --------------------------------------------------------------------------
# Health & frontend
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
