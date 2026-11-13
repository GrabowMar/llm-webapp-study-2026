import hashlib
import json
import os
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from backend.seed import QUESTIONS

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
QUESTION_FIELDS = (
    "id", "text", "option_a", "option_b", "option_c", "option_d", "correct_option"
)


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=str(Path(os.environ.get("DATA_DIR", "./data")) / "quiz.sqlite3"),
        ADMIN_PASSWORD=os.environ.get("ADMIN_PASSWORD", ""),
        MAX_CONTENT_LENGTH=256 * 1024,
    )
    if config:
        app.config.update(config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=30)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(error=None):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    with app.app_context():
        connection = db()
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                is_admin INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY,
                text TEXT NOT NULL,
                option_a TEXT NOT NULL,
                option_b TEXT NOT NULL,
                option_c TEXT NOT NULL,
                option_d TEXT NOT NULL,
                correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                score REAL NOT NULL,
                correct INTEGER NOT NULL,
                total_questions INTEGER NOT NULL,
                submitted_at TEXT NOT NULL,
                answers TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, id DESC);
            CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT);
        """)
        connection.execute("BEGIN IMMEDIATE")
        if not connection.execute("SELECT 1 FROM metadata WHERE key = 'seeded'").fetchone():
            connection.executemany(
                "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option) VALUES (?, ?, ?, ?, ?, ?)",
                QUESTIONS,
            )
            connection.execute("INSERT INTO metadata VALUES ('seeded', '1')")
        admin = connection.execute("SELECT * FROM users WHERE username = 'admin'").fetchone()
        password = app.config["ADMIN_PASSWORD"]
        if admin is None:
            connection.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES ('admin', ?, 1)",
                (generate_password_hash(password or secrets.token_urlsafe(32)),),
            )
        elif not password or not check_password_hash(admin["password_hash"], password):
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (admin["id"],))
            if password:
                connection.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (generate_password_hash(password), admin["id"]),
                )
        connection.commit()

    def fail(message, status=400, errors=None):
        response = {"error": message}
        if errors:
            response["errors"] = errors
        return response, status

    def body():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else None

    @app.before_request
    def identify_user():
        g.user = None
        if not request.path.startswith("/api"):
            return None
        authorization = request.headers.get("Authorization")
        if authorization is None:
            return None
        parts = authorization.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return fail("A valid bearer token is required.", 401)
        token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
        g.user = db().execute(
            "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?",
            (token_hash, datetime.now(UTC).isoformat()),
        ).fetchone()
        if g.user is None or (g.user["is_admin"] and not app.config["ADMIN_PASSWORD"]):
            return fail("Your session has expired. Please sign in again.", 401)
        g.token_hash = token_hash
        return None

    def authenticated(admin=False):
        def decorator(function):
            @wraps(function)
            def wrapped(*args, **kwargs):
                if g.user is None:
                    return fail("Please sign in to continue.", 401)
                if admin and not g.user["is_admin"]:
                    return fail("Administrator access is required.", 403)
                return function(*args, **kwargs)
            return wrapped
        return decorator

    def user_json(user):
        return {"username": user["username"], "is_admin": bool(user["is_admin"])}

    def int_param(name, default, maximum):
        raw = request.args.get(name, str(default))
        if not re.fullmatch(r"[0-9]+", raw) or len(raw) > 9:
            return None
        value = int(raw)
        return value if 1 <= value <= maximum else None

    def question_json(row, reveal=True):
        return {key: row[key] for key in QUESTION_FIELDS if reveal or key != "correct_option"}

    def attempt_json(row):
        return {
            "id": row["id"], "score": row["score"], "correct": row["correct"],
            "total_questions": row["total_questions"], "submitted_at": row["submitted_at"],
            "answers": json.loads(row["answers"]),
        }

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        data = body()
        if data is None:
            return fail("A JSON object is required.")
        username, password = data.get("username"), data.get("password")
        errors = {}
        if not isinstance(username, str) or not re.fullmatch(r"[a-zA-Z0-9_]{3,32}", username):
            errors["username"] = "Use 3–32 letters, numbers or underscores."
        if not isinstance(password, str) or not 8 <= len(password) <= 128:
            errors["password"] = "Use a password between 8 and 128 characters."
        if errors:
            return fail("Please check your account details.", errors=errors)
        if username.lower() == "admin":
            return fail("This username is reserved.", 409, {"username": "This username is reserved."})
        try:
            db().execute(
                "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            db().commit()
        except sqlite3.IntegrityError:
            db().rollback()
            return fail("This username is already taken.", 409, {"username": "This username is already taken."})
        return {"username": username, "message": "Account created. You can now sign in."}, 201

    @app.post("/api/auth/login")
    def login():
        data = body()
        if data is None:
            return fail("A JSON object is required.")
        username, password = data.get("username"), data.get("password")
        if not isinstance(username, str) or not isinstance(password, str) or len(password) > 128:
            return fail("A username and password are required.")
        user = db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if (user is None or (user["is_admin"] and not app.config["ADMIN_PASSWORD"])
                or not check_password_hash(user["password_hash"], password)):
            return fail("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        db().execute(
            "INSERT INTO sessions VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), user["id"],
             (datetime.now(UTC) + timedelta(days=30)).isoformat()),
        )
        db().commit()
        return {"token": token, "user": user_json(user)}

    @app.get("/api/auth/me")
    @authenticated()
    def me():
        return user_json(g.user)

    @app.post("/api/auth/logout")
    @authenticated()
    def logout():
        db().execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        db().commit()
        return {"message": "Signed out."}

    @app.get("/api/quiz")
    def quiz():
        count = int_param("count", 5, 50)
        if count is None:
            return fail("count must be an integer between 1 and 50.")
        rows = db().execute("SELECT * FROM questions WHERE active = 1 ORDER BY RANDOM() LIMIT ?", (count,)).fetchall()
        return {"items": [question_json(row, reveal=False) for row in rows]}

    @app.post("/api/attempts")
    def submit_attempt():
        data = body()
        answers = data.get("answers") if data is not None else None
        if not isinstance(answers, list) or not 1 <= len(answers) <= 50:
            return fail("answers must contain between 1 and 50 answers.")
        seen = set()
        review = []
        for index, answer in enumerate(answers):
            if not isinstance(answer, dict):
                return fail(f"Answer {index + 1} must be an object.")
            question_id, selected = answer.get("question_id"), answer.get("selected")
            if type(question_id) is not int or question_id < 1 or question_id > 9223372036854775807:
                return fail(f"Answer {index + 1} needs a valid question_id.")
            if not isinstance(selected, str) or selected not in ("A", "B", "C", "D"):
                return fail(f"Answer {index + 1}: selected must be A, B, C or D.")
            if question_id in seen:
                return fail("A question can only be answered once per attempt.")
            seen.add(question_id)
            row = db().execute("SELECT * FROM questions WHERE id = ? AND active = 1", (question_id,)).fetchone()
            if row is None:
                return fail(f"Question {question_id} does not exist or is inactive.")
            review.append({
                **question_json(row), "question_id": question_id, "selected": selected,
                "is_correct": selected == row["correct_option"],
            })
        correct = sum(answer["is_correct"] for answer in review)
        result = {
            "id": None, "score": round(correct / len(review) * 100, 2),
            "correct": correct, "total_questions": len(review),
            "submitted_at": datetime.now(UTC).isoformat(), "answers": review,
        }
        if g.user is not None:
            cursor = db().execute(
                "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at, answers) VALUES (?, ?, ?, ?, ?, ?)",
                (g.user["id"], result["score"], correct, len(review), result["submitted_at"], json.dumps(review)),
            )
            db().commit()
            result["id"] = cursor.lastrowid
        return result

    @app.get("/api/attempts")
    @authenticated()
    def attempts():
        rows = db().execute("SELECT * FROM attempts WHERE user_id = ? ORDER BY id DESC", (g.user["id"],)).fetchall()
        return {"items": [attempt_json(row) for row in rows]}

    @app.get("/api/attempts/<int:attempt_id>")
    @authenticated()
    def attempt(attempt_id):
        if attempt_id > 9223372036854775807:
            return fail("Attempt not found.", 404)
        row = db().execute("SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, g.user["id"])).fetchone()
        if row is None:
            return fail("Attempt not found.", 404)
        return attempt_json(row)

    @app.post("/api/admin/questions")
    @authenticated(admin=True)
    def add_question():
        data = body()
        if data is None:
            return fail("A JSON object is required.")
        errors = {}
        cleaned = {}
        for field in QUESTION_FIELDS[1:-1]:
            value = data.get(field)
            maximum = 1000 if field == "text" else 300
            if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
                errors[field] = f"Enter between 1 and {maximum} characters."
            else:
                cleaned[field] = value.strip()
        if data.get("correct_option") not in ("A", "B", "C", "D"):
            errors["correct_option"] = "Choose the correct option: A, B, C or D."
        active = data.get("active", True)
        if type(active) is not bool:
            errors["active"] = "active must be true or false."
        if errors:
            return fail("Please check the highlighted fields.", errors=errors)
        cursor = db().execute(
            "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (*cleaned.values(), data["correct_option"], int(active)),
        )
        db().commit()
        row = db().execute("SELECT * FROM questions WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return question_json(row), 201

    @app.get("/api/admin/questions")
    @authenticated(admin=True)
    def admin_questions():
        page, page_size = int_param("page", 1, 1000000), int_param("page_size", 10, 100)
        if page is None or page_size is None:
            return fail("page must be a positive integer; page_size must be between 1 and 100.")
        total = db().execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        rows = db().execute("SELECT * FROM questions ORDER BY id DESC LIMIT ? OFFSET ?", (page_size, (page - 1) * page_size)).fetchall()
        return {"items": [question_json(row) for row in rows], "total": total, "page": page, "page_size": page_size}

    @app.errorhandler(HTTPException)
    def http_error(error):
        return fail(error.description, error.code)

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return fail("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
