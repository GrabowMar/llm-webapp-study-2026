"""Flask entry point for the book library app."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "library.sqlite"

app = Flask(__name__, static_folder=None)


def utcnow():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
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
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE (book_id, user_id)
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()
    db.close()


init_db()


def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_user():
    user = current_user()
    if user is None:
        return None, jsonify({"error": "Authentication required"}), 401
    return user, None, None


def book_to_dict(row):
    book_id = row["id"]
    review_count, average = get_db().execute(
        "SELECT COUNT(*), ROUND(AVG(rating), 1) FROM reviews WHERE book_id = ?",
        (book_id,),
    ).fetchone()
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": review_count,
        "average_rating": average,
    }


def review_to_dict(row):
    username = get_db().execute(
        "SELECT username FROM users WHERE id = ?", (row["user_id"],)
    ).fetchone()["username"]
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": username,
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username:
        return jsonify({"error": "Username is required"}), 400
    if not password:
        return jsonify({"error": "Password is required"}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing:
        return jsonify({"error": "Username is already taken"}), 409

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utcnow()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    row = db.execute("SELECT id, password_hash FROM users WHERE username = ?", (username,)).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "Invalid username or password"}), 401

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/books")
def list_books():
    q = (request.args.get("q") or "").strip()
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, int(request.args.get("page_size", 10)))
    except (TypeError, ValueError):
        page_size = 10

    db = get_db()
    where = ""
    params = []
    if q:
        where = "WHERE title LIKE ? OR author LIKE ?"
        like = f"%{q}%"
        params = [like, like]

    total = db.execute(f"SELECT COUNT(*) FROM books {where}", params).fetchone()[0]
    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM books {where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    return jsonify({
        "items": [book_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


def parse_book_payload(data, partial=False):
    errors = {}
    title = data.get("title")
    author = data.get("author")

    if not partial or "title" in data:
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required"
    if not partial or "author" in data:
        if not isinstance(author, str) or not author.strip():
            errors["author"] = "Author is required"

    year = data.get("year")
    if "year" in data and year is not None:
        if isinstance(year, bool) or not isinstance(year, int):
            errors["year"] = "Year must be an integer"

    isbn = data.get("isbn")
    if "isbn" in data and isbn is not None and not isinstance(isbn, str):
        errors["isbn"] = "ISBN must be a string"

    return errors


@app.post("/api/books")
def create_book():
    user, err, status = require_user()
    if user is None:
        return err, status

    data = request.get_json(silent=True) or {}
    errors = parse_book_payload(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (
            data["title"].strip(),
            data["author"].strip(),
            data.get("year"),
            data.get("isbn"),
            utcnow(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM books WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(book_to_dict(row)), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id):
    row = get_db().execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Book not found"}), 404
    return jsonify(book_to_dict(row))


@app.put("/api/books/<int:book_id>")
def update_book(book_id):
    user, err, status = require_user()
    if user is None:
        return err, status

    row = get_db().execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Book not found"}), 404

    data = request.get_json(silent=True) or {}
    errors = parse_book_payload(data)
    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    title = data["title"].strip()
    author = data["author"].strip()
    year = data.get("year")
    isbn = data.get("isbn")

    db = get_db()
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (title, author, year, isbn, book_id),
    )
    db.commit()
    updated = db.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    return jsonify(book_to_dict(updated))


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id):
    user, err, status = require_user()
    if user is None:
        return err, status

    row = get_db().execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Book not found"}), 404

    db = get_db()
    db.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    return jsonify({"deleted": True})


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id):
    row = get_db().execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return jsonify({"error": "Book not found"}), 404
    rows = get_db().execute(
        "SELECT * FROM reviews WHERE book_id = ? ORDER BY created_at DESC, id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [review_to_dict(r) for r in rows]})


@app.post("/api/books/<int:book_id>/reviews")
def create_review(book_id):
    user, err, status = require_user()
    if user is None:
        return err, status

    book = get_db().execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if book is None:
        return jsonify({"error": "Book not found"}), 404

    data = request.get_json(silent=True) or {}
    rating = data.get("rating")
    comment = data.get("comment")
    errors = {}

    if isinstance(rating, bool) or not isinstance(rating, int) or rating < 1 or rating > 5:
        errors["rating"] = "Rating must be an integer between 1 and 5"
    if not isinstance(comment, str) or not comment.strip():
        errors["comment"] = "Comment is required"

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?",
        (book_id, user["id"]),
    ).fetchone()
    if existing:
        return jsonify({"error": "You have already reviewed this book"}), 409

    cur = db.execute(
        "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (book_id, user["id"], rating, comment.strip(), utcnow()),
    )
    db.commit()
    row = db.execute("SELECT * FROM reviews WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(review_to_dict(row)), 201


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
