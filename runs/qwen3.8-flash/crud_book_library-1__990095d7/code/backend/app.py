"""Flask entry point: JSON API under /api plus the frontend build."""

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("./data")
DB_PATH = DATA_DIR / "books.db"

PBKDF2_ITERATIONS = 200_000

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


# ---------------------------------------------------------------------------
# database
# ---------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
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
    comment TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (book_id, user_id)
);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.executescript(SCHEMA)
    db.commit()
    db.close()


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def json_body() -> dict:
    data = request.get_json(silent=True)
    if data is None:
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
        return secrets.compare_digest(digest.hex(), digest_hex)
    except ValueError:
        return False


def current_user():
    user = getattr(g, "_user", None)
    if user is not None:
        return user
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth[len("Bearer "):].strip()
        if token:
            row = get_db().execute(
                "SELECT u.id, u.username FROM sessions s "
                "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
                (token,),
            ).fetchone()
            if row is not None:
                g._user = dict(row)
                return g._user
    g._user = None
    return None


def require_user():
    user = current_user()
    if user is None:
        return None, error("authentication required", 401)
    return user, None


def parse_int(value, name: str, lo: int, hi: int):
    """Return (int_value, None) or (None, error_message)."""
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None, f"{name} must be an integer between {lo} and {hi}"
    try:
        n = int(str(value).strip())
    except ValueError:
        return None, f"{name} must be an integer between {lo} and {hi}"
    if not lo <= n <= hi:
        return None, f"{name} must be an integer between {lo} and {hi}"
    return n, None


def book_row_to_json(row: sqlite3.Row) -> dict:
    count = row["review_count"] or 0
    avg = None
    if count > 0:
        avg = round(float(row["rating_sum"]) / count, 1)
    return {
        "id": row["id"],
        "title": row["title"],
        "author": row["author"],
        "year": row["year"],
        "isbn": row["isbn"],
        "created_at": row["created_at"],
        "review_count": count,
        "average_rating": avg,
    }


def review_row_to_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "book_id": row["book_id"],
        "rating": row["rating"],
        "comment": row["comment"],
        "created_at": row["created_at"],
        "username": row["username"],
    }


BOOK_SELECT = (
    "SELECT b.*, "
    "(SELECT COUNT(*) FROM reviews r WHERE r.book_id = b.id) AS review_count, "
    "(SELECT SUM(r.rating) FROM reviews r WHERE r.book_id = b.id) AS rating_sum "
    "FROM books b"
)


def validate_book_fields(data: dict, partial_required: bool = True):
    """Validate title/author/year/isbn. Returns (fields, err) with err a message."""
    fields: dict = {}

    if "title" in data and data["title"] is not None:
        title = data["title"]
        if not isinstance(title, str) or not title.strip():
            return None, "title is required"
        title = title.strip()
        if len(title) > 300:
            return None, "title must be at most 300 characters"
        fields["title"] = title
    elif partial_required:
        return None, "title is required"

    if "author" in data and data["author"] is not None:
        author = data["author"]
        if not isinstance(author, str) or not author.strip():
            return None, "author is required"
        author = author.strip()
        if len(author) > 300:
            return None, "author must be at most 300 characters"
        fields["author"] = author
    elif partial_required:
        return None, "author is required"

    if "year" in data:
        year = data["year"]
        if year is None:
            fields["year"] = None
        else:
            n, err = parse_int(year, "year", 0, 9999)
            if err:
                return None, err
            fields["year"] = n

    if "isbn" in data:
        isbn = data["isbn"]
        if isbn is None:
            fields["isbn"] = None
        else:
            if not isinstance(isbn, str) or not isbn.strip():
                return None, "isbn must be a non-empty string or null"
            isbn = isbn.strip()
            if len(isbn) > 32:
                return None, "isbn must be at most 32 characters"
            fields["isbn"] = isbn

    return fields, None


# ---------------------------------------------------------------------------
# API: health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# API: auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        return error("username is required")
    username = username.strip()
    if not USERNAME_RE.match(username):
        return error("username must be 3-32 characters of letters, digits, '_', '.' or '-'")
    if not isinstance(password, str) or len(password) < 6:
        return error("password must be at least 6 characters")

    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return error("username already taken", 409)

    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"message": "account created", "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required")

    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("invalid username or password", 401)

    token = secrets.token_hex(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------------------
# API: books
# ---------------------------------------------------------------------------

@app.get("/api/books")
def list_books():
    q = request.args.get("q", "", type=str) or ""
    q = q.strip()

    try:
        page = int(request.args.get("page", "1"))
    except (TypeError, ValueError):
        return error("page must be an integer")
    try:
        page_size = int(request.args.get("page_size", "10"))
    except (TypeError, ValueError):
        return error("page_size must be an integer")
    if page < 1:
        return error("page must be 1 or greater")
    if page_size < 1 or page_size > 100:
        return error("page_size must be between 1 and 100")

    db = get_db()
    where = ""
    params: list = []
    if q:
        where = "WHERE (b.title LIKE ? OR b.author LIKE ?)"
        like = f"%{q}%"
        params = [like, like]

    total = db.execute(f"SELECT COUNT(*) AS c FROM books b {where}", params).fetchone()["c"]
    rows = db.execute(
        f"{BOOK_SELECT} {where} ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    items = [book_row_to_json(r) for r in rows]
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size}), 200


def fetch_book(book_id: int):
    if book_id < 1:
        return None
    row = get_db().execute(f"{BOOK_SELECT} WHERE b.id = ?", (book_id,)).fetchone()
    return row


@app.post("/api/books")
def create_book():
    user, err = require_user()
    if err:
        return err
    data = json_body()
    fields, verr = validate_book_fields(data)
    if verr:
        return error(verr)

    db = get_db()
    cur = db.execute(
        "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
        (
            fields.get("title"),
            fields.get("author"),
            fields.get("year"),
            fields.get("isbn"),
            utcnow(),
        ),
    )
    db.commit()
    row = fetch_book(cur.lastrowid)
    return jsonify(book_row_to_json(row)), 201


@app.get("/api/books/<int:book_id>")
def get_book(book_id: int):
    row = fetch_book(book_id)
    if row is None:
        return error("book not found", 404)
    return jsonify(book_row_to_json(row)), 200


@app.put("/api/books/<int:book_id>")
def update_book(book_id: int):
    user, err = require_user()
    if err:
        return err
    row = fetch_book(book_id)
    if row is None:
        return error("book not found", 404)

    data = json_body()
    fields, verr = validate_book_fields(data)
    if verr:
        return error(verr)

    db = get_db()
    db.execute(
        "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
        (
            fields.get("title", row["title"]),
            fields.get("author", row["author"]),
            fields.get("year"),
            fields.get("isbn"),
            book_id,
        ),
    )
    db.commit()
    return jsonify(book_row_to_json(fetch_book(book_id))), 200


@app.delete("/api/books/<int:book_id>")
def delete_book(book_id: int):
    user, err = require_user()
    if err:
        return err
    db = get_db()
    row = db.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()
    if row is None:
        return error("book not found", 404)
    db.execute("DELETE FROM reviews WHERE book_id = ?", (book_id,))
    db.execute("DELETE FROM books WHERE id = ?", (book_id,))
    db.commit()
    return jsonify({"message": "deleted"}), 200


# ---------------------------------------------------------------------------
# API: reviews
# ---------------------------------------------------------------------------

REVIEW_SELECT = (
    "SELECT r.*, u.username FROM reviews r JOIN users u ON u.id = r.user_id"
)


@app.get("/api/books/<int:book_id>/reviews")
def list_reviews(book_id: int):
    row = db_check_book(book_id)
    if row is None:
        return error("book not found", 404)
    rows = get_db().execute(
        f"{REVIEW_SELECT} WHERE r.book_id = ? ORDER BY r.created_at DESC, r.id DESC",
        (book_id,),
    ).fetchall()
    return jsonify({"items": [review_row_to_json(r) for r in rows]}), 200


def db_check_book(book_id: int):
    return get_db().execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone()


@app.post("/api/books/<int:book_id>/reviews")
def create_review(book_id: int):
    user, err = require_user()
    if err:
        return err
    if db_check_book(book_id) is None:
        return error("book not found", 404)

    data = json_body()

    if "rating" not in data or data["rating"] is None:
        return error("rating is required")
    rating, rerr = parse_int(data["rating"], "rating", 1, 5)
    if rerr:
        return error("rating must be an integer between 1 and 5")

    comment = data.get("comment")
    if comment is not None and not isinstance(comment, str):
        return error("comment must be a string")
    if comment is not None:
        comment = comment.strip()
        if len(comment) > 2000:
            return error("comment must be at most 2000 characters")

    db = get_db()
    existing = db.execute(
        "SELECT id FROM reviews WHERE book_id = ? AND user_id = ?",
        (book_id, user["id"]),
    ).fetchone()
    if existing:
        return error("you have already reviewed this book", 409)

    try:
        cur = db.execute(
            "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (book_id, user["id"], rating, comment if comment else None, utcnow()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("you have already reviewed this book", 409)

    row = db.execute(f"{REVIEW_SELECT} WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(review_row_to_json(row)), 201


# ---------------------------------------------------------------------------
# API errors + frontend
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(_e):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return index()


@app.errorhandler(405)
def method_not_allowed(_e):
    if request.path.startswith("/api/"):
        return error("method not allowed", 405)
    return index()


@app.errorhandler(415)
def unsupported_media(_e):
    return error("request body must be JSON", 415)


@app.errorhandler(500)
def server_error(_e):
    return error("internal server error", 500)


@app.get("/")
@app.get("/<path:path>")
def serve_frontend(path: str = "index.html"):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return index()


def index():
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return "Frontend not built yet. Run `npm run build` in frontend/.", 503


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
