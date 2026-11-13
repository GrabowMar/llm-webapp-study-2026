"""Flask entry point."""

from __future__ import annotations

import csv
import hashlib
import io
import math
import os
import re
import secrets
import sqlite3
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

TOKEN_TTL = timedelta(days=30)
USERNAME_MAX = 64
PASSWORD_MAX = 256
PROJECT_MAX = 100
DESCRIPTION_MAX = 2000
HOURS_MAX = 24
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CSV_DANGEROUS_PREFIXES = ("=", "+", "-", "@", "|", "%", "\t", "\r", "\n", "\uff1d", "\uff0b", "\uff0d", "\uff20")

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
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


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


init_db()


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


@app.errorhandler(ApiError)
def handle_api_error(err: ApiError):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    return jsonify(body), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": err.description or err.name}), err.code
    return err


@app.errorhandler(Exception)
def handle_unexpected(err: Exception):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error"}), 500


@app.after_request
def security_headers(resp: Response):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.path.startswith("/api"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user_from_header():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] <= now_iso():
        return None
    return row


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user_from_header()
        if user is None:
            raise ApiError(401, "Authentication required")
        g.user_id = user["id"]
        g.username = user["username"]
        return fn(*args, **kwargs)

    return wrapper


# ---------- health ----------


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- auth ----------


def read_credentials() -> tuple[str, str]:
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif len(username.strip()) > USERNAME_MAX:
        errors["username"] = f"Username must be at most {USERNAME_MAX} characters"
    if not isinstance(password, str) or password == "":
        errors["password"] = "Password is required"
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters"
    if errors:
        raise ApiError(400, next(iter(errors.values())), errors)
    return username.strip(), password


@app.post("/api/auth/register")
def register():
    username, password = read_credentials()
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = read_credentials()
    conn = db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (now_iso(),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (
            hash_token(token),
            row["id"],
            now_iso(),
            (now + TOKEN_TTL).isoformat(timespec="seconds").replace("+00:00", "Z"),
        ),
    )
    conn.commit()
    return jsonify({"token": token, "username": username})


@app.post("/api/auth/logout")
@auth_required
def logout():
    _, _, token = request.headers.get("Authorization", "").partition(" ")
    conn = db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token.strip()),))
    conn.commit()
    return "", 204


@app.get("/api/auth/me")
@auth_required
def me():
    return jsonify({"id": g.user_id, "username": g.username})


# ---------- entries ----------


def entry_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": row["hours"],
        "date": row["date"],
        "created_at": row["created_at"],
    }


def parse_date(value) -> str | None:
    if not isinstance(value, str) or not DATE_RE.match(value):
        return None
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError:
        return None


def validate_entry(data: dict, partial: bool) -> dict:
    out: dict = {}
    errors: dict = {}

    if "project" in data or not partial:
        project = data.get("project")
        if not isinstance(project, str) or not project.strip():
            errors["project"] = "Project is required"
        elif len(project.strip()) > PROJECT_MAX:
            errors["project"] = f"Project must be at most {PROJECT_MAX} characters"
        else:
            out["project"] = project.strip()

    if "description" in data or not partial:
        description = data.get("description")
        if description is None:
            out["description"] = ""
        elif not isinstance(description, str):
            errors["description"] = "Description must be text"
        elif len(description) > DESCRIPTION_MAX:
            errors["description"] = f"Description must be at most {DESCRIPTION_MAX} characters"
        else:
            out["description"] = description

    if "hours" in data or not partial:
        hours = data.get("hours")
        if hours is None or (isinstance(hours, str) and not hours.strip()):
            errors["hours"] = "Hours are required"
        elif isinstance(hours, bool) or not isinstance(hours, (int, float)):
            errors["hours"] = "Hours must be a number"
        elif not math.isfinite(hours) or hours <= 0:
            errors["hours"] = "Hours must be greater than 0"
        elif hours > HOURS_MAX:
            errors["hours"] = f"Hours must be at most {HOURS_MAX}"
        else:
            out["hours"] = float(hours)

    if "date" in data or not partial:
        raw = data.get("date")
        if raw is None or raw == "":
            errors["date"] = "Date is required"
        else:
            parsed = parse_date(raw)
            if parsed is None:
                errors["date"] = "Date must be a valid date in YYYY-MM-DD format"
            else:
                out["date"] = parsed

    if errors:
        raise ApiError(400, "; ".join(errors.values()), errors)
    return out


def query_date(name: str) -> str | None:
    raw = request.args.get(name, "").strip()
    if not raw:
        return None
    parsed = parse_date(raw)
    if parsed is None:
        raise ApiError(400, f"{name} must be a valid date in YYYY-MM-DD format", {name: "Invalid date"})
    return parsed


def query_int(name: str, default: int, minimum: int = 1, maximum: int | None = None) -> int:
    raw = request.args.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer", {name: "Must be a positive integer"})
    if value < minimum:
        raise ApiError(400, f"{name} must be at least {minimum}", {name: f"Must be at least {minimum}"})
    if maximum is not None and value > maximum:
        value = maximum
    return value


def build_filters(include_project: bool = True) -> tuple[str, list]:
    start = query_date("start_date")
    end = query_date("end_date")
    if start and end and start > end:
        raise ApiError(400, "start_date must not be after end_date", {"start_date": "Must not be after end_date"})
    clauses = ["user_id = ?"]
    params: list = [g.user_id]
    if start:
        clauses.append("date >= ?")
        params.append(start)
    if end:
        clauses.append("date <= ?")
        params.append(end)
    if include_project:
        project = request.args.get("project", "").strip()
        if project:
            clauses.append("project = ?")
            params.append(project)
    return " AND ".join(clauses), params


def get_owned_entry(entry_id: int) -> sqlite3.Row:
    row = db().execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user_id)
    ).fetchone()
    if row is None:
        raise ApiError(404, "Entry not found")
    return row


@app.get("/api/entries")
@auth_required
def list_entries():
    where, params = build_filters()
    page = query_int("page", 1)
    page_size = query_int("page_size", DEFAULT_PAGE_SIZE, maximum=MAX_PAGE_SIZE)
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM entries WHERE {where}", params).fetchone()[0]
    rows = conn.execute(
        f"SELECT * FROM entries WHERE {where} ORDER BY date DESC, created_at DESC, id DESC "
        "LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
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
@auth_required
def create_entry():
    values = validate_entry(json_body(), partial=False)
    conn = db()
    cur = conn.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (g.user_id, values["project"], values["description"], values["hours"], values["date"], now_iso()),
    )
    conn.commit()
    return jsonify(entry_json(get_owned_entry(cur.lastrowid))), 201


@app.get("/api/entries/<int:entry_id>")
@auth_required
def get_entry(entry_id: int):
    return jsonify(entry_json(get_owned_entry(entry_id)))


@app.patch("/api/entries/<int:entry_id>")
@auth_required
def update_entry(entry_id: int):
    get_owned_entry(entry_id)
    values = validate_entry(json_body(), partial=True)
    if values:
        cols = ", ".join(f"{k} = ?" for k in values)
        conn = db()
        conn.execute(
            f"UPDATE entries SET {cols} WHERE id = ? AND user_id = ?",
            [*values.values(), entry_id, g.user_id],
        )
        conn.commit()
    return jsonify(entry_json(get_owned_entry(entry_id)))


@app.delete("/api/entries/<int:entry_id>")
@auth_required
def delete_entry(entry_id: int):
    get_owned_entry(entry_id)
    conn = db()
    conn.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (entry_id, g.user_id))
    conn.commit()
    return "", 204


@app.get("/api/projects")
@auth_required
def list_projects():
    rows = db().execute(
        "SELECT project, MAX(date) AS last_used FROM entries WHERE user_id = ? "
        "GROUP BY project ORDER BY last_used DESC, project",
        (g.user_id,),
    ).fetchall()
    return jsonify({"items": [r["project"] for r in rows]})


def project_totals(include_project: bool) -> list[tuple[str, float]]:
    where, params = build_filters(include_project=include_project)
    rows = db().execute(
        f"SELECT project, SUM(hours) AS hours FROM entries WHERE {where} "
        "GROUP BY project ORDER BY project",
        params,
    ).fetchall()
    return [(r["project"], round(r["hours"], 6)) for r in rows]


@app.get("/api/summary")
@auth_required
def summary():
    totals = project_totals(include_project=True)
    return jsonify(
        {
            "items": [{"project": p, "hours": h} for p, h in totals],
            "total_hours": round(sum(h for _, h in totals), 6),
        }
    )


# ---------- CSV exports ----------


def csv_text(value: str) -> str:
    """Make a user-typed value safe so spreadsheets show it as literal text."""
    if value and (value.startswith(CSV_DANGEROUS_PREFIXES) or value.lstrip().startswith(CSV_DANGEROUS_PREFIXES)):
        return "'" + value
    return value


def format_hours(value: float) -> str:
    text = f"{round(value, 6):.6f}".rstrip("0").rstrip(".")
    return text or "0"


def csv_response(filename: str, header: list[str], rows: list[list[str]]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL, lineterminator="\r\n")
    writer.writerow(header)
    writer.writerows(rows)
    resp = Response(buf.getvalue().encode("utf-8"), mimetype="text/csv")
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp


@app.get("/api/exports/entries.csv")
@auth_required
def export_entries():
    where, params = build_filters()
    rows = db().execute(
        f"SELECT * FROM entries WHERE {where} ORDER BY date ASC, created_at ASC, id ASC",
        params,
    ).fetchall()
    return csv_response(
        "entries.csv",
        ["date", "project", "description", "hours"],
        [
            [r["date"], csv_text(r["project"]), csv_text(r["description"]), format_hours(r["hours"])]
            for r in rows
        ],
    )


@app.get("/api/exports/summary.csv")
@auth_required
def export_summary():
    totals = project_totals(include_project=False)
    return csv_response(
        "summary.csv",
        ["project", "hours"],
        [[csv_text(p), format_hours(h)] for p, h in totals],
    )


# ---------- frontend ----------


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
