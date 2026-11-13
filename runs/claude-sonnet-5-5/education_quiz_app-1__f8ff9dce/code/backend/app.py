"""Quiz app: Flask JSON API under /api plus the built frontend."""

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from seed import QUESTIONS

BASE = Path(__file__).resolve().parent.parent
DIST = BASE / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "quiz.db"

ADMIN_USERNAME = "admin"
OPTIONS = ("A", "B", "C", "D")
TOKEN_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 128
DEFAULT_QUIZ_COUNT = 5
MAX_QUIZ_COUNT = 50
MAX_PAGE_SIZE = 100
DUMMY_HASH = generate_password_hash("dummy-password")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
    active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, id);
CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    selected TEXT NOT NULL CHECK (selected IN ('A','B','C','D'))
);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON attempt_answers(attempt_id, id);
"""

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        count = conn.execute("SELECT COUNT(*) FROM questions").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                QUESTIONS,
            )
        conn.execute(
            "DELETE FROM tokens WHERE expires_at < ?", (iso(datetime.now(timezone.utc)),)
        )
        conn.commit()
    finally:
        conn.close()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def error(message, status, **extra):
    return jsonify({"error": message, **extra}), status


def validation_error(errors):
    return error(next(iter(errors.values())), 400, errors=errors)


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def admin_enabled():
    return bool(os.environ.get("ADMIN_PASSWORD"))


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def issue_token(user_id):
    token = secrets.token_urlsafe(32)
    expires = iso(datetime.now(timezone.utc) + TOKEN_TTL)
    db().execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), user_id, expires),
    )
    db().commit()
    return token


class Unauthorized(Exception):
    pass


def current_user(required):
    """Return the signed-in user row, None for anonymous. Raises Unauthorized."""
    header = request.headers.get("Authorization")
    if header is None:
        if required:
            raise Unauthorized
        return None
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise Unauthorized
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token_hash = ?",
        (hash_token(parts[1].strip()),),
    ).fetchone()
    if row is None or row["expires_at"] < iso(datetime.now(timezone.utc)):
        raise Unauthorized
    return row


def is_admin(user):
    return (
        user is not None
        and admin_enabled()
        and user["username"].lower() == ADMIN_USERNAME
    )


@app.errorhandler(Unauthorized)
def handle_unauthorized(_e):
    resp = jsonify({"error": "Authentication required"})
    resp.status_code = 401
    resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http(e):
    if request.path.startswith("/api"):
        return error(e.description or e.name, e.code or 500)
    return e


@app.errorhandler(Exception)
def handle_unexpected(e):
    app.logger.exception("Unhandled error: %s", e)
    return error("Internal server error", 500)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object", 400)
    username = body.get("username")
    password = body.get("password")
    errors = {}
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        errors["username"] = (
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-'"
        )
    if not isinstance(password, str) or not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        errors["password"] = (
            f"Password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters long"
        )
    if errors:
        return validation_error(errors)
    username = username.strip()
    if username.lower() == ADMIN_USERNAME:
        return error("Username is already taken", 409)
    try:
        db().execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error("Username is already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username:
        return error("Username and password are required", 400)
    username = username.strip()
    bad = error("Invalid username or password", 401)
    if username.lower() == ADMIN_USERNAME:
        expected = os.environ.get("ADMIN_PASSWORD", "")
        if not expected or not hmac.compare_digest(password.encode(), expected.encode()):
            return bad
        row = db().execute(
            "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            db().execute(
                "INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)",
                (ADMIN_USERNAME, "!"),
            )
            db().commit()
            row = db().execute(
                "SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)
            ).fetchone()
        return jsonify({"token": issue_token(row["id"])})
    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        return bad
    if not check_password_hash(row["password_hash"], password):
        return bad
    return jsonify({"token": issue_token(row["id"])})


@app.get("/api/auth/me")
def me():
    user = current_user(True)
    return jsonify({"username": user["username"], "is_admin": is_admin(user)})


def parse_int(value, name, minimum, maximum=None):
    try:
        if not re.fullmatch(r"[0-9]+", value.strip()):
            raise ValueError
        number = int(value)
    except ValueError:
        return None, f"{name} must be an integer"
    if number < minimum or (maximum is not None and number > maximum):
        bound = f"between {minimum} and {maximum}" if maximum else f"at least {minimum}"
        return None, f"{name} must be {bound}"
    return number, None


@app.get("/api/quiz")
def quiz():
    count = DEFAULT_QUIZ_COUNT
    raw = request.args.get("count")
    if raw is not None:
        count, err = parse_int(raw, "count", 1, MAX_QUIZ_COUNT)
        if err:
            return error(err, 400)
    rows = db().execute(
        "SELECT id, text, option_a, option_b, option_c, option_d FROM questions"
        " WHERE active = 1 ORDER BY RANDOM() LIMIT ?",
        (count,),
    ).fetchall()
    return jsonify({"items": [dict(r) for r in rows]})


def review_items(rows):
    items = []
    for r in rows:
        items.append(
            {
                "question_id": r["question_id"],
                "text": r["text"],
                "option_a": r["option_a"],
                "option_b": r["option_b"],
                "option_c": r["option_c"],
                "option_d": r["option_d"],
                "selected": r["selected"],
                "correct_option": r["correct_option"],
                "is_correct": r["selected"] == r["correct_option"],
            }
        )
    return items


def attempt_dict(row, answers):
    return {
        "id": row["id"],
        "score": row["score"],
        "correct": row["correct"],
        "total_questions": row["total_questions"],
        "submitted_at": row["submitted_at"],
        "answers": answers,
    }


def load_answers(attempt_id):
    rows = db().execute(
        "SELECT a.question_id, a.selected, q.text, q.option_a, q.option_b, q.option_c,"
        " q.option_d, q.correct_option FROM attempt_answers a"
        " JOIN questions q ON q.id = a.question_id WHERE a.attempt_id = ? ORDER BY a.id",
        (attempt_id,),
    ).fetchall()
    return review_items(rows)


@app.post("/api/attempts")
def submit_attempt():
    user = current_user(False)
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object", 400)
    answers = body.get("answers")
    if not isinstance(answers, list) or not answers:
        return error("answers must be a non-empty list", 400)
    if len(answers) > 100:
        return error("answers must not contain more than 100 entries", 400)
    parsed = []
    seen = set()
    for i, a in enumerate(answers):
        if not isinstance(a, dict):
            return error(f"answers[{i}] must be an object", 400)
        qid = a.get("question_id")
        sel = a.get("selected")
        if not isinstance(qid, int) or isinstance(qid, bool):
            return error(f"answers[{i}].question_id must be an integer", 400)
        if not isinstance(sel, str) or sel not in OPTIONS:
            return error(f"answers[{i}].selected must be one of A, B, C, D", 400)
        if qid in seen:
            return error(f"Question {qid} is answered more than once", 400)
        seen.add(qid)
        parsed.append((qid, sel))
    placeholders = ",".join("?" * len(parsed))
    qrows = db().execute(
        f"SELECT * FROM questions WHERE active = 1 AND id IN ({placeholders})",
        [q for q, _ in parsed],
    ).fetchall()
    questions = {r["id"]: r for r in qrows}
    for qid, _ in parsed:
        if qid not in questions:
            return error(f"Unknown question: {qid}", 400)
    review = []
    for qid, sel in parsed:
        q = questions[qid]
        review.append({**dict(q), "question_id": qid, "selected": sel})
    items = review_items(review)
    total = len(items)
    correct = sum(1 for it in items if it["is_correct"])
    score = round(100 * correct / total)
    now = iso(datetime.now(timezone.utc))
    attempt_id = None
    if user is not None:
        conn = db()
        cur = conn.execute(
            "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (user["id"], score, correct, total, now),
        )
        attempt_id = cur.lastrowid
        conn.executemany(
            "INSERT INTO attempt_answers (attempt_id, question_id, selected) VALUES (?, ?, ?)",
            [(attempt_id, qid, sel) for qid, sel in parsed],
        )
        conn.commit()
    result = {
        "id": attempt_id,
        "score": score,
        "correct": correct,
        "total_questions": total,
        "submitted_at": now,
        "answers": items,
    }
    return jsonify(result), 201 if attempt_id else 200


@app.get("/api/attempts")
def list_attempts():
    user = current_user(True)
    rows = db().execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify({"items": [attempt_dict(r, load_answers(r["id"])) for r in rows]})


@app.get("/api/attempts/<int:attempt_id>")
def get_attempt(attempt_id):
    user = current_user(True)
    row = db().execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, user["id"])
    ).fetchone()
    if row is None:
        return error("Attempt not found", 404)
    return jsonify(attempt_dict(row, load_answers(row["id"])))


def require_admin():
    user = current_user(True)
    if not is_admin(user):
        return error("Admin access required", 403)
    return None


def question_dict(r):
    return {
        "id": r["id"],
        "text": r["text"],
        "option_a": r["option_a"],
        "option_b": r["option_b"],
        "option_c": r["option_c"],
        "option_d": r["option_d"],
        "correct_option": r["correct_option"],
    }


@app.post("/api/admin/questions")
def add_question():
    denied = require_admin()
    if denied:
        return denied
    body = json_body()
    if body is None:
        return error("Request body must be a JSON object", 400)
    errors = {}
    values = {}
    limits = {"text": 500, "option_a": 200, "option_b": 200, "option_c": 200, "option_d": 200}
    labels = {
        "text": "Question text",
        "option_a": "Option A",
        "option_b": "Option B",
        "option_c": "Option C",
        "option_d": "Option D",
    }
    for field, limit in limits.items():
        v = body.get(field)
        if not isinstance(v, str) or not v.strip():
            errors[field] = f"{labels[field]} is required"
        elif len(v.strip()) > limit:
            errors[field] = f"{labels[field]} must be at most {limit} characters"
        else:
            values[field] = v.strip()
    opts = [values.get(f"option_{c}") for c in "abcd"]
    present = [o.lower() for o in opts if o]
    if len(set(present)) != len(present):
        for c in "abcd":
            f = f"option_{c}"
            if f not in errors and values[f].lower() in [
                o.lower() for k, o in zip("abcd", opts) if k != c and o
            ]:
                errors[f] = "Options must be different from each other"
    correct = body.get("correct_option")
    if not isinstance(correct, str) or correct not in OPTIONS:
        errors["correct_option"] = "Correct option must be one of A, B, C, D"
    if errors:
        order = ["text", "option_a", "option_b", "option_c", "option_d", "correct_option"]
        return validation_error({k: errors[k] for k in order if k in errors})
    conn = db()
    cur = conn.execute(
        "INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_option)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            values["text"],
            values["option_a"],
            values["option_b"],
            values["option_c"],
            values["option_d"],
            correct,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(question_dict(row)), 201


@app.get("/api/admin/questions")
def list_questions():
    denied = require_admin()
    if denied:
        return denied
    page, page_size = 1, 20
    if "page" in request.args:
        page, err = parse_int(request.args["page"], "page", 1)
        if err:
            return error(err, 400)
    if "page_size" in request.args:
        page_size, err = parse_int(request.args["page_size"], "page_size", 1, MAX_PAGE_SIZE)
        if err:
            return error(err, 400)
    total = db().execute("SELECT COUNT(*) FROM questions").fetchone()[0]
    rows = db().execute(
        "SELECT * FROM questions ORDER BY id LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [question_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path):
    return error("Not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = (DIST / path).resolve()
    if target.is_file() and DIST.resolve() in target.parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
