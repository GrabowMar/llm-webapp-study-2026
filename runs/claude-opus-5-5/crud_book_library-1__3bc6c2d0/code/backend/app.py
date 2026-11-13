"""Flask entry point."""

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "library.db"

USERNAME_RE = re.compile(r"^\S{1,64}$")
ISBN_RE = re.compile(r"^(?:\d{9}[\dX]|\d{13})$")
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
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
CREATE INDEX IF NOT EXISTS idx_books_created ON books(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id, created_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def now_iso():
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
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


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() == "bearer" and token:
        row = db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row:
            g.user = {"id": row["id"], "username": row["username"]}
    return g.user


def require_user():
    user = current_user()
    if user is None:
        raise ApiError(401, "Authentication required.")
    return user


def average(total, count):
    if not count:
        return None
    value = (Decimal(total) / Decimal(count)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(value)


BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count, COALESCE(SUM(r.rating), 0) AS rating_sum
FROM books b LEFT JOIN reviews r ON r.book_id = b.id
"""


def book_dict(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": row["review_count"],
        "average_rating": average(row["rating_sum"], row["review_count"]),
    }


def fetch_book(book_id):
    row = db().execute(BOOK_SELECT + " WHERE b.id = ? GROUP BY b.id", (book_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Book not found.")
    return book_dict(row)


def ensure_book_exists(book_id):
    if db().execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        raise ApiError(404, "Book not found.")


def validate_book(data):
    errors = {}
    clean = {}
    for field, label, limit in (("title", "Title", 300), ("author", "Author", 200)):
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            errors[field] = f"{label} is required."
        elif not isinstance(value, str):
            errors[field] = f"{label} must be a string."
        elif len(value.strip()) > limit:
            errors[field] = f"{label} must be at most {limit} characters."
        else:
            clean[field] = value.strip()

    year = data.get("year")
    if isinstance(year, str) and year.strip() == "":
        year = None
    if year is None:
        clean["year"] = None
    else:
        if isinstance(year, str) and re.fullmatch(r"-?\d+", year.strip()):
            year = int(year.strip())
        if isinstance(year, float) and year.is_integer():
            year = int(year)
        max_year = datetime.now(UTC).year + 1
        if isinstance(year, bool) or not isinstance(year, int):
            errors["year"] = "Year must be a whole number."
        elif year < 1 or year > max_year:
            errors["year"] = f"Year must be between 1 and {max_year}."
        else:
            clean["year"] = year

    isbn = data.get("isbn")
    if isbn is None or (isinstance(isbn, str) and not isbn.strip()):
        clean["isbn"] = None
    elif not isinstance(isbn, str):
        errors["isbn"] = "ISBN must be a string."
    else:
        compact = re.sub(r"[\s-]", "", isbn.strip()).upper()
        if not ISBN_RE.fullmatch(compact):
            errors["isbn"] = "ISBN must have 10 or 13 digits (ISBN-10 may end in X)."
        else:
            clean["isbn"] = isbn.strip()

    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return clean


def parse_positive_int(name, default):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer.", {name: "Must be a positive integer."})
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer.", {name: "Must be a positive integer."})
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
        errors["username"] = "Username is required."
    elif not USERNAME_RE.fullmatch(username.strip()):
        errors["username"] = "Username must be 1-64 characters without spaces."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) < 4:
        errors["password"] = "Password must be at least 4 characters."
    elif len(password) > 200:
        errors["password"] = "Password must be at most 200 characters."
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    username = username.strip()
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "Username and password are required.")
    conn = db()
    row = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], now_iso()),
    )
    conn.commit()
    return {"token": token, "username": row["username"]}


@app.get("/api/auth/me")
def me():
    user = require_user()
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/logout")
def logout():
    require_user()
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    conn.commit()
    return "", 204


@app.get("/api/books")
def list_books():
    page = parse_positive_int("page", 1)
    page_size = min(parse_positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    q = (request.args.get("q") or "").strip()
    where = ""
    params = []
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where = (
            " WHERE b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\'"
            " OR COALESCE(b.isbn, '') LIKE ? ESCAPE '\\'"
        )
        params = [pattern, pattern, pattern]
    conn = db()
    total = conn.execute("SELECT COUNT(*) FROM books b" + where, params).fetchone()[0]
    rows = conn.execute(
        BOOK_SELECT + where + " GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [book_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/books")
def create_book():
    require_user()
    clean = validate_book(json_body())
    conn = db()
    cur = conn.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (clean["title"], clean["author"], clean["year"], clean["isbn"], now_iso()),
    )
    conn.commit()
    return fetch_book(cur.lastrowid), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id):
    return fetch_book(book_id)


@app.put("/api/books/<int:book_id>")
def update_book(book_id):
    require_user()
    ensure_book_exists(book_id)
    clean = validate_book(json_body())
    conn = db()
    conn.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (clean["title"], clean["author"], clean["year"], clean["isbn"], book_id),
    )
    conn.commit()
    return fetch_book(book_id)


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id):
    require_user()
    ensure_book_exists(book_id)
    conn = db()
    conn.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    return "", 204


def review_dict(row):
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


REVIEW_SELECT = """
SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username
FROM reviews r JOIN users u ON u.id = r.user_id
"""


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id):
    ensure_book_exists(book_id)
    rows = db().execute(
        REVIEW_SELECT + " WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC", (book_id,)
    ).fetchall()
    return {"items": [review_dict(r) for r in rows]}


@app.post("/api/books/<int:book_id>/reviews")
def create_review(book_id):
    user = require_user()
    ensure_book_exists(book_id)
    data = json_body()
    errors = {}
    rating = data.get("rating")
    if isinstance(rating, float) and rating.is_integer():
        rating = int(rating)
    if isinstance(rating, str) and rating.strip().isdigit():
        rating = int(rating.strip())
    if rating is None:
        errors["rating"] = "Rating is required."
    elif isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
        errors["rating"] = "Rating must be a whole number from 1 to 5."
    comment = data.get("comment")
    if comment is None:
        comment = ""
    elif not isinstance(comment, str):
        errors["comment"] = "Comment must be a string."
    elif len(comment.strip()) > 2000:
        errors["comment"] = "Comment must be at most 2000 characters."
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
            (book_id, user["id"], rating, comment.strip(), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "You have already reviewed this book.")
    row = conn.execute(REVIEW_SELECT + " WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return review_dict(row), 201


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path=""):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
