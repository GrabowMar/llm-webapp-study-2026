"""Flask entry point."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from checker import check_xml

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"
TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DUMMY_HASH = generate_password_hash("dummy-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
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
            CREATE TABLE IF NOT EXISTS validations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                xml_preview TEXT NOT NULL,
                valid INTEGER NOT NULL,
                error TEXT,
                line INTEGER,
                column INTEGER,
                root_element TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_validations_user
                ON validations(user_id, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def error(status: int, message: str):
    return jsonify({"error": message}), status


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user_id():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT user_id, expires_at FROM tokens WHERE token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= iso(now()):
        return None
    return row["user_id"]


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def credentials():
    data = json_body()
    if data is None:
        return None
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None
    return username.strip(), password


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api/"):
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    creds = credentials()
    if creds is None:
        return error(400, "username and password are required")
    username, password = creds
    if not username or len(username) > 64:
        return error(400, "username must be 1-64 characters")
    if not password or len(password) > 256:
        return error(400, "password must be 1-256 characters")
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso(now())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error(409, "username already taken")
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    creds = credentials()
    if creds is None:
        return error(400, "username and password are required")
    username, password = creds
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    ok = check_password_hash(row["password_hash"] if row else DUMMY_HASH, password)
    if row is None or not ok:
        return error(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    db.execute(
        "DELETE FROM tokens WHERE expires_at <= ?", (iso(now()),)
    )
    db.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], iso(now() + TOKEN_TTL)),
    )
    db.commit()
    return jsonify({"token": token, "username": username})


@app.get("/api/auth/me")
def me():
    uid = current_user_id()
    if uid is None:
        return error(401, "authentication required")
    row = get_db().execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()
    return jsonify({"username": row["username"]})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    token = header.partition(" ")[2].strip()
    if token:
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
        db.commit()
    return "", 204


def xml_from_request():
    data = json_body()
    if data is None or not isinstance(data.get("xml"), str):
        return None
    return data["xml"]


@app.post("/api/validate/xml")
def validate_xml():
    xml = xml_from_request()
    if xml is None:
        return error(400, "xml must be a string")
    return jsonify(check_xml(xml))


def serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "xml_preview": row["xml_preview"],
        "valid": bool(row["valid"]),
        "error": row["error"],
        "line": row["line"],
        "column": row["column"],
        "root_element": row["root_element"],
        "created_at": row["created_at"],
    }


@app.post("/api/validations")
def create_validation():
    uid = current_user_id()
    if uid is None:
        return error(401, "authentication required")
    xml = xml_from_request()
    if xml is None:
        return error(400, "xml must be a string")
    result = check_xml(xml)
    db = get_db()
    cur = db.execute(
        "INSERT INTO validations (user_id, xml_preview, valid, error, line, column,"
        " root_element, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            uid,
            xml[:200],
            1 if result["valid"] else 0,
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            iso(now()),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM validations WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(serialize(row)), 201


def positive_int(name: str, default: int):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value >= 1 else None


@app.get("/api/validations")
def list_validations():
    uid = current_user_id()
    if uid is None:
        return error(401, "authentication required")
    page = positive_int("page", 1)
    page_size = positive_int("page_size", 10)
    if page is None:
        return error(400, "page must be a positive integer")
    if page_size is None or page_size > MAX_PAGE_SIZE:
        return error(400, f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    where = "user_id = ?"
    params: list = [uid]
    raw_valid = request.args.get("valid")
    if raw_valid not in (None, ""):
        lowered = raw_valid.lower()
        if lowered in ("true", "1"):
            where += " AND valid = 1"
        elif lowered in ("false", "0"):
            where += " AND valid = 0"
        else:
            return error(400, "valid must be true or false")
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM validations WHERE {where}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM validations WHERE {where} ORDER BY created_at DESC, id DESC"
        " LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/validations/<int:validation_id>")
def delete_validation(validation_id: int):
    uid = current_user_id()
    if uid is None:
        return error(401, "authentication required")
    db = get_db()
    cur = db.execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?", (validation_id, uid)
    )
    db.commit()
    if cur.rowcount == 0:
        return error(404, "not found")
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
