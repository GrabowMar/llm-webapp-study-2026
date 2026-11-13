"""Personal timesheet: JSON API under /api plus the built frontend.

Uses only Flask and the Python standard library. Data lives in SQLite
under ./data (relative to the working directory).
"""

from __future__ import annotations

import csv
import functools
import hashlib
import io
import math
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path("./data")
DB_PATH = DATA_DIR / "timesheet.db"

PBKDF2_ITERATIONS = 200_000
DEFAULT_PAGE_SIZE = 25
MAX_PAGE_SIZE = 200
INJECTION_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# database


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


def _init_db() -> None:
    con = _connect()
    try:
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
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
            CREATE INDEX IF NOT EXISTS idx_entries_user_date
                ON entries (user_id, date);
            CREATE INDEX IF NOT EXISTS idx_entries_user_project
                ON entries (user_id, project);
            """
        )
        con.commit()
    finally:
        con.close()


_init_db()


def get_db() -> sqlite3.Connection:
    db = getattr(g, "_db", None)
    if db is None:
        db = g._db = _connect()
    return db


@app.teardown_appcontext
def _close_db(exc: BaseException | None) -> None:
    db = g.pop("_db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# helpers


def error(message: str, status: int = 400) -> tuple[Response, int]:
    return jsonify({"error": message}), status


def login_required(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        match = re.fullmatch(r"[Bb][Ee][Aa][Rr][Ee][Rr]\s+(\S+)", header.strip())
        user_id = None
        if match:
            row = get_db().execute(
                "SELECT user_id FROM sessions WHERE token = ?", (match.group(1),)
            ).fetchone()
            if row is not None:
                user_id = row["user_id"]
        if user_id is None:
            return error("authentication required", 401)
        g.user_id = user_id
        return func(*args, **kwargs)

    return wrapper


def _hash_password(password: str, salt_hex: str) -> str:
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), PBKDF2_ITERATIONS
    )
    return digest.hex()


def _parse_date(value: object, field: str = "date") -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string in YYYY-MM-DD format")
    value = value.strip()
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"{field} must be a valid date in YYYY-MM-DD format") from None
    if parsed.isoformat() != value:
        raise ValueError(f"{field} must be a valid date in YYYY-MM-DD format")
    return value


def _parse_hours(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("hours must be a number")
    hours = float(value)
    if not math.isfinite(hours):
        raise ValueError("hours must be a number")
    if hours <= 0:
        raise ValueError("hours must be greater than 0")
    if hours > 24:
        raise ValueError("hours must be at most 24")
    return round(hours, 2)


def _parse_project(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("project must be a string")
    project = value.strip()
    if not project:
        raise ValueError("project must not be empty")
    if len(project) > 100:
        raise ValueError("project must be at most 100 characters")
    return project


def _parse_description(value: object) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        raise ValueError("description must be a string")
    if len(value) > 2000:
        raise ValueError("description must be at most 2000 characters")
    return value


def _hours_number(value: float) -> int | float:
    rounded = round(float(value), 2)
    if rounded.is_integer():
        return int(rounded)
    return rounded


def _format_hours(value: Decimal | float) -> str:
    if isinstance(value, float):
        value = Decimal(str(round(value, 2)))
    if value == value.to_integral_value():
        return str(int(value))
    return format(value.normalize(), "f")


def _entry_json(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "project": row["project"],
        "description": row["description"],
        "hours": _hours_number(row["hours"]),
        "date": row["date"],
        "created_at": row["created_at"],
    }


def _json_body() -> dict:
    body = request.get_json(silent=True, force=True)
    if not isinstance(body, dict):
        raise ValueError("request body must be a JSON object")
    return body


def _build_filter(allow_project: bool) -> tuple[str, list]:
    conditions = ["user_id = ?"]
    params: list = [g.user_id]
    start_date = request.args.get("start_date", "").strip()
    end_date = request.args.get("end_date", "").strip()
    if start_date:
        conditions.append("date >= ?")
        params.append(_parse_date(start_date, "start_date"))
    if end_date:
        conditions.append("date <= ?")
        params.append(_parse_date(end_date, "end_date"))
    if allow_project:
        project = request.args.get("project", "").strip()
        if project:
            conditions.append("project = ?")
            params.append(project)
    return " AND ".join(conditions), params


# ---------------------------------------------------------------------------
# health / auth


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    try:
        body = _json_body()
    except ValueError as exc:
        return error(str(exc))
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username must not be empty")
    if not isinstance(password, str) or not password:
        return error("password must not be empty")
    username = username.strip()
    if len(username) > 64 or len(password) > 256:
        return error("username or password is too long")

    db = get_db()
    salt = secrets.token_hex(16)
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, salt, created_at)"
            " VALUES (?, ?, ?, ?)",
            (username, _hash_password(password, salt), salt, _utc_now()),
        )
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    db.commit()

    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, cur.lastrowid, _utc_now()),
    )
    db.commit()
    return jsonify({"token": token}), 201


@app.post("/api/auth/login")
def login():
    try:
        body = _json_body()
    except ValueError as exc:
        return error(str(exc))
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("invalid username or password", 401)
    row = get_db().execute(
        "SELECT id, password_hash, salt FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not secrets.compare_digest(
        _hash_password(password, row["salt"]), row["password_hash"]
    ):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], _utc_now()),
    )
    db.commit()
    return jsonify({"token": token})


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    match = re.fullmatch(r"[Bb][Ee][Aa][Rr][Ee][Rr]\s+(\S+)", header.strip())
    if match:
        db = get_db()
        db.execute("DELETE FROM sessions WHERE token = ?", (match.group(1),))
        db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# entries


@app.get("/api/entries")
@login_required
def list_entries():
    try:
        where, params = _build_filter(allow_project=True)
        page_raw = request.args.get("page", "1").strip() or "1"
        size_raw = request.args.get("page_size", str(DEFAULT_PAGE_SIZE)).strip()
    except ValueError as exc:
        return error(str(exc))
    try:
        page = max(1, int(page_raw))
        page_size = min(MAX_PAGE_SIZE, max(1, int(size_raw)))
    except ValueError:
        return error("page and page_size must be integers")

    db = get_db()
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
            "items": [_entry_json(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/me")
@login_required
def me():
    row = get_db().execute(
        "SELECT username FROM users WHERE id = ?", (g.user_id,)
    ).fetchone()
    return jsonify({"username": row["username"]})


@app.get("/api/projects")
@login_required
def projects():
    rows = get_db().execute(
        "SELECT DISTINCT project FROM entries WHERE user_id = ? ORDER BY project",
        (g.user_id,),
    ).fetchall()
    return jsonify({"projects": [r["project"] for r in rows]})


@app.post("/api/entries")
@login_required
def create_entry():
    try:
        body = _json_body()
    except ValueError as exc:
        return error(str(exc))
    try:
        project = _parse_project(body.get("project"))
        description = _parse_description(body.get("description"))
        hours = _parse_hours(body.get("hours"))
        date = _parse_date(body.get("date"))
    except ValueError as exc:
        return error(str(exc))

    db = get_db()
    created_at = _utc_now()
    cur = db.execute(
        "INSERT INTO entries (user_id, project, description, hours, date, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (g.user_id, project, description, hours, date, created_at),
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(_entry_json(row)), 201


def _get_own_entry(entry_id: str) -> sqlite3.Row | None:
    if not entry_id.isdigit():
        return None
    return get_db().execute(
        "SELECT * FROM entries WHERE id = ? AND user_id = ?",
        (int(entry_id), g.user_id),
    ).fetchone()


@app.patch("/api/entries/<entry_id>")
@login_required
def update_entry(entry_id: str):
    row = _get_own_entry(entry_id)
    if row is None:
        return error("entry not found", 404)
    try:
        body = _json_body()
    except ValueError as exc:
        return error(str(exc))

    updates: dict = {}
    try:
        if "project" in body:
            updates["project"] = _parse_project(body["project"])
        if "description" in body:
            updates["description"] = _parse_description(body["description"])
        if "hours" in body:
            updates["hours"] = _parse_hours(body["hours"])
        if "date" in body:
            updates["date"] = _parse_date(body["date"])
    except ValueError as exc:
        return error(str(exc))
    if not updates:
        return error("no valid fields to update")

    assignments = ", ".join(f"{col} = ?" for col in updates)
    db = get_db()
    db.execute(
        f"UPDATE entries SET {assignments} WHERE id = ? AND user_id = ?",
        (*updates.values(), row["id"], g.user_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM entries WHERE id = ?", (row["id"],)).fetchone()
    return jsonify(_entry_json(row))


@app.delete("/api/entries/<entry_id>")
@login_required
def delete_entry(entry_id: str):
    row = _get_own_entry(entry_id)
    if row is None:
        return error("entry not found", 404)
    db = get_db()
    db.execute("DELETE FROM entries WHERE id = ? AND user_id = ?", (row["id"], g.user_id))
    db.commit()
    return "", 204


# ---------------------------------------------------------------------------
# CSV exports


def _sanitize_cell(value: str) -> str:
    # Spreadsheet formula-injection protection: a leading apostrophe makes
    # spreadsheet programs treat the cell as the literal text the user typed.
    if value and value[0] in INJECTION_PREFIXES:
        return "'" + value
    return value


def _csv_response(rows: list[list[str]], filename: str) -> Response:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    for row in rows:
        writer.writerow(row)
    payload = buffer.getvalue().encode("utf-8")
    response = Response(payload, status=200, mimetype="text/csv")
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/summary")
@login_required
def summary_json():
    try:
        where, params = _build_filter(allow_project=True)
    except ValueError as exc:
        return error(str(exc))
    rows = get_db().execute(
        f"SELECT project, hours FROM entries WHERE {where}", params
    ).fetchall()
    totals: dict[str, Decimal] = {}
    for row in rows:
        totals[row["project"]] = totals.get(row["project"], Decimal(0)) + Decimal(
            str(round(row["hours"], 2))
        )
    projects = sorted(totals)
    return jsonify(
        {
            "items": [
                {"project": p, "hours": _hours_number(float(totals[p]))} for p in projects
            ],
            "total_hours": _hours_number(float(sum(totals.values(), Decimal(0)))),
        }
    )


@app.get("/api/exports/entries.csv")
@login_required
def export_entries():
    try:
        where, params = _build_filter(allow_project=True)
    except ValueError as exc:
        return error(str(exc))
    rows = get_db().execute(
        f"SELECT * FROM entries WHERE {where} ORDER BY date ASC, id ASC", params
    ).fetchall()
    table: list[list[str]] = [["date", "project", "description", "hours"]]
    for row in rows:
        table.append(
            [
                row["date"],
                _sanitize_cell(row["project"]),
                _sanitize_cell(row["description"]),
                _format_hours(row["hours"]),
            ]
        )
    return _csv_response(table, "entries.csv")


@app.get("/api/exports/summary.csv")
@login_required
def export_summary():
    try:
        where, params = _build_filter(allow_project=True)
    except ValueError as exc:
        return error(str(exc))
    rows = get_db().execute(
        f"SELECT project, hours FROM entries WHERE {where}", params
    ).fetchall()
    totals: dict[str, Decimal] = {}
    for row in rows:
        key = row["project"]
        totals[key] = totals.get(key, Decimal(0)) + Decimal(str(round(row["hours"], 2)))
    table: list[list[str]] = [["project", "hours"]]
    for project in sorted(totals):
        table.append([_sanitize_cell(project), _format_hours(totals[project])])
    return _csv_response(table, "summary.csv")


# ---------------------------------------------------------------------------
# frontend


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    if request.path.startswith("/api"):
        return jsonify({"error": exc.description}), exc.code
    return exc


@app.route("/api/<path:unknown>", methods=["GET", "POST", "PATCH", "PUT", "DELETE"])
def api_not_found(unknown: str):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    candidate = (DIST / path).resolve()
    if path and DIST in candidate.parents and candidate.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
