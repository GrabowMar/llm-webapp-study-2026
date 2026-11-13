"""XML well-formedness checker: Flask API and frontend server."""

from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.parsers import expat

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "validations.db"

app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
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
                column INTEGER,
                root_element TEXT,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_validations_user_created
                ON validations(user_id, created_at DESC, id DESC);
            """
        )
        db.commit()
    finally:
        db.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


init_db()


def json_error(message: str, status: int):
    return jsonify({"error": message}), status


def body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    match = re.fullmatch(r"Bearer\s+(\S+)", header.strip())
    if not match:
        return None
    return (
        get_db()
        .execute(
            """SELECT u.id, u.username FROM tokens t
               JOIN users u ON u.id = t.user_id
               WHERE t.token_hash = ?""",
            (token_hash(match.group(1)),),
        )
        .fetchone()
    )


def require_user():
    user = current_user()
    if user is None:
        return None, json_error("Authentication required", 401)
    return user, None


def xml_result(xml: str) -> dict[str, Any]:
    """Parse the submitted text only; never resolve anything external."""
    parser = expat.ParserCreate(namespace_separator="}")
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.ExternalEntityRefHandler = lambda *args: 1
    root: list[str] = []

    def start_element(name: str, _attrs: Any) -> None:
        if not root:
            if "}" in name:
                uri, local = name.split("}", 1)
                root.append(f"{{{uri}}}{local}")
            else:
                root.append(name)

    parser.StartElementHandler = start_element

    try:
        parser.Parse(xml.encode("utf-8"), True)
    except (expat.ExpatError, ValueError, UnicodeError) as exc:
        if isinstance(exc, expat.ExpatError):
            message = expat.ErrorString(exc.code)
            line, column = exc.lineno, exc.offset
        else:
            message = str(exc) or "invalid input"
            line, column = 1, 0
        return {
            "valid": False,
            "error": message,
            "line": line,
            "column": column,
            "root_element": None,
        }
    return {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": root[0] if root else None,
    }


@app.post("/api/validate/xml")
def validate_xml():
    xml = body().get("xml")
    if not isinstance(xml, str):
        return json_error("Field 'xml' must be a string", 400)
    return jsonify(xml_result(xml))


@app.post("/api/auth/register")
def register():
    data = body()
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("Field 'username' is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("Field 'password' is required", 400)
    username = username.strip()
    if len(username) > 150:
        return json_error("Username is too long", 400)
    try:
        get_db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        get_db().commit()
    except sqlite3.IntegrityError:
        return json_error("Username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("Fields 'username' and 'password' are required", 400)
    user = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return json_error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_hash(token), user["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    match = re.fullmatch(r"Bearer\s+(\S+)", header.strip())
    if match:
        get_db().execute("DELETE FROM tokens WHERE token_hash = ?", (token_hash(match.group(1)),))
        get_db().commit()
    return jsonify({"status": "ok"})


@app.get("/api/auth/me")
def me():
    user, error = require_user()
    if error:
        return error
    return jsonify({"username": user["username"]})


@app.post("/api/validations")
def create_validation():
    user, error = require_user()
    if error:
        return error
    xml = body().get("xml")
    if not isinstance(xml, str):
        return json_error("Field 'xml' must be a string", 400)
    result = xml_result(xml)
    cursor = get_db().execute(
        """INSERT INTO validations
           (user_id, xml_preview, valid, error, line, column, root_element, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            user["id"],
            xml[:200],
            int(result["valid"]),
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            now_iso(),
        ),
    )
    get_db().commit()
    return jsonify(serialize_validation(get_db().execute(
        "SELECT * FROM validations WHERE id = ?", (cursor.lastrowid,)
    ).fetchone())), 201


def serialize_validation(row: sqlite3.Row) -> dict[str, Any]:
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


def parse_bool(value: str | None) -> bool | None:
    if value is None:
        return None
    if value.lower() in ("true", "1", "yes"):
        return True
    if value.lower() in ("false", "0", "no"):
        return False
    return None


@app.get("/api/validations")
def list_validations():
    user, error = require_user()
    if error:
        return error
    try:
        page = int(request.args.get("page", 1))
        page_size = int(request.args.get("page_size", 10))
    except ValueError:
        return json_error("'page' and 'page_size' must be integers", 400)
    if page < 1 or page_size < 1 or page_size > 100:
        return json_error("'page' must be >= 1 and 'page_size' between 1 and 100", 400)
    valid = parse_bool(request.args.get("valid"))
    if request.args.get("valid") is not None and valid is None:
        return json_error("'valid' must be true or false", 400)

    where = "WHERE user_id = ?"
    params: list[Any] = [user["id"]]
    if valid is not None:
        where += " AND valid = ?"
        params.append(int(valid))
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM validations {where}", params).fetchone()[0]
    rows = db.execute(
        f"""SELECT * FROM validations {where}
            ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify({
        "items": [serialize_validation(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    })


@app.delete("/api/validations/<int:validation_id>")
def delete_validation(validation_id: int):
    user, error = require_user()
    if error:
        return error
    cursor = get_db().execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?", (validation_id, user["id"])
    )
    get_db().commit()
    if cursor.rowcount == 0:
        return json_error("Validation not found", 404)
    return jsonify({"status": "ok"})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
