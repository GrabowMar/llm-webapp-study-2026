"""Flask entry point for the quiz app.

Serves the JSON API under ``/api`` and the built frontend from ``frontend/dist``.
All data is stored in a SQLite database under ``./data``.
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR") or "./data")
DB_PATH = Path(os.environ.get("DATABASE_PATH") or (DATA_DIR / "quiz.db"))

ADMIN_USERNAME = "admin"
OPTIONS = ("A", "B", "C", "D")
OPTION_FIELDS = ("option_a", "option_b", "option_c", "option_d")
DEFAULT_QUIZ_COUNT = 5
MAX_QUIZ_COUNT = 50
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    """An error that is rendered as a JSON payload."""

    def __init__(self, message: str, status: int = 400, errors: dict[str, str] | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.errors = errors or {}

    def payload(self) -> dict[str, Any]:
        body: dict[str, Any] = {"error": self.message}
        if self.errors:
            body["errors"] = self.errors
        return body


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify(error.payload()), error.status


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_tokens (
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
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    selected TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    is_correct INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(is_active);
"""


def get_db() -> sqlite3.Connection:
    """Return the request-scoped database connection."""
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None = None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# Seed data
# --------------------------------------------------------------------------- #

SEED_QUESTIONS: list[tuple[str, str, str, str, str, str]] = [
    ("What is the capital city of France?", "Berlin", "Paris", "Rome", "Madrid", "B"),
    ("Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Mercury", "B"),
    ("What is the largest ocean on Earth?", "Atlantic", "Indian", "Arctic", "Pacific", "D"),
    ("Who wrote the play 'Romeo and Juliet'?", "Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain", "B"),
    ("What gas do plants absorb from the atmosphere for photosynthesis?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "C"),
    ("How many continents are there on Earth?", "5", "6", "7", "8", "C"),
    ("What is the chemical symbol for gold?", "Ag", "Gd", "Au", "Go", "C"),
    ("Which country is home to the kangaroo?", "Brazil", "Australia", "South Africa", "India", "B"),
    ("What is the tallest mountain in the world?", "K2", "Mount Everest", "Denali", "Mont Blanc", "B"),
    ("In computing, what does 'CPU' stand for?", "Central Processing Unit", "Computer Personal Unit", "Control Processing Unit", "Central Program Unit", "A"),
    ("Which sea creature has three hearts?", "Octopus", "Shark", "Dolphin", "Sea turtle", "A"),
    ("What is the longest river in the world?", "Amazon", "Nile", "Yangtze", "Mississippi", "B"),
    ("Who painted the Mona Lisa?", "Leonardo da Vinci", "Michelangelo", "Raphael", "Donatello", "A"),
    ("What is the smallest prime number?", "0", "1", "2", "3", "C"),
    ("Which language has the most native speakers worldwide?", "English", "Spanish", "Mandarin Chinese", "Hindi", "C"),
    ("What is the hardest natural substance on Earth?", "Quartz", "Steel", "Diamond", "Granite", "C"),
    ("How many bones are in the adult human body?", "186", "206", "226", "246", "B"),
    ("Which country gifted the Statue of Liberty to the United States?", "Britain", "France", "Spain", "Italy", "B"),
    ("What does DNA stand for?", "Deoxyribonucleic acid", "Dinucleic acid", "Diribose nucleic acid", "Deoxyribose amine acid", "A"),
    ("Which animal is known for changing its colour to blend in?", "Chameleon", "Zebra", "Panda", "Penguin", "A"),
    ("What is the currency of Japan?", "Won", "Yuan", "Yen", "Baht", "C"),
    ("How many players are on the field per team in a football (soccer) match?", "9", "10", "11", "12", "C"),
    ("Which element has the atomic number 1?", "Helium", "Hydrogen", "Lithium", "Carbon", "B"),
    ("What is the largest desert in the world?", "Sahara", "Gobi", "Antarctic", "Arabian", "C"),
    ("Who developed the theory of general relativity?", "Isaac Newton", "Niels Bohr", "Albert Einstein", "Max Planck", "C"),
    ("What is the study of fungi called?", "Mycology", "Botany", "Zoology", "Ecology", "A"),
    ("How many continents does the Amazon rainforest span?", "1", "2", "3", "4", "A"),
    ("What is the freezing point of water in degrees Celsius?", "0", "10", "32", "100", "A"),
    ("Which instrument has 88 keys in its standard form?", "Guitar", "Piano", "Violin", "Flute", "B"),
    ("What year did World War II end?", "1943", "1944", "1945", "1946", "C"),
    ("Which vitamin is produced by the skin in sunlight?", "Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D", "D"),
    ("What is the national flower of Japan?", "Rose", "Cherry blossom", "Lotus", "Hibiscus", "B"),
]


def seed_questions(connection: sqlite3.Connection) -> None:
    row = connection.execute("SELECT COUNT(*) AS total FROM questions").fetchone()
    if row["total"]:
        return
    timestamp = now_iso()
    connection.executemany(
        """
        INSERT INTO questions
            (text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """,
        [(*question, timestamp) for question in SEED_QUESTIONS],
    )
    connection.commit()


# --------------------------------------------------------------------------- #
# Authentication helpers
# --------------------------------------------------------------------------- #


def admin_password() -> str:
    """The admin password comes from the environment; empty means disabled."""
    return (os.environ.get("ADMIN_PASSWORD") or "").strip()


def ensure_admin_user(connection: sqlite3.Connection) -> None:
    password = admin_password()
    if not password:
        return
    row = connection.execute("SELECT * FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
    if row is None:
        connection.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
            (ADMIN_USERNAME, generate_password_hash(password), now_iso()),
        )
    elif not row["is_admin"] or not check_password_hash(row["password_hash"], password):
        connection.execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
            (generate_password_hash(password), row["id"]),
        )
    connection.commit()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=30)
    try:
        connection.row_factory = sqlite3.Row
        connection.executescript(SCHEMA)
        connection.commit()
        seed_questions(connection)
        ensure_admin_user(connection)
    finally:
        connection.close()


def issue_token(connection: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO auth_tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    connection.commit()
    return token


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip() or None
    return header.strip() or None


def current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if not token:
        return None
    connection = get_db()
    row = connection.execute(
        """
        SELECT users.* FROM auth_tokens
        JOIN users ON users.id = auth_tokens.user_id
        WHERE auth_tokens.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def require_user() -> sqlite3.Row:
    user = current_user()
    if user is None:
        raise ApiError("Authentication required", 401)
    return user


def require_admin() -> sqlite3.Row:
    user = require_user()
    if not user["is_admin"]:
        raise ApiError("Administrator privileges required", 403)
    return user


# --------------------------------------------------------------------------- #
# Serialisation helpers
# --------------------------------------------------------------------------- #


def question_payload(row: sqlite3.Row, with_answer: bool = True) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
    }
    if with_answer:
        payload["correct_option"] = row["correct_option"]
    return payload


def attempt_payload(connection: sqlite3.Connection, attempt: sqlite3.Row) -> dict[str, Any]:
    answers = connection.execute(
        """
        SELECT attempt_answers.*, questions.text, questions.option_a, questions.option_b,
               questions.option_c, questions.option_d
        FROM attempt_answers
        JOIN questions ON questions.id = attempt_answers.question_id
        WHERE attempt_answers.attempt_id = ?
        ORDER BY attempt_answers.id ASC
        """,
        (attempt["id"],),
    ).fetchall()

    return {
        "id": attempt["id"],
        "score": attempt["score"],
        "correct": attempt["correct"],
        "total_questions": attempt["total_questions"],
        "submitted_at": attempt["submitted_at"],
        "answers": [
            {
                "question_id": answer["question_id"],
                "text": answer["text"],
                "option_a": answer["option_a"],
                "option_b": answer["option_b"],
                "option_c": answer["option_c"],
                "option_d": answer["option_d"],
                "selected": answer["selected"],
                "correct_option": answer["correct_option"],
                "is_correct": bool(answer["is_correct"]),
            }
            for answer in answers
        ],
    }


def parse_json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if body is None:
        raise ApiError("A JSON body is required", 400)
    if not isinstance(body, dict):
        raise ApiError("The JSON body must be an object", 400)
    return body


def clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = parse_json_body()
    username = clean_text(body.get("username"))
    password = body.get("password") if isinstance(body.get("password"), str) else ""

    errors: dict[str, str] = {}
    if not username:
        errors["username"] = "Username is required"
    elif len(username) > 64:
        errors["username"] = "Username must be at most 64 characters"
    if not password:
        errors["password"] = "Password is required"
    if errors:
        raise ApiError("Please fix the highlighted fields", 400, errors)
    if username.lower() == ADMIN_USERNAME:
        raise ApiError("That username is reserved", 409, {"username": "That username is reserved"})

    connection = get_db()
    existing = connection.execute(
        "SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError("Username is already taken", 409, {"username": "Username is already taken"})

    cursor = connection.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    connection.commit()
    user_id = cursor.lastrowid
    token = issue_token(connection, user_id)
    return (
        jsonify({"id": user_id, "username": username, "token": token}),
        201,
    )


@app.post("/api/auth/login")
def login():
    body = parse_json_body()
    username = clean_text(body.get("username"))
    password = body.get("password") if isinstance(body.get("password"), str) else ""

    errors: dict[str, str] = {}
    if not username:
        errors["username"] = "Username is required"
    if not password:
        errors["password"] = "Password is required"
    if errors:
        raise ApiError("Please fix the highlighted fields", 400, errors)

    connection = get_db()

    if username.lower() == ADMIN_USERNAME:
        # Admin sign-in only works when an admin password is configured.
        if not admin_password():
            raise ApiError("Admin sign-in is disabled", 401)
        ensure_admin_user(connection)
        user = connection.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            raise ApiError("Invalid username or password", 401)
    else:
        user = connection.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            raise ApiError("Invalid username or password", 401)

    token = issue_token(connection, user["id"])
    return jsonify({"token": token})


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])})


@app.get("/api/quiz")
def quiz():
    raw_count = request.args.get("count")
    if raw_count is None or raw_count == "":
        count = DEFAULT_QUIZ_COUNT
    else:
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            raise ApiError("count must be a whole number", 400, {"count": "count must be a whole number"})
        if count < 1:
            raise ApiError("count must be at least 1", 400, {"count": "count must be at least 1"})
        count = min(count, MAX_QUIZ_COUNT)

    connection = get_db()
    rows = connection.execute(
        """
        SELECT id, text, option_a, option_b, option_c, option_d
        FROM questions
        WHERE is_active = 1
        ORDER BY RANDOM()
        LIMIT ?
        """,
        (count,),
    ).fetchall()
    return jsonify({"items": [question_payload(row, with_answer=False) for row in rows]})


@app.post("/api/attempts")
def submit_attempt():
    body = parse_json_body()
    answers = body.get("answers")
    if not isinstance(answers, list) or not answers:
        raise ApiError("answers must be a non-empty list", 400, {"answers": "answers must be a non-empty list"})

    connection = get_db()
    prepared: list[dict[str, Any]] = []
    errors: dict[str, str] = {}
    for index, answer in enumerate(answers):
        if not isinstance(answer, dict):
            errors[f"answers[{index}]"] = "Each answer must be an object"
            continue
        question_id = answer.get("question_id")
        selected = answer.get("selected")
        if isinstance(question_id, str):
            try:
                question_id = int(question_id)
            except ValueError:
                question_id = None
        if not isinstance(question_id, int):
            errors[f"answers[{index}].question_id"] = "question_id must be a question id"
            continue
        if not isinstance(selected, str) or selected.upper() not in OPTIONS:
            errors[f"answers[{index}].selected"] = "selected must be one of A, B, C or D"
            continue
        question = connection.execute(
            "SELECT id, correct_option FROM questions WHERE id = ?", (question_id,)
        ).fetchone()
        if question is None:
            errors[f"answers[{index}].question_id"] = f"Unknown question id: {question_id}"
            continue
        prepared.append(
            {
                "question_id": question_id,
                "selected": selected.upper(),
                "correct_option": question["correct_option"],
                "is_correct": 1 if question["correct_option"] == selected.upper() else 0,
            }
        )

    if errors:
        raise ApiError("Please fix the highlighted fields", 400, errors)

    correct = sum(item["is_correct"] for item in prepared)
    total = len(prepared)
    score = round(correct * 100 / total, 2) if total else 0.0
    user = current_user()
    submitted_at = now_iso()

    cursor = connection.execute(
        """
        INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (user["id"] if user is not None else None, score, correct, total, submitted_at),
    )
    attempt_id = cursor.lastrowid
    connection.executemany(
        """
        INSERT INTO attempt_answers
            (attempt_id, question_id, selected, correct_option, is_correct)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
            (
                attempt_id,
                item["question_id"],
                item["selected"],
                item["correct_option"],
                item["is_correct"],
            )
            for item in prepared
        ],
    )
    connection.commit()

    attempt = connection.execute("SELECT * FROM attempts WHERE id = ?", (attempt_id,)).fetchone()
    return jsonify(attempt_payload(connection, attempt))


@app.get("/api/attempts")
def list_attempts():
    user = require_user()
    connection = get_db()
    rows = connection.execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify({"items": [attempt_payload(connection, row) for row in rows]})


@app.get("/api/attempts/<int:attempt_id>")
def get_attempt(attempt_id: int):
    user = require_user()
    connection = get_db()
    row = connection.execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, user["id"])
    ).fetchone()
    if row is None:
        raise ApiError("Attempt not found", 404)
    return jsonify(attempt_payload(connection, row))


@app.post("/api/admin/questions")
def admin_create_question():
    require_admin()
    body = parse_json_body()

    errors: dict[str, str] = {}
    values: dict[str, str] = {}
    text = clean_text(body.get("text"))
    if not text:
        errors["text"] = "Question text is required"
    values["text"] = text

    for field, label in zip(OPTION_FIELDS, OPTIONS):
        value = clean_text(body.get(field))
        if not value:
            errors[field] = f"Option {label} is required"
        values[field] = value

    correct_option = clean_text(body.get("correct_option")).upper()
    if correct_option not in OPTIONS:
        errors["correct_option"] = "Correct option must be one of A, B, C or D"
    values["correct_option"] = correct_option

    if errors:
        raise ApiError("Please fix the highlighted fields", 400, errors)

    connection = get_db()
    cursor = connection.execute(
        """
        INSERT INTO questions
            (text, option_a, option_b, option_c, option_d, correct_option, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            values["text"],
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
            values["correct_option"],
            1 if body.get("is_active", True) else 0,
            now_iso(),
        ),
    )
    connection.commit()

    row = connection.execute("SELECT * FROM questions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(question_payload(row)), 201


@app.get("/api/admin/questions")
def admin_list_questions():
    require_admin()
    try:
        page = int(request.args.get("page", 1))
    except (TypeError, ValueError):
        raise ApiError("page must be a whole number", 400, {"page": "page must be a whole number"})
    try:
        page_size = int(request.args.get("page_size", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        raise ApiError(
            "page_size must be a whole number", 400, {"page_size": "page_size must be a whole number"}
        )
    page = max(page, 1)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    connection = get_db()
    total = connection.execute("SELECT COUNT(*) AS total FROM questions").fetchone()["total"]
    rows = connection.execute(
        """
        SELECT * FROM questions
        ORDER BY id ASC
        LIMIT ? OFFSET ?
        """,
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [question_payload(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/questions")
def list_questions():
    """Public catalogue of active questions (without the correct option)."""
    connection = get_db()
    rows = connection.execute(
        """
        SELECT id, text, option_a, option_b, option_c, option_d
        FROM questions WHERE is_active = 1 ORDER BY id ASC
        """
    ).fetchall()
    return jsonify({"items": [question_payload(row, with_answer=False) for row in rows]})


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return serve_frontend()


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed"}), 405
    return jsonify({"error": "Method not allowed"}), 405


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #


def serve_frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    candidate = (DIST / path).resolve()
    try:
        candidate.relative_to(DIST.resolve())
    except ValueError:
        candidate = DIST / "index.html"
    if candidate.is_file():
        return send_from_directory(DIST, candidate.relative_to(DIST.resolve()).as_posix())
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    return serve_frontend(path)


init_db()
