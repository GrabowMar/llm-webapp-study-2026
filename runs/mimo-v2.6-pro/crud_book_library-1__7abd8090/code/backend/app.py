"""Book library: JSON API under /api plus the frontend build."""

import re
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "library.db"

DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def error_response(status: int, message: str):
    return jsonify({"error": message, "message": message}), status


@app.errorhandler(ApiError)
def handle_api_error(exc: ApiError):
    return error_response(exc.status, exc.message)


@app.errorhandler(404)
def handle_not_found(_exc):
    return error_response(404, "Not found")


@app.errorhandler(405)
def handle_method_not_allowed(_exc):
    return error_response(405, "Method not allowed")


@app.errorhandler(400)
def handle_bad_request(_exc):
    return error_response(400, "Bad request")


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
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
    rating INTEGER NOT NULL,
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (book_id, user_id)
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def require_str(data: dict, field: str, *, allow_empty: bool = False) -> str:
    if field not in data or data[field] is None:
        raise ApiError(400, f"{field} is required")
    value = data[field]
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be a string")
    value = value.strip()
    if not allow_empty and not value:
        raise ApiError(400, f"{field} is required")
    return value


def optional_str(data: dict, field: str):
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if not isinstance(value, str):
        raise ApiError(400, f"{field} must be a string")
    value = value.strip()
    return value or None


def optional_int(data: dict, field: str, lo: int, hi: int):
    if field not in data or data[field] is None:
        return None
    value = data[field]
    if isinstance(value, bool):
        raise ApiError(400, f"{field} must be an integer")
    if isinstance(value, str):
        if not value.strip():
            return None
        if not re.fullmatch(r"-?\d+", value.strip()):
            raise ApiError(400, f"{field} must be an integer")
        value = int(value.strip())
    if isinstance(value, float):
        if not value.is_integer():
            raise ApiError(400, f"{field} must be an integer")
        value = int(value)
    if not isinstance(value, int):
        raise ApiError(400, f"{field} must be an integer")
    if value < lo or value > hi:
        raise ApiError(400, f"{field} must be between {lo} and {hi}")
    return value


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def current_user():
    auth = request.headers.get("Authorization", "")
    match = re.fullmatch(r"Bearer\s+(.+)", auth.strip(), re.IGNORECASE)
    if not match:
        raise ApiError(401, "Authentication required")
    token = match.group(1).strip()
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id"
        " WHERE t.token = ?",
        (token,),
    ).fetchone()
    if row is None:
        raise ApiError(401, "Invalid or expired token")
    return {"id": row["id"], "username": row["username"]}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = require_str(data, "username")
    password = require_str(data, "password")
    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError(400, "Username already taken")
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utcnow()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = require_str(data, "username")
    password = require_str(data, "password")
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------

BOOK_AGGREGATE = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count,
       AVG(r.rating) AS avg_rating
FROM books b
LEFT JOIN reviews r ON r.book_id = b.id
"""


def serialize_book(row) -> dict:
    count = row["review_count"] or 0
    avg = row["avg_rating"]
    if avg is None:
        average_rating = None
    else:
        average_rating = float(
            Decimal(str(avg)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        )
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": count,
        "average_rating": average_rating,
    }


def fetch_book(book_id: int) -> dict:
    row = get_db().execute(
        BOOK_AGGREGATE + " WHERE b.id = ? GROUP BY b.id", (book_id,)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Book not found")
    return serialize_book(row)


def parse_book_fields(data: dict) -> tuple:
    title = require_str(data, "title")
    author = require_str(data, "author")
    year = optional_int(data, "year", 0, 9999)
    isbn = optional_str(data, "isbn")
    return title, author, year, isbn


@app.get("/api/books")
def list_books():
    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", str(DEFAULT_PAGE_SIZE)))
    except ValueError:
        raise ApiError(400, "page and page_size must be integers")
    if page < 1:
        raise ApiError(400, "page must be at least 1")
    if page_size < 1:
        raise ApiError(400, "page_size must be at least 1")

    q = request.args.get("q", "").strip()
    where = ""
    params = []
    if q:
        where = " WHERE b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?"
        like = f"%{q}%"
        params = [like, like, like]

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM books b" + where, params
    ).fetchone()["n"]
    rows = db.execute(
        BOOK_AGGREGATE
        + where
        + " GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_book(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/books")
def create_book():
    current_user()
    data = json_body()
    title, author, year, isbn = parse_book_fields(data)
    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (title, author, year, isbn, utcnow()),
    )
    db.commit()
    return jsonify(fetch_book(cur.lastrowid)), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    return jsonify(fetch_book(book_id))


@app.put("/api/books/<int:book_id>")
def replace_book(book_id: int):
    current_user()
    fetch_book(book_id)
    data = json_body()
    title, author, year, isbn = parse_book_fields(data)
    db = get_db()
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (title, author, year, isbn, book_id),
    )
    db.commit()
    return jsonify(fetch_book(book_id))


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id: int):
    current_user()
    db = get_db()
    cur = db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    if cur.rowcount == 0:
        raise ApiError(404, "Book not found")
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Reviews
# ---------------------------------------------------------------------------


def serialize_review(row) -> dict:
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    db = get_db()
    exists = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if exists is None:
        raise ApiError(404, "Book not found")
    rows = db.execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username"
        " FROM reviews r JOIN users u ON u.id = r.user_id"
        " WHERE r.book_id = ?"
        " ORDER BY r.created_at DESC, r.id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [serialize_review(row) for row in rows]})


@app.post("/api/books/<int:book_id>/reviews")
def create_review(book_id: int):
    user = current_user()
    db = get_db()
    exists = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if exists is None:
        raise ApiError(404, "Book not found")
    data = json_body()
    rating = optional_int(data, "rating", 1, 5)
    if rating is None:
        raise ApiError(400, "rating is required")
    comment = optional_str(data, "comment") or ""
    duplicate = db.execute(
        "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?",
        (book_id, user["id"]),
    ).fetchone()
    if duplicate is not None:
        raise ApiError(400, "You have already reviewed this book")
    cur = db.execute(
        "INSERT INTO reviews (book_id, user_id, rating, comment, created_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (book_id, user["id"], rating, comment, utcnow()),
    )
    db.commit()
    row = db.execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username"
        " FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(serialize_review(row)), 201


# ---------------------------------------------------------------------------
# Health and frontend
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
