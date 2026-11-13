import hashlib
import os
import secrets
import sqlite3
import time
from contextlib import closing
from datetime import UTC, datetime
from functools import wraps
from pathlib import Path
from xml.parsers import expat

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.routing import PathConverter
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
MAX_XML_LENGTH = 1_000_000
TOKEN_LIFETIME = 30 * 24 * 60 * 60


class FrontendPathConverter(PathConverter):
    regex = r"(?!api(?:/|$))[^/].*?"


def check_xml(xml):
    result = {
        "valid": True,
        "error": None,
        "line": None,
        "column": None,
        "root_element": None,
    }
    parser = expat.ParserCreate(namespace_separator="}")
    parser.namespace_prefixes = True
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.ExternalEntityRefHandler = lambda *args: 1

    def start_element(name, attributes):
        if result["root_element"] is None:
            parts = name.split("}")
            result["root_element"] = (
                f"{parts[2]}:{parts[1]}" if len(parts) == 3 else parts[-1]
            )

    parser.StartElementHandler = start_element
    try:
        parser.Parse(xml, True)
    except expat.ExpatError as error:
        result.update(
            valid=False,
            error=expat.ErrorString(error.code),
            line=error.lineno,
            column=error.offset + 1,
            root_element=None,
        )
    except (ValueError, LookupError) as error:
        result.update(
            valid=False,
            error="Invalid XML character or unsupported encoding.",
            line=parser.CurrentLineNumber or 1,
            column=parser.CurrentColumnNumber + 1,
            root_element=None,
        )
        if isinstance(error, UnicodeEncodeError):
            prefix = xml[: error.start].replace("\r\n", "\n").replace("\r", "\n")
            result["line"] = prefix.count("\n") + 1
            result["column"] = len(prefix.rsplit("\n", 1)[-1]) + 1
    return result


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.url_map.converters["frontend"] = FrontendPathConverter
    app.config.update(
        DATABASE=os.environ.get("DATABASE_PATH", "data/xmlcheck.sqlite3"),
        MAX_CONTENT_LENGTH=8 * 1024 * 1024,
    )
    if config:
        app.config.update(config)

    database_path = Path(app.config["DATABASE"])
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(database_path, timeout=15)) as database:
        database.execute("PRAGMA journal_mode=WAL")
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
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
            CREATE INDEX IF NOT EXISTS validations_user_created
                ON validations(user_id, id DESC);
            CREATE INDEX IF NOT EXISTS validations_user_valid
                ON validations(user_id, valid, id DESC);
            """
        )

    def get_database():
        if "database" not in g:
            g.database = sqlite3.connect(app.config["DATABASE"], timeout=15)
            g.database.row_factory = sqlite3.Row
            g.database.execute("PRAGMA foreign_keys=ON")
        return g.database

    @app.teardown_appcontext
    def close_database(error=None):
        database = g.pop("database", None)
        if database is not None:
            database.close()

    def require_auth(handler):
        @wraps(handler)
        def wrapped(*args, **kwargs):
            authorization = request.headers.get("Authorization", "").split()
            if len(authorization) != 2 or authorization[0].lower() != "bearer":
                return {"error": "Sign in to access your saved checks."}, 401
            g.token_hash = hashlib.sha256(authorization[1].encode()).hexdigest()
            g.user = get_database().execute(
                "SELECT users.id, users.username FROM sessions "
                "JOIN users ON users.id = sessions.user_id "
                "WHERE token_hash = ? AND expires_at > ?",
                (g.token_hash, int(time.time())),
            ).fetchone()
            if g.user is None:
                return {"error": "Your session has expired. Please sign in again."}, 401
            return handler(*args, **kwargs)

        return wrapped

    def json_body():
        body = request.get_json(silent=True)
        return body if isinstance(body, dict) else None

    def credentials():
        body = json_body()
        if body is None:
            return None
        username = body.get("username")
        password = body.get("password")
        if (
            not isinstance(username, str)
            or not isinstance(password, str)
            or not username.strip()
            or len(username.strip()) > 80
            or not password
            or len(password) > 1024
        ):
            return None
        try:
            username.encode("utf-8")
            password.encode("utf-8")
        except UnicodeEncodeError:
            return None
        return username.strip(), password

    def submitted_xml():
        body = json_body()
        if body is None or not isinstance(body.get("xml"), str):
            return None, ({"error": "Provide an XML string in the 'xml' field."}, 400)
        if len(body["xml"]) > MAX_XML_LENGTH:
            return None, ({"error": "XML must be at most 1,000,000 characters."}, 413)
        return body["xml"], None

    def saved_check(row):
        item = dict(row)
        item.pop("user_id", None)
        item["valid"] = bool(item["valid"])
        return item

    @app.errorhandler(HTTPException)
    def http_error(error):
        return jsonify(error=error.description), error.code

    @app.after_request
    def security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
        )
        if request.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        fields = credentials()
        if fields is None:
            return {"error": "Provide a username (1–80 characters) and a password."}, 400
        username, password = fields
        password_hash = generate_password_hash(password)
        database = get_database()
        try:
            with database:
                cursor = database.execute(
                    "INSERT INTO users (username, password_hash) VALUES (?, ?)",
                    (username, password_hash),
                )
        except sqlite3.IntegrityError:
            return {"error": "That username is already taken."}, 409
        return {"id": cursor.lastrowid, "username": username}, 201

    @app.post("/api/auth/login")
    def login():
        fields = credentials()
        if fields is None:
            return {"error": "Provide a username and password."}, 400
        username, password = fields
        database = get_database()
        user = database.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return {"error": "Incorrect username or password."}, 401
        token = secrets.token_urlsafe(32)
        with database:
            database.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
            database.execute(
                "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (
                    hashlib.sha256(token.encode()).hexdigest(),
                    user["id"],
                    int(time.time()) + TOKEN_LIFETIME,
                ),
            )
        return {"token": token}

    @app.get("/api/auth/me")
    @require_auth
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @require_auth
    def logout():
        database = get_database()
        with database:
            database.execute("DELETE FROM sessions WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.post("/api/validate/xml")
    def validate_xml():
        xml, error = submitted_xml()
        if error:
            return error
        return check_xml(xml)

    @app.post("/api/validations")
    @require_auth
    def save_validation():
        xml, error = submitted_xml()
        if error:
            return error
        result = check_xml(xml)
        database = get_database()
        with database:
            cursor = database.execute(
                "INSERT INTO validations "
                "(user_id, xml_preview, valid, error, line, column, root_element, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    g.user["id"],
                    xml[:200],
                    result["valid"],
                    result["error"],
                    result["line"],
                    result["column"],
                    result["root_element"],
                    datetime.now(UTC).isoformat(),
                ),
            )
        row = database.execute(
            "SELECT * FROM validations WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
        return saved_check(row), 201

    @app.get("/api/validations")
    @require_auth
    def list_validations():
        try:
            page = int(request.args.get("page", "1"))
            page_size = int(request.args.get("page_size", "10"))
        except ValueError:
            return {"error": "Page and page_size must be integers."}, 400
        if page < 1 or page > 1_000_000 or not 1 <= page_size <= 100:
            return {"error": "Page must be positive; page_size must be between 1 and 100."}, 400
        valid = request.args.get("valid")
        where = "user_id = ?"
        parameters = [g.user["id"]]
        if valid is not None:
            if valid.lower() not in ("true", "false"):
                return {"error": "The valid filter must be 'true' or 'false'."}, 400
            where += " AND valid = ?"
            parameters.append(int(valid.lower() == "true"))
        database = get_database()
        total = database.execute(
            f"SELECT COUNT(*) FROM validations WHERE {where}", parameters
        ).fetchone()[0]
        rows = database.execute(
            f"SELECT * FROM validations WHERE {where} ORDER BY id DESC LIMIT ? OFFSET ?",
            [*parameters, page_size, (page - 1) * page_size],
        ).fetchall()
        return {
            "items": [saved_check(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @app.delete("/api/validations/<int:validation_id>")
    @require_auth
    def delete_validation(validation_id):
        database = get_database()
        with database:
            cursor = database.execute(
                "DELETE FROM validations WHERE id = ? AND user_id = ?",
                (validation_id, g.user["id"]),
            )
        if cursor.rowcount == 0:
            return {"error": "Saved check not found."}, 404
        return "", 204

    @app.get("/")
    @app.get("/<frontend:path>")
    def frontend(path="index.html"):
        if (DIST / path).is_file():
            return send_from_directory(DIST, path)
        if Path(path).suffix:
            return {"error": "File not found."}, 404
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()
