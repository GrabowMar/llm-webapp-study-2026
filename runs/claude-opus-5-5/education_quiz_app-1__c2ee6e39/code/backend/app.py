"""Flask entry point."""

import hashlib
import os
import random
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from seed import QUESTIONS

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

ADMIN_USERNAME = "admin"
OPTIONS = ("A", "B", "C", "D")
OPTION_FIELDS = ("option_a", "option_b", "option_c", "option_d")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128
TEXT_MAX = 500
OPTION_MAX = 200
QUIZ_DEFAULT = 5
QUIZ_MAX = 50
ANSWERS_MAX = 100
PAGE_SIZE_DEFAULT = 20
PAGE_SIZE_MAX = 100
TOKEN_TTL = timedelta(days=30)

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def now():
    return datetime.now(UTC)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
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
    position INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    selected TEXT NOT NULL,
    correct_option TEXT NOT NULL,
    is_correct INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON attempt_answers(attempt_id, position);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        with conn:
            conn.executescript(SCHEMA)
            if conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0] == 0:
                ts = iso(now())
                conn.executemany(
                    "INSERT INTO questions (text, option_a, option_b, option_c, option_d,"
                    " correct_option, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                    [(*q, ts) for q in QUESTIONS],
                )
            setup_admin(conn)
            conn.execute("DELETE FROM tokens WHERE expires_at < ?", (iso(now()),))
    finally:
        conn.close()


def setup_admin(conn):
    password = os.environ.get("ADMIN_PASSWORD") or ""
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (ADMIN_USERNAME,)
    ).fetchone()
    if row is None:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, NULL, 1, ?)",
            (ADMIN_USERNAME, iso(now())),
        )
        admin_id, current_hash = cur.lastrowid, None
    else:
        admin_id, current_hash = row["id"], row["password_hash"]
        conn.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (admin_id,))
    if not password:
        conn.execute("UPDATE users SET password_hash = NULL WHERE id = ?", (admin_id,))
        conn.execute("DELETE FROM tokens WHERE user_id = ?", (admin_id,))
        return
    if current_hash and check_password_hash(current_hash, password):
        return
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?",
        (generate_password_hash(password), admin_id),
    )
    conn.execute("DELETE FROM tokens WHERE user_id = ?", (admin_id,))


def admin_enabled():
    return bool(os.environ.get("ADMIN_PASSWORD"))


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization")
    if header is None:
        return None
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Invalid or expired token")
    row = db().execute(
        "SELECT u.id, u.username, u.is_admin FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token_hash = ? AND t.expires_at > ?",
        (hash_token(token), iso(now())),
    ).fetchone()
    if row is None or (row["is_admin"] and not admin_enabled()):
        raise ApiError(401, "Invalid or expired token")
    g.user = {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}
    return g.user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required")
    return user


def require_admin():
    user = require_user()
    if not user["is_admin"]:
        raise ApiError(403, "Admin access required")
    return user


def int_param(name, default, minimum, maximum, clamp=False):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"'{name}' must be an integer", {name: "Must be an integer"})
    if clamp and value > maximum:
        return maximum
    if value < minimum or value > maximum:
        msg = f"Must be between {minimum} and {maximum}"
        raise ApiError(400, f"'{name}' {msg.lower()}", {name: msg})
    return value


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    else:
        username = username.strip()
        if not USERNAME_RE.match(username):
            errors["username"] = (
                "Username must be 3-32 characters: letters, digits, '_', '.' or '-'"
            )
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters"
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    if username.lower() == ADMIN_USERNAME:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    conn = db()
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
                (username, generate_password_hash(password), iso(now())),
            )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return {"id": cur.lastrowid, "username": username, "is_admin": False}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "Username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    valid = (
        row is not None
        and row["password_hash"]
        and (not row["is_admin"] or admin_enabled())
        and check_password_hash(row["password_hash"], password)
    )
    if not valid:
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    created = now()
    conn = db()
    with conn:
        conn.execute(
            "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (hash_token(token), row["id"], iso(created), iso(created + TOKEN_TTL)),
        )
    return {"token": token, "username": row["username"], "is_admin": bool(row["is_admin"])}


@app.post("/api/auth/logout")
def logout():
    require_user()
    token = request.headers["Authorization"].partition(" ")[2].strip()
    conn = db()
    with conn:
        conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    return "", 204


@app.get("/api/auth/me")
def me():
    user = require_user()
    return {"id": user["id"], "username": user["username"], "is_admin": user["is_admin"]}


@app.get("/api/quiz")
def quiz():
    count = int_param("count", QUIZ_DEFAULT, 1, QUIZ_MAX, clamp=True)
    rows = db().execute(
        "SELECT id, text, option_a, option_b, option_c, option_d FROM questions WHERE active = 1"
    ).fetchall()
    chosen = random.SystemRandom().sample(rows, min(count, len(rows)))
    return {"items": [dict(r) for r in chosen]}


def answer_out(row):
    return {
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


def attempt_out(attempt, answers):
    return {
        "id": attempt["id"],
        "score": attempt["score"],
        "correct": attempt["correct"],
        "total_questions": attempt["total_questions"],
        "submitted_at": attempt["submitted_at"],
        "answers": [answer_out(a) for a in answers],
    }


def parse_answers(data):
    answers = data.get("answers")
    if not isinstance(answers, list) or not answers:
        raise ApiError(400, "'answers' must be a non-empty list", {"answers": "Must be a non-empty list"})
    if len(answers) > ANSWERS_MAX:
        raise ApiError(400, f"At most {ANSWERS_MAX} answers are allowed", {"answers": "Too many answers"})
    parsed = []
    seen = set()
    for i, item in enumerate(answers):
        if not isinstance(item, dict):
            raise ApiError(400, f"answers[{i}] must be an object", {f"answers[{i}]": "Must be an object"})
        qid = item.get("question_id")
        if isinstance(qid, bool) or not isinstance(qid, int):
            raise ApiError(
                400,
                f"answers[{i}].question_id must be an integer",
                {f"answers[{i}].question_id": "Must be an integer"},
            )
        selected = item.get("selected")
        if not isinstance(selected, str) or selected.strip().upper() not in OPTIONS:
            raise ApiError(
                400,
                f"answers[{i}].selected must be one of A, B, C, D",
                {f"answers[{i}].selected": "Must be one of A, B, C, D"},
            )
        if qid in seen:
            raise ApiError(
                400,
                f"Question {qid} is answered more than once",
                {f"answers[{i}].question_id": "Duplicate question"},
            )
        seen.add(qid)
        parsed.append((qid, selected.strip().upper()))
    return parsed


@app.post("/api/attempts")
def submit_attempt():
    user = current_user()
    parsed = parse_answers(json_body())
    conn = db()
    ids = [qid for qid, _ in parsed]
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT id, text, option_a, option_b, option_c, option_d, correct_option"
        f" FROM questions WHERE id IN ({placeholders})",
        ids,
    ).fetchall()
    questions = {r["id"]: r for r in rows}
    missing = [qid for qid in ids if qid not in questions]
    if missing:
        raise ApiError(
            400,
            f"Unknown question id(s): {', '.join(map(str, missing))}",
            {"answers": "Contains unknown questions"},
        )
    answers = []
    for qid, selected in parsed:
        q = questions[qid]
        answers.append(
            {
                "question_id": qid,
                "text": q["text"],
                "option_a": q["option_a"],
                "option_b": q["option_b"],
                "option_c": q["option_c"],
                "option_d": q["option_d"],
                "selected": selected,
                "correct_option": q["correct_option"],
                "is_correct": selected == q["correct_option"],
            }
        )
    total = len(answers)
    correct = sum(1 for a in answers if a["is_correct"])
    score = round(correct * 100 / total)
    attempt = {
        "id": None,
        "score": score,
        "correct": correct,
        "total_questions": total,
        "submitted_at": iso(now()),
    }
    if user is None:
        return attempt_out(attempt, answers) | {"saved": False}, 200
    with conn:
        cur = conn.execute(
            "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (user["id"], score, correct, total, attempt["submitted_at"]),
        )
        attempt["id"] = cur.lastrowid
        conn.executemany(
            "INSERT INTO attempt_answers (attempt_id, position, question_id, text, option_a,"
            " option_b, option_c, option_d, selected, correct_option, is_correct)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (
                    attempt["id"], pos, a["question_id"], a["text"], a["option_a"],
                    a["option_b"], a["option_c"], a["option_d"], a["selected"],
                    a["correct_option"], int(a["is_correct"]),
                )
                for pos, a in enumerate(answers)
            ],
        )
    return attempt_out(attempt, answers) | {"saved": True}, 201


def load_answers(attempt_ids):
    if not attempt_ids:
        return {}
    placeholders = ",".join("?" * len(attempt_ids))
    rows = db().execute(
        f"SELECT * FROM attempt_answers WHERE attempt_id IN ({placeholders})"
        f" ORDER BY attempt_id, position",
        attempt_ids,
    ).fetchall()
    grouped = {aid: [] for aid in attempt_ids}
    for r in rows:
        grouped[r["attempt_id"]].append(r)
    return grouped


@app.get("/api/attempts")
def list_attempts():
    user = require_user()
    rows = db().execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    answers = load_answers([r["id"] for r in rows])
    return {"items": [attempt_out(r, answers[r["id"]]) for r in rows]}


@app.get("/api/attempts/<int:attempt_id>")
def get_attempt(attempt_id):
    user = require_user()
    row = db().execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, user["id"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Attempt not found")
    return attempt_out(row, load_answers([attempt_id])[attempt_id])


def question_out(row):
    return {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
        "correct_option": row["correct_option"],
        "active": bool(row["active"]),
    }


@app.post("/api/admin/questions")
def create_question():
    require_admin()
    data = json_body()
    errors = {}
    values = {}
    text = data.get("text")
    if not isinstance(text, str) or not text.strip():
        errors["text"] = "Question text is required"
    elif len(text.strip()) > TEXT_MAX:
        errors["text"] = f"Question text must be at most {TEXT_MAX} characters"
    else:
        values["text"] = text.strip()
    for field, letter in zip(OPTION_FIELDS, OPTIONS):
        value = data.get(field)
        if not isinstance(value, str) or not value.strip():
            errors[field] = f"Option {letter} is required"
        elif len(value.strip()) > OPTION_MAX:
            errors[field] = f"Option {letter} must be at most {OPTION_MAX} characters"
        else:
            values[field] = value.strip()
    if all(f in values for f in OPTION_FIELDS):
        seen = {}
        for field, letter in zip(OPTION_FIELDS, OPTIONS):
            key = values[field].casefold()
            if key in seen:
                errors[field] = f"Option {letter} duplicates option {seen[key]}"
            else:
                seen[key] = letter
    correct = data.get("correct_option")
    if not isinstance(correct, str) or correct.strip().upper() not in OPTIONS:
        errors["correct_option"] = "Correct option must be one of A, B, C, D"
    else:
        values["correct_option"] = correct.strip().upper()
    active = data.get("active", True)
    if not isinstance(active, bool):
        errors["active"] = "Active must be true or false"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    conn = db()
    with conn:
        cur = conn.execute(
            "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option,"
            " active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                values["text"], values["option_a"], values["option_b"], values["option_c"],
                values["option_d"], values["correct_option"], int(active), iso(now()),
            ),
        )
    row = conn.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return question_out(row), 201


@app.get("/api/admin/questions")
def list_questions():
    require_admin()
    page = int_param("page", 1, 1, 1_000_000)
    page_size = int_param("page_size", PAGE_SIZE_DEFAULT, 1, PAGE_SIZE_MAX, clamp=True)
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    rows = conn.execute(
        "SELECT * FROM questions ORDER BY id LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return {
        "items": [question_out(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path=""):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "Frontend not built"}), 404
    return send_from_directory(DIST, "index.html")


init_db()
