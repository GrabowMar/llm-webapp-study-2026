"""Book library: JSON API under /api plus the built frontend."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "library.db"
DIST = BASE_DIR / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

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
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def _close_db(_exc: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), 120_000
    )
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, expected = stored.split("$", 1)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("ascii"), 120_000
    )
    return secrets.compare_digest(digest.hex(), expected)


def api_error(message: str, status: int, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def json_body() -> tuple[dict[str, Any] | None, Any]:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, api_error("Request body must be a JSON object", 400)
    return data, None


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t "
            "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return api_error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def coerce_int(value: Any) -> tuple[int | None, bool]:
    """Return (value, ok). Empty/absent input yields (None, True)."""
    if value is None or value == "":
        return None, True
    if isinstance(value, bool):
        return None, False
    if isinstance(value, int):
        return value, True
    if isinstance(value, float) and value.is_integer():
        return int(value), True
    if isinstance(value, str) and value.strip().lstrip("-").isdigit():
        return int(value.strip()), True
    return None, False


def coerce_year(value: Any) -> tuple[int | None, str | None]:
    year, ok = coerce_int(value)
    if not ok:
        return None, "Year must be an integer"
    return year, None


def coerce_isbn(value: Any) -> tuple[str | None, str | None]:
    if value is None or value == "":
        return None, None
    if isinstance(value, str):
        return value, None
    if isinstance(value, bool):
        return None, "ISBN must be a string"
    if isinstance(value, (int, float)):
        return str(value), None
    return None, "ISBN must be a string"


def book_payload(data: dict[str, Any]) -> tuple[dict[str, Any] | None, Any]:
    errors: dict[str, str] = {}
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    author = data.get("author")
    if not isinstance(author, str) or not author.strip():
        errors["author"] = "Author is required"
    year, year_err = coerce_year(data.get("year"))
    if year_err:
        errors["year"] = year_err
    isbn, isbn_err = coerce_isbn(data.get("isbn"))
    if isbn_err:
        errors["isbn"] = isbn_err
    if errors:
        first = next(iter(errors.values()))
        return None, api_error(first, 400, errors)
    return {"title": title, "author": author, "year": year, "isbn": isbn}, None


BOOK_SELECT = """
SELECT b.id, b.title, b.author, b.year, b.isbn, b.created_at,
       COALESCE(s.cnt, 0) AS review_count,
       s.avg AS avg_rating
FROM books b
LEFT JOIN (
    SELECT book_id, COUNT(*) AS cnt, AVG(rating) AS avg
    FROM reviews GROUP BY book_id
) s ON s.book_id = b.id
"""


def serialize_book(row: sqlite3.Row) -> dict[str, Any]:
    count = int(row["review_count"])
    avg = row["avg_rating"]
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": count,
        "average_rating": round(avg, 1) if count else None,
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


def escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def int_arg(name: str, default: int) -> tuple[int | None, str | None]:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be an integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    return value, None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data, err = json_body()
    if err:
        return err
    errors: dict[str, str] = {}
    username = data.get("username")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    password = data.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    if errors:
        return api_error(next(iter(errors.values())), 400, errors)
    username = username.strip()
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), now_iso()),
        )
    except sqlite3.IntegrityError:
        return api_error("Username already taken", 409, {"username": "Username already taken"})
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data, err = json_body()
    if err:
        return err
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return api_error("Invalid username or password", 401)
    row = (
        get_db()
        .execute("SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),))
        .fetchone()
    )
    if row is None or not verify_password(password, row["password_hash"]):
        return api_error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/books")
def list_books():
    page, page_err = int_arg("page", 1)
    if page_err:
        return api_error(page_err, 400)
    page_size, size_err = int_arg("page_size", 10)
    if size_err:
        return api_error(size_err, 400)

    conditions: list[str] = []
    params: list[Any] = []
    q = request.args.get("q", "").strip()
    if q:
        pattern = f"%{escape_like(q.lower())}%"
        conditions.append(
            "(LOWER(b.title) LIKE ? ESCAPE '\\' OR LOWER(b.author) LIKE ? ESCAPE '\\' "
            "OR LOWER(COALESCE(b.isbn, '')) LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern, pattern, pattern])
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM books b {where}", params).fetchone()[0]
    rows = db.execute(
        f"{BOOK_SELECT} {where} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_book(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/books")
@login_required
def create_book():
    data, err = json_body()
    if err:
        return err
    fields, field_err = book_payload(data)
    if field_err:
        return field_err
    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (fields["title"], fields["author"], fields["year"], fields["isbn"], now_iso()),
    )
    db.commit()
    row = db.execute(f"{BOOK_SELECT} WHERE b.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize_book(row)), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    row = get_db().execute(f"{BOOK_SELECT} WHERE b.id = ?", (book_id,)).fetchone()
    if row is None:
        return api_error("Book not found", 404)
    return jsonify(serialize_book(row))


@app.put("/api/books/<int:book_id>")
@login_required
def update_book(book_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        return api_error("Book not found", 404)
    data, err = json_body()
    if err:
        return err
    fields, field_err = book_payload(data)
    if field_err:
        return field_err
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (fields["title"], fields["author"], fields["year"], fields["isbn"], book_id),
    )
    db.commit()
    row = db.execute(f"{BOOK_SELECT} WHERE b.id = ?", (book_id,)).fetchone()
    return jsonify(serialize_book(row))


@app.delete("/api/books/<int:book_id>")
@login_required
def delete_book(book_id: int):
    db = get_db()
    cur = db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    if cur.rowcount == 0:
        return api_error("Book not found", 404)
    return "", 204


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        return api_error("Book not found", 404)
    rows = db.execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username "
        "FROM reviews r JOIN users u ON u.id = r.user_id "
        "WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [serialize_review(r) for r in rows]})


@app.post("/api/books/<int:book_id>/reviews")
@login_required
def create_review(book_id: int):
    db = get_db()
    if db.execute("SELECT 1 FROM books WHERE id = ?", (book_id,)).fetchone() is None:
        return api_error("Book not found", 404)
    data, err = json_body()
    if err:
        return err
    errors: dict[str, str] = {}
    rating, rating_ok = coerce_int(data.get("rating"))
    if not rating_ok or rating is None or not 1 <= rating <= 5:
        errors["rating"] = "Rating must be an integer between 1 and 5"
        rating = None
    comment = data.get("comment", "")
    if comment is None:
        comment = ""
    if not isinstance(comment, str):
        errors["comment"] = "Comment must be a string"
    if errors:
        return api_error(next(iter(errors.values())), 400, errors)

    user = g.user
    try:
        cur = db.execute(
            "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (book_id, user["id"], rating, comment, now_iso()),
        )
    except sqlite3.IntegrityError:
        return api_error(
            "You have already reviewed this book",
            409,
            {"rating": "You have already reviewed this book"},
        )
    db.commit()
    row = db.execute(
        "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username "
        "FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(serialize_review(row)), 201


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
def api_not_found(_rest: str):
    return api_error("Not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if path.startswith("assets/") or Path(path).suffix:
        return api_error("Not found", 404)
    return send_from_directory(DIST, "index.html")


init_db()
