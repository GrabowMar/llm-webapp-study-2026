"""Timesheet API and frontend host."""

from __future__ import annotations

import csv
import io
import os
import secrets
import sqlite3
from datetime import date, datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", DATA_DIR / "timesheet.db"))

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

SCHEMA = """
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
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    hours REAL NOT NULL,
    entry_date TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, entry_date);
"""


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g._db = conn
    return conn


@app.teardown_appcontext
def close_db(exception):
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def error(message, status=400, fields=None):
    payload = {"error": message}
    if fields:
        payload["fields"] = fields
    return jsonify(payload), status


def parse_date(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        raise ValueError(f"{field} must be a date in YYYY-MM-DD format")
    return parsed


def parse_hours(value):
    if isinstance(value, bool) or value is None:
        raise ValueError("hours is required")
    try:
        hours = float(value)
    except (TypeError, ValueError):
        raise ValueError("hours must be a number")
    if hours != hours or hours in (float("inf"), float("-inf")):
        raise ValueError("hours must be a number")
    if hours <= 0:
        raise ValueError("hours must be greater than 0")
    return hours


def clean_text(value, field, max_length, required=True):
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text")
    value = value.strip()
    if required and not value:
        raise ValueError(f"{field} is required")
    if len(value) > max_length:
        raise ValueError(f"{field} must be at most {max_length} characters")
    return value


def entry_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["entry_date"],
        "created_at": row["created_at"],
    }


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return error("Authentication required", 401)
        token = header[len("Bearer "):].strip()
        if not token:
            return error("Authentication required", 401)
        db = get_db()
        row = db.execute(
            "SELECT user_id FROM tokens WHERE token = ?", (token,)
        ).fetchone()
        if row is None:
            return error("Authentication required", 401)
        user = db.execute(
            "SELECT id, username FROM users WHERE id = ?", (row["user_id"],)
        ).fetchone()
        if user is None:
            return error("Authentication required", 401)
        g.user_id = user["id"]
        g.username = user["username"]
        return fn(*args, **kwargs)

    return wrapper


def build_filters(include_project: bool = True):
    """Return (where_clause, params) for entry filters from the query string."""
    clauses = ["user_id = ?"]
    params: list = [g.user_id]
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    project = request.args.get("project") if include_project else None
    if start:
        try:
            params.append(parse_date(start, "start_date").isoformat())
        except ValueError as exc:
            raise ValueError(str(exc))
        clauses.append("entry_date >= ?")
    if end:
        try:
            params.append(parse_date(end, "end_date").isoformat())
        except ValueError as exc:
            raise ValueError(str(exc))
        clauses.append("entry_date <= ?")
    if project:
        clauses.append("project = ?")
        params.append(project)
    return " AND ".join(clauses), params


def csv_cell(value) -> str:
    """Neutralise spreadsheet formula injection so cells are read as text."""
    text = str(value)
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r", "\n"):
        return "'" + text
    return text


def csv_response(rows, filename) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerows(rows)
    body = buffer.getvalue()
    return Response(
        body,
        mimetype="text/csv",
        headers={
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


def format_hours(value) -> str:
    number = float(value)
    if number.is_integer():
        return str(int(number))
    return ("%.6f" % number).rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")

    fields = {}
    if not isinstance(username, str) or not username.strip():
        fields["username"] = "Username is required"
    elif len(username.strip()) > 100:
        fields["username"] = "Username must be at most 100 characters"
    if not isinstance(password, str) or not password:
        fields["password"] = "Password is required"
    elif len(password) > 200:
        fields["password"] = "Password must be at most 200 characters"
    if fields:
        return error("Please correct the highlighted fields", 400, fields)

    username = username.strip()
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), iso_now()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error(
            "Username is already taken",
            409,
            {"username": "Username is already taken"},
        )
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("Username and password are required", 400)

    db = get_db()
    user = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], iso_now()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@auth_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer "):].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"status": "ok"})


@app.get("/api/auth/me")
@auth_required
def me():
    return jsonify({"username": g.username})


# ---------------------------------------------------------------------------
# Entries
# ---------------------------------------------------------------------------

@app.get("/api/entries")
@auth_required
def list_entries():
    try:
        where, params = build_filters()
    except ValueError as exc:
        return error(str(exc), 400)

    try:
        page = max(1, int(request.args.get("page", 1)))
    except (TypeError, ValueError):
        return error("page must be a positive integer", 400)
    try:
        page_size = int(request.args.get("page_size", 20))
    except (TypeError, ValueError):
        return error("page_size must be a positive integer", 400)
    page_size = max(1, min(page_size, 200))

    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS c FROM entries WHERE {where}", params
    ).fetchone()["c"]
    offset = (page - 1) * page_size
    rows = db.execute(
        f"""SELECT * FROM entries WHERE {where}
            ORDER BY entry_date DESC, id DESC
            LIMIT ? OFFSET ?""",
        [*params, page_size, offset],
    ).fetchall()

    return jsonify(
        {
            "items": [entry_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
@auth_required
def create_entry():
    data = json_body()
    fields = {}
    project = description = entry_date = hours = None

    try:
        project = clean_text(data.get("project"), "project", 200)
    except ValueError as exc:
        fields["project"] = str(exc)
    try:
        description = clean_text(
            data.get("description"), "description", 2000, required=False
        )
    except ValueError as exc:
        fields["description"] = str(exc)
    try:
        hours = parse_hours(data.get("hours"))
    except ValueError as exc:
        fields["hours"] = str(exc)
    try:
        entry_date = parse_date(data.get("date"), "date").isoformat()
    except ValueError as exc:
        fields["date"] = str(exc)

    if fields:
        return error("Please correct the highlighted fields", 400, fields)

    db = get_db()
    cur = db.execute(
        """INSERT INTO entries (user_id, project, description, hours, entry_date, created_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (g.user_id, project, description, hours, entry_date, iso_now()),
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(entry_to_dict(row)), 201


@app.patch("/api/entries/<int:entry_id>")
@auth_required
def update_entry(entry_id: int):
    db = get_db()
    row = db.execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, g.user_id),
    ).fetchone()
    if row is None:
        return error("Entry not found", 404)

    data = json_body()
    fields = {}
    updates = {}

    if "project" in data:
        try:
            updates["project"] = clean_text(data.get("project"), "project", 200)
        except ValueError as exc:
            fields["project"] = str(exc)
    if "description" in data:
        try:
            updates["description"] = clean_text(
                data.get("description"), "description", 2000, required=False
            )
        except ValueError as exc:
            fields["description"] = str(exc)
    if "hours" in data:
        try:
            updates["hours"] = parse_hours(data.get("hours"))
        except ValueError as exc:
            fields["hours"] = str(exc)
    if "date" in data:
        try:
            updates["date"] = parse_date(data.get("date"), "date").isoformat()
        except ValueError as exc:
            fields["date"] = str(exc)

    if fields:
        return error("Please correct the highlighted fields", 400, fields)
    if not updates:
        return jsonify(entry_to_dict(row))

    column_map = {"date": "entry_date"}
    assignments = []
    params = []
    for key, value in updates.items():
        assignments.append(f"{column_map.get(key, key)} = ?")
        params.append(value)
    params.extend([entry_id, g.user_id])
    db.execute(
        f"UPDATE entries SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
        params,
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (entry_id,)).fetchone()
    return jsonify(entry_to_dict(row))


@app.delete("/api/entries/<int:entry_id>")
@auth_required
def delete_entry(entry_id: int):
    db = get_db()
    cur = db.execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user_id)
    )
    db.commit()
    if cur.rowcount == 0:
        return error("Entry not found", 404)
    return jsonify({"status": "ok"})


@app.get("/api/projects")
@auth_required
def list_projects():
    try:
        where, params = build_filters()
    except ValueError as exc:
        return error(str(exc), 400)
    db = get_db()
    rows = db.execute(
        f"""SELECT project, SUM(hours) AS total, COUNT(*) AS count
           FROM entries WHERE {where}
           GROUP BY project ORDER BY project ASC""",
        params,
    ).fetchall()
    return jsonify(
        {
            "items": [
                {"project": r["project"], "hours": round(r["total"], 6), "count": r["count"]}
                for r in rows
            ]
        }
    )


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

@app.get("/api/exports/entries.csv")
@auth_required
def export_entries():
    try:
        where, params = build_filters()
    except ValueError as exc:
        return error(str(exc), 400)

    db = get_db()
    rows = db.execute(
        f"""SELECT * FROM entries WHERE {where}
            ORDER BY entry_date ASC, id ASC""",
        params,
    ).fetchall()

    csv_rows = [("date", "project", "description", "hours")]
    for r in rows:
        csv_rows.append(
            (
                r["entry_date"],
                csv_cell(r["project"]),
                csv_cell(r["description"]),
                format_hours(r["hours"]),
            )
        )
    return csv_response(csv_rows, "entries.csv")


@app.get("/api/exports/summary.csv")
@auth_required
def export_summary():
    try:
        where, params = build_filters(include_project=False)
    except ValueError as exc:
        return error(str(exc), 400)

    db = get_db()
    rows = db.execute(
        f"""SELECT project, SUM(hours) AS total FROM entries
            WHERE {where}
            GROUP BY project ORDER BY project ASC""",
        params,
    ).fetchall()

    csv_rows = [("project", "hours")]
    for r in rows:
        csv_rows.append((csv_cell(r["project"]), format_hours(r["total"])))
    return csv_response(csv_rows, "summary.csv")


# ---------------------------------------------------------------------------
# Health & frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    candidate = (DIST / path).resolve()
    try:
        candidate.relative_to(DIST.resolve())
    except ValueError:
        return send_from_directory(DIST, "index.html")
    if candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
