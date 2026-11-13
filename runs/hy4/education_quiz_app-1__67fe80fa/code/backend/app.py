"""Quiz app: Flask JSON API and static React frontend."""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "quiz.sqlite3"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""
ADMIN_ENABLED = bool(ADMIN_PASSWORD)

OPTIONS = ("A", "B", "C", "D")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    text           TEXT NOT NULL,
    option_a       TEXT NOT NULL,
    option_b       TEXT NOT NULL,
    option_c       TEXT NOT NULL,
    option_d       TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    score           INTEGER NOT NULL,
    correct         INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id     INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id    INTEGER NOT NULL,
    text           TEXT NOT NULL,
    option_a       TEXT NOT NULL,
    option_b       TEXT NOT NULL,
    option_c       TEXT NOT NULL,
    option_d       TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    selected       TEXT,
    is_correct     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_questions_active ON questions(active);
"""

SEED_QUESTIONS = [
    ("What is the capital of France?", "Berlin", "Paris", "Madrid", "Rome", "B"),
    ("Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Mercury", "B"),
    ("How many continents are there on Earth?", "5", "6", "7", "8", "C"),
    ("What is the chemical formula for water?", "H2O", "CO2", "O2", "NaCl", "A"),
    ("Who wrote 'Romeo and Juliet'?", "Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain", "B"),
    ("What is the largest ocean on Earth?", "Atlantic", "Indian", "Arctic", "Pacific", "D"),
    ("Which language is the official language of Brazil?", "Spanish", "Portuguese", "French", "Italian", "B"),
    ("What is 7 multiplied by 8?", "54", "56", "64", "48", "B"),
    ("Which animal is known as the king of the jungle?", "Tiger", "Elephant", "Lion", "Bear", "C"),
    ("In which year did World War II end?", "1945", "1939", "1918", "1950", "A"),
    ("What is the freezing point of water in degrees Celsius?", "0", "100", "-10", "32", "A"),
    ("Which instrument measures temperature?", "Barometer", "Thermometer", "Hygrometer", "Altimeter", "B"),
    ("What is the currency of Japan?", "Yuan", "Won", "Yen", "Ringgit", "C"),
    ("How many sides does a hexagon have?", "5", "6", "7", "8", "B"),
    ("Which element has the chemical symbol 'Au'?", "Silver", "Gold", "Argon", "Aluminium", "B"),
    ("What is the tallest mountain above sea level?", "K2", "Mount Everest", "Kilimanjaro", "Denali", "B"),
    ("Who painted the Mona Lisa?", "Michelangelo", "Leonardo da Vinci", "Raphael", "Donatello", "B"),
    ("Which gas do plants absorb from the atmosphere for photosynthesis?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "C"),
    ("What is the capital of Australia?", "Sydney", "Melbourne", "Canberra", "Perth", "C"),
    ("How many minutes are there in one hour?", "30", "60", "90", "100", "B"),
    ("Which country is home to the Great Barrier Reef?", "New Zealand", "Australia", "Indonesia", "Fiji", "B"),
    ("What colour does the Sun appear from space?", "Red", "Yellow", "White", "Green", "C"),
    ("Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars", "A"),
    ("In computing, what does 'CPU' stand for?", "Central Processing Unit", "Computer Personal Unit", "Central Power Unit", "Core Processing Unit", "A"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.executescript(SCHEMA)
    conn.execute("BEGIN IMMEDIATE")

    count = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    if count == 0:
        stamp = now_iso()
        conn.executemany(
            "INSERT INTO questions (text, option_a, option_b, option_c, option_d, "
            "correct_option, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            [(*q, stamp) for q in SEED_QUESTIONS],
        )

    admin = conn.execute("SELECT id FROM users WHERE username = 'admin'").fetchone()
    if ADMIN_ENABLED:
        password_hash = generate_password_hash(ADMIN_PASSWORD)
        if admin:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (password_hash, admin["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) "
                "VALUES ('admin', ?, 1, ?)",
                (password_hash, now_iso()),
            )
    elif admin:
        conn.execute("DELETE FROM tokens WHERE user_id = ?", (admin["id"],))
        conn.execute(
            "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
            (generate_password_hash(secrets.token_urlsafe(32)), admin["id"]),
        )

    conn.commit()
    conn.close()


init_db()


def error(message: str, status: int = 400, errors=None):
    payload = {"message": message}
    if errors is not None:
        payload["errors"] = errors
    return jsonify(payload), status


def json_body():
    return request.get_json(force=True, silent=True)


def clean_text(value, max_length: int):
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > max_length:
        return None
    return value


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    return get_db().execute(
        "SELECT u.* FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        return view(user, *args, **kwargs)

    return wrapper


def require_admin(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        if not user["is_admin"] or not ADMIN_ENABLED:
            return error("Administrator access required.", 403)
        return view(user, *args, **kwargs)

    return wrapper


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    get_db().commit()
    return token


def user_json(row):
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def question_json(row):
    return {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
        "correct_option": row["correct_option"],
    }


def review_item(question, selected):
    return {
        "question_id": question["id"],
        "text": question["text"],
        "option_a": question["option_a"],
        "option_b": question["option_b"],
        "option_c": question["option_c"],
        "option_d": question["option_d"],
        "correct_option": question["correct_option"],
        "selected": selected,
        "is_correct": selected == question["correct_option"],
    }


def attempt_json(conn, row):
    answers = conn.execute(
        "SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY id ASC",
        (row["id"],),
    ).fetchall()
    return {
        "id": row["id"],
        "score": row["score"],
        "correct": row["correct"],
        "total_questions": row["total_questions"],
        "submitted_at": row["submitted_at"],
        "answers": [
            {
                "question_id": answer["question_id"],
                "text": answer["text"],
                "option_a": answer["option_a"],
                "option_b": answer["option_b"],
                "option_c": answer["option_c"],
                "option_d": answer["option_d"],
                "correct_option": answer["correct_option"],
                "selected": answer["selected"],
                "is_correct": bool(answer["is_correct"]),
            }
            for answer in answers
        ],
    }


def positive_int(value, default: int, maximum: int = 100):
    if value is None or value == "":
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    if parsed < 1:
        return None
    return min(parsed, maximum)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    data = json_body()
    if not isinstance(data, dict):
        return error("A JSON object is required.")

    errors = {}
    username = clean_text(data.get("username"), 30)
    password = data.get("password")

    if username is None:
        errors["username"] = "Username is required (1-30 characters)."
    elif not USERNAME_RE.fullmatch(username):
        errors["username"] = "Username may only contain letters, digits, '.', '_' and '-'."
    elif username.lower() == "admin":
        errors["username"] = "That username is reserved."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > 200:
        errors["password"] = "Password is too long."

    if errors:
        return error(next(iter(errors.values())), 400, errors)

    conn = get_db()
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("That username is already taken.", 409)

    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    user = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    token = issue_token(user["id"])
    return jsonify({**user_json(user), "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if not isinstance(data, dict):
        return error("A JSON object is required.")

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required.", 400)

    if username.strip().lower() == "admin" and not ADMIN_ENABLED:
        return error("Invalid username or password.", 401)

    user = get_db().execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password.", 401)

    return jsonify({"token": issue_token(user["id"])})


@app.get("/api/auth/me")
@require_auth
def me(user):
    return jsonify(user_json(user))


@app.get("/api/quiz")
def quiz():
    count = positive_int(request.args.get("count"), 5, 50)
    if count is None:
        return error("count must be a positive integer.", 400)

    rows = get_db().execute(
        "SELECT id, text, option_a, option_b, option_c, option_d FROM questions "
        "WHERE active = 1 ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    return jsonify({"items": [dict(row) for row in rows]})


@app.post("/api/attempts")
def submit_attempt():
    data = json_body()
    if not isinstance(data, dict) or not isinstance(data.get("answers"), list):
        return error("answers must be a list of answers.", 400)

    raw_answers = data["answers"]
    if not raw_answers:
        return error("answers must not be empty.", 400)
    if len(raw_answers) > 100:
        return error("Too many answers (maximum 100).", 400)

    conn = get_db()
    parsed = []
    seen = set()
    for index, item in enumerate(raw_answers):
        if not isinstance(item, dict):
            return error(f"answers[{index}] must be an object.", 400)
        question_id = item.get("question_id")
        if isinstance(question_id, bool):
            return error(f"answers[{index}].question_id must be an integer.", 400)
        try:
            question_id = int(question_id)
        except (TypeError, ValueError):
            return error(f"answers[{index}].question_id must be an integer.", 400)
        if question_id in seen:
            return error(f"answers[{index}].question_id is duplicated.", 400)
        seen.add(question_id)

        selected = item.get("selected")
        if selected is not None:
            selected = str(selected).strip().upper()
            if selected not in OPTIONS:
                return error(f"answers[{index}].selected must be one of A, B, C, D.", 400)

        question = conn.execute("SELECT * FROM questions WHERE id = ?", (question_id,)).fetchone()
        if question is None:
            return error(f"answers[{index}].question_id does not exist.", 400)
        parsed.append((question, selected))

    answers = [review_item(question, selected) for question, selected in parsed]
    correct = sum(1 for answer in answers if answer["is_correct"])
    total = len(answers)
    submitted_at = now_iso()

    user = current_user()
    user_id = user["id"] if user is not None else None
    cursor = conn.execute(
        "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (user_id, correct, correct, total, submitted_at),
    )
    attempt_id = cursor.lastrowid
    for answer in answers:
        question_id = answer["question_id"]
        conn.execute(
            "INSERT INTO attempt_answers (attempt_id, question_id, text, option_a, option_b, "
            "option_c, option_d, correct_option, selected, is_correct) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                attempt_id,
                question_id,
                answer["text"],
                answer["option_a"],
                answer["option_b"],
                answer["option_c"],
                answer["option_d"],
                answer["correct_option"],
                answer["selected"],
                int(answer["is_correct"]),
            ),
        )
    conn.commit()

    return jsonify(
        {
            "id": attempt_id,
            "score": correct,
            "correct": correct,
            "total_questions": total,
            "submitted_at": submitted_at,
            "answers": answers,
        }
    )


@app.get("/api/attempts")
@require_auth
def list_attempts(user):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify({"items": [attempt_json(conn, row) for row in rows]})


@app.get("/api/attempts/<int:attempt_id>")
@require_auth
def get_attempt(user, attempt_id: int):
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, user["id"])
    ).fetchone()
    if row is None:
        return error("Attempt not found.", 404)
    return jsonify(attempt_json(conn, row))


@app.post("/api/admin/questions")
@require_admin
def add_question(_user):
    data = json_body()
    if not isinstance(data, dict):
        return error("A JSON object is required.", 400)

    errors = {}
    values = {}
    for field in ("text", "option_a", "option_b", "option_c", "option_d"):
        value = clean_text(data.get(field), 1000 if field == "text" else 300)
        if value is None:
            errors[field] = f"{field} is required and must be non-empty."
        else:
            values[field] = value

    correct_option = data.get("correct_option")
    correct_option = str(correct_option).strip().upper() if correct_option is not None else ""
    if correct_option not in OPTIONS:
        errors["correct_option"] = "correct_option must be one of A, B, C, D."
    else:
        values["correct_option"] = correct_option

    active = 0 if data.get("active") is False else 1

    if errors:
        return error(next(iter(errors.values())), 400, errors)

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO questions (text, option_a, option_b, option_c, option_d, "
        "correct_option, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            values["text"],
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
            values["correct_option"],
            active,
            now_iso(),
        ),
    )
    row = conn.execute("SELECT * FROM questions WHERE id = ?", (cursor.lastrowid,)).fetchone()
    conn.commit()
    return jsonify(question_json(row)), 201


@app.get("/api/admin/questions")
@require_admin
def list_questions(_user):
    page = positive_int(request.args.get("page"), 1, 1_000_000)
    page_size = positive_int(request.args.get("page_size"), 20, 100)
    if page is None:
        return error("page must be a positive integer.", 400)
    if page_size is None:
        return error("page_size must be a positive integer.", 400)

    conn = get_db()
    total = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    rows = conn.execute(
        "SELECT * FROM questions ORDER BY id ASC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [question_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def serve_frontend(path: str = ""):
    if not DIST.is_dir():
        return jsonify({"message": "Frontend build not found."}), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
def index():
    return serve_frontend()


@app.get("/<path:path>")
def frontend(path: str):
    if path.startswith("api/"):
        return error("Not found.", 404)
    return serve_frontend(path)


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("Not found.", 404)
    return serve_frontend(request.path.lstrip("/"))


@app.errorhandler(405)
def method_not_allowed(_exc):
    return error("Method not allowed.", 405)


@app.errorhandler(500)
def internal_error(_exc):
    return error("Internal server error.", 500)
