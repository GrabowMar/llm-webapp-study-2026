"""XML well-formedness checker: JSON API under /api plus the built frontend."""

import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
import xml.parsers.expat as expat

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

XML_ERROR_EXTERNAL_ENTITY_HANDLING = 21
MAX_ENTITY_DECL_CHARS = 1_000_000
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 10
PREVIEW_LEN = 200

_POS_SUFFIX = re.compile(r":\s*line \d+, column \d+\s*$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024


# ---------------------------------------------------------------- database


def get_db():
    db = getattr(g, "_db", None)
    if db is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
    return db


@app.teardown_appcontext
def close_db(_exc):
    db = getattr(g, "_db", None)
    if db is not None:
        db.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.executescript(
            """
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
            CREATE TABLE IF NOT EXISTS validations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                xml_preview TEXT NOT NULL,
                valid INTEGER NOT NULL,
                error TEXT,
                error_line INTEGER,
                error_column INTEGER,
                root_element TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_validations_user
                ON validations (user_id, id DESC);
            """
        )


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------- xml well-formedness


class _EntityBomb(Exception):
    """Raised from a parser callback when entity declarations grow too large."""


def check_xml_document(text):
    """Decide XML well-formedness of `text`; nothing outside it is ever consulted."""
    parser = expat.ParserCreate()
    root = []
    declared_chars = [0]

    def on_start(name, _attrs):
        if not root:
            root.append(name)

    def on_entity_decl(_name, _is_pe, value, _base, _sys, _pub, _notn):
        if value is not None:
            declared_chars[0] += len(value)
            if declared_chars[0] > MAX_ENTITY_DECL_CHARS:
                raise _EntityBomb("entity declarations are too large")

    def on_external_ref(_ctx, _base, _sys, _pub):
        # Never fetch or resolve anything outside the submitted text.
        return 0

    parser.StartElementHandler = on_start
    parser.EntityDeclHandler = on_entity_decl
    parser.ExternalEntityRefHandler = on_external_ref
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)

    result = {
        "valid": False,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root[0] if root else None,
    }
    try:
        parser.Parse(text, True)
    except _EntityBomb as exc:
        result["error"] = str(exc)
        result["line"] = parser.CurrentLineNumber
        result["column"] = parser.CurrentColumnNumber + 1
    except expat.ExpatError as exc:
        message = _POS_SUFFIX.sub("", str(exc))
        if exc.code == XML_ERROR_EXTERNAL_ENTITY_HANDLING:
            message = "reference to external entity cannot be resolved"
        result["error"] = message
        result["line"] = exc.lineno
        result["column"] = exc.offset + 1
    else:
        result["valid"] = True
    result["root_element"] = root[0] if root else None
    return result


# ------------------------------------------------------------------- helpers


def current_user():
    """Return the row of the user named by the Authorization header, or None."""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        return view(user, *args, **kwargs)

    return wrapped


def xml_payload():
    """Return the `xml` string from the request body, or a (response, status) error."""
    data = request.get_json(silent=True)
    text = data.get("xml") if isinstance(data, dict) else None
    if not isinstance(text, str):
        return None, (jsonify({"error": "field 'xml' is required and must be a string"}), 400)
    return text, None


def saved_check_dict(row):
    return {
        "id": row["id"],
        "xml_preview": row["xml_preview"],
        "valid": bool(row["valid"]),
        "error": row["error"],
        "line": row["error_line"],
        "column": row["error_column"],
        "root_element": row["root_element"],
        "created_at": row["created_at"],
    }


# --------------------------------------------------------------------- auth


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    data = data if isinstance(data, dict) else {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "password is required"}), 400
    if len(username) > 64 or len(password) > 1024:
        return jsonify({"error": "username or password too long"}), 400
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    data = data if isinstance(data, dict) else {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        generate_password_hash(password)
        return jsonify({"error": "invalid username or password"}), 401
    if not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


# ---------------------------------------------------------------- xml check


@app.post("/api/validate/xml")
def validate_xml():
    text, error = xml_payload()
    if error is not None:
        return error
    return jsonify(check_xml_document(text))


@app.post("/api/validations")
@login_required
def create_validation(user):
    text, error = xml_payload()
    if error is not None:
        return error
    result = check_xml_document(text)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO validations"
        " (user_id, xml_preview, valid, error, error_line, error_column, root_element, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            text[:PREVIEW_LEN],
            1 if result["valid"] else 0,
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM validations WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(saved_check_dict(row)), 201


@app.get("/api/validations")
@login_required
def list_validations(user):
    def int_arg(name, default):
        raw = request.args.get(name)
        return default if raw is None or raw.strip() == "" else int(raw)

    try:
        page = int_arg("page", 1)
        page_size = int_arg("page_size", DEFAULT_PAGE_SIZE)
    except ValueError:
        return jsonify({"error": "page and page_size must be integers"}), 400
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    where = ["user_id = ?"]
    params = [user["id"]]
    valid_param = request.args.get("valid")
    if valid_param is not None and valid_param.strip():
        low = valid_param.strip().lower()
        if low in ("true", "1", "yes"):
            where.append("valid = 1")
        elif low in ("false", "0", "no"):
            where.append("valid = 0")
        else:
            return jsonify({"error": "valid must be true or false"}), 400

    db = get_db()
    where_sql = " AND ".join(where)
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM validations WHERE {where_sql}", params
    ).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM validations WHERE {where_sql}"
        " ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [saved_check_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/validations/<int:validation_id>")
@login_required
def delete_validation(user, validation_id):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?",
        (validation_id, user["id"]),
    )
    db.commit()
    if cursor.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"deleted": True})


# ---------------------------------------------------------------- frontend


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    candidate = (DIST / path).resolve()
    if candidate.is_file() and candidate.is_relative_to(DIST.resolve()):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
