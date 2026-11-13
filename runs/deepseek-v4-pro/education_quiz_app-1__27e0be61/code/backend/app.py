"""Quiz app backend: Flask + SQLite."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "quiz.db"

app = Flask(__name__, static_folder=None)

OPTIONS = ("A", "B", "C", "D")


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sessions (
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
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            score INTEGER NOT NULL,
            correct INTEGER NOT NULL,
            total_questions INTEGER NOT NULL,
            submitted_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS attempt_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
            question_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_option TEXT NOT NULL,
            selected TEXT NOT NULL,
            is_correct INTEGER NOT NULL
        );
        """
    )
    conn.commit()

    # Admin account
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_password:
        row = conn.execute(
            "SELECT id FROM users WHERE username = ?", ("admin",)
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
                ("admin", generate_password_hash(admin_password)),
            )
        else:
            conn.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE username = ?",
                (generate_password_hash(admin_password), "admin"),
            )
        conn.commit()

    # Seed general-knowledge questions
    count = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    if count == 0:
        conn.executemany(
            "INSERT INTO questions "
            "(text, option_a, option_b, option_c, option_d, correct_option) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            SEED_QUESTIONS,
        )
        conn.commit()
    conn.close()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def current_user() -> sqlite3.Row | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[7:].strip()
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None
    return user


def require_admin():
    user = current_user()
    if user is None or not user["is_admin"]:
        return None
    return user


def question_row(row: sqlite3.Row, include_correct: bool) -> dict:
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


def attempt_payload(attempt_id: int) -> dict:
    db = get_db()
    attempt = db.execute(
        "SELECT * FROM attempts WHERE id = ?", (attempt_id,)
    ).fetchone()
    answers = db.execute(
        "SELECT * FROM attempt_answers WHERE attempt_id = ? ORDER BY id",
        (attempt_id,),
    ).fetchall()
    return {
        "id": attempt["id"],
        "score": attempt["score"],
        "correct": attempt["correct"],
        "total_questions": attempt["total_questions"],
        "submitted_at": attempt["submitted_at"],
        "answers": [
            {
                "question_id": a["question_id"],
                "text": a["text"],
                "option_a": a["option_a"],
                "option_b": a["option_b"],
                "option_c": a["option_c"],
                "option_d": a["option_d"],
                "correct_option": a["correct_option"],
                "selected": a["selected"],
                "is_correct": bool(a["is_correct"]),
            }
            for a in answers
        ],
    }


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username:
        return jsonify({"error": "username is required"}), 400
    if len(username) > 64:
        return jsonify({"error": "username is too long"}), 400
    if not password:
        return jsonify({"error": "password is required"}), 400
    if username == "admin":
        return jsonify({"error": "that username is not available"}), 409

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return jsonify({"error": "that username is already taken"}), 409

    cur = db.execute(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 0)",
        (username, generate_password_hash(password)),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401

    if user["is_admin"] and not os.environ.get("ADMIN_PASSWORD", ""):
        return jsonify({"error": "admin sign-in is disabled"}), 401

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": user["username"]}), 200


# --------------------------------------------------------------------------- #
# Quiz
# --------------------------------------------------------------------------- #

@app.get("/api/quiz")
def quiz():
    raw = request.args.get("count", "5")
    try:
        count = int(raw)
    except ValueError:
        return jsonify({"error": "count must be an integer"}), 400
    if count < 1:
        return jsonify({"error": "count must be at least 1"}), 400

    db = get_db()
    rows = db.execute(
        "SELECT * FROM questions WHERE active = 1 ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    return jsonify({"items": [question_row(r, include_correct=False) for r in rows]})


# --------------------------------------------------------------------------- #
# Attempts
# --------------------------------------------------------------------------- #

@app.post("/api/attempts")
def submit_attempt():
    data = request.get_json(silent=True) or {}
    answers = data.get("answers")
    if not isinstance(answers, list) or not answers:
        return jsonify({"error": "answers must be a non-empty list"}), 400

    db = get_db()
    reviewed = []
    correct = 0

    for entry in answers:
        if not isinstance(entry, dict):
            return jsonify({"error": "each answer must be an object"}), 400
        question_id = entry.get("question_id")
        selected = entry.get("selected")
        q = db.execute(
            "SELECT * FROM questions WHERE id = ?", (question_id,)
        ).fetchone()
        if q is None:
            return jsonify({"error": f"question {question_id} not found"}), 400
        if selected not in OPTIONS:
            return jsonify({"error": "selected must be one of A, B, C, D"}), 400

        is_correct = selected == q["correct_option"]
        if is_correct:
            correct += 1
        reviewed.append(
            {
                "question_id": q["id"],
                "text": q["text"],
                "option_a": q["option_a"],
                "option_b": q["option_b"],
                "option_c": q["option_c"],
                "option_d": q["option_d"],
                "correct_option": q["correct_option"],
                "selected": selected,
                "is_correct": is_correct,
            }
        )

    total = len(reviewed)
    score = correct

    user = current_user()
    attempt_id = None
    if user is not None:
        cur = db.execute(
            "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (user["id"], score, correct, total, now_iso()),
        )
        attempt_id = cur.lastrowid
        for r in reviewed:
            db.execute(
                "INSERT INTO attempt_answers "
                "(attempt_id, question_id, text, option_a, option_b, option_c, option_d, "
                "correct_option, selected, is_correct) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    attempt_id,
                    r["question_id"],
                    r["text"],
                    r["option_a"],
                    r["option_b"],
                    r["option_c"],
                    r["option_d"],
                    r["correct_option"],
                    r["selected"],
                    int(r["is_correct"]),
                ),
            )
        db.commit()

    return jsonify(
        {
            "id": attempt_id,
            "score": score,
            "correct": correct,
            "total_questions": total,
            "submitted_at": now_iso(),
            "answers": reviewed,
        }
    )


@app.get("/api/attempts")
def list_attempts():
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    rows = db.execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify({"items": [attempt_payload(r["id"]) for r in rows]})


@app.get("/api/attempts/<int:attempt_id>")
def get_attempt(attempt_id: int):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    attempt = db.execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?",
        (attempt_id, user["id"]),
    ).fetchone()
    if attempt is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(attempt_payload(attempt_id))


# --------------------------------------------------------------------------- #
# Admin
# --------------------------------------------------------------------------- #

@app.post("/api/admin/questions")
def admin_add_question():
    if require_admin() is None:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    option_a = (data.get("option_a") or "").strip()
    option_b = (data.get("option_b") or "").strip()
    option_c = (data.get("option_c") or "").strip()
    option_d = (data.get("option_d") or "").strip()
    correct_option = (data.get("correct_option") or "").strip().upper()

    errors = []
    if not text:
        errors.append("text is required")
    if not option_a:
        errors.append("option_a is required")
    if not option_b:
        errors.append("option_b is required")
    if not option_c:
        errors.append("option_c is required")
    if not option_d:
        errors.append("option_d is required")
    if correct_option not in OPTIONS:
        errors.append("correct_option must be one of A, B, C, D")

    if errors:
        return jsonify({"error": "; ".join(errors)}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO questions "
        "(text, option_a, option_b, option_c, option_d, correct_option, active) "
        "VALUES (?, ?, ?, ?, ?, ?, 1)",
        (text, option_a, option_b, option_c, option_d, correct_option),
    )
    db.commit()
    q = db.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(question_row(q, include_correct=True)), 201


@app.get("/api/admin/questions")
def admin_list_questions():
    if require_admin() is None:
        return jsonify({"error": "unauthorized"}), 401

    page = max(1, int(request.args.get("page", "1")))
    page_size = max(1, int(request.args.get("page_size", "10")))

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    rows = db.execute(
        "SELECT * FROM questions ORDER BY id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [question_row(r, include_correct=True) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


# --------------------------------------------------------------------------- #
# Health + frontend
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


# --------------------------------------------------------------------------- #
# Seed data
# --------------------------------------------------------------------------- #

SEED_QUESTIONS = [
    ("What is the capital of France?", "Berlin", "Madrid", "Paris", "Rome", "C"),
    ("Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Saturn", "B"),
    ("What is the largest ocean on Earth?", "Atlantic", "Indian", "Arctic", "Pacific", "D"),
    ("Who wrote 'Romeo and Juliet'?", "Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen", "B"),
    ("What is the chemical symbol for water?", "H2O", "CO2", "O2", "NaCl", "A"),
    ("How many continents are there on Earth?", "5", "6", "7", "8", "C"),
    ("What is the longest river in the world?", "Amazon", "Nile", "Yangtze", "Mississippi", "B"),
    ("Which country gifted the Statue of Liberty to the USA?", "UK", "Italy", "France", "Spain", "C"),
    ("What is the smallest prime number?", "0", "1", "2", "3", "C"),
    ("Which gas do plants absorb from the atmosphere?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "C"),
    ("What is the currency of Japan?", "Won", "Yuan", "Yen", "Ringgit", "C"),
    ("In which year did World War II end?", "1943", "1945", "1947", "1950", "B"),
    ("What is the hardest natural substance?", "Gold", "Iron", "Diamond", "Quartz", "C"),
    ("Which instrument has 88 keys?", "Violin", "Piano", "Guitar", "Flute", "B"),
    ("What is the boiling point of water at sea level?", "90°C", "100°C", "110°C", "120°C", "B"),
    ("Who painted the Mona Lisa?", "Michelangelo", "Raphael", "Leonardo da Vinci", "Van Gogh", "C"),
    ("What is the largest mammal in the world?", "Elephant", "Blue whale", "Giraffe", "Orca", "B"),
    ("Which language has the most native speakers?", "English", "Spanish", "Mandarin Chinese", "Hindi", "C"),
    ("What is the fastest land animal?", "Lion", "Cheetah", "Horse", "Leopard", "B"),
    ("How many sides does a hexagon have?", "5", "6", "7", "8", "B"),
    ("What planet is closest to the Sun?", "Venus", "Earth", "Mercury", "Mars", "C"),
    ("Which element has the atomic number 1?", "Oxygen", "Hydrogen", "Helium", "Carbon", "B"),
    ("Who developed the theory of general relativity?", "Newton", "Einstein", "Galileo", "Darwin", "B"),
    ("What is the largest desert in the world?", "Sahara", "Gobi", "Antarctic", "Kalahari", "C"),
    ("Which organ pumps blood through the body?", "Lungs", "Brain", "Liver", "Heart", "D"),
]


with app.app_context():
    init_db()
