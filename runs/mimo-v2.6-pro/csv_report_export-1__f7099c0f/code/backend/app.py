"""Timesheet backend: JSON API under /api plus the built frontend."""

from __future__ import annotations

import csv
import io
import math
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "timesheet.db"

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
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    project TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    hours NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries (user_id, date);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens (user_id);
"""

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")
NUMBER_RE = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?")
GROUPED_NUMBER_RE = re.compile(r"[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?")
DATE_LIKE_RE = re.compile(r"\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[ T].*)?")
BOOL_WORDS = {"true", "false"}


class ApiError(Exception):
    """An error that is rendered as a JSON body with the given status."""

    def __init__(self, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def error_response(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    return error_response(err.message, err.status)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    if not isinstance(data, dict):
        raise ApiError("request body must be a JSON object")
    return data


def get_auth_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise ApiError("authentication required", 401)
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token.strip(),),
    ).fetchone()
    if row is None:
        raise ApiError("invalid or expired token", 401)
    return row


def login_required(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_auth_user()
        return fn(user, *args, **kwargs)

    return wrapper


def validate_credentials(data: dict) -> tuple[str, str]:
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        raise ApiError("username is required")
    if not isinstance(password, str) or not password:
        raise ApiError("password is required")
    username = username.strip()
    if len(username) > 150:
        raise ApiError("username is too long")
    return username, password


def parse_date_arg(value: Any, field: str = "date") -> str:
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise ApiError(f"{field} must be a date in YYYY-MM-DD format")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise ApiError(f"{field} must be a valid date") from None
    return value


def parse_hours(value: Any) -> int | float:
    if isinstance(value, bool):
        raise ApiError("hours must be a number")
    if isinstance(value, int):
        hours: int | float = value
    elif isinstance(value, float):
        if not math.isfinite(value):
            raise ApiError("hours must be a number")
        hours = value
    elif isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            raise ApiError("hours must be a number") from None
        if not math.isfinite(parsed):
            raise ApiError("hours must be a number")
        hours = int(value) if re.fullmatch(r"[+-]?\d+", value.strip()) else parsed
    else:
        raise ApiError("hours must be a number")
    if hours <= 0:
        raise ApiError("hours must be greater than 0")
    return hours


def validate_entry_fields(data: dict, *, partial: bool) -> dict:
    fields: dict[str, Any] = {}
    if not partial:
        for key in ("project", "hours", "date"):
            if key not in data:
                raise ApiError(f"{key} is required")
    if "project" in data:
        project = data.get("project")
        if not isinstance(project, str):
            raise ApiError("project must be a string")
        if not project.strip():
            raise ApiError("project is required")
        if len(project) > 200:
            raise ApiError("project is too long")
        fields["project"] = project
    if "description" in data:
        description = data.get("description")
        if description is None:
            description = ""
        if not isinstance(description, str):
            raise ApiError("description must be a string")
        if len(description) > 2000:
            raise ApiError("description is too long")
        fields["description"] = description
    elif not partial:
        fields["description"] = ""
    if "hours" in data:
        fields["hours"] = parse_hours(data.get("hours"))
    if "date" in data:
        fields["date"] = parse_date_arg(data.get("date"))
    return fields


def entry_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        raise ApiError(f"{name} must be a positive integer") from None


def entry_filters(user_id: int, *, include_project: bool = True) -> tuple[str, list]:
    where = ["user_id = ?"]
    params: list = [user_id]
    start = request.args.get("start_date")
    if start:
        where.append("date >= ?")
        params.append(parse_date_arg(start, "start_date"))
    end = request.args.get("end_date")
    if end:
        where.append("date <= ?")
        params.append(parse_date_arg(end, "end_date"))
    project = request.args.get("project")
    if include_project and project:
        where.append("project = ?")
        params.append(project)
    return " AND ".join(where), params


def format_hours(value: Any) -> str:
    if isinstance(value, int):
        return str(value)
    f = float(value)
    rounded = round(f, 10)
    if rounded != f:
        f = rounded
    return str(f)


def csv_text(value: str) -> str:
    """Keep spreadsheet programs from reading text cells as formulas/numbers/dates."""
    if not value:
        return value
    stripped = value.strip()
    if (
        value[0] in FORMULA_PREFIXES
        or NUMBER_RE.fullmatch(stripped)
        or GROUPED_NUMBER_RE.fullmatch(stripped)
        or DATE_LIKE_RE.fullmatch(stripped)
        or stripped.lower() in BOOL_WORDS
    ):
        return "'" + value
    return value


def csv_response(text: str, filename: str) -> Response:
    return Response(
        text,
        mimetype="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/auth/register")
def register():
    data = json_body()
    username, password = validate_credentials(data)
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        raise ApiError("username already taken", 409)
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utcnow()),
    )
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, cur.lastrowid, utcnow()),
    )
    db.commit()
    return jsonify({"username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username, password = validate_credentials(data)
    db = get_db()
    row = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token})


@app.get("/api/entries")
@login_required
def list_entries(user):
    db = get_db()
    where, params = entry_filters(user["id"])
    page = int_arg("page", 1)
    page_size = int_arg("page_size", 100)
    if page < 1:
        raise ApiError("page must be a positive integer")
    if page_size < 1:
        raise ApiError("page_size must be a positive integer")
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM entries WHERE {where}", params
    ).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM entries WHERE {where}"
        " ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        (*params, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [entry_to_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
@login_required
def create_entry(user):
    fields = validate_entry_fields(json_body(), partial=False)
    db = get_db()
    cur = db.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            user["id"],
            fields["project"],
            fields["description"],
            fields["hours"],
            fields["date"],
            utcnow(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(entry_to_dict(row)), 201


@app.patch("/api/entries/<int:entry_id>")
@login_required
def update_entry(user, entry_id):
    fields = validate_entry_fields(json_body(), partial=True)
    db = get_db()
    row = db.execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?", (entry_id, user["id"])
    ).fetchone()
    if row is None:
        raise ApiError("entry not found", 404)
    if fields:
        assignments = ", ".join(f"{name} = ?" for name in fields)
        db.execute(
            f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
            (*fields.values(), entry_id, user["id"]),
        )
        db.commit()
        row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return jsonify(entry_to_dict(row))


@app.delete("/api/entries/<int:entry_id>")
@login_required
def delete_entry(user, entry_id):
    db = get_db()
    cur = db.execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, user["id"])
    )
    db.commit()
    if cur.rowcount == 0:
        raise ApiError("entry not found", 404)
    return "", 204


@app.get("/api/exports/entries.csv")
@login_required
def export_entries_csv(user):
    where, params = entry_filters(user["id"])
    rows = get_db().execute(
        f"SELECT project, description, hours, date FROM entries WHERE {where}"
        " ORDER BY date ASC, id ASC",
        params,
    ).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["date", "project", "description", "hours"])
    for row in rows:
        writer.writerow(
            [
                row["date"],
                csv_text(row["project"]),
                csv_text(row["description"]),
                format_hours(row["hours"]),
            ]
        )
    return csv_response(buf.getvalue(), "entries.csv")


@app.get("/api/exports/summary.csv")
@login_required
def export_summary_csv(user):
    where, params = entry_filters(user["id"], include_project=False)
    rows = get_db().execute(
        f"SELECT project, SUM(hours) AS total FROM entries WHERE {where}"
        " GROUP BY project ORDER BY project ASC",
        params,
    ).fetchall()
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(["project", "hours"])
    for row in rows:
        writer.writerow([csv_text(row["project"]), format_hours(row["total"])])
    return csv_response(buf.getvalue(), "summary.csv")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api")
@app.get("/api/<path:rest>")
def api_not_found(rest: str = ""):
    raise ApiError("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
