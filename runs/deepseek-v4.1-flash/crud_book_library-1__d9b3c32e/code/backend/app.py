"""Flask entry point: JSON API and frontend static serving."""

import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DB_PATH = os.environ.get(
    "DATABASE_PATH", str(Path.cwd() / "data" / "library.db")
)

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

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


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, _digest = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(404)
def handle_404(_err):
    if request.path.startswith("/api"):
        return jsonify({"error": "Not found."}), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_err):
    if request.path.startswith("/api"):
        return jsonify({"error": "Method not allowed."}), 405
    return send_from_directory(DIST, "index.html")


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError("A JSON object is required.")
    return data


def clean_str(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ApiError("Expected a string value.")
    return value.strip()


def parse_year(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ApiError("Year must be a number.")
    if isinstance(value, int):
        year = value
    elif isinstance(value, float) and value.is_integer():
        year = int(value)
    elif isinstance(value, str) and value.strip().lstrip("-").isdigit():
        year = int(value.strip())
    else:
        raise ApiError("Year must be a number.")
    if year < 1 or year > 9999:
        raise ApiError("Year must be between 1 and 9999.")
    return year


def parse_optional_str(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ApiError("ISBN must be a string.")
    value = value.strip()
    return value or None


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT users.id, users.username FROM tokens "
        "JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            raise ApiError("Authentication required.", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def book_row_to_dict(row: sqlite3.Row) -> dict:
    avg = row["average_rating"]
    average = None
    if avg is not None:
        average = float(
            Decimal(str(avg)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        )
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": row["review_count"],
        "average_rating": average,
    }


BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count,
       AVG(r.rating) AS average_rating
FROM books b
LEFT JOIN reviews r ON r.book_id = b.id
"""


def get_book_or_404(book_id: int):
    row = get_db().execute(
        BOOK_SELECT + " WHERE b.id = ? GROUP BY b.id", (book_id,)
    ).fetchone()
    if row is None:
        raise ApiError("Book not found.", 404)
    return row


def review_row_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = clean_str(data.get("username"))
    password = data.get("password")
    if not username:
        raise ApiError("Username is required.")
    if len(username) > 50:
        raise ApiError("Username must be at most 50 characters.")
    if not isinstance(password, str) or not password:
        raise ApiError("Password is required.")

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        raise ApiError("Username is already taken.", 409)

    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), now_iso()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = clean_str(data.get("username"))
    password = data.get("password")
    if not username or not isinstance(password, str) or not password:
        raise ApiError("Username and password are required.", 401)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if user is None or not verify_password(password, user["password_hash"]):
        raise ApiError("Invalid username or password.", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/books")
def list_books():
    db = get_db()
    q = clean_str(request.args.get("q"))
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", 10))
    except (TypeError, ValueError):
        page_size = 10
    page_size = min(max(page_size, 1), 100)

    where = ""
    params: list = []
    if q:
        like = f"%{q}%"
        where = " WHERE (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)"
        params = [like, like, like]

    total = db.execute(
        "SELECT COUNT(*) FROM books b" + where, params
    ).fetchone()[0]
    rows = db.execute(
        BOOK_SELECT
        + where
        + " GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [book_row_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def validate_book(data: dict):
    title = clean_str(data.get("title"))
    author = clean_str(data.get("author"))
    if not title:
        raise ApiError("Title is required.")
    if not author:
        raise ApiError("Author is required.")
    year = parse_year(data.get("year"))
    isbn = parse_optional_str(data.get("isbn"))
    return title, author, year, isbn


@app.post("/api/books")
@login_required
def create_book():
    data = json_body()
    title, author, year, isbn = validate_book(data)
    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (title, author, year, isbn, now_iso()),
    )
    db.commit()
    return jsonify(book_row_to_dict(get_book_or_404(cur.lastrowid))), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    return jsonify(book_row_to_dict(get_book_or_404(book_id)))


@app.put("/api/books/<int:book_id>")
@login_required
def update_book(book_id: int):
    get_book_or_404(book_id)
    data = json_body()
    title, author, year, isbn = validate_book(data)
    db = get_db()
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (title, author, year, isbn, book_id),
    )
    db.commit()
    return jsonify(book_row_to_dict(get_book_or_404(book_id)))


@app.delete("/api/books/<int:book_id>")
@login_required
def delete_book(book_id: int):
    get_book_or_404(book_id)
    db = get_db()
    db.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    return jsonify({"ok": True})


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    get_book_or_404(book_id)
    rows = get_db().execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, "
        "u.username FROM reviews r JOIN users u ON u.id = r.user_id "
        "WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [review_row_to_dict(r) for r in rows]})


@app.post("/api/books/<int:book_id>/reviews")
@login_required
def create_review(book_id: int):
    get_book_or_404(book_id)
    data = json_body()
    rating = data.get("rating")
    if isinstance(rating, float) and rating.is_integer():
        rating = int(rating)
    if isinstance(rating, str) and rating.strip().lstrip("-").isdigit():
        rating = int(rating.strip())
    if isinstance(rating, bool) or not isinstance(rating, int):
        raise ApiError("Rating must be a number between 1 and 5.")
    if rating < 1 or rating > 5:
        raise ApiError("Rating must be between 1 and 5.")
    comment = clean_str(data.get("comment"))

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?",
        (book_id, g.user["id"]),
    ).fetchone()
    if existing is not None:
        raise ApiError("You have already reviewed this book.", 409)

    cur = db.execute(
        "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (book_id, g.user["id"], rating, comment, now_iso()),
    )
    db.commit()
    row = db.execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, "
        "u.username FROM reviews r JOIN users u ON u.id = r.user_id "
        "WHERE r.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(review_row_to_dict(row)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)), debug=True)
