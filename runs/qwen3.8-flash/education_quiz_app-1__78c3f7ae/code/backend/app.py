"""Flask entry point."""

import json
import os
import random
import re
import secrets
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

import db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,64}$")
OPTION_LETTERS = ("A", "B", "C", "D")
OPTION_KEYS = {
    "A": "option_a",
    "B": "option_b",
    "C": "option_c",
    "D": "option_d",
}


def row_to_question(row, include_correct: bool):
    q = {
        "id": row["id"],
        "text": row["text"],
        "option_a": row["option_a"],
        "option_b": row["option_b"],
        "option_c": row["option_c"],
        "option_d": row["option_d"],
    }
    if include_correct:
        q["correct_option"] = row["correct_option"]
    return q


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


class HttpError(Exception):
    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.message = message
        self.status = status


def current_user():
    if "user" not in g:
        header = request.headers.get("Authorization", "")
        g.user = None
        if header.startswith("Bearer "):
            conn = db.get_conn()
            try:
                g.user = db.lookup_token(conn, header[7:].strip())
            finally:
                conn.close()
    return g.user


def require_user():
    user = current_user()
    if user is None:
        raise HttpError("Sign-in required", 401)
    return user


def require_admin():
    user = require_user()
    if user["role"] != "admin":
        raise HttpError("Admin access required", 403)
    return user


@app.errorhandler(HttpError)
def handle_http_error(e):
    return jsonify({"error": e.message}), e.status


@app.before_request
def _ensure_db():
    db.ensure_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    errors = {}
    if not USERNAME_RE.match(username):
        errors["username"] = "Username must be 3-64 characters using letters, numbers, '.', '-' or '_'."
    if username.lower() == "admin":
        errors["username"] = "This username is reserved."
    if len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400
    conn = db.get_conn()
    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        conn.close()
        return jsonify({"error": "Username is already taken"}), 409
    user_id = secrets.token_hex(16)
    password_hash = db.hash_password(password)
    with conn:
        conn.execute(
            "INSERT INTO users (id, username, password_hash, role, created_at)"
            " VALUES (?, ?, ?, 'user', ?)",
            (user_id, username, password_hash, db.now_iso()),
        )
    conn.close()
    return jsonify({"token": db.issue_token(user_id, password_hash)}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = str(body.get("username", "")).strip()
    password = str(body.get("password", ""))
    if username == "admin" and not os.environ.get("ADMIN_PASSWORD", "").strip():
        return jsonify({"error": "Invalid username or password"}), 401
    conn = db.get_conn()
    row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()
    if row is None or not db.verify_password(password, row["password_hash"]):
        return jsonify({"error": "Invalid username or password"}), 401
    return jsonify({"token": db.issue_token(row["id"], row["password_hash"])}), 200


@app.get("/api/auth/me")
def me():
    user = require_user()
    return jsonify({"username": user["username"], "role": user["role"]})


@app.get("/api/quiz")
def quiz():
    raw = request.args.get("count", "5")
    try:
        count = int(raw)
    except (TypeError, ValueError):
        return jsonify({"error": "count must be an integer"}), 400
    count = max(1, min(count, 20))
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM questions WHERE active = 1"
    ).fetchall()
    conn.close()
    if count > len(rows):
        return jsonify({"error": f"Only {len(rows)} questions are available"}), 400
    picked = random.sample(rows, count)
    return jsonify({"items": [row_to_question(r, False) for r in picked]})


@app.post("/api/attempts")
def submit_attempt():
    body = json_body()
    answers = body.get("answers")
    if not isinstance(answers, list) or not answers:
        return jsonify({"error": "Provide a non-empty list of answers"}), 400
    seen: set[int] = set()
    cleaned = []
    for entry in answers:
        if not isinstance(entry, dict):
            return jsonify({"error": "Each answer needs question_id and selected"}), 400
        try:
            qid = int(entry.get("question_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "Each answer needs question_id and selected"}), 400
        selected = str(entry.get("selected", "")).strip().upper()
        if selected not in OPTION_LETTERS:
            return jsonify({"error": f"Invalid answer for question {qid}"}), 400
        if qid in seen:
            continue
        seen.add(qid)
        cleaned.append((qid, selected))
    conn = db.get_conn()
    rows = {}
    for qid, _ in cleaned:
        row = conn.execute("SELECT * FROM questions WHERE id = ?", (qid,)).fetchone()
        if row is None:
            conn.close()
            return jsonify({"error": f"Question {qid} does not exist"}), 400
        rows[qid] = row
    review = []
    correct_count = 0
    for qid, selected in cleaned:
        row = rows[qid]
        is_correct = selected == row["correct_option"]
        if is_correct:
            correct_count += 1
        item = row_to_question(row, True)
        item["selected"] = selected
        item["is_correct"] = is_correct
        review.append(item)
    total = len(review)
    score = round(correct_count / total * 100, 1)
    attempt = {
        "id": None,
        "score": score,
        "correct": correct_count,
        "total_questions": total,
        "submitted_at": db.now_iso(),
        "answers": review,
    }
    user = current_user()
    if user is not None:
        with conn:
            cur = conn.execute(
                "INSERT INTO attempts (user_id, score, correct, total_questions, submitted_at, review)"
                " VALUES (?, ?, ?, ?, ?, ?)",
                (user["id"], score, correct_count, total, attempt["submitted_at"], json.dumps(review)),
            )
            attempt["id"] = cur.lastrowid
    conn.close()
    return jsonify(attempt), 201


def attempt_to_json(row) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "correct": row["correct"],
        "total_questions": row["total_questions"],
        "submitted_at": row["submitted_at"],
        "answers": json.loads(row["review"]),
    }


@app.get("/api/attempts")
def list_attempts():
    user = require_user()
    conn = db.get_conn()
    rows = conn.execute(
        "SELECT * FROM attempts WHERE user_id = ? ORDER BY submitted_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    conn.close()
    return jsonify({"items": [attempt_to_json(r) for r in rows]})


@app.get("/api/attempts/<int:attempt_id>")
def get_attempt(attempt_id: int):
    user = require_user()
    conn = db.get_conn()
    row = conn.execute(
        "SELECT * FROM attempts WHERE id = ? AND user_id = ?", (attempt_id, user["id"])
    ).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Attempt not found"}), 404
    return jsonify(attempt_to_json(row))


@app.post("/api/admin/questions")
def admin_add_question():
    require_admin()
    body = json_body()
    errors = {}
    fields = {}
    for name in ("text", "option_a", "option_b", "option_c", "option_d"):
        value = str(body.get(name, "")).strip()
        fields[name] = value
        if not value:
            errors[name] = "This field is required."
    correct = str(body.get("correct_option", "")).strip().upper()
    if correct not in OPTION_LETTERS:
        errors["correct_option"] = "correct_option must be one of A, B, C or D."
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400
    conn = db.get_conn()
    with conn:
        cur = conn.execute(
            "INSERT INTO questions (text, option_a, option_b, option_c, option_d,"
            " correct_option, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
            (fields["text"], fields["option_a"], fields["option_b"], fields["option_c"],
             fields["option_d"], correct, db.now_iso()),
        )
        row = conn.execute("SELECT * FROM questions WHERE id = ?", (cur.lastrowid,)).fetchone()
    conn.close()
    return jsonify(row_to_question(row, True)), 201


@app.get("/api/admin/questions")
def admin_list_questions():
    require_admin()
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        return jsonify({"error": "page and page_size must be integers"}), 400
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    conn = db.get_conn()
    total = conn.execute("SELECT COUNT(*) AS c FROM questions").fetchone()["c"]
    rows = conn.execute(
        "SELECT * FROM questions ORDER BY id LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    conn.close()
    return jsonify({
        "items": [row_to_question(r, True) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.errorhandler(404)
def api_not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    return e


@app.errorhandler(405)
def api_not_allowed(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed"}), 405
    return e


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found"}), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


db.init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
