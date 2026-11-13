import hashlib
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
BOOK_QUERY = """
    SELECT b.*, COUNT(r.id) AS review_count,
           ROUND(AVG(r.rating), 1) AS average_rating
    FROM books b LEFT JOIN reviews r ON r.book_id = b.id
"""
SCHEMA = """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
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
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        comment TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE(book_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS books_newest ON books(created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS reviews_book ON reviews(book_id, created_at DESC, id DESC);
"""


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=os.environ.get("DATABASE_PATH", str(Path.cwd() / "data" / "library.sqlite3")),
        SEED_DATA=os.environ.get("SEED_LIBRARY", "1") == "1",
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    if config:
        app.config.update(config)

    def connect():
        connection = sqlite3.connect(app.config["DATABASE"], timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with closing(connect()) as connection, connection:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(SCHEMA)
        if app.config["SEED_DATA"]:
            try:
                from .seed import seed_library
            except ImportError:
                from seed import seed_library
            seed_library(connection)

    def db():
        if "db" not in g:
            g.db = connect()
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    def error(message, status=400, errors=None):
        body = {"error": message}
        if errors:
            body["errors"] = errors
        return jsonify(body), status

    def body():
        value = request.get_json(silent=True)
        return value if isinstance(value, dict) else None

    def authenticated(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "").split()
            if len(authorization) != 2 or authorization[0].lower() != "bearer":
                return error("Please sign in to continue.", 401)
            token_hash = hashlib.sha256(authorization[1].encode()).hexdigest()
            user = db().execute(
                "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id "
                "WHERE s.token_hash = ? AND s.expires_at > ?",
                (token_hash, datetime.now(UTC).isoformat()),
            ).fetchone()
            if not user:
                return error("Your session has expired. Please sign in again.", 401)
            g.user = user
            g.token_hash = token_hash
            return handler(*args, **kwargs)

        return wrapped

    def credentials(data):
        errors = {}
        username = data.get("username")
        password = data.get("password")
        if not isinstance(username, str) or not username.strip():
            errors["username"] = "Please enter a username."
        elif len(username.strip()) > 50:
            errors["username"] = "Username must be 50 characters or fewer."
        if not isinstance(password, str) or not password.strip():
            errors["password"] = "Please enter a password."
        elif len(password) > 256:
            errors["password"] = "Password must be 256 characters or fewer."
        return errors

    def book_fields(data):
        values = {}
        errors = {}
        for field, limit in (("title", 300), ("author", 200)):
            value = data.get(field)
            if not isinstance(value, str) or not value.strip():
                errors[field] = f"Please enter the book's {field}."
            elif len(value.strip()) > limit:
                errors[field] = f"{field.capitalize()} must be {limit} characters or fewer."
            else:
                values[field] = value.strip()
        year = data.get("year")
        if year is not None and (type(year) is not int or not 1 <= year <= 9999):
            errors["year"] = "Year must be a whole number between 1 and 9999."
        values["year"] = year
        isbn = data.get("isbn")
        if isbn is not None and (not isinstance(isbn, str) or len(isbn.strip()) > 32):
            errors["isbn"] = "ISBN must be text, up to 32 characters."
        values["isbn"] = isbn.strip() or None if isinstance(isbn, str) else None
        return values, errors

    def find_book(book_id):
        row = db().execute(BOOK_QUERY + " WHERE b.id = ? GROUP BY b.id", (book_id,)).fetchone()
        return dict(row) if row else None

    @app.get("/api/health")
    def health():
        db().execute("SELECT 1")
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        data = body()
        if data is None:
            return error("Please send a JSON object.")
        errors = credentials(data)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        try:
            with db() as connection:
                connection.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (data["username"].strip(), generate_password_hash(data["password"])),
                )
        except sqlite3.IntegrityError:
            return error("This username is already taken.", 409, {"username": "This username is already taken."})
        return {"username": data["username"].strip()}, 201

    @app.post("/api/auth/login")
    def login():
        data = body()
        if data is None:
            return error("Please send a JSON object.")
        errors = credentials(data)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        user = db().execute("SELECT * FROM users WHERE username = ?", (data["username"].strip(),)).fetchone()
        password_hash = user["password_hash"] if user else app.config["DUMMY_PASSWORD_HASH"]
        valid = check_password_hash(password_hash, data["password"])
        if not user or not valid:
            return error("The username or password is incorrect.", 401)
        token = secrets.token_urlsafe(48)
        with db() as connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (datetime.now(UTC).isoformat(),))
            connection.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"],
                 (datetime.now(UTC) + timedelta(days=30)).isoformat()),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def current_user():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        with db() as connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.get("/api/stats")
    def stats():
        return {
            "books": db().execute("SELECT COUNT(*) FROM books").fetchone()[0],
            "reviews": db().execute("SELECT COUNT(*) FROM reviews").fetchone()[0],
        }

    @app.get("/api/books")
    def list_books():
        errors = {}
        pagination = {}
        for name, default, maximum in (("page", 1, 1000000), ("page_size", 8, 100)):
            try:
                value = int(request.args.get(name, default))
                if not 1 <= value <= maximum:
                    raise ValueError
                pagination[name] = value
            except (TypeError, ValueError):
                errors[name] = f"{name} must be a whole number between 1 and {maximum}."
        query = request.args.get("q", "").strip()
        if len(query) > 500:
            errors["q"] = "Search must be 500 characters or fewer."
        if errors:
            return error("Invalid search parameters.", errors=errors)
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        where = " WHERE (b.title LIKE ? ESCAPE '\\' OR b.author LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\')"
        params = (pattern, pattern, pattern)
        total = db().execute("SELECT COUNT(*) FROM books b" + where, params).fetchone()[0]
        rows = db().execute(
            BOOK_QUERY + where + " GROUP BY b.id ORDER BY b.created_at DESC, b.id DESC LIMIT ? OFFSET ?",
            (*params, pagination["page_size"], (pagination["page"] - 1) * pagination["page_size"]),
        ).fetchall()
        return {"items": [dict(row) for row in rows], "total": total, **pagination}

    @app.post("/api/books")
    @authenticated
    def add_book():
        data = body()
        if data is None:
            return error("Please send a JSON object.")
        values, errors = book_fields(data)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        with db() as connection:
            cursor = connection.execute(
                "INSERT INTO books (title, author, year, isbn) VALUES (?, ?, ?, ?)",
                (values["title"], values["author"], values["year"], values["isbn"]),
            )
        return find_book(cursor.lastrowid), 201

    @app.get("/api/books/<int:book_id>")
    def get_book(book_id):
        book = find_book(book_id)
        return book if book else error("This book could not be found.", 404)

    @app.put("/api/books/<int:book_id>")
    @authenticated
    def update_book(book_id):
        if not find_book(book_id):
            return error("This book could not be found.", 404)
        data = body()
        if data is None:
            return error("Please send a JSON object.")
        values, errors = book_fields(data)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        with db() as connection:
            connection.execute(
                "UPDATE books SET title = ?, author = ?, year = ?, isbn = ? WHERE id = ?",
                (values["title"], values["author"], values["year"], values["isbn"], book_id),
            )
        return find_book(book_id)

    @app.delete("/api/books/<int:book_id>")
    @authenticated
    def delete_book(book_id):
        with db() as connection:
            cursor = connection.execute("DELETE FROM books WHERE id = ?", (book_id,))
        if not cursor.rowcount:
            return error("This book could not be found.", 404)
        return "", 204

    @app.get("/api/books/<int:book_id>/reviews")
    def list_reviews(book_id):
        if not find_book(book_id):
            return error("This book could not be found.", 404)
        rows = db().execute(
            "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username "
            "FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.book_id = ? "
            "ORDER BY r.created_at DESC, r.id DESC", (book_id,),
        ).fetchall()
        return {"items": [dict(row) for row in rows]}

    @app.post("/api/books/<int:book_id>/reviews")
    @authenticated
    def add_review(book_id):
        if not find_book(book_id):
            return error("This book could not be found.", 404)
        data = body()
        if data is None:
            return error("Please send a JSON object.")
        errors = {}
        if type(data.get("rating")) is not int or not 1 <= data["rating"] <= 5:
            errors["rating"] = "Choose a whole-number rating from 1 to 5."
        comment = data.get("comment", "")
        if not isinstance(comment, str) or len(comment) > 5000:
            errors["comment"] = "Your review must be text, up to 5,000 characters."
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        try:
            with db() as connection:
                cursor = connection.execute(
                    "INSERT INTO reviews (book_id, user_id, rating, comment) VALUES (?, ?, ?, ?)",
                    (book_id, g.user["id"], data["rating"], comment.strip()),
                )
        except sqlite3.IntegrityError:
            return error("You've already reviewed this book. One book, one review per reader.", 409)
        row = db().execute(
            "SELECT r.id, r.book_id, r.rating, r.comment, r.created_at, u.username "
            "FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.id = ?", (cursor.lastrowid,),
        ).fetchone()
        return dict(row), 201

    @app.errorhandler(HTTPException)
    def http_error(exception):
        if request.path.startswith("/api"):
            return error(exception.description, exception.code)
        return exception

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("This API endpoint could not be found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    app.config["DUMMY_PASSWORD_HASH"] = generate_password_hash(secrets.token_urlsafe(32))
    return app


app = create_app()
