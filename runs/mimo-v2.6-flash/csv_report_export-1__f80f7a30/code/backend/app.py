"""Personal timesheet: JSON API under /api plus the built frontend."""

from __future__ import annotations

import csv
import io
import math
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "timesheet.db"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CSV_UNSAFE_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------- database


def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect_db()
    return g.db


@app.teardown_appcontext
def close_db(_exc) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect_db()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL
                    REFERENCES users (id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL
                    REFERENCES users (id) ON DELETE CASCADE,
                project TEXT NOT NULL,
                description TEXT NOT NULL,
                hours REAL NOT NULL,
                date TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_user_date
                ON entries (user_id, date);
            """
        )
        conn.execute("PRAGMA journal_mode=WAL")
        conn.commit()
    finally:
        conn.close()


init_db()


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- helpers


def payload() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def api_error(message: str, status: int, errors: dict | None = None):
    body: dict = {"error": message}
    if errors is not None:
        body["errors"] = errors
    return jsonify(body), status


def validation_error(errors: dict[str, str]):
    return api_error("; ".join(errors.values()), 400, errors)


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens AS t "
            "JOIN users AS u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )
    return row


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return api_error("unauthorized", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


class FilterError(ValueError):
    pass


def parse_date(value: str) -> str:
    """Validate a YYYY-MM-DD string and return it normalised."""
    candidate = value.strip()
    if not DATE_RE.match(candidate):
        raise FilterError("must be a valid date in YYYY-MM-DD format")
    try:
        datetime.strptime(candidate, "%Y-%m-%d")
    except ValueError as exc:
        raise FilterError("must be a valid date in YYYY-MM-DD format") from exc
    return candidate


def parse_filters(args, include_project: bool = True) -> tuple[list[str], list]:
    where: list[str] = []
    params: list = []
    for name, operator in (("start_date", ">="), ("end_date", "<=")):
        raw = args.get(name)
        if raw:
            try:
                cleaned = parse_date(raw)
            except FilterError as exc:
                raise FilterError(f"{name} {exc}") from exc
            where.append(f"date {operator} ?")
            params.append(cleaned)
    if include_project:
        project = args.get("project")
        if project:
            where.append("project = ?")
            params.append(project)
    return where, params


def validate_entry(data: dict, *, partial: bool) -> tuple[dict, dict]:
    """Validate entry fields; returns (values, errors).

    In partial mode only the keys present in ``data`` are checked and
    returned, which is what PATCH needs.
    """
    errors: dict[str, str] = {}
    values: dict = {}

    def given(field: str) -> bool:
        return not partial or field in data

    if given("project"):
        raw = data.get("project")
        if not isinstance(raw, str) or not raw.strip():
            errors["project"] = "project is required"
        else:
            values["project"] = raw

    if given("description"):
        raw = data.get("description")
        if not isinstance(raw, str) or not raw.strip():
            errors["description"] = "description is required"
        else:
            values["description"] = raw

    if given("hours"):
        raw = data.get("hours")
        if raw is None or (isinstance(raw, str) and not raw.strip()):
            errors["hours"] = "hours is required"
        else:
            number: float | None = None
            if isinstance(raw, bool):
                number = None
            elif isinstance(raw, (int, float)):
                number = float(raw)
            elif isinstance(raw, str):
                try:
                    number = float(raw.strip())
                except ValueError:
                    number = None
            if number is None or not math.isfinite(number):
                errors["hours"] = "hours must be a number"
            elif number <= 0:
                errors["hours"] = "hours must be a positive number"
            else:
                values["hours"] = number

    if given("date"):
        raw = data.get("date")
        if not isinstance(raw, str) or not raw.strip():
            errors["date"] = "date is required"
        else:
            try:
                values["date"] = parse_date(raw)
            except FilterError:
                errors["date"] = "date must be a valid date in YYYY-MM-DD format"

    return values, errors


def entry_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def sanitize_cell(value) -> str:
    """Keep spreadsheet programs from re-interpreting typed text."""
    text = "" if value is None else str(value)
    if text[:1] in CSV_UNSAFE_PREFIXES:
        return "'" + text
    return text


def csv_response(rows: list[list], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    for row in rows:
        writer.writerow([sanitize_cell(cell) for cell in row])
    response = Response(buffer.getvalue().encode("utf-8"), mimetype="text/csv")
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


# ---------------------------------------------------------------- auth


@app.post("/api/auth/register")
def register():
    data = payload()
    errors: dict[str, str] = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    if not isinstance(password, str) or password == "":
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    username = username.strip()
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return api_error("username already exists", 409, {"username": "username already exists"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = payload()
    errors: dict[str, str] = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    if not isinstance(password, str) or password == "":
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    row = (
        get_db()
        .execute("SELECT * FROM users WHERE username = ?", (username.strip(),))
        .fetchone()
    )
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utcnow()),
    )
    db.commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------- entries


@app.get("/api/entries")
@login_required
def list_entries():
    try:
        where, params = parse_filters(request.args)
    except FilterError as exc:
        return api_error(str(exc), 400)

    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "100"))
    except ValueError:
        return api_error("page and page_size must be integers", 400)
    if page < 1:
        return api_error("page must be at least 1", 400)
    if page_size < 1 or page_size > 1000:
        return api_error("page_size must be between 1 and 1000", 400)

    tail = " AND " + " AND ".join(where) if where else ""
    owner_params: list = [g.user["id"]]
    all_params = owner_params + params

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) FROM entries WHERE user_id = ?{tail}", all_params
    ).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM entries WHERE user_id = ?{tail}"
        " ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        [*all_params, page_size, (page - 1) * page_size],
    ).fetchall()

    return jsonify(
        {
            "items": [entry_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
@login_required
def create_entry():
    values, errors = validate_entry(payload(), partial=False)
    if errors:
        return validation_error(errors)

    db = get_db()
    cursor = db.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            values["project"],
            values["description"],
            values["hours"],
            values["date"],
            utcnow(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT * FROM entries WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(entry_dict(row)), 201


def load_entry(entry_id: int):
    return (
        get_db()
        .execute(
            "SELECT * FROM entries WHERE id = ? AND user_id = ?",
            (entry_id, g.user["id"]),
        )
        .fetchone()
    )


@app.patch("/api/entries/<int:entry_id>")
@login_required
def update_entry(entry_id: int):
    existing = load_entry(entry_id)
    if existing is None:
        return api_error("entry not found", 404)

    values, errors = validate_entry(payload(), partial=True)
    if errors:
        return validation_error(errors)
    if values:
        assignments = ", ".join(f"{field} = ?" for field in values)
        db = get_db()
        db.execute(
            f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
            [*values.values(), entry_id, g.user["id"]],
        )
        db.commit()

    return jsonify(entry_dict(load_entry(entry_id)))


@app.delete("/api/entries/<int:entry_id>")
@login_required
def delete_entry(entry_id: int):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, g.user["id"]),
    )
    db.commit()
    if cursor.rowcount == 0:
        return api_error("entry not found", 404)
    return jsonify({"ok": True}), 200


@app.get("/api/projects")
@login_required
def list_projects():
    rows = (
        get_db()
        .execute(
            "SELECT DISTINCT project FROM entries WHERE user_id = ? ORDER BY project",
            (g.user["id"],),
        )
        .fetchall()
    )
    return jsonify({"items": [row["project"] for row in rows]})


@app.get("/api/totals")
@login_required
def totals():
    try:
        where, params = parse_filters(request.args)
    except FilterError as exc:
        return api_error(str(exc), 400)

    sql = (
        "SELECT project, SUM(hours) AS total FROM entries WHERE user_id = ?"
        + (" AND " + " AND ".join(where) if where else "")
        + " GROUP BY project ORDER BY project"
    )
    rows = get_db().execute(sql, [g.user["id"], *params]).fetchall()
    return jsonify(
        {
            "items": [
                {"project": row["project"], "hours": row["total"]} for row in rows
            ]
        }
    )


# ---------------------------------------------------------------- exports


@app.get("/api/exports/entries.csv")
@login_required
def export_entries_csv():
    try:
        where, params = parse_filters(request.args)
    except FilterError as exc:
        return api_error(str(exc), 400)

    sql = (
        "SELECT date, project, description, hours FROM entries WHERE user_id = ?"
        + (" AND " + " AND ".join(where) if where else "")
        + " ORDER BY date ASC, id ASC"
    )
    rows = get_db().execute(sql, [g.user["id"], *params]).fetchall()
    data = [["date", "project", "description", "hours"]]
    data.extend(
        [row["date"], row["project"], row["description"], row["hours"]]
        for row in rows
    )
    return csv_response(data, "entries.csv")


@app.get("/api/exports/summary.csv")
@login_required
def export_summary_csv():
    try:
        where, params = parse_filters(request.args, include_project=False)
    except FilterError as exc:
        return api_error(str(exc), 400)

    sql = (
        "SELECT project, SUM(hours) AS total FROM entries WHERE user_id = ?"
        + (" AND " + " AND ".join(where) if where else "")
        + " GROUP BY project ORDER BY project"
    )
    rows = get_db().execute(sql, [g.user["id"], *params]).fetchall()
    data = [["project", "hours"]]
    data.extend([row["project"], row["total"]] for row in rows)
    return csv_response(data, "summary.csv")


# ---------------------------------------------------------------- frontend


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return api_error("frontend build not found", 404)


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return api_error("not found", 404)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return api_error("not found", 404)


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return api_error("method not allowed", 405)
    return api_error("method not allowed", 405)


@app.after_request
def cors_headers(response):
    if request.path.startswith("/api/"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Authorization, Content-Type"
        )
        response.headers.setdefault(
            "Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS"
        )
    return response
