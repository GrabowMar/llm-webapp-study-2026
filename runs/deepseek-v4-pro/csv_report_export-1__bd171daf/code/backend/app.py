"""Personal timesheet: Flask API + static frontend."""

import csv
import io
import math
import os
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "timesheet.db"

app = Flask(__name__, static_folder=None)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = get_db()
    conn.executescript(
        """
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
            description TEXT NOT NULL,
            hours REAL NOT NULL,
            date TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
        """
    )
    conn.commit()
    conn.close()


init_db()


def get_json() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def json_error(message: str, status: int):
    return jsonify({"error": message}), status


def require_user() -> int | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    conn = get_db()
    row = conn.execute(
        "SELECT user_id FROM tokens WHERE token = ?", (token,)
    ).fetchone()
    conn.close()
    return row["user_id"] if row else None


def parse_date(value) -> str | None:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value


def parse_hours(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        num = float(value)
    elif isinstance(value, str):
        try:
            num = float(value)
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(num) or num <= 0:
        return None
    return num


def parse_text(value) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return text


def validate_entry_fields(data: dict, partial: bool) -> tuple[dict, str | None]:
    fields = {}
    for key in ("project", "description", "hours", "date"):
        if key not in data:
            if partial:
                continue
            return {}, f"{key} is required"

        value = data[key]
        if key == "project":
            text = parse_text(value)
            if text is None:
                return {}, "project must be a non-empty string"
            fields["project"] = text
        elif key == "description":
            if not isinstance(value, str):
                return {}, "description must be a string"
            fields["description"] = value
        elif key == "hours":
            num = parse_hours(value)
            if num is None:
                return {}, "hours must be a positive number"
            fields["hours"] = num
        elif key == "date":
            date = parse_date(value)
            if date is None:
                return {}, "date must be a valid date in YYYY-MM-DD format"
            fields["date"] = date
    return fields, None


def entry_to_dict(row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def apply_filters(query: str, args: list, start_date=None, end_date=None, project=None):
    conditions = []
    if start_date:
        conditions.append("date >= ?")
        args.append(start_date)
    if end_date:
        conditions.append("date <= ?")
        args.append(end_date)
    if project:
        conditions.append("project = ?")
        args.append(project)
    if conditions:
        query += " AND " + " AND ".join(conditions)
    return query


# ---- auth ----


@app.post("/api/auth/register")
def register():
    data = get_json()
    if data is None:
        return json_error("invalid JSON body", 400)
    username = parse_text(data.get("username"))
    password = data.get("password")
    if username is None:
        return json_error("username is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("password is required", 400)

    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        conn.close()
        return json_error("username already taken", 409)
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    conn.commit()
    conn.close()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = get_json()
    if data is None:
        return json_error("invalid JSON body", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return json_error("username and password are required", 400)

    conn = get_db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        conn.close()
        return json_error("invalid username or password", 401)

    token = secrets.token_hex(32)
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    conn.commit()
    conn.close()
    return jsonify({"token": token}), 200


# ---- entries ----


@app.get("/api/entries")
def list_entries():
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    start_date = request.args.get("start_date") or None
    end_date = request.args.get("end_date") or None
    project = request.args.get("project") or None

    if start_date and parse_date(start_date) is None:
        return json_error("start_date must be a valid date in YYYY-MM-DD format", 400)
    if end_date and parse_date(end_date) is None:
        return json_error("end_date must be a valid date in YYYY-MM-DD format", 400)

    try:
        page = int(request.args.get("page", "1"))
        page_size = int(request.args.get("page_size", "20"))
    except ValueError:
        return json_error("page and page_size must be integers", 400)
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    conn = get_db()
    base = "FROM entries WHERE user_id = ?"
    args = [user_id]
    where = apply_filters(base, args, start_date, end_date, project)

    total = conn.execute(f"SELECT COUNT(*) {where}", args).fetchone()[0]

    rows = conn.execute(
        f"SELECT * {where} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?",
        args + [page_size, (page - 1) * page_size],
    ).fetchall()
    conn.close()

    return jsonify(
        {
            "items": [entry_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
def create_entry():
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    data = get_json()
    if data is None:
        return json_error("invalid JSON body", 400)

    fields, error = validate_entry_fields(data, partial=False)
    if error:
        return json_error(error, 400)

    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            user_id,
            fields["project"],
            fields["description"],
            fields["hours"],
            fields["date"],
            now_iso(),
        ),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM entries WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    conn.close()
    return jsonify(entry_to_dict(row)), 201


@app.patch("/api/entries/<int:entry_id>")
def update_entry(entry_id: int):
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    data = get_json()
    if data is None:
        return json_error("invalid JSON body", 400)

    fields, error = validate_entry_fields(data, partial=True)
    if error:
        return json_error(error, 400)
    if not fields:
        return json_error("no valid fields to update", 400)

    conn = get_db()
    row = conn.execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?", (entry_id, user_id)
    ).fetchone()
    if row is None:
        conn.close()
        return json_error("entry not found", 404)

    assignments = []
    args = []
    for key, value in fields.items():
        assignments.append(f"{key} = ?")
        args.append(value)
    args += [entry_id, user_id]
    conn.execute(
        f"UPDATE entries SET {', '.join(assignments)} WHERE id = ? AND user_id = ?",
        args,
    )
    conn.commit()
    updated = conn.execute(
        "SELECT * FROM entries WHERE id = ?", (entry_id,)
    ).fetchone()
    conn.close()
    return jsonify(entry_to_dict(updated))


@app.delete("/api/entries/<int:entry_id>")
def delete_entry(entry_id: int):
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    conn = get_db()
    cursor = conn.execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, user_id)
    )
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    if not deleted:
        return json_error("entry not found", 404)
    return "", 204


# ---- CSV export ----


def csv_cell(value) -> str:
    s = "" if value is None else str(value)
    if s and s[0] in "=+-@\t\r":
        s = "'" + s
    return s


def format_hours(h) -> str:
    if h is None:
        return ""
    f = float(h)
    s = f"{f:.10f}".rstrip("0").rstrip(".")
    return s or "0"


def build_csv_response(header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    for row in rows:
        writer.writerow([csv_cell(c) for c in row])
    body = buf.getvalue()
    return Response(
        body,
        mimetype="text/csv",
        headers={"Content-Type": "text/csv; charset=utf-8"},
    )


def export_filters():
    start_date = request.args.get("start_date") or None
    end_date = request.args.get("end_date") or None
    project = request.args.get("project") or None
    if start_date and parse_date(start_date) is None:
        return None, json_error("start_date must be a valid date in YYYY-MM-DD format", 400)
    if end_date and parse_date(end_date) is None:
        return None, json_error("end_date must be a valid date in YYYY-MM-DD format", 400)
    return (start_date, end_date, project), None


@app.get("/api/exports/entries.csv")
def export_entries():
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    filters, err = export_filters()
    if err:
        return err
    start_date, end_date, project = filters

    conn = get_db()
    args = [user_id]
    where = apply_filters("FROM entries WHERE user_id = ?", args, start_date, end_date, project)
    rows = conn.execute(f"SELECT * {where} ORDER BY date ASC, id ASC", args).fetchall()
    conn.close()

    data = [[r["date"], r["project"], r["description"], format_hours(r["hours"])] for r in rows]
    resp = build_csv_response(["date", "project", "description", "hours"], data)
    resp.headers["Content-Disposition"] = "attachment; filename=entries.csv"
    return resp


@app.get("/api/exports/summary.csv")
def export_summary():
    user_id = require_user()
    if user_id is None:
        return json_error("sign in required", 401)

    filters, err = export_filters()
    if err:
        return err
    start_date, end_date, project = filters

    conn = get_db()
    args = [user_id]
    where = apply_filters("FROM entries WHERE user_id = ?", args, start_date, end_date, project)
    rows = conn.execute(
        f"SELECT project, SUM(hours) AS hours {where} GROUP BY project ORDER BY project ASC",
        args,
    ).fetchall()
    conn.close()

    data = [[r["project"], format_hours(r["hours"])] for r in rows]
    resp = build_csv_response(["project", "hours"], data)
    resp.headers["Content-Disposition"] = "attachment; filename=summary.csv"
    return resp


# ---- health + frontend ----


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
def index():
    return send_from_directory(DIST, "index.html")


@app.get("/<path:path>")
def frontend(path: str):
    if path == "api" or path.startswith("api/"):
        return json_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
