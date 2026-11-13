"""Flask entry point for the book library API and web frontend."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "library.db"
SECRET_PATH = DATA_DIR / "secret.key"

TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_TITLE = 200
MAX_AUTHOR = 200
MAX_ISBN = 64
MAX_COMMENT = 2000
MAX_USERNAME = 50
MAX_PASSWORD = 200
MIN_RATING = 1
MAX_RATING = 5

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_books_created_at ON books(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id, created_at DESC, id DESC);
"""


def load_secret() -> bytes:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        return SECRET_PATH.read_bytes()
    key = secrets.token_bytes(32)
    try:
        with open(SECRET_PATH, "xb") as handle:
            handle.write(key)
        os.chmod(SECRET_PATH, 0o600)
    except FileExistsError:
        return SECRET_PATH.read_bytes()
    return key


SECRET = load_secret()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def error(message: str, status: int = 400, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def issue_token(user_id: int) -> str:
    payload = json.dumps(
        {"uid": user_id, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    signature = hmac.new(SECRET, payload, hashlib.sha256).digest()
    body = base64.urlsafe_b64encode(payload).rstrip(b"=")
    return f"{body.decode('ascii')}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode('ascii')}"


def read_token(token: str) -> dict[str, Any] | None:
    if not token or "." not in token:
        return None
    body_part, _, signature_part = token.partition(".")
    try:
        body = base64.urlsafe_b64decode(body_part + "=" * (-len(body_part) % 4))
        signature = base64.urlsafe_b64decode(signature_part + "=" * (-len(signature_part) % 4))
    except Exception:
        return None
    expected = hmac.new(SECRET, body, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        data = json.loads(body.decode("utf-8"))
    except Exception:
        return None
    if not isinstance(data, dict) or "uid" not in data:
        return None
    if float(data.get("exp", 0)) < time.time():
        return None
    return data


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    data = read_token(parts[1].strip())
    if not data:
        return None
    row = get_db().execute("SELECT id, username FROM users WHERE id = ?", (data["uid"],)).fetchone()
    return row


def require_auth(view: Callable[..., Any]):
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return error("Authentication required.", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def json_body() -> tuple[dict[str, Any] | None, Any]:
    body = request.get_json(silent=True)
    if body is None:
        return None, error("A JSON object body is required.", 400)
    if not isinstance(body, dict):
        return None, error("A JSON object body is required.", 400)
    return body, None


def clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def round_rating(value: float | None) -> float | None:
    if value is None:
        return None
    quantised = Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
    return float(quantised)


def serialize_book(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": row["review_count"],
        "average_rating": round_rating(row["average_rating"]),
    }


def serialize_review(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COUNT(r.id) AS review_count,
       AVG(r.rating) AS average_rating
FROM books b
LEFT JOIN reviews r ON r.book_id = b.id
"""

BOOK_GROUP = " GROUP BY b.id"


def fetch_book(book_id: int) -> sqlite3.Row | None:
    query = BOOK_SELECT + " WHERE b.id = ?" + BOOK_GROUP
    return get_db().execute(query, (book_id,)).fetchone()


def positive_int(value: Any, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return number if number > 0 else default


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body, failure = json_body()
    if failure is not None:
        return failure
    assert body is not None
    errors: dict[str, str] = {}
    username = clean_text(body.get("username"))
    password = body.get("password")
    if not username:
        errors["username"] = "Username is required."
    elif len(username) > MAX_USERNAME:
        errors["username"] = f"Username must be at most {MAX_USERNAME} characters."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > MAX_PASSWORD:
        errors["password"] = f"Password must be at most {MAX_PASSWORD} characters."
    if errors:
        return error("Please fix the highlighted fields.", 400, errors)

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return error("That username is already taken.", 409, {"username": "That username is already taken."})

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utc_now()),
    )
    db.commit()
    user_id = cursor.lastrowid
    return jsonify({"id": user_id, "username": username, "token": issue_token(user_id)}), 201


@app.post("/api/auth/login")
def login():
    body, failure = json_body()
    if failure is not None:
        return failure
    assert body is not None
    username = clean_text(body.get("username"))
    password = body.get("password")
    if not username or not isinstance(password, str) or not password:
        return error("Username and password are required.", 400)
    row = get_db().execute("SELECT id, username, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("Invalid username or password.", 401)
    return jsonify({"token": issue_token(row["id"])}), 200


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]}), 200


@app.get("/api/books")
def list_books():
    query = clean_text(request.args.get("q"))
    page = positive_int(request.args.get("page"), 1)
    page_size = positive_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE)
    page_size = min(page_size, MAX_PAGE_SIZE)

    params: list[Any] = []
    where = ""
    if query:
        where = " WHERE (b.title LIKE ? OR b.author LIKE ? OR IFNULL(b.isbn, '') LIKE ?)"
        needle = f"%{query}%"
        params.extend([needle, needle, needle])

    db = get_db()
    total = db.execute("SELECT COUNT(*) AS c FROM books b" + where, params).fetchone()["c"]
    rows = db.execute(
        BOOK_SELECT + where + BOOK_GROUP + " ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
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


def validate_book(body: dict[str, Any]) -> tuple[dict[str, Any], dict[str, str]]:
    values: dict[str, Any] = {}
    errors: dict[str, str] = {}

    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > MAX_TITLE:
        errors["title"] = f"Title must be at most {MAX_TITLE} characters."
    else:
        values["title"] = title.strip()

    author = body.get("author")
    if not isinstance(author, str) or not author.strip():
        errors["author"] = "Author is required."
    elif len(author.strip()) > MAX_AUTHOR:
        errors["author"] = f"Author must be at most {MAX_AUTHOR} characters."
    else:
        values["author"] = author.strip()

    raw_year = body.get("year")
    if raw_year is None or (isinstance(raw_year, str) and not raw_year.strip()):
        values["year"] = None
    elif isinstance(raw_year, bool):
        errors["year"] = "Year must be a whole number."
    elif isinstance(raw_year, int):
        values["year"] = raw_year
    elif isinstance(raw_year, float) and raw_year.is_integer():
        values["year"] = int(raw_year)
    elif isinstance(raw_year, str) and raw_year.strip().lstrip("+-").isdigit():
        values["year"] = int(raw_year.strip())
    else:
        errors["year"] = "Year must be a whole number."

    if "year" in values and values["year"] is not None:
        if not -3000 <= values["year"] <= 9999:
            errors["year"] = "Year must be between -3000 and 9999."
        else:
            values["year"] = int(values["year"])

    raw_isbn = body.get("isbn")
    if raw_isbn is None or (isinstance(raw_isbn, str) and not raw_isbn.strip()):
        values["isbn"] = None
    elif not isinstance(raw_isbn, str):
        errors["isbn"] = "ISBN must be text."
    elif len(raw_isbn.strip()) > MAX_ISBN:
        errors["isbn"] = f"ISBN must be at most {MAX_ISBN} characters."
    else:
        values["isbn"] = raw_isbn.strip()

    return values, errors


@app.post("/api/books")
@require_auth
def create_book():
    body, failure = json_body()
    if failure is not None:
        return failure
    assert body is not None
    values, errors = validate_book(body)
    if errors:
        return error("Please fix the highlighted fields.", 400, errors)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (values["title"], values["author"], values["year"], values["isbn"], utc_now()),
    )
    db.commit()
    row = fetch_book(cursor.lastrowid)
    assert row is not None
    return jsonify(serialize_book(row)), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    row = fetch_book(book_id)
    if row is None:
        return error("Book not found.", 404)
    return jsonify(serialize_book(row)), 200


@app.put("/api/books/<int:book_id>")
@require_auth
def update_book(book_id: int):
    body, failure = json_body()
    if failure is not None:
        return failure
    assert body is not None
    db = get_db()
    existing = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if existing is None:
        return error("Book not found.", 404)
    values, errors = validate_book(body)
    if errors:
        return error("Please fix the highlighted fields.", 400, errors)
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (values["title"], values["author"], values["year"], values["isbn"], book_id),
    )
    db.commit()
    row = fetch_book(book_id)
    assert row is not None
    return jsonify(serialize_book(row)), 200


@app.delete("/api/books/<int:book_id>")
@require_auth
def delete_book(book_id: int):
    db = get_db()
    existing = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if existing is None:
        return error("Book not found.", 404)
    db.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    return "", 204


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    db = get_db()
    book = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if book is None:
        return error("Book not found.", 404)
    rows = db.execute(
        """
        SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.book_id = ?
        ORDER BY r.created_at DESC, r.id DESC
        """,
        (book_id,),
    ).fetchall()
    return jsonify({"items": [serialize_review(row) for row in rows]}), 200


@app.post("/api/books/<int:book_id>/reviews")
@require_auth
def create_review(book_id: int):
    body, failure = json_body()
    if failure is not None:
        return failure
    assert body is not None
    db = get_db()
    book = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if book is None:
        return error("Book not found.", 404)

    errors: dict[str, str] = {}
    raw_rating = body.get("rating")
    rating: int | None = None
    if raw_rating is None or (isinstance(raw_rating, str) and not raw_rating.strip()):
        errors["rating"] = "Rating is required."
    elif isinstance(raw_rating, bool):
        errors["rating"] = "Rating must be a whole number."
    elif isinstance(raw_rating, int):
        rating = raw_rating
    elif isinstance(raw_rating, float) and raw_rating.is_integer():
        rating = int(raw_rating)
    elif isinstance(raw_rating, str) and raw_rating.strip().lstrip("+-").isdigit():
        rating = int(raw_rating.strip())
    else:
        errors["rating"] = "Rating must be a whole number."
    if rating is not None and not MIN_RATING <= rating <= MAX_RATING:
        errors["rating"] = f"Rating must be between {MIN_RATING} and {MAX_RATING}."

    raw_comment = body.get("comment")
    comment = ""
    if raw_comment is not None:
        if not isinstance(raw_comment, str):
            errors["comment"] = "Comment must be text."
        elif len(raw_comment) > MAX_COMMENT:
            errors["comment"] = f"Comment must be at most {MAX_COMMENT} characters."
        else:
            comment = raw_comment.strip()

    if errors:
        return error("Please fix the highlighted fields.", 400, errors)

    duplicate = db.execute(
        "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?",
        (book_id, g.user["id"]),
    ).fetchone()
    if duplicate is not None:
        return error("You have already reviewed this book.", 409)

    cursor = db.execute(
        "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
        (book_id, g.user["id"], rating, comment, utc_now()),
    )
    db.commit()
    row = db.execute(
        """
        SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username
        FROM reviews r
        JOIN users u ON u.id = r.user_id
        WHERE r.id = ?
        """,
        (cursor.lastrowid,),
    ).fetchone()
    assert row is not None
    return jsonify(serialize_review(row)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found.", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
