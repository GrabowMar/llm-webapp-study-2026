"""XML well-formedness checker API and frontend host."""

from __future__ import annotations

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable
from xml.parsers import expat

from flask import Flask, abort, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"
PREVIEW_LENGTH = 200
DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)
app.url_map.strict_slashes = False


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
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

            CREATE INDEX IF NOT EXISTS idx_validations_user_created
                ON validations (user_id, created_at DESC, id DESC);
            """
        )
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


init_db()


def json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    return token or None


def get_current_user() -> sqlite3.Row | None:
    token = bearer_token()
    if token is None:
        return None
    row = get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens
        JOIN users ON users.id = tokens.user_id
        WHERE tokens.token_hash = ?
        """,
        (hash_token(token),),
    ).fetchone()
    return row


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if get_current_user() is None:
            return jsonify({"error": "authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped


_ERROR_SUFFIX = re.compile(r": line \d+, column \d+$")


def validate_xml(xml: str) -> dict[str, Any]:
    """Check XML syntax only. External entities are never fetched or resolved."""
    parser = expat.ParserCreate()
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.ExternalEntityRefHandler = lambda *args: 1

    root_element: list[str | None] = [None]

    def on_start(name: str, _attrs: dict[str, str]) -> None:
        if root_element[0] is None:
            root_element[0] = name

    parser.StartElementHandler = on_start

    try:
        parser.Parse(xml, True)
    except expat.ExpatError as exc:
        message = _ERROR_SUFFIX.sub("", str(exc)).strip()
        if not message:
            message = expat.ErrorString(exc.code)
        return {
            "valid": False,
            "error": message,
            "line": exc.lineno,
            "column": exc.offset,
            "root_element": None,
        }
    except UnicodeError as exc:
        position = getattr(exc, "start", 0) or 0
        prefix = xml[:position]
        line = prefix.count("\n") + 1
        column = len(prefix) - (prefix.rfind("\n") + 1)
        return {
            "valid": False,
            "error": "not well-formed (invalid token)",
            "line": line,
            "column": column,
            "root_element": None,
        }

    return {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root_element[0],
    }


def validation_to_dict(row: sqlite3.Row) -> dict[str, Any]:
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


@app.get("/api/health")
def health() -> Any:
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register() -> Any:
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    username = username.strip()
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if len(username) > 150:
        return jsonify({"error": "username is too long"}), 400

    try:
        conn = get_db()
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utc_now()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already exists"}), 409

    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login() -> Any:
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    username = username.strip()

    conn = get_db()
    user = conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401

    token = secrets.token_urlsafe(32)
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (hash_token(token), user["id"], utc_now()),
    )
    conn.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@login_required
def me() -> Any:
    user = get_current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.post("/api/validate/xml")
def validate() -> Any:
    data = json_body()
    xml = data.get("xml")
    if not isinstance(xml, str):
        return jsonify({"error": "xml must be a string"}), 400
    return jsonify(validate_xml(xml))


@app.post("/api/validations")
@login_required
def create_validation() -> Any:
    data = json_body()
    xml = data.get("xml")
    if not isinstance(xml, str):
        return jsonify({"error": "xml must be a string"}), 400

    result = validate_xml(xml)
    user = get_current_user()
    created_at = utc_now()
    conn = get_db()
    cursor = conn.execute(
        """
        INSERT INTO validations
            (user_id, xml_preview, valid, error, line, column, root_element, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user["id"],
            xml[:PREVIEW_LENGTH],
            1 if result["valid"] else 0,
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            created_at,
        ),
    )
    conn.commit()

    row = conn.execute("SELECT * FROM validations WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(validation_to_dict(row)), 201


def parse_positive_int(name: str, default: int) -> int | None:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    if value < 1:
        return None
    return value


def parse_valid_filter() -> bool | None:
    raw = request.args.get("valid")
    if raw is None or raw == "":
        return None
    lowered = raw.strip().lower()
    if lowered in {"true", "1", "yes"}:
        return True
    if lowered in {"false", "0", "no"}:
        return False
    return None


@app.get("/api/validations")
@login_required
def list_validations() -> Any:
    valid_filter = parse_valid_filter()
    raw_valid = request.args.get("valid")
    if raw_valid not in (None, "") and valid_filter is None:
        return jsonify({"error": "valid must be true or false"}), 400

    page = parse_positive_int("page", 1)
    if page is None:
        return jsonify({"error": "page must be a positive integer"}), 400
    page_size = parse_positive_int("page_size", DEFAULT_PAGE_SIZE)
    if page_size is None:
        return jsonify({"error": "page_size must be a positive integer"}), 400
    user = get_current_user()
    where = "user_id = ?"
    params: list[Any] = [user["id"]]
    if valid_filter is not None:
        where += " AND valid = ?"
        params.append(1 if valid_filter else 0)

    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) AS count FROM validations WHERE {where}", params).fetchone()[
        "count"
    ]
    rows = conn.execute(
        f"""
        SELECT * FROM validations
        WHERE {where}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
        """,
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [validation_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/validations/<int:validation_id>")
@login_required
def delete_validation(validation_id: int) -> Any:
    user = get_current_user()
    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?", (validation_id, user["id"])
    )
    conn.commit()
    if cursor.rowcount == 0:
        return jsonify({"error": "validation not found"}), 404
    return jsonify({"deleted": True})


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str) -> Any:
    return jsonify({"error": "not found"}), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html") -> Any:
    if path.startswith("api/"):
        abort(404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
