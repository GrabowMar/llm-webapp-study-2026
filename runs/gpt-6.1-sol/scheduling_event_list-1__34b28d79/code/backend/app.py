import hashlib
import os
import re
import secrets
import sqlite3
from datetime import UTC, date, datetime, timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def utc_string(value):
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def parse_datetime(value):
    if not isinstance(value, str) or not re.match(r"^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}", value):
        raise ValueError("Enter a valid ISO 8601 date and time.")
    try:
        parsed = datetime.fromisoformat(value.replace("z", "Z"))
        return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)
    except (ValueError, OverflowError) as exc:
        raise ValueError("Enter a valid ISO 8601 date and time.") from exc


def get_db():
    if "db" not in g:
        from flask import current_app

        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=20)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def json_body():
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None
    return body


def validation_error(errors):
    return {"error": "Please check the highlighted fields.", "errors": errors}, 400


def credentials(body):
    errors = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) > 80:
        errors["username"] = "Username must be 80 characters or fewer."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) > 256:
        errors["password"] = "Password must be 256 characters or fewer."
    return username.strip() if isinstance(username, str) else "", password, errors


def authenticated(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        parts = request.headers.get("Authorization", "").split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return {"error": "Please sign in to continue."}, 401
        token_hash = hashlib.sha256(parts[1].encode()).hexdigest()
        user = get_db().execute(
            "SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id "
            "WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
            (token_hash, utc_string(datetime.now(UTC))),
        ).fetchone()
        if user is None:
            return {"error": "Your session has expired. Please sign in again."}, 401
        g.user = user
        g.token_hash = token_hash
        return handler(*args, **kwargs)

    return wrapped


def event_fields(body):
    errors = {}
    values = {}
    title = body.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "An event title is required."
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be 200 characters or fewer."
    else:
        values["title"] = title.strip()
    for field, limit in (("description", 10000), ("location", 500)):
        value = body.get(field)
        if value is not None and not isinstance(value, str):
            errors[field] = f"{field.capitalize()} must be text."
        elif value is not None and len(value) > limit:
            errors[field] = f"{field.capitalize()} must be {limit:,} characters or fewer."
        else:
            values[field] = value
    times = {}
    for field in ("start_time", "end_time"):
        if not body.get(field):
            errors[field] = f"{field.replace('_', ' ').capitalize()} is required."
            continue
        try:
            times[field] = parse_datetime(body[field])
            values[field] = utc_string(times[field])
        except ValueError as exc:
            errors[field] = str(exc)
    if len(times) == 2 and times["end_time"] <= times["start_time"]:
        errors["end_time"] = "End time must be after start time."
    return values, errors


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(
        DATABASE=os.environ.get("DATABASE_PATH", str(Path.cwd() / "data" / "calendar.sqlite3")),
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    if config:
        app.config.update(config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db = get_db()
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                expires_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT,
                location TEXT,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                created_at TEXT NOT NULL,
                created_by TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS events_start_time ON events(start_time);
            """
        )
        db.close()
        g.pop("db", None)

    @app.teardown_appcontext
    def close_db(exception=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        if request.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(HTTPException)
    def http_error(error):
        if request.path.startswith("/api"):
            return {"error": error.description}, error.code
        return error

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        if body is None:
            return {"error": "A JSON object is required."}, 400
        username, password, errors = credentials(body)
        if errors:
            return validation_error(errors)
        db = get_db()
        try:
            db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), utc_string(datetime.now(UTC))),
            )
            db.commit()
        except sqlite3.IntegrityError:
            db.rollback()
            return {"error": "This username is already taken.", "errors": {"username": "This username is already taken."}}, 409
        return {"username": username}, 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        if body is None:
            return {"error": "A JSON object is required."}, 400
        username, password, errors = credentials(body)
        if errors:
            return validation_error(errors)
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return {"error": "Incorrect username or password."}, 401
        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_string(now),))
        db.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (hashlib.sha256(token.encode()).hexdigest(), user["id"], utc_string(now + timedelta(days=30))),
        )
        db.commit()
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        db.commit()
        return "", 204

    @app.get("/api/events")
    def list_events():
        conditions = []
        parameters = []
        bounds = {}
        for field in ("start_date", "end_date"):
            value = request.args.get(field)
            if value is None:
                continue
            try:
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    parsed = datetime.combine(date.fromisoformat(value), datetime.min.time(), UTC)
                    if field == "end_date":
                        parsed += timedelta(days=1)
                        operator = "<"
                    else:
                        operator = ">="
                else:
                    parsed = parse_datetime(value)
                    operator = ">=" if field == "start_date" else "<="
                bounds[field] = parsed
                conditions.append(f"julianday(start_time) {operator} julianday(?)")
                parameters.append(utc_string(parsed))
            except (ValueError, OverflowError):
                return validation_error({field: "Enter a valid ISO 8601 date or date-time."})
        if len(bounds) == 2 and bounds["end_date"] < bounds["start_date"]:
            return validation_error({"end_date": "End date must not be before start date."})
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        rows = get_db().execute("SELECT * FROM events" + where + " ORDER BY julianday(start_time), id", parameters).fetchall()
        return {"items": [dict(row) for row in rows], "total": len(rows)}

    @app.post("/api/events")
    @authenticated
    def create_event():
        body = json_body()
        if body is None:
            return {"error": "A JSON object is required."}, 400
        values, errors = event_fields(body)
        if errors:
            return validation_error(errors)
        db = get_db()
        cursor = db.execute(
            "INSERT INTO events (title, description, location, start_time, end_time, created_at, created_by) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (*[values[field] for field in ("title", "description", "location", "start_time", "end_time")],
             utc_string(datetime.now(UTC)), g.user["username"]),
        )
        db.commit()
        return dict(db.execute("SELECT * FROM events WHERE id = ?", (cursor.lastrowid,)).fetchone()), 201

    @app.get("/api/events/<int:event_id>")
    def get_event(event_id):
        event = get_db().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if event is None:
            return {"error": "Event not found."}, 404
        return dict(event)

    @app.put("/api/events/<int:event_id>")
    @authenticated
    def update_event(event_id):
        db = get_db()
        if db.execute("SELECT id FROM events WHERE id = ?", (event_id,)).fetchone() is None:
            return {"error": "Event not found."}, 404
        body = json_body()
        if body is None:
            return {"error": "A JSON object is required."}, 400
        values, errors = event_fields(body)
        if errors:
            return validation_error(errors)
        db.execute(
            "UPDATE events SET title = ?, description = ?, location = ?, start_time = ?, end_time = ? WHERE id = ?",
            (*[values[field] for field in ("title", "description", "location", "start_time", "end_time")], event_id),
        )
        db.commit()
        return dict(db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone())

    @app.delete("/api/events/<int:event_id>")
    @authenticated
    def delete_event(event_id):
        db = get_db()
        cursor = db.execute("DELETE FROM events WHERE id = ?", (event_id,))
        db.commit()
        if cursor.rowcount == 0:
            return {"error": "Event not found."}, 404
        return "", 204

    @app.get("/api")
    @app.get("/api/<path:path>")
    def unknown_api(path=""):
        return {"error": "API endpoint not found."}, 404

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        resolved = safe_join(str(DIST), path)
        if resolved and Path(resolved).is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
