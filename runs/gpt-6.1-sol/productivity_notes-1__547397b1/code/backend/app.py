import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def timestamp():
    return datetime.now(UTC).isoformat(timespec="microseconds")


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.from_mapping(
        DATABASE=os.environ.get("DATABASE_PATH", str(Path.cwd() / "data" / "notes.sqlite3")),
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    if config:
        app.config.update(config)

    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    def db():
        if "db" not in g:
            g.db = sqlite3.connect(app.config["DATABASE"], timeout=20)
            g.db.row_factory = sqlite3.Row
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    @app.teardown_appcontext
    def close_db(_error):
        connection = g.pop("db", None)
        if connection is not None:
            connection.close()

    with app.app_context():
        db().execute("PRAGMA journal_mode = WAL")
        db().executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                author_id INTEGER NOT NULL REFERENCES users(id)
            );
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag)
            );
            CREATE INDEX IF NOT EXISTS notes_order ON notes(pinned DESC, updated_at DESC);
            CREATE INDEX IF NOT EXISTS notes_author ON notes(author_id);
            CREATE INDEX IF NOT EXISTS tags_name ON note_tags(tag);
        """)

    def error(message, status=400, errors=None):
        body = {"error": message}
        if errors:
            body["errors"] = errors
        return body, status

    def json_body():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return None
        return body

    def authenticated(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "")
            parts = authorization.split()
            if len(parts) != 2 or parts[0].lower() != "bearer":
                return error("Sign in to continue.", 401)
            token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
            user = db().execute(
                "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id "
                "WHERE token_hash = ? AND expires_at > ?",
                (token_hash, timestamp()),
            ).fetchone()
            if user is None:
                return error("Your session is invalid or expired. Please sign in again.", 401)
            g.user = user
            return view(*args, **kwargs)

        return wrapped

    def account_fields(body, registering=False):
        errors = {}
        username = body.get("username")
        password = body.get("password")
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_-]{3,32}", username.strip()):
            errors["username"] = "Use 3–32 letters, numbers, underscores, or hyphens."
        if not isinstance(password, str) or not (8 if registering else 1) <= len(password) <= 128:
            errors["password"] = "Use a password between 8 and 128 characters." if registering else "Enter your password."
        return errors

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        errors = account_fields(body, registering=True)
        if errors:
            return error("Please check your account details.", errors=errors)
        username = body["username"].strip()
        try:
            with db():
                db().execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, generate_password_hash(body["password"])),
                )
        except sqlite3.IntegrityError:
            return error("That username is already taken.", 409, {"username": "That username is already taken."})
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        errors = account_fields(body)
        if errors:
            return error("Please check your account details.", errors=errors)
        user = db().execute("SELECT * FROM users WHERE username = ?", (body["username"].strip(),)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], body["password"]):
            return error("Incorrect username or password.", 401)
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(UTC) + timedelta(days=30)).isoformat(timespec="microseconds")
        with db():
            db().execute("DELETE FROM sessions WHERE expires_at <= ?", (timestamp(),))
            db().execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user["id"], expires),
            )
        return {"token": token, "username": user["username"]}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        token = request.headers["Authorization"].split()[1]
        with db():
            db().execute("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
        return "", 204

    def note_fields(body, partial=False):
        errors = {}
        values = {}
        unknown = set(body) - {"title", "content", "tags", "pinned"}
        if unknown:
            errors["fields"] = "Unknown fields: " + ", ".join(sorted(unknown)) + "."
        for field, limit in (("title", 200), ("content", 100000)):
            if partial and field not in body:
                continue
            value = body.get(field)
            if not isinstance(value, str):
                errors[field] = f"{field.capitalize()} must be text."
            elif field == "title" and not value.strip():
                errors[field] = "Give your note a title."
            elif len(value) > limit:
                errors[field] = f"{field.capitalize()} must be at most {limit:,} characters."
            else:
                values[field] = value.strip() if field == "title" else value
        if "pinned" in body or not partial:
            pinned = body.get("pinned", False)
            if not isinstance(pinned, bool):
                errors["pinned"] = "Pinned must be true or false."
            else:
                values["pinned"] = pinned
        if "tags" in body or not partial:
            tags = body.get("tags", [])
            if not isinstance(tags, list) or len(tags) > 12:
                errors["tags"] = "Use a list of up to 12 tags."
            elif any(not isinstance(tag, str) or not 1 <= len(tag.strip()) <= 40 for tag in tags):
                errors["tags"] = "Each tag must contain 1–40 characters."
            else:
                values["tags"] = list(dict.fromkeys(tag.strip().lower() for tag in tags))
        return values, errors

    def note_query():
        return "SELECT notes.*, users.username AS author FROM notes JOIN users ON users.id = notes.author_id"

    def get_note(note_id):
        return db().execute(note_query() + " WHERE notes.id = ?", (note_id,)).fetchone()

    def serialize_notes(rows):
        if not rows:
            return []
        placeholders = ",".join("?" for _ in rows)
        tags_by_id = {}
        tags = db().execute(
            f"SELECT note_id, tag FROM note_tags WHERE note_id IN ({placeholders}) ORDER BY position",
            [row["id"] for row in rows],
        )
        for tag in tags:
            tags_by_id.setdefault(tag["note_id"], []).append(tag["tag"])
        return [
            {
                "id": row["id"], "title": row["title"], "content": row["content"],
                "tags": tags_by_id.get(row["id"], []), "pinned": bool(row["pinned"]),
                "created_at": row["created_at"], "updated_at": row["updated_at"], "author": row["author"],
            }
            for row in rows
        ]

    def set_tags(note_id, tags):
        db().execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
        db().executemany(
            "INSERT INTO note_tags (note_id, tag, position) VALUES (?, ?, ?)",
            [(note_id, tag, position) for position, tag in enumerate(tags)],
        )

    @app.get("/api/notes")
    def list_notes():
        pagination = {}
        for field, default in (("page", 1), ("page_size", 12)):
            raw = request.args.get(field, str(default))
            if not re.fullmatch(r"[0-9]{1,9}", raw) or int(raw) < 1:
                return error(f"{field} must be a positive integer.", errors={field: "Use a positive integer."})
            pagination[field] = int(raw)
        if pagination["page_size"] > 100:
            return error("page_size must be at most 100.", errors={"page_size": "Use a value from 1 to 100."})
        clauses = []
        parameters = []
        if tag := request.args.get("tag", "").strip().lower():
            clauses.append("EXISTS (SELECT 1 FROM note_tags WHERE note_id = notes.id AND tag = ?)")
            parameters.append(tag)
        if author := request.args.get("author", "").strip():
            clauses.append("users.username = ?")
            parameters.append(author)
        if query := request.args.get("q", "").strip():
            escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            clauses.append("(notes.title LIKE ? ESCAPE '\\' OR notes.content LIKE ? ESCAPE '\\')")
            parameters.extend([f"%{escaped}%", f"%{escaped}%"])
        where = " WHERE " + " AND ".join(clauses) if clauses else ""
        total = db().execute(
            "SELECT COUNT(*) FROM notes JOIN users ON users.id = notes.author_id" + where, parameters,
        ).fetchone()[0]
        rows = db().execute(
            note_query() + where + " ORDER BY pinned DESC, updated_at DESC, notes.id DESC LIMIT ? OFFSET ?",
            parameters + [pagination["page_size"], (pagination["page"] - 1) * pagination["page_size"]],
        ).fetchall()
        return {"items": serialize_notes(rows), "total": total, **pagination}

    @app.post("/api/notes")
    @authenticated
    def create_note():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        values, errors = note_fields(body)
        if errors:
            return error("Please check your note.", errors=errors)
        now = timestamp()
        with db():
            cursor = db().execute(
                "INSERT INTO notes (title, content, pinned, created_at, updated_at, author_id) VALUES (?, ?, ?, ?, ?, ?)",
                (values["title"], values["content"], values["pinned"], now, now, g.user["id"]),
            )
            note_id = cursor.lastrowid
            set_tags(note_id, values["tags"])
        return serialize_notes([get_note(note_id)])[0], 201

    @app.get("/api/notes/<int:note_id>")
    def read_note(note_id):
        row = get_note(note_id)
        if row is None:
            return error("Note not found.", 404)
        return serialize_notes([row])[0]

    @app.patch("/api/notes/<int:note_id>")
    @authenticated
    def update_note(note_id):
        row = get_note(note_id)
        if row is None:
            return error("Note not found.", 404)
        if row["author_id"] != g.user["id"]:
            return error("Only the author can edit this note.", 403)
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        values, errors = note_fields(body, partial=True)
        if errors:
            return error("Please check your note.", errors=errors)
        tags = values.pop("tags", None)
        values["updated_at"] = timestamp()
        assignments = ", ".join(f"{field} = ?" for field in values)
        with db():
            db().execute(f"UPDATE notes SET {assignments} WHERE id = ?", [*values.values(), note_id])
            if tags is not None:
                set_tags(note_id, tags)
        return serialize_notes([get_note(note_id)])[0]

    @app.delete("/api/notes/<int:note_id>")
    @authenticated
    def delete_note(note_id):
        row = get_note(note_id)
        if row is None:
            return error("Note not found.", 404)
        if row["author_id"] != g.user["id"]:
            return error("Only the author can delete this note.", 403)
        with db():
            db().execute("DELETE FROM notes WHERE id = ?", (note_id,))
        return "", 204

    @app.get("/api/tags")
    def list_tags():
        rows = db().execute("SELECT tag, COUNT(*) AS count FROM note_tags GROUP BY tag ORDER BY count DESC, tag ASC")
        return {"items": [dict(row) for row in rows]}

    @app.errorhandler(HTTPException)
    def http_error(exception):
        if request.path.startswith("/api"):
            return error(exception.description, exception.code)
        return exception

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
