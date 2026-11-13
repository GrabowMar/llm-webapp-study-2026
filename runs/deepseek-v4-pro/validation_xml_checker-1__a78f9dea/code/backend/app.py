"""Flask entry point for the XML well-formedness checker."""

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from xml.parsers import expat
from xml.parsers.expat import errors

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
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
        """
    )
    conn.commit()
    conn.close()


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- #
# XML well-formedness
# --------------------------------------------------------------------------- #

def validate_xml(xml: str) -> dict:
    """Return a result dict for the given XML string (well-formedness only)."""
    parser = expat.ParserCreate()
    root_element = None

    def start_element(name, attrs):
        nonlocal root_element
        if root_element is None:
            root_element = name

    parser.StartElementHandler = start_element

    try:
        parser.Parse(xml, True)
    except expat.ExpatError as exc:
        message = errors.messages.get(exc.code, str(exc))
        return {
            "valid": False,
            "error": message,
            "line": exc.lineno,
            "column": exc.offset + 1,
            "root_element": root_element,
        }

    return {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root_element,
    }


# --------------------------------------------------------------------------- #
# Auth helpers
# --------------------------------------------------------------------------- #

def current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM sessions s "
        "JOIN users u ON u.id = s.user_id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return jsonify({"error": "username already taken"}), 409

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), _now()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], _now()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/validate/xml")
def validate_endpoint():
    data = request.get_json(silent=True) or {}
    xml = data.get("xml")
    if not isinstance(xml, str):
        return jsonify({"error": "xml is required"}), 400
    return jsonify(validate_xml(xml))


@app.post("/api/validations")
@login_required
def create_validation():
    data = request.get_json(silent=True) or {}
    xml = data.get("xml")
    if not isinstance(xml, str):
        return jsonify({"error": "xml is required"}), 400

    result = validate_xml(xml)
    xml_preview = xml[:200]
    db = get_db()
    cur = db.execute(
        "INSERT INTO validations "
        "(user_id, xml_preview, valid, error, line, column, root_element, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            xml_preview,
            1 if result["valid"] else 0,
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            _now(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM validations WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(_serialize(row)), 201


@app.get("/api/validations")
@login_required
def list_validations():
    valid_param = request.args.get("valid")
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = max(1, min(100, int(request.args.get("page_size", 10))))
    except (TypeError, ValueError):
        page_size = 10

    db = get_db()
    where = "user_id = ?"
    params = [g.user["id"]]

    if valid_param in ("true", "false"):
        where += " AND valid = ?"
        params.append(1 if valid_param == "true" else 0)

    total = db.execute(
        f"SELECT COUNT(*) AS c FROM validations WHERE {where}", params
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM validations WHERE {where} "
        "ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    return jsonify(
        {
            "items": [_serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/validations/<int:validation_id>")
@login_required
def delete_validation(validation_id):
    db = get_db()
    cur = db.execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?",
        (validation_id, g.user["id"]),
    )
    db.commit()
    if cur.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    return jsonify({"deleted": True})


def _serialize(row) -> dict:
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


# --------------------------------------------------------------------------- #
# Frontend
# --------------------------------------------------------------------------- #

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
