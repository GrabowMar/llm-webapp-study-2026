"""Timesheet application: Flask JSON API, CSV exports and the frontend build."""

from __future__ import annotations

import csv
import io
import re
import secrets
import sqlite3
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from functools import wraps
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE = Path(__file__).resolve().parent.parent
DATA_DIR = BASE / "data"
DB_PATH = DATA_DIR / "timesheet.db"
DIST = BASE / "frontend" / "dist"

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
DANGEROUS_LEADS = "=+-@\t\r\n'\""
NUMBERISH_RE = re.compile(
    r"^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$"
    r"|^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$"
    r"|^\d{1,2}:\d{2}(?::\d{2})?$"
    r"|^(?:true|false)$",
    re.IGNORECASE,
)
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 1000
HOURS_QUANTUM = Decimal("0.000001")

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tokens (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS entries (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                project     TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                hours       TEXT NOT NULL,
                date        TEXT NOT NULL,
                created_at  TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_entries_user_date
                ON entries(user_id, date);
            CREATE INDEX IF NOT EXISTS idx_entries_user_project
                ON entries(user_id, project);
            """
        )
        conn.commit()
    finally:
        conn.close()


def db() -> sqlite3.Connection:
    connection = g.get("db")
    if connection is None:
        connection = sqlite3.connect(DB_PATH, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 30000")
        g.db = connection
    return connection


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


init_db()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def validation_error(errors: dict[str, str]):
    return jsonify({"error": next(iter(errors.values())), "errors": errors}), 400


def valid_date(value: object) -> bool:
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def parse_hours(raw: object) -> str | None:
    if raw is None or isinstance(raw, bool) or not isinstance(raw, (int, float, str, Decimal)):
        return None
    try:
        amount = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount < 0 or amount > 10000:
        return None
    return decimal_text(amount.quantize(HOURS_QUANTUM))


def hours_number(text: str) -> int | float:
    amount = Decimal(text)
    return int(amount) if amount == amount.to_integral_value() else float(amount)


def entry_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": hours_number(row["hours"]),
        "date": row["date"],
        "created_at": row["created_at"],
    }


def validate_entry_fields(data: dict, *, partial: bool = False) -> tuple[dict, dict]:
    values: dict = {}
    errors: dict[str, str] = {}

    if not partial or "project" in data:
        raw = data.get("project")
        if not isinstance(raw, str) or not raw.strip():
            errors["project"] = "Project is required."
        else:
            values["project"] = raw.strip()

    if not partial or "description" in data:
        raw = data.get("description", "")
        if raw is None:
            raw = ""
        if not isinstance(raw, str):
            errors["description"] = "Description must be text."
        else:
            values["description"] = raw

    if not partial or "hours" in data:
        hours = parse_hours(data.get("hours"))
        if hours is None:
            errors["hours"] = "Hours must be a non-negative number."
        else:
            values["hours"] = hours

    if not partial or "date" in data:
        raw = data.get("date")
        if raw in (None, "") and not partial:
            values["date"] = date.today().isoformat()
        elif not valid_date(raw):
            errors["date"] = "Date must be in YYYY-MM-DD format."
        else:
            values["date"] = raw

    return values, errors


def clamped_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(maximum, value))


def filters(include_project: bool = True) -> tuple[str, list, dict]:
    errors: dict[str, str] = {}
    start = request.args.get("start_date") or None
    end = request.args.get("end_date") or None
    if start is not None and not valid_date(start):
        errors["start_date"] = "start_date must be in YYYY-MM-DD format."
    if end is not None and not valid_date(end):
        errors["end_date"] = "end_date must be in YYYY-MM-DD format."
    if errors:
        return "", [], errors

    project = (request.args.get("project") or None) if include_project else None
    clauses = ["user_id = ?"]
    params: list = [g.user["id"]]
    if start is not None:
        clauses.append("date >= ?")
        params.append(start)
    if end is not None:
        clauses.append("date <= ?")
        params.append(end)
    if project is not None:
        clauses.append("project = ?")
        params.append(project)
    return " AND ".join(clauses), params, {}


def totals_for(where: str, params: list) -> list[tuple[str, Decimal]]:
    rows = db().execute(
        f"SELECT project, hours FROM entries WHERE {where}", params
    ).fetchall()
    totals: dict[str, Decimal] = {}
    for row in rows:
        name = row["project"]
        totals[name] = totals.get(name, Decimal(0)) + Decimal(row["hours"])
    return [(name, totals[name]) for name in sorted(totals)]


def safe_cell(value: object) -> str:
    """Keep spreadsheet programs from interpreting a text cell as a formula.

    A leading apostrophe is the text marker understood by Excel/LibreOffice and
    is not displayed when the file is opened, so the cell still reads as the
    text the user typed.
    """
    text = str(value)
    if not text:
        return text
    stripped = text.strip()
    risky = text[0] in DANGEROUS_LEADS or text != stripped
    if not risky and stripped:
        risky = NUMBERISH_RE.fullmatch(stripped) is not None
    if risky:
        return "'" + text
    return text


def csv_response(header: list[str], rows: list[list[str]], filename: str) -> Response:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(header)
    writer.writerows(rows)
    response = Response(buffer.getvalue().encode("utf-8"), content_type="text/csv; charset=utf-8")
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.headers["Cache-Control"] = "no-store"
    return response


# --------------------------------------------------------------------------- #
# Authentication
# --------------------------------------------------------------------------- #


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        parts = header.split(None, 1)
        user = None
        if len(parts) == 2 and parts[0].lower() == "bearer":
            user = db().execute(
                "SELECT u.id, u.username FROM tokens t "
                "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (parts[1].strip(),),
            ).fetchone()
        if user is None:
            return jsonify({"error": "Authentication required."}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, utc_now()),
    )
    db().commit()
    return token


@app.post("/api/auth/register")
def register():
    data = json_body()
    errors: dict[str, str] = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return validation_error(errors)

    username = username.strip()
    if db().execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify({"error": "That username is already taken."}), 409

    cursor = db().execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), utc_now()),
    )
    db().commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    user = None
    if isinstance(username, str) and isinstance(password, str):
        user = db().execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401
    return jsonify({"token": issue_token(user["id"])}), 200


@app.post("/api/auth/logout")
@require_auth
def logout():
    parts = request.headers.get("Authorization", "").split(None, 1)
    db().execute("DELETE FROM tokens WHERE token = ?", (parts[1].strip(),))
    db().commit()
    return jsonify({"status": "ok"}), 200


@app.get("/api/me")
@require_auth
def me():
    return jsonify({"username": g.user["username"]}), 200


# --------------------------------------------------------------------------- #
# Entries
# --------------------------------------------------------------------------- #


@app.get("/api/entries")
@require_auth
def list_entries():
    where, params, errors = filters()
    if errors:
        return validation_error(errors)

    total = db().execute(
        f"SELECT COUNT(*) AS n FROM entries WHERE {where}", params
    ).fetchone()["n"]
    page = clamped_int("page", 1, 1, 1_000_000_000)
    page_size = clamped_int("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    rows = db().execute(
        f"SELECT * FROM entries WHERE {where} "
        "ORDER BY date DESC, created_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [entry_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.post("/api/entries")
@require_auth
def create_entry():
    values, errors = validate_entry_fields(json_body())
    if errors:
        return validation_error(errors)
    cursor = db().execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            values["project"],
            values["description"],
            values["hours"],
            values["date"],
            utc_now(),
        ),
    )
    db().commit()
    row = db().execute("SELECT * FROM entries WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(entry_dict(row)), 201


def own_entry(entry_id: int) -> sqlite3.Row | None:
    return db().execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, g.user["id"]),
    ).fetchone()


@app.patch("/api/entries/<int:entry_id>")
@require_auth
def update_entry(entry_id: int):
    row = own_entry(entry_id)
    if row is None:
        return jsonify({"error": "Entry not found."}), 404
    values, errors = validate_entry_fields(json_body(), partial=True)
    if errors:
        return validation_error(errors)
    if values:
        assignments = ", ".join(f"{key} = ?" for key in values)
        db().execute(
            f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
            [*values.values(), entry_id, g.user["id"]],
        )
        db().commit()
        row = own_entry(entry_id)
    return jsonify(entry_dict(row)), 200


@app.delete("/api/entries/<int:entry_id>")
@require_auth
def delete_entry(entry_id: int):
    if own_entry(entry_id) is None:
        return jsonify({"error": "Entry not found."}), 404
    db().execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"])
    )
    db().commit()
    return jsonify({"deleted": True}), 200


@app.get("/api/projects")
@require_auth
def list_projects():
    rows = db().execute(
        "SELECT DISTINCT project FROM entries WHERE user_id = ? ORDER BY project",
        (g.user["id"],),
    ).fetchall()
    return jsonify({"items": [row["project"] for row in rows]}), 200


@app.get("/api/summary")
@require_auth
def summary():
    where, params, errors = filters()
    if errors:
        return validation_error(errors)
    totals = totals_for(where, params)
    return jsonify(
        {
            "items": [
                {"project": name, "hours": hours_number(decimal_text(hours))}
                for name, hours in totals
            ],
            "total_hours": hours_number(
                decimal_text(sum((hours for _, hours in totals), Decimal(0)))
            ),
        }
    ), 200


# --------------------------------------------------------------------------- #
# CSV exports
# --------------------------------------------------------------------------- #


@app.get("/api/exports/entries.csv")
@require_auth
def export_entries():
    where, params, errors = filters()
    if errors:
        return validation_error(errors)
    rows = db().execute(
        f"SELECT * FROM entries WHERE {where} "
        "ORDER BY date ASC, created_at ASC, id ASC",
        params,
    ).fetchall()
    body = [
        [
            row["date"],
            safe_cell(row["project"]),
            safe_cell(row["description"]),
            decimal_text(Decimal(row["hours"])),
        ]
        for row in rows
    ]
    return csv_response(["date", "project", "description", "hours"], body, "entries.csv")


@app.get("/api/exports/summary.csv")
@require_auth
def export_summary():
    where, params, errors = filters()
    if errors:
        return validation_error(errors)
    body = [
        [safe_cell(name), decimal_text(hours)] for name, hours in totals_for(where, params)
    ]
    return csv_response(["project", "hours"], body, "summary.csv")


# --------------------------------------------------------------------------- #
# Health and frontend
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
