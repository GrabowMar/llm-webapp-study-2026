"""Timesheet API and frontend server."""

import csv
import hashlib
import io
import math
import os
import re
import secrets
import sqlite3
from datetime import date as date_cls
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "timesheet.db"

TOKEN_TTL = timedelta(days=30)
MAX_HOURS = 24
MAX_PROJECT = 100
MAX_DESCRIPTION = 2000
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.\-]{3,50}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 128
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries(user_id, date);
CREATE INDEX IF NOT EXISTS idx_entries_user_project ON entries(user_id, project);
"""


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        self.status = status
        self.message = message
        self.errors = errors or {}


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("unhandled error")
    return jsonify({"error": "Internal server error"}), 500


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise ApiError(401, "Authentication required")
    token = parts[1].strip()
    row = db().execute(
        "SELECT users.id, users.username, tokens.expires_at FROM tokens "
        "JOIN users ON users.id = tokens.user_id WHERE tokens.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        raise ApiError(401, "Authentication required")
    g.token_hash = hash_token(token)
    return row


def require_user(fn):
    from functools import wraps

    @wraps(fn)
    def wrapper(*args, **kwargs):
        g.user = current_user()
        return fn(*args, **kwargs)

    return wrapper


DUMMY_HASH = generate_password_hash("dummy-password-for-timing")


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        errors["username"] = (
            "Username must be 3-50 characters: letters, digits, '.', '_' or '-'"
        )
    if (
        not isinstance(password, str)
        or len(password) < MIN_PASSWORD
        or len(password) > MAX_PASSWORD
    ):
        errors["password"] = (
            f"Password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters long"
        )
    if errors:
        raise ApiError(400, "Validation failed", errors)
    username = username.strip()
    conn = db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(
            409, "Username is already taken", {"username": "Username is already taken"}
        )
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        raise ApiError(400, "Username and password are required")
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now_iso(),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], expires),
    )
    conn.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@require_user
def me():
    return jsonify({"username": g.user["username"]})


@app.post("/api/auth/logout")
@require_user
def logout():
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
    conn.commit()
    return "", 204


def parse_date(value, field):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"{field} must be a date in YYYY-MM-DD format")
    try:
        return date_cls.fromisoformat(value).isoformat()
    except ValueError:
        raise ValueError(f"{field} must be a valid date")


def clean_fields(data, partial):
    errors = {}
    out = {}

    if "project" in data or not partial:
        value = data.get("project")
        if not isinstance(value, str) or not value.strip():
            errors["project"] = "Project is required"
        elif len(value.strip()) > MAX_PROJECT:
            errors["project"] = f"Project must be at most {MAX_PROJECT} characters"
        else:
            out["project"] = value.strip()

    if "description" in data or not partial:
        value = data.get("description", "")
        if value is None and not partial:
            value = ""
        if not isinstance(value, str):
            errors["description"] = "Description must be text"
        elif len(value) > MAX_DESCRIPTION:
            errors["description"] = (
                f"Description must be at most {MAX_DESCRIPTION} characters"
            )
        else:
            out["description"] = value.strip()

    if "hours" in data or not partial:
        value = data.get("hours")
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            errors["hours"] = "Hours must be a number"
        elif value <= 0:
            errors["hours"] = "Hours must be greater than 0"
        elif value > MAX_HOURS:
            errors["hours"] = f"Hours must be at most {MAX_HOURS}"
        else:
            out["hours"] = round(float(value), 4)
            if out["hours"] <= 0:
                errors["hours"] = "Hours must be greater than 0"

    if "date" in data or not partial:
        value = data.get("date")
        if value is None and not partial:
            out["date"] = date_cls.today().isoformat()
        else:
            try:
                out["date"] = parse_date(value, "Date")
            except ValueError as exc:
                errors["date"] = str(exc)

    if errors:
        raise ApiError(400, "Validation failed", errors)
    return out


def entry_json(row):
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def filters(allow_project=True):
    where = ["user_id = ?"]
    params = [g.user["id"]]
    errors = {}
    start = request.args.get("start_date")
    end = request.args.get("end_date")
    parsed = {}
    for name, raw in (("start_date", start), ("end_date", end)):
        if raw is None or raw == "":
            continue
        try:
            parsed[name] = parse_date(raw, name)
        except ValueError as exc:
            errors[name] = str(exc)
    if (
        not errors
        and "start_date" in parsed
        and "end_date" in parsed
        and parsed["start_date"] > parsed["end_date"]
    ):
        errors["start_date"] = "start_date must not be after end_date"
    if errors:
        raise ApiError(400, "Invalid filters", errors)
    if "start_date" in parsed:
        where.append("date >= ?")
        params.append(parsed["start_date"])
    if "end_date" in parsed:
        where.append("date <= ?")
        params.append(parsed["end_date"])
    project = request.args.get("project")
    if allow_project and project is not None and project.strip() != "":
        where.append("project = ?")
        params.append(project.strip())
    return " AND ".join(where), params


def int_arg(name, default, minimum, maximum=None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    if not re.fullmatch(r"\d{1,9}", raw.strip()):
        raise ApiError(400, f"{name} must be a positive integer", {name: "Invalid"})
    value = int(raw)
    if value < minimum or (maximum is not None and value > maximum):
        limit = f"between {minimum} and {maximum}" if maximum else f"at least {minimum}"
        raise ApiError(400, f"{name} must be {limit}", {name: "Out of range"})
    return value


def get_own_entry(entry_id):
    row = db().execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?",
        (entry_id, g.user["id"]),
    ).fetchone()
    if row is None:
        raise ApiError(404, "Entry not found")
    return row


@app.get("/api/entries")
@require_user
def list_entries():
    where, params = filters()
    page = int_arg("page", 1, 1)
    page_size = int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM entries WHERE {where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM entries WHERE {where} ORDER BY date DESC, id DESC "
        "LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [entry_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/entries")
@require_user
def create_entry():
    fields = clean_fields(json_body(), partial=False)
    conn = db()
    cur = conn.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            fields["project"],
            fields["description"],
            fields["hours"],
            fields["date"],
            now_iso(),
        ),
    )
    conn.commit()
    return jsonify(entry_json(get_own_entry(cur.lastrowid))), 201


@app.patch("/api/entries/<int:entry_id>")
@require_user
def update_entry(entry_id):
    get_own_entry(entry_id)
    fields = clean_fields(json_body(), partial=True)
    if fields:
        conn = db()
        assignments = ", ".join(f"{name} = ?" for name in fields)
        conn.execute(
            f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
            list(fields.values()) + [entry_id, g.user["id"]],
        )
        conn.commit()
    return jsonify(entry_json(get_own_entry(entry_id)))


@app.delete("/api/entries/<int:entry_id>")
@require_user
def delete_entry(entry_id):
    get_own_entry(entry_id)
    conn = db()
    conn.execute(
        "DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user["id"])
    )
    conn.commit()
    return "", 204


def summary_rows(where, params):
    rows = db().execute(
        f"SELECT project, SUM(hours) AS hours FROM entries WHERE {where} "
        "GROUP BY project ORDER BY project",
        params,
    ).fetchall()
    return [(r["project"], round(r["hours"], 4)) for r in rows]


@app.get("/api/summary")
@require_user
def summary():
    where, params = filters()
    rows = summary_rows(where, params)
    return jsonify(
        {
            "items": [{"project": p, "hours": h} for p, h in rows],
            "total_hours": round(sum(h for _, h in rows), 4),
        }
    )


@app.get("/api/projects")
@require_user
def projects():
    rows = db().execute(
        "SELECT project, MAX(date) AS last_date FROM entries WHERE user_id = ? "
        "GROUP BY project ORDER BY last_date DESC, project LIMIT 200",
        (g.user["id"],),
    ).fetchall()
    return jsonify({"items": [r["project"] for r in rows]})


CSV_TRIGGERS = ("=", "+", "-", "@", "\t", "\r", "\n")


def csv_text(value):
    value = str(value)
    if value.startswith(CSV_TRIGGERS):
        return "'" + value
    return value


def csv_hours(value):
    text = f"{round(value, 4):.4f}".rstrip("0").rstrip(".")
    return text or "0"


def csv_response(header, rows, filename):
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    resp = Response(buf.getvalue().encode("utf-8"), mimetype="text/csv")
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/exports/entries.csv")
@require_user
def export_entries():
    where, params = filters()
    rows = db().execute(
        f"SELECT date, project, description, hours FROM entries WHERE {where} "
        "ORDER BY date ASC, id ASC",
        params,
    ).fetchall()
    return csv_response(
        ["date", "project", "description", "hours"],
        (
            [
                r["date"],
                csv_text(r["project"]),
                csv_text(r["description"]),
                csv_hours(r["hours"]),
            ]
            for r in rows
        ),
        "entries.csv",
    )


@app.get("/api/exports/summary.csv")
@require_user
def export_summary():
    where, params = filters(allow_project=False)
    rows = summary_rows(where, params)
    return csv_response(
        ["project", "hours"],
        ([csv_text(p), csv_hours(h)] for p, h in rows),
        "summary.csv",
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target is not None and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
