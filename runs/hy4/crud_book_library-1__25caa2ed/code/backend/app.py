"""Shared book catalogue API and frontend server."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data"))
DB_PATH = DATA_DIR / "library.db"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    year INTEGER,
    isbn TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (book_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_books_created ON books(created_at DESC, id DESC);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 15000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exception):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count,
       AVG(r.rating) AS avg_rating
FROM books b
LEFT JOIN reviews r ON r.book_id = b.id
"""


def book_dict(row) -> dict:
    average = row["avg_rating"]
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": row["review_count"],
        "average_rating": round(float(average), 1) if average is not None else None,
    }


def review_dict(row) -> dict:
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


def body() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def error(message: str, status: int, errors: dict | None = None):
    payload = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def validation_error(errors: dict):
    message = "Validation failed"
    if errors:
        message = " ".join(errors.values())
    return error(message, 400, errors)


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            """SELECT u.id, u.username FROM tokens t
               JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
            (token,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def as_text(value, field: str, errors: dict, required: bool, max_len: int = 5000):
    """Normalise an optional/required text field."""
    if value is None:
        if required:
            errors[field] = f"{field.capitalize()} is required."
        return None
    if not isinstance(value, str):
        errors[field] = f"{field.capitalize()} must be a string."
        return None
    value = value.strip()
    if not value:
        if required:
            errors[field] = f"{field.capitalize()} is required."
        return None
    if len(value) > max_len:
        errors[field] = f"{field.capitalize()} must be at most {max_len} characters."
        return None
    return value


def as_int(value, field: str, errors: dict, *, required=False, low=None, high=None):
    if value is None or value == "":
        if required:
            errors[field] = f"{field.capitalize()} is required."
        return None
    if isinstance(value, bool):
        errors[field] = f"{field.capitalize()} must be an integer."
        return None
    if isinstance(value, int):
        number = value
    elif isinstance(value, float) and value.is_integer():
        number = int(value)
    elif isinstance(value, str) and value.strip().lstrip("+-").isdigit():
        number = int(value.strip())
    else:
        errors[field] = f"{field.capitalize()} must be an integer."
        return None
    if (low is not None and number < low) or (high is not None and number > high):
        errors[field] = f"{field.capitalize()} must be between {low} and {high}."
        return None
    return number


def like_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@app.before_request
def handle_options():
    if request.method == "OPTIONS":
        return "", 204


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = body()
    errors: dict = {}
    username = as_text(data.get("username"), "username", errors, True, 80)
    password = as_text(data.get("password"), "password", errors, True, 200)
    if errors:
        return validation_error(errors)

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("Username is already taken", 409, {"username": "Username is already taken."})

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    errors: dict = {}
    username = as_text(data.get("username"), "username", errors, True, 80)
    password = as_text(data.get("password"), "password", errors, True, 200)
    if errors:
        return validation_error(errors)

    user = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    token = request.headers.get("Authorization", "")[7:].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"message": "Signed out"}), 200


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]}), 200


# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------


@app.get("/api/books")
def list_books():
    q = request.args.get("q", "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(1000, int(request.args.get("page_size", 20))))
    except (TypeError, ValueError):
        page_size = 20

    where = ""
    params: list = []
    if q:
        where = (
            "WHERE b.title LIKE ? ESCAPE '\\' "
            "OR b.author LIKE ? ESCAPE '\\' "
            "OR COALESCE(b.isbn, '') LIKE ? ESCAPE '\\'"
        )
        pattern = like_pattern(q)
        params = [pattern, pattern, pattern]

    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM books b {where}", params).fetchone()[0]
    rows = db.execute(
        f"{BOOK_SELECT} {where} GROUP BY b.id "
        "ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [book_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/books")
@login_required
def create_book():
    data = body()
    errors: dict = {}
    title = as_text(data.get("title"), "title", errors, True, 300)
    author = as_text(data.get("author"), "author", errors, True, 300)
    year = as_int(data.get("year"), "year", errors, low=1, high=9999)
    isbn = as_text(data.get("isbn"), "isbn", errors, False, 64)
    if errors:
        return validation_error(errors)

    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (title, author, year, isbn, now_iso()),
    )
    db.commit()
    row = db.execute(f"{BOOK_SELECT} WHERE b.id = ? GROUP BY b.id", (cur.lastrowid,)).fetchone()
    return jsonify(book_dict(row)), 201


def find_book(book_id: int):
    return (
        get_db()
        .execute(f"{BOOK_SELECT} WHERE b.id = ? GROUP BY b.id", (book_id,))
        .fetchone()
    )


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    row = find_book(book_id)
    if row is None:
        return error("Book not found", 404)
    return jsonify(book_dict(row))


@app.put("/api/books/<int:book_id>")
@login_required
def update_book(book_id: int):
    row = find_book(book_id)
    if row is None:
        return error("Book not found", 404)

    data = body()
    errors: dict = {}
    # A PUT replaces the fields: omitted year/isbn are cleared, while omitted
    # title/author keep their current values.
    title = row["title"] if "title" not in data else as_text(data.get("title"), "title", errors, True, 300)
    author = row["author"] if "author" not in data else as_text(data.get("author"), "author", errors, True, 300)
    year = as_int(data.get("year"), "year", errors, low=1, high=9999)
    isbn = as_text(data.get("isbn"), "isbn", errors, False, 64)
    if errors:
        return validation_error(errors)

    db = get_db()
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (title, author, year, isbn, book_id),
    )
    db.commit()
    return jsonify(book_dict(find_book(book_id))), 200


@app.delete("/api/books/<int:book_id>")
@login_required
def delete_book(book_id: int):
    if find_book(book_id) is None:
        return error("Book not found", 404)
    db = get_db()
    db.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    return jsonify({"message": "Book deleted", "id": book_id}), 200


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------

REVIEW_SELECT = """
SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username
FROM reviews r
JOIN users u ON u.id = r.user_id
"""


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    if get_db().execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        return error("Book not found", 404)
    rows = get_db().execute(
        f"{REVIEW_SELECT} WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [review_dict(row) for row in rows]})


@app.post("/api/books/<int:book_id>/reviews")
@login_required
def create_review(book_id: int):
    if get_db().execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        return error("Book not found", 404)

    data = body()
    errors: dict = {}
    rating = as_int(data.get("rating"), "rating", errors, required=True, low=1, high=5)
    comment = as_text(data.get("comment"), "comment", errors, False, 5000)
    if errors:
        return validation_error(errors)

    db = get_db()
    if db.execute(
        "SELECT 1 FROM reviews WHERE book_id = ? AND user_id = ?", (book_id, g.user["id"])
    ).fetchone():
        return error("You have already reviewed this book", 409)

    cur = db.execute(
        "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
        (book_id, g.user["id"], rating, comment or "", now_iso()),
    )
    db.commit()
    row = db.execute(f"{REVIEW_SELECT} WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(review_dict(row)), 201


# ---------------------------------------------------------------------------
# Health / static frontend
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    target = DIST / path
    if path and target.is_file() and DIST in target.resolve().parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
