"""Flask entry point."""

from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from xmlcheck import check_xml

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LENGTH = 200
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
MAX_USERNAME_LENGTH = 64
MIN_PASSWORD_LENGTH = 1
MAX_PASSWORD_LENGTH = 1024

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    xml_preview TEXT NOT NULL,
    valid INTEGER NOT NULL,
    error TEXT,
    line INTEGER,
    column_number INTEGER,
    root_element TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_validations_user
    ON validations (user_id, id DESC);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="microseconds")
        .replace("+00:00", "Z")
    )


def error_response(status: int, message: str):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def handle_http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error_response(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc: Exception):
    if isinstance(exc, HTTPException):
        return handle_http_error(exc)
    app.logger.exception("Unhandled error")
    return error_response(500, "Internal server error")


def json_body() -> dict | None:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user_id() -> int | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT user_id FROM tokens WHERE token_hash = ?", (hash_token(token),)
        )
        .fetchone()
    )
    return row["user_id"] if row else None


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user_id = current_user_id()
        if user_id is None:
            return error_response(401, "Authentication required")
        g.user_id = user_id
        return view(*args, **kwargs)

    return wrapper


def read_credentials():
    data = json_body()
    if data is None:
        return None, None, "Request body must be a JSON object"
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None, "username and password are required"
    return username.strip(), password, None


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    username, password, err = read_credentials()
    if err:
        return error_response(400, err)
    if not username:
        return error_response(400, "username must not be empty")
    if len(username) > MAX_USERNAME_LENGTH:
        return error_response(
            400, f"username must be at most {MAX_USERNAME_LENGTH} characters"
        )
    if len(password) < MIN_PASSWORD_LENGTH:
        return error_response(400, "password must not be empty")
    if len(password) > MAX_PASSWORD_LENGTH:
        return error_response(400, "password is too long")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error_response(409, "username is already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, err = read_credentials()
    if err:
        return error_response(400, err)
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error_response(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token.strip()),))
    db.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    row = (
        get_db()
        .execute("SELECT id, username FROM users WHERE id = ?", (g.user_id,))
        .fetchone()
    )
    return jsonify({"id": row["id"], "username": row["username"]})


def read_xml():
    data = json_body()
    if data is None:
        return None, "Request body must be a JSON object"
    xml = data.get("xml")
    if not isinstance(xml, str):
        return None, "xml is required and must be a string"
    return xml, None


@app.post("/api/validate/xml")
def validate_xml():
    xml, err = read_xml()
    if err:
        return error_response(400, err)
    return jsonify(check_xml(xml).to_dict())


def serialize_validation(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "xml_preview": row["xml_preview"],
        "valid": bool(row["valid"]),
        "error": row["error"],
        "line": row["line"],
        "column": row["column_number"],
        "root_element": row["root_element"],
        "created_at": row["created_at"],
    }


@app.post("/api/validations")
@login_required
def create_validation():
    xml, err = read_xml()
    if err:
        return error_response(400, err)
    result = check_xml(xml)
    db = get_db()
    cur = db.execute(
        """INSERT INTO validations
           (user_id, xml_preview, valid, error, line, column_number, root_element, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            g.user_id,
            xml[:PREVIEW_LENGTH],
            int(result.valid),
            result.error,
            result.line,
            result.column,
            result.root_element,
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM validations WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(serialize_validation(row)), 201


def parse_positive_int(name: str, default: int, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be a positive integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    if maximum is not None and value > maximum:
        return None, f"{name} must be at most {maximum}"
    return value, None


def parse_valid_filter():
    raw = request.args.get("valid")
    if raw is None or raw.strip() == "":
        return None, None
    value = raw.strip().lower()
    if value in ("true", "1", "yes"):
        return True, None
    if value in ("false", "0", "no"):
        return False, None
    return None, "valid must be true or false"


@app.get("/api/validations")
@login_required
def list_validations():
    valid, err = parse_valid_filter()
    if err:
        return error_response(400, err)
    page, err = parse_positive_int("page", 1)
    if err:
        return error_response(400, err)
    page_size, err = parse_positive_int("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    if err:
        return error_response(400, err)

    where = "user_id = ?"
    params: list = [g.user_id]
    if valid is not None:
        where += " AND valid = ?"
        params.append(int(valid))

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM validations WHERE {where}", params
    ).fetchone()[0]
    rows = db.execute(
        f"""SELECT * FROM validations WHERE {where}
            ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_validation(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/validations/<int:validation_id>")
@login_required
def get_validation(validation_id: int):
    row = (
        get_db()
        .execute(
            "SELECT * FROM validations WHERE id = ? AND user_id = ?",
            (validation_id, g.user_id),
        )
        .fetchone()
    )
    if row is None:
        return error_response(404, "Validation not found")
    return jsonify(serialize_validation(row))


@app.delete("/api/validations/<int:validation_id>")
@login_required
def delete_validation(validation_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?",
        (validation_id, g.user_id),
    )
    db.commit()
    if cur.rowcount == 0:
        return error_response(404, "Validation not found")
    return "", 204


@app.route("/api", strict_slashes=False)
@app.route("/api/<path:_path>")
def api_not_found(_path: str = ""):
    return error_response(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return error_response(404, "Frontend not built")
    return send_from_directory(DIST, "index.html")


init_db()
