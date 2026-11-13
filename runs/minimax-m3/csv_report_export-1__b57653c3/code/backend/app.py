"""Flask entry point."""

from __future__ import annotations

import csv
import io
import math
import os
import re
import secrets
import sqlite3
from datetime import date as date_type
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "timesheet.db"

DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_PROJECT_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 5000
MAX_HOURS = 10000.0
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500

app = Flask(__name__, static_folder=None)


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or {}


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return jsonify({"error": error.message, "errors": error.errors}), error.status


@app.errorhandler(HTTPException)
def handle_http_exception(error: HTTPException):
    if request.path.startswith("/api/"):
        return jsonify({"error": error.description, "errors": {}}), error.code
    return error


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_key TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    hours REAL NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_error: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def require_auth(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        header = request.headers.get("Authorization", "")
        token = ""
        if header.lower().startswith("bearer "):
            token = header[len("bearer ") :].strip()
        if not token:
            raise ApiError(401, "Authentication required.")
        row = get_db().execute(
            "SELECT users.id AS id, users.username AS username FROM tokens"
            " JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
            (token,),
        ).fetchone()
        if row is None:
            raise ApiError(401, "Invalid or expired token.")
        g.user = row
        g.token = token
        return view(*args, **kwargs)

    return wrapper


def entry_json(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def valid_date(value: Any) -> bool:
    if not isinstance(value, str) or not DATE_PATTERN.match(value):
        return False
    try:
        date_type.fromisoformat(value)
    except ValueError:
        return False
    return True


def parse_hours(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        hours = float(value)
    elif isinstance(value, str):
        try:
            hours = float(value.strip())
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(hours) or hours <= 0 or hours > MAX_HOURS:
        return None
    return hours


def parse_int_param(value: Any, name: str, default: int, minimum: int, maximum: int) -> int:
    if value is None or value == "":
        return default
    try:
        parsed = int(str(value).strip())
    except (TypeError, ValueError):
        raise ApiError(400, f"Invalid query parameter '{name}'.", {name: "Must be a whole number."})
    return max(minimum, min(maximum, parsed))


def filter_clauses(args: Any, allow_project: bool = True) -> tuple[str, list[Any]]:
    clauses = ["user_id = ?"]
    params: list[Any] = [g.user["id"]]

    start_date = args.get("start_date")
    if start_date not in (None, ""):
        if not valid_date(start_date):
            raise ApiError(
                400,
                "Invalid start_date filter.",
                {"start_date": "Use the YYYY-MM-DD format."},
            )
        clauses.append("date >= ?")
        params.append(start_date)

    end_date = args.get("end_date")
    if end_date not in (None, ""):
        if not valid_date(end_date):
            raise ApiError(
                400,
                "Invalid end_date filter.",
                {"end_date": "Use the YYYY-MM-DD format."},
            )
        clauses.append("date <= ?")
        params.append(end_date)

    if allow_project:
        project = args.get("project")
        if project not in (None, ""):
            clauses.append("project = ? COLLATE NOCASE")
            params.append(str(project).strip())

    return " AND ".join(clauses), params


def format_hours(value: Any) -> str:
    number = round(float(value), 6)
    if number == int(number):
        return str(int(number))
    return f"{number:.6f}".rstrip("0").rstrip(".")


def csv_cell(value: Any) -> str:
    """Keep a cell as literal text so spreadsheets never evaluate it as a formula."""
    text = "" if value is None else str(value)
    stripped = text.lstrip(" \t\r\n")
    if stripped[:1] in ("=", "+", "-", "@") or text[:1] in ("\t", "\r"):
        return "'" + text
    return text


def csv_response(rows: list[list[Any]], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL)
    for row in rows:
        writer.writerow(row)
    response = Response(buffer.getvalue(), mimetype="text/csv")
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


def json_body() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError(400, "A JSON object is required.", {"body": "Send a JSON object."})
    return payload


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = json_body()
    errors: dict[str, str] = {}

    username = payload.get("username")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) > 100:
        errors["username"] = "Username must be 100 characters or fewer."

    password = payload.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."

    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)

    username = username.strip()
    connection = get_db()
    existing = connection.execute(
        "SELECT id FROM users WHERE username_key = ?", (username.casefold(),)
    ).fetchone()
    if existing is not None:
        raise ApiError(409, "That username is already taken.", {"username": "Already taken."})

    cursor = connection.execute(
        "INSERT INTO users (username, username_key, password_hash, created_at) VALUES (?, ?, ?, ?)",
        (username, username.casefold(), generate_password_hash(password), now_iso()),
    )
    user_id = cursor.lastrowid
    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    connection.commit()
    return jsonify({"token": token, "username": username}), 201


@app.post("/api/auth/login")
def login():
    payload = json_body()
    errors: dict[str, str] = {}

    username = payload.get("username")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."

    password = payload.get("password")
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."

    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)

    connection = get_db()
    row = connection.execute(
        "SELECT * FROM users WHERE username_key = ?", (username.strip().casefold(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")

    token = secrets.token_urlsafe(32)
    connection.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    connection.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.post("/api/auth/logout")
@require_auth
def logout():
    get_db().execute("DELETE FROM tokens WHERE token = ?", (g.token,))
    get_db().commit()
    return jsonify({"status": "ok"})


@app.get("/api/entries")
@require_auth
def list_entries():
    where, params = filter_clauses(request.args)
    connection = get_db()

    total = connection.execute(
        f"SELECT COUNT(*) AS count FROM entries WHERE {where}", params
    ).fetchone()["count"]

    page = parse_int_param(request.args.get("page"), "page", 1, 1, 1_000_000)
    page_size = parse_int_param(
        request.args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE
    )

    rows = connection.execute(
        f"SELECT * FROM entries WHERE {where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [entry_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
@require_auth
def create_entry():
    payload = json_body()
    errors: dict[str, str] = {}

    project = payload.get("project")
    if not isinstance(project, str) or not project.strip():
        errors["project"] = "Project is required."
    elif len(project.strip()) > MAX_PROJECT_LENGTH:
        errors["project"] = f"Project must be {MAX_PROJECT_LENGTH} characters or fewer."

    description = payload.get("description", "")
    if description is None:
        description = ""
    if not isinstance(description, str):
        errors["description"] = "Description must be text."
    elif len(description) > MAX_DESCRIPTION_LENGTH:
        errors["description"] = f"Description must be {MAX_DESCRIPTION_LENGTH} characters or fewer."

    hours = parse_hours(payload.get("hours"))
    if hours is None:
        errors["hours"] = "Hours must be a number greater than 0."

    entry_date = payload.get("date")
    if not valid_date(entry_date):
        errors["date"] = "Date is required and must use the YYYY-MM-DD format."

    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)

    connection = get_db()
    cursor = connection.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            project.strip(),
            description,
            hours,
            entry_date,
            now_iso(),
        ),
    )
    connection.commit()
    row = connection.execute(
        "SELECT * FROM entries WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(entry_json(row)), 201


@app.patch("/api/entries/<int:entry_id>")
@require_auth
def update_entry(entry_id: int):
    connection = get_db()
    row = connection.execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Entry not found.")

    payload = json_body()
    errors: dict[str, str] = {}
    updates: dict[str, Any] = {}

    if "project" in payload:
        project = payload.get("project")
        if not isinstance(project, str) or not project.strip():
            errors["project"] = "Project is required."
        elif len(project.strip()) > MAX_PROJECT_LENGTH:
            errors["project"] = f"Project must be {MAX_PROJECT_LENGTH} characters or fewer."
        else:
            updates["project"] = project.strip()

    if "description" in payload:
        description = payload.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            errors["description"] = "Description must be text."
        elif len(description) > MAX_DESCRIPTION_LENGTH:
            errors["description"] = f"Description must be {MAX_DESCRIPTION_LENGTH} characters or fewer."
        else:
            updates["description"] = description

    if "hours" in payload:
        hours = parse_hours(payload.get("hours"))
        if hours is None:
            errors["hours"] = "Hours must be a number greater than 0."
        else:
            updates["hours"] = hours

    if "date" in payload:
        entry_date = payload.get("date")
        if not valid_date(entry_date):
            errors["date"] = "Date is required and must use the YYYY-MM-DD format."
        else:
            updates["date"] = entry_date

    if errors:
        raise ApiError(400, "Please fix the highlighted fields.", errors)

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        connection.execute(
            f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
            [*updates.values(), entry_id, g.user["id"]],
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM entries WHERE id = ?", (entry_id,)
        ).fetchone()

    return jsonify(entry_json(row))


@app.delete("/api/entries/<int:entry_id>")
@require_auth
def delete_entry(entry_id: int):
    connection = get_db()
    row = connection.execute(
        "SELECT id FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"])
    ).fetchone()
    if row is None:
        raise ApiError(404, "Entry not found.")
    connection.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"]))
    connection.commit()
    return "", 204


@app.get("/api/projects")
@require_auth
def list_projects():
    rows = get_db().execute(
        "SELECT DISTINCT project FROM entries WHERE user_id = ? ORDER BY project COLLATE NOCASE ASC",
        (g.user["id"],),
    ).fetchall()
    return jsonify({"projects": [row["project"] for row in rows]})


@app.get("/api/summary")
@require_auth
def summary():
    where, params = filter_clauses(request.args, allow_project=False)
    rows = get_db().execute(
        f"SELECT project, SUM(hours) AS hours FROM entries WHERE {where}"
        " GROUP BY project ORDER BY project COLLATE NOCASE ASC",
        params,
    ).fetchall()
    items = [{"project": row["project"], "hours": round(float(row["hours"]), 6)} for row in rows]
    return jsonify(
        {
            "items": items,
            "total": round(sum(item["hours"] for item in items), 6),
        }
    )


@app.get("/api/exports/entries.csv")
@require_auth
def export_entries_csv():
    where, params = filter_clauses(request.args)
    rows = get_db().execute(
        f"SELECT date, project, description, hours FROM entries WHERE {where}"
        " ORDER BY date ASC, id ASC",
        params,
    ).fetchall()

    csv_rows: list[list[Any]] = [["date", "project", "description", "hours"]]
    for row in rows:
        csv_rows.append(
            [
                csv_cell(row["date"]),
                csv_cell(row["project"]),
                csv_cell(row["description"]),
                format_hours(row["hours"]),
            ]
        )
    return csv_response(csv_rows, "entries.csv")


@app.get("/api/exports/summary.csv")
@require_auth
def export_summary_csv():
    where, params = filter_clauses(request.args, allow_project=False)
    rows = get_db().execute(
        f"SELECT project, SUM(hours) AS hours FROM entries WHERE {where}"
        " GROUP BY project ORDER BY project COLLATE NOCASE ASC",
        params,
    ).fetchall()

    csv_rows: list[list[Any]] = [["project", "hours"]]
    for row in rows:
        csv_rows.append([csv_cell(row["project"]), format_hours(row["hours"])])
    return csv_response(csv_rows, "summary.csv")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        raise ApiError(404, "Not found.")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
