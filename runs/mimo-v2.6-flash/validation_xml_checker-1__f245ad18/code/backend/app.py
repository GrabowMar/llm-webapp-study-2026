"""Flask entry point: XML well-formedness checker API plus frontend serving."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.parsers import expat

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or Path.cwd() / "data")
DB_PATH = DATA_DIR / "app.db"

PREVIEW_LENGTH = 200
DEFAULT_PAGE_SIZE = 10

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
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    xml_preview TEXT NOT NULL,
    valid INTEGER NOT NULL,
    error TEXT,
    line INTEGER,
    column INTEGER,
    root_element TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_validations_user_created
    ON validations (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);
"""


# ----------------------------------------------------------------- database


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = _connect()
    return g.db


@app.teardown_appcontext
def _close_db(_exception: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = _connect()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ------------------------------------------------------------ xml checking


def check_xml(text: str) -> dict[str, Any]:
    """Decide well-formedness of ``text`` without resolving anything external."""
    parser = expat.ParserCreate()
    root: list[str] = []

    def start_element(name: str, _attrs: dict[str, str]) -> None:
        if not root:
            root.append(name)

    parser.StartElementHandler = start_element
    # Never hand anything to the parser from outside the submitted text.
    parser.ExternalEntityRefHandler = lambda *_args: 0
    try:
        parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    except (AttributeError, expat.ExpatError):  # pragma: no cover - exotic builds
        pass

    try:
        parser.Parse(text, True)
    except expat.ExpatError as exc:
        return {
            "valid": False,
            "error": expat.ErrorString(exc.code) or "parse error",
            "line": exc.lineno,
            "column": exc.offset + 1,
            "root_element": root[0] if root else None,
        }
    except (UnicodeEncodeError, ValueError):
        return {
            "valid": False,
            "error": "not well-formed (invalid character)",
            "line": 1,
            "column": 1,
            "root_element": root[0] if root else None,
        }
    return {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root[0] if root else None,
    }


def _check_from_row(row: sqlite3.Row) -> dict[str, Any]:
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


# ----------------------------------------------------------------- helpers


def _json_body() -> tuple[dict[str, Any] | None, Any]:
    body = request.get_json(silent=True, force=True)
    if not isinstance(body, dict):
        return None, (jsonify({"error": "a JSON object body is required"}), 400)
    return body, None


def _xml_from(body: dict[str, Any]) -> tuple[str | None, Any]:
    if "xml" not in body:
        return None, (jsonify({"error": "the 'xml' field is required"}), 400)
    value = body["xml"]
    if not isinstance(value, str):
        return None, (jsonify({"error": "the 'xml' field must be a string"}), 400)
    return value, None


def _current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    return (
        db()
        .execute(
            "SELECT u.id AS id, u.username AS username "
            "FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )


def _auth_error():
    return jsonify({"error": "a valid bearer token is required"}), 401


def _query_int(name: str, default: int, minimum: int, maximum: int | None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, (jsonify({"error": f"'{name}' must be an integer"}), 400)
    value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value, None


# ---------------------------------------------------------------- endpoints


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body, err = _json_body()
    if err is not None:
        return err
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "a username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "a password is required"}), 400
    username = username.strip()
    if len(username) > 150:
        return jsonify({"error": "the username is too long"}), 400
    try:
        cursor = db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), _now()),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "that username is already taken"}), 409
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body, err = _json_body()
    if err is not None:
        return err
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "a username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "a password is required"}), 400
    row = (
        db()
        .execute(
            "SELECT id, password_hash FROM users WHERE username = ?",
            (username.strip(),),
        )
        .fetchone()
    )
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], _now()),
    )
    db().commit()
    return jsonify({"token": token}), 200


@app.post("/api/validate/xml")
def validate_xml():
    body, err = _json_body()
    if err is not None:
        return err
    xml, err = _xml_from(body)
    if err is not None:
        return err
    return jsonify(check_xml(xml)), 200


@app.post("/api/validations")
def create_validation():
    user = _current_user()
    if user is None:
        return _auth_error()
    body, err = _json_body()
    if err is not None:
        return err
    xml, err = _xml_from(body)
    if err is not None:
        return err
    result = check_xml(xml)
    created_at = _now()
    cursor = db().execute(
        "INSERT INTO validations "
        "(user_id, xml_preview, valid, error, line, column, root_element, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            xml[:PREVIEW_LENGTH],
            int(result["valid"]),
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            created_at,
        ),
    )
    db().commit()
    return (
        jsonify(
            {
                "id": cursor.lastrowid,
                "xml_preview": xml[:PREVIEW_LENGTH],
                "valid": result["valid"],
                "error": result["error"],
                "line": result["line"],
                "column": result["column"],
                "root_element": result["root_element"],
                "created_at": created_at,
            }
        ),
        201,
    )


@app.get("/api/validations")
def list_validations():
    user = _current_user()
    if user is None:
        return _auth_error()

    where = "user_id = ?"
    params: list[Any] = [user["id"]]
    raw_valid = request.args.get("valid")
    if raw_valid is not None and raw_valid != "":
        lowered = raw_valid.strip().lower()
        if lowered in ("true", "1", "yes"):
            where += " AND valid = 1"
        elif lowered in ("false", "0", "no"):
            where += " AND valid = 0"
        else:
            return jsonify({"error": "'valid' must be true or false"}), 400

    page, err = _query_int("page", 1, 1, None)
    if err is not None:
        return err
    page_size, err = _query_int("page_size", DEFAULT_PAGE_SIZE, 1, None)
    if err is not None:
        return err

    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM validations WHERE {where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM validations WHERE {where} "
        "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return (
        jsonify(
            {
                "items": [_check_from_row(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        ),
        200,
    )


@app.delete("/api/validations/<int:validation_id>")
def delete_validation(validation_id: int):
    user = _current_user()
    if user is None:
        return _auth_error()
    cursor = db().execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?",
        (validation_id, user["id"]),
    )
    db().commit()
    if cursor.rowcount == 0:
        return jsonify({"error": "not found"}), 404
    return "", 204


@app.route("/api/<path:_rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_fallback(_rest: str):
    return jsonify({"error": "not found"}), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    parts = Path(path).parts
    if path and (".." in parts or path.startswith("/")):
        return jsonify({"error": "not found"}), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()

if __name__ == "__main__":  # pragma: no cover - local convenience
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
