"""Flask entry point for the quiz app."""

from __future__ import annotations

import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "quiz.db"

ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD") or ""

OPTIONS = ("A", "B", "C", "D")


SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
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
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    position INTEGER NOT NULL,
    selected TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    is_correct INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id, position);
"""


SEED_QUESTIONS = [
    (
        "What is the capital of France?",
        "Paris",
        "London",
        "Berlin",
        "Madrid",
        "A",
    ),
    (
        "Which planet is known as the Red Planet?",
        "Venus",
        "Mars",
        "Jupiter",
        "Mercury",
        "B",
    ),
    (
        "What is the largest ocean on Earth?",
        "Atlantic Ocean",
        "Indian Ocean",
        "Pacific Ocean",
        "Arctic Ocean",
        "C",
    ),
    (
        "Who painted the Mona Lisa?",
        "Vincent van Gogh",
        "Pablo Picasso",
        "Claude Monet",
        "Leonardo da Vinci",
        "D",
    ),
    (
        "What is the chemical symbol for gold?",
        "Go",
        "Au",
        "Ag",
        "Gd",
        "B",
    ),
    (
        "How many continents are there on Earth?",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "C",
    ),
    (
        "Which is the longest river in the world?",
        "Amazon",
        "Nile",
        "Yangtze",
        "Mississippi",
        "B",
    ),
    (
        "What gas do plants absorb from the atmosphere?",
        "Oxygen",
        "Nitrogen",
        "Carbon dioxide",
        "Hydrogen",
        "C",
    ),
    (
        "Who wrote the play Romeo and Juliet?",
        "Charles Dickens",
        "William Shakespeare",
        "Jane Austen",
        "Mark Twain",
        "B",
    ),
    (
        "What is the smallest prime number?",
        "0",
        "1",
        "2",
        "3",
        "C",
    ),
    (
        "Which country is home to the kangaroo?",
        "Australia",
        "New Zealand",
        "South Africa",
        "Brazil",
        "A",
    ),
    (
        "What is the freezing point of water in Celsius?",
        "0 degrees",
        "32 degrees",
        "100 degrees",
        "-10 degrees",
        "A",
    ),
    (
        "Which musical instrument has 88 keys?",
        "Guitar",
        "Piano",
        "Violin",
        "Flute",
        "B",
    ),
    (
        "What is the largest planet in our solar system?",
        "Earth",
        "Saturn",
        "Jupiter",
        "Neptune",
        "C",
    ),
    (
        "Who developed the theory of relativity?",
        "Isaac Newton",
        "Albert Einstein",
        "Galileo Galilei",
        "Nikola Tesla",
        "B",
    ),
    (
        "Which currency is used in Japan?",
        "Yuan",
        "Won",
        "Yen",
        "Ringgit",
        "C",
    ),
    (
        "What is the hardest natural substance on Earth?",
        "Gold",
        "Iron",
        "Diamond",
        "Quartz",
        "C",
    ),
    (
        "In which year did World War II end?",
        "1918",
        "1939",
        "1945",
        "1950",
        "C",
    ),
    (
        "What is the main ingredient in guacamole?",
        "Tomato",
        "Avocado",
        "Cucumber",
        "Pepper",
        "B",
    ),
    (
        "Which language has the most native speakers worldwide?",
        "English",
        "Spanish",
        "Mandarin Chinese",
        "Hindi",
        "C",
    ),
    (
        "What is the capital of Japan?",
        "Seoul",
        "Beijing",
        "Tokyo",
        "Bangkok",
        "C",
    ),
    (
        "How many sides does a hexagon have?",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "B",
    ),
    (
        "Which animal is known as the king of the jungle?",
        "Tiger",
        "Lion",
        "Elephant",
        "Gorilla",
        "B",
    ),
    (
        "What is the study of stars and planets called?",
        "Geology",
        "Astronomy",
        "Biology",
        "Chemistry",
        "B",
    ),
    (
        "What is the boiling point of water at sea level in Celsius?",
        "50 degrees",
        "90 degrees",
        "100 degrees",
        "120 degrees",
        "C",
    ),
    (
        "Which planet is closest to the Sun?",
        "Venus",
        "Mercury",
        "Earth",
        "Mars",
        "B",
    ),
]


def utc_now() -> str:
    """Return the current UTC time as an ISO-8601 string."""

    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    """Create the schema, seed questions and synchronise the admin account."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = connect_db()
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA)
        connection.execute("BEGIN IMMEDIATE")
        try:
            seeded = connection.execute(
                "SELECT value FROM meta WHERE key = 'questions_seeded'"
            ).fetchone()
            if seeded is None:
                count = connection.execute(
                    "SELECT COUNT(*) AS n FROM questions"
                ).fetchone()["n"]
                if count == 0:
                    now = utc_now()
                    connection.executemany(
                        """
                        INSERT INTO questions
                            (text, option_a, option_b, option_c, option_d,
                             correct_option, active, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                        """,
                        [(*question, now) for question in SEED_QUESTIONS],
                    )
                connection.execute(
                    "INSERT INTO meta (key, value) VALUES ('questions_seeded', '1')"
                )

            if ADMIN_PASSWORD:
                admin = connection.execute(
                    "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
                ).fetchone()
                password_hash = generate_password_hash(ADMIN_PASSWORD)
                if admin is None:
                    connection.execute(
                        """
                        INSERT INTO users
                            (username, password_hash, is_admin, created_at)
                        VALUES (?, ?, 1, ?)
                        """,
                        (ADMIN_USERNAME, password_hash, utc_now()),
                    )
                else:
                    connection.execute(
                        "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                        (password_hash, admin["id"]),
                    )
            else:
                rows = connection.execute(
                    "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
                ).fetchall()
                unusable_hash = generate_password_hash(secrets.token_urlsafe(32))
                for row in rows:
                    connection.execute(
                        """
                        UPDATE users
                        SET is_admin = 0, password_hash = ?
                        WHERE id = ?
                        """,
                        (unusable_hash, row["id"]),
                    )
                    connection.execute(
                        "DELETE FROM tokens WHERE user_id = ?", (row["id"],)
                    )
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    finally:
        connection.close()


init_db()

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def error_response(message: str, status: int, **extra: Any):
    payload: dict[str, Any] = {"error": message}
    payload.update(extra)
    return jsonify(payload), status


def unauthorized(message: str = "Authentication required."):
    return error_response(message, 401)


def question_dict(row: sqlite3.Row, include_correct: bool = True) -> dict[str, Any]:
    question = {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
    }
    if include_correct:
        question["correct_option"] = row["correct_option"]
    return question


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return ""
    return parts[1].strip()


def resolve_user(required: bool = False, admin: bool = False):
    token = bearer_token()
    user = None
    if token:
        row = get_db().execute(
            """
            SELECT users.id, users.username, users.is_admin
            FROM tokens JOIN users ON users.id = tokens.user_id
            WHERE tokens.token = ?
            """,
            (token,),
        ).fetchone()
        if row is None:
            return None, unauthorized("Invalid or expired token.")
        user = {
            "id": row["id"],
            "username": row["username"],
            "is_admin": bool(row["is_admin"]),
        }
    elif token == "":
        return None, unauthorized("Invalid authorization header.")

    if required and user is None:
        return None, unauthorized()
    if admin and user is not None and not user["is_admin"]:
        return None, error_response("Administrator access required.", 403)
    return user, None


def auth_required(admin: bool = False):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user, error = resolve_user(required=True, admin=admin)
            if error:
                return error
            g.current_user = user
            return view(*args, **kwargs)

        return wrapped

    return decorator


def attempt_payload(connection: sqlite3.Connection, attempt: sqlite3.Row) -> dict[str, Any]:
    rows = connection.execute(
        """
        SELECT aa.question_id, aa.selected, aa.correct_option, aa.is_correct,
               q.text, q.option_a, q.option_b, q.option_c, q.option_d
        FROM attempt_answers aa
        JOIN questions q ON q.id = aa.question_id
        WHERE aa.attempt_id = ?
        ORDER BY aa.position ASC, aa.id ASC
        """,
        (attempt["id"],),
    ).fetchall()
    answers = []
    for row in rows:
        answers.append(
            {
                "question_id": row["question_id"],
                "text": row["text"],
                "option_a": row["option_a"],
                "option_b": row["option_b"],
                "option_c": row["option_c"],
                "option_d": row["option_d"],
                "selected": row["selected"],
                "correct_option": row["correct_option"],
                "is_correct": bool(row["is_correct"]),
            }
        )
    return {
        "id": attempt["id"],
        "score": attempt["score"],
        "correct": attempt["correct"],
        "total_questions": attempt["total_questions"],
        "submitted_at": attempt["submitted_at"],
        "answers": answers,
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.", 400)

    username = data.get("username")
    password = data.get("password")
    errors: dict[str, str] = {}

    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) > 80:
        errors["username"] = "Username must be at most 80 characters."
    elif username.strip().lower() == ADMIN_USERNAME:
        errors["username"] = "That username is reserved."

    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > 256:
        errors["password"] = "Password must be at most 256 characters."

    if errors:
        return error_response("Please correct the highlighted fields.", 400, errors=errors)

    username = username.strip()
    connection = get_db()
    existing = connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error_response("That username is already taken.", 400)

    connection.execute(
        """
        INSERT INTO users (username, password_hash, is_admin, created_at)
        VALUES (?, ?, 0, ?)
        """,
        (username, generate_password_hash(password), utc_now()),
    )
    connection.commit()
    row = connection.execute(
        "SELECT id, username FROM users WHERE username = ?", (username,)
    ).fetchone()
    return jsonify({"id": row["id"], "username": row["username"]}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.", 400)

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error_response("Username and password are required.", 400)

    username = username.strip()
    connection = get_db()

    user = None
    if username.lower() == ADMIN_USERNAME:
        if not ADMIN_PASSWORD:
            return unauthorized("Invalid username or password.")
        if not hmac.compare_digest(
            password.encode("utf-8"), ADMIN_PASSWORD.encode("utf-8")
        ):
            return unauthorized("Invalid username or password.")
        row = connection.execute(
            "SELECT id, username FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            connection.execute(
                """
                INSERT INTO users (username, password_hash, is_admin, created_at)
                VALUES (?, ?, 1, ?)
                """,
                (ADMIN_USERNAME, generate_password_hash(ADMIN_PASSWORD), utc_now()),
            )
            connection.commit()
            row = connection.execute(
                "SELECT id, username FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        user = {"id": row["id"], "username": row["username"]}
    else:
        row = connection.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username,),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return unauthorized("Invalid username or password.")
        user = {"id": row["id"], "username": row["username"]}

    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], utc_now()),
    )
    connection.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@auth_required()
def me():
    return jsonify(g.current_user)


@app.post("/api/auth/logout")
@auth_required()
def logout():
    token = bearer_token()
    if token:
        connection = get_db()
        connection.execute("DELETE FROM tokens WHERE token = ?", (token,))
        connection.commit()
    return jsonify({"status": "ok"})


@app.get("/api/quiz")
def quiz():
    raw_count = request.args.get("count", "5")
    try:
        count = int(raw_count)
    except (TypeError, ValueError):
        return error_response("count must be an integer.", 400)
    if count < 1:
        return error_response("count must be at least 1.", 400)
    count = min(count, 100)

    connection = get_db()
    rows = connection.execute(
        """
        SELECT id, text, option_a, option_b, option_c, option_d
        FROM questions
        WHERE active = 1
        ORDER BY RANDOM()
        LIMIT ?
        """,
        (count,),
    ).fetchall()
    return jsonify({"items": [question_dict(row, include_correct=False) for row in rows]})


@app.post("/api/attempts")
def submit_attempt():
    user, error = resolve_user()
    if error:
        return error

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.", 400)

    raw_answers = data.get("answers")
    if not isinstance(raw_answers, list) or not raw_answers:
        return error_response("answers must be a non-empty list.", 400)

    connection = get_db()
    review: list[dict[str, Any]] = []
    seen: set[int] = set()

    for index, item in enumerate(raw_answers):
        if not isinstance(item, dict):
            return error_response(f"answers[{index}] must be an object.", 400)

        question_id = item.get("question_id")
        selected = item.get("selected")
        if isinstance(question_id, bool) or not isinstance(question_id, int):
            return error_response(
                f"answers[{index}].question_id must be an integer.", 400
            )
        if not isinstance(selected, str) or selected.strip().upper() not in OPTIONS:
            return error_response(
                f"answers[{index}].selected must be one of A, B, C or D.", 400
            )
        selected = selected.strip().upper()

        if question_id in seen:
            return error_response(
                f"answers[{index}] repeats question {question_id}.", 400
            )
        seen.add(question_id)

        row = connection.execute(
            """
            SELECT id, text, option_a, option_b, option_c, option_d, correct_option
            FROM questions WHERE id = ?
            """,
            (question_id,),
        ).fetchone()
        if row is None:
            return error_response(
                f"Question {question_id} does not exist.", 400
            )

        is_correct = selected == row["correct_option"]
        review.append(
            {
                "question_id": row["id"],
                "text": row["text"],
                "option_a": row["option_a"],
                "option_b": row["option_b"],
                "option_c": row["option_c"],
                "option_d": row["option_d"],
                "selected": selected,
                "correct_option": row["correct_option"],
                "is_correct": is_correct,
            }
        )

    total = len(review)
    correct = sum(1 for answer in review if answer["is_correct"])
    score = int(round(correct * 100 / total)) if total else 0
    submitted_at = utc_now()

    attempt_id = None
    if user is not None:
        cursor = connection.execute(
            """
            INSERT INTO attempts
                (user_id, score, correct, total_questions, submitted_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (user["id"], score, correct, total, submitted_at),
        )
        attempt_id = cursor.lastrowid
        connection.executemany(
            """
            INSERT INTO attempt_answers
                (attempt_id, question_id, position, selected,
                 correct_option, is_correct)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    attempt_id,
                    answer["question_id"],
                    position,
                    answer["selected"],
                    answer["correct_option"],
                    1 if answer["is_correct"] else 0,
                )
                for position, answer in enumerate(review)
            ],
        )
        connection.commit()

    return (
        jsonify(
            {
                "id": attempt_id,
                "score": score,
                "correct": correct,
                "total_questions": total,
                "submitted_at": submitted_at,
                "answers": review,
            }
        ),
        200,
    )


@app.get("/api/attempts")
@auth_required()
def list_attempts():
    connection = get_db()
    rows = connection.execute(
        """
        SELECT id, score, correct, total_questions, submitted_at
        FROM attempts
        WHERE user_id = ?
        ORDER BY submitted_at DESC, id DESC
        """,
        (g.current_user["id"],),
    ).fetchall()
    return jsonify({"items": [attempt_payload(connection, row) for row in rows]})


@app.get("/api/attempts/<int:attempt_id>")
@auth_required()
def get_attempt(attempt_id: int):
    connection = get_db()
    row = connection.execute(
        """
        SELECT id, score, correct, total_questions, submitted_at
        FROM attempts
        WHERE id = ? AND user_id = ?
        """,
        (attempt_id, g.current_user["id"]),
    ).fetchone()
    if row is None:
        return error_response("Attempt not found.", 404)
    return jsonify(attempt_payload(connection, row))


@app.post("/api/admin/questions")
@auth_required(admin=True)
def create_question():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("A JSON object is required.", 400)

    errors: dict[str, str] = {}
    values: dict[str, str] = {}

    fields = (
        ("text", "Question text", 1000),
        ("option_a", "Option A", 500),
        ("option_b", "Option B", 500),
        ("option_c", "Option C", 500),
        ("option_d", "Option D", 500),
    )
    for field, label, maximum in fields:
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = f"{label} is required."
        elif len(value.strip()) > maximum:
            errors[field] = f"{label} must be at most {maximum} characters."
        else:
            values[field] = value.strip()

    correct_option = data.get("correct_option")
    if not isinstance(correct_option, str) or not correct_option.strip():
        errors["correct_option"] = "Correct option is required."
    elif correct_option.strip().upper() not in OPTIONS:
        errors["correct_option"] = "Correct option must be one of A, B, C or D."
    else:
        values["correct_option"] = correct_option.strip().upper()

    if errors:
        return error_response(
            "Please correct the highlighted fields.", 400, errors=errors
        )

    connection = get_db()
    cursor = connection.execute(
        """
        INSERT INTO questions
            (text, option_a, option_b, option_c, option_d,
             correct_option, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        """,
        (
            values["text"],
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
            values["correct_option"],
            utc_now(),
        ),
    )
    connection.commit()
    row = connection.execute(
        """
        SELECT id, text, option_a, option_b, option_c, option_d, correct_option
        FROM questions WHERE id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(question_dict(row)), 201


@app.get("/api/admin/questions")
@auth_required(admin=True)
def admin_list_questions():
    try:
        page = max(1, int(request.args.get("page", "1")))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        page_size = 20
    page_size = max(1, min(page_size, 100))

    connection = get_db()
    total = connection.execute("SELECT COUNT(*) AS n FROM questions").fetchone()["n"]
    offset = (page - 1) * page_size
    rows = connection.execute(
        """
        SELECT id, text, option_a, option_b, option_c, option_d, correct_option
        FROM questions
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """,
        (page_size, offset),
    ).fetchall()
    return jsonify(
        {
            "items": [question_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return error_response("Not found.", 404)
    return serve_frontend("index.html")


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return error_response("Method not allowed.", 405)
    return serve_frontend("index.html")


@app.errorhandler(413)
def payload_too_large(_error):
    if request.path.startswith("/api"):
        return error_response("Request body is too large.", 413)
    return error_response("Request body is too large.", 413)


@app.errorhandler(500)
def internal_error(_error):
    if request.path.startswith("/api"):
        return error_response("Internal server error.", 500)
    return error_response("Internal server error.", 500)


def serve_frontend(path: str):
    dist_root = DIST.resolve()
    candidate = (DIST / path).resolve()
    if candidate.is_file() and (candidate == dist_root or dist_root in candidate.parents):
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return error_response("Frontend has not been built.", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error_response("Not found.", 404)
    return serve_frontend(path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
