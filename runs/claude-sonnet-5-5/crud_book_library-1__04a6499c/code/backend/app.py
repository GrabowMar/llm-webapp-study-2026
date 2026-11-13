"""Book library: Flask API and frontend host."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "library.db"

TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

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
    expires_at TEXT NOT NULL
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
"""


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body: dict = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(404)
def handle_404(_err):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(405)
def handle_405(_err):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def handle_500(_err):
    return jsonify({"error": "Internal server error"}), 500


def body_object() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise ApiError(401, "Authentication required")
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(parts[1].strip()),),
    ).fetchone()
    if row is None or row["expires_at"] < iso(now()):
        raise ApiError(401, "Authentication required")
    return row


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = body_object()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    else:
        username = username.strip()
        if len(username) > 50:
            errors["username"] = "Username must be at most 50 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) > 200:
        errors["password"] = "Password must be at most 200 characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso(now())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "Username is already taken", {"username": "Username is already taken"}
        )
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body_object()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "Username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (iso(now()),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], iso(now() + TOKEN_TTL)),
    )
    conn.commit()
    return jsonify({"token": token})


BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count, COALESCE(SUM(r.rating), 0) AS rating_sum
FROM books b LEFT JOIN reviews r ON r.book_id = b.id
"""


def book_json(row: sqlite3.Row) -> dict:
    count = row["review_count"]
    average = None
    if count:
        average = float(
            (Decimal(row["rating_sum"]) / Decimal(count)).quantize(
                Decimal("0.1"), rounding=ROUND_HALF_UP
            )
        )
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": count,
        "average_rating": average,
    }


def fetch_book(book_id: int) -> sqlite3.Row:
    row = db().execute(BOOK_SELECT + " WHERE b.id = ? GROUP BY b.id", (book_id,)).fetchone()
    if row is None or row["id"] is None:
        raise ApiError(404, "Book not found")
    return row


def validate_book(data: dict) -> dict:
    errors = {}
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    else:
        title = title.strip()
        if len(title) > 200:
            errors["title"] = "Title must be at most 200 characters"
    author = data.get("author")
    if not isinstance(author, str) or not author.strip():
        errors["author"] = "Author is required"
    else:
        author = author.strip()
        if len(author) > 200:
            errors["author"] = "Author must be at most 200 characters"
    year = data.get("year")
    if year is not None:
        if isinstance(year, bool) or not isinstance(year, int):
            errors["year"] = "Year must be a whole number"
        elif year < 1 or year > 9999:
            errors["year"] = "Year must be between 1 and 9999"
    isbn = data.get("isbn")
    if isbn is not None:
        if not isinstance(isbn, str):
            errors["isbn"] = "ISBN must be a string"
        else:
            isbn = isbn.strip()
            if not isbn:
                isbn = None
            elif len(isbn) > 32:
                errors["isbn"] = "ISBN must be at most 32 characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    return {"title": title, "author": author, "year": year, "isbn": isbn}


def int_param(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer")
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer")
    return value


@app.get("/api/books")
def list_books():
    page = int_param("page", 1)
    page_size = min(int_param("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    q = (request.args.get("q") or "").strip()
    where = ""
    params: list = []
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where = " WHERE (b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\')"
        params = [f"%{escaped}%"] * 2
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM books b{where}", params).fetchone()[0]
    rows = conn.execute(
        BOOK_SELECT + where + " GROUP BY b.id ORDER BY b.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [book_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/books")
def create_book():
    current_user()
    fields = validate_book(body_object())
    conn = db()
    cur = conn.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (fields["title"], fields["author"], fields["year"], fields["isbn"], iso(now())),
    )
    conn.commit()
    return jsonify(book_json(fetch_book(cur.lastrowid))), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    return jsonify(book_json(fetch_book(book_id)))


@app.put("/api/books/<int:book_id>")
def update_book(book_id: int):
    current_user()
    fetch_book(book_id)
    fields = validate_book(body_object())
    conn = db()
    conn.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (fields["title"], fields["author"], fields["year"], fields["isbn"], book_id),
    )
    conn.commit()
    return jsonify(book_json(fetch_book(book_id)))


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id: int):
    current_user()
    fetch_book(book_id)
    conn = db()
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    return "", 204


def review_json(row: sqlite3.Row) -> dict:
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
def list_reviews(book_id: int):
    fetch_book(book_id)
    rows = db().execute(
        REVIEW_SELECT + " WHERE r.book_id = ? ORDER BY r.id DESC", (book_id,)
    ).fetchall()
    return jsonify({"items": [review_json(r) for r in rows]})


@app.post("/api/books/<int:book_id>/reviews")
def create_review(book_id: int):
    user = current_user()
    fetch_book(book_id)
    data = body_object()
    errors = {}
    rating = data.get("rating")
    if isinstance(rating, bool) or not isinstance(rating, int) or not 1 <= rating <= 5:
        errors["rating"] = "Rating must be a whole number from 1 to 5"
    comment = data.get("comment")
    if comment is None:
        comment = ""
    elif not isinstance(comment, str):
        errors["comment"] = "Comment must be a string"
    else:
        comment = comment.strip()
        if len(comment) > 2000:
            errors["comment"] = "Comment must be at most 2000 characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (book_id, user["id"], rating, comment, iso(now())),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
        if conn.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
            raise ApiError(404, "Book not found")
        raise ApiError(409, "You have already reviewed this book")
    row = conn.execute(REVIEW_SELECT + " WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(review_json(row)), 201


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
