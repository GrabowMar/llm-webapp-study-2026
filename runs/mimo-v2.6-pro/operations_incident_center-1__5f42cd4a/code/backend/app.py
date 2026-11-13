"""Incident center: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory
from werkzeug.security import check_password_hash
from werkzeug.security import generate_password_hash

DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "incidents.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
STATUSES = ("investigating", "identified", "monitoring", "resolved")
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def sla_due_at(opened_at: datetime, severity: str) -> str:
    return to_iso(opened_at + timedelta(minutes=SLA_MINUTES[severity]))


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc=None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    service TEXT NOT NULL,
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    commander TEXT,
    impact_summary TEXT,
    opened_at TEXT NOT NULL,
    resolved_at TEXT,
    reopen_count INTEGER NOT NULL DEFAULT 0,
    opened_by TEXT NOT NULL,
    sla_due_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_opened_at ON incidents(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON timeline_events(incident_id, id);
"""


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    try:
        db.executescript(SCHEMA)
        db.commit()
    finally:
        db.close()


def error(message: str, status: int = 400):
    return jsonify({"error": message}), status


def validation_error(errors: dict[str, str]):
    return jsonify({"error": "validation failed", "errors": errors}), 400


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def require_text(data: dict, field: str, errors: dict[str, str], label: str | None = None) -> str | None:
    label = label or field
    value = data.get(field)
    if value is None or (isinstance(value, str) and not value.strip()):
        errors[field] = f"{label} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{label} must be a string"
        return None
    return value.strip()


def optional_text(data: dict, field: str, errors: dict[str, str], label: str | None = None) -> str | None:
    label = label or field
    if field not in data:
        return None
    value = data.get(field)
    if value is None:
        return None
    if not isinstance(value, str):
        errors[field] = f"{label} must be a string"
        return None
    value = value.strip()
    return value or None


def parse_bool(raw: str) -> bool | None:
    lowered = raw.strip().lower()
    if lowered in ("true", "1", "yes", "on"):
        return True
    if lowered in ("false", "0", "no", "off"):
        return False
    return None


def parse_paging() -> tuple[int, int] | None:
    page = 1
    page_size = DEFAULT_PAGE_SIZE
    raw_page = request.args.get("page")
    if raw_page is not None:
        try:
            page = int(raw_page)
        except ValueError:
            return None
    raw_size = request.args.get("page_size")
    if raw_size is not None:
        try:
            page_size = int(raw_size)
        except ValueError:
            return None
    page = max(1, page)
    page_size = min(max(1, page_size), MAX_PAGE_SIZE)
    return page, page_size


# --------------------------------------------------------------------------
# serialisation
# --------------------------------------------------------------------------

def incident_dict(row: sqlite3.Row, now: datetime | None = None) -> dict:
    now = now or now_utc()
    due = parse_iso(row["sla_due_at"])
    resolved_at = row["resolved_at"]
    if resolved_at is not None:
        breached = parse_iso(resolved_at) > due
    else:
        breached = now > due
    return {
        "id": row["id"],
        "title": row["title"],
        "service": row["service"],
        "severity": row["severity"],
        "status": row["status"],
        "commander": row["commander"],
        "impact_summary": row["impact_summary"],
        "opened_at": row["opened_at"],
        "resolved_at": resolved_at,
        "reopen_count": row["reopen_count"],
        "opened_by": row["opened_by"],
        "sla_due_at": row["sla_due_at"],
        "sla_breached": breached,
    }


def event_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------

def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error("request body must be a JSON object")
    errors: dict[str, str] = {}
    username = require_text(data, "username", errors)
    password = require_text(data, "password", errors)
    if errors:
        return validation_error(errors)
    db = get_db()
    taken = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if taken is not None:
        return jsonify({"error": "username already taken", "errors": {"username": "username already taken"}}), 409
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), to_iso(now_utc())),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error("request body must be a JSON object")
    errors: dict[str, str] = {}
    username = require_text(data, "username", errors)
    password = require_text(data, "password", errors)
    if errors:
        return validation_error(errors)
    user = get_db().execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], to_iso(now_utc())),
    )
    db.commit()
    return jsonify({"token": token})


# --------------------------------------------------------------------------
# incidents
# --------------------------------------------------------------------------

def get_incident_or_none(incident_id: int):
    return get_db().execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()


def create_event(incident_id: int, event_type: str, message: str, author: str, created_at: str) -> dict:
    db = get_db()
    cur = db.execute(
        "INSERT INTO timeline_events (incident_id, type, message, created_at, author) VALUES (?, ?, ?, ?, ?)",
        (incident_id, event_type, message, created_at, author),
    )
    db.commit()
    row = db.execute("SELECT * FROM timeline_events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return event_dict(row)


@app.get("/api/incidents")
@login_required
def list_incidents():
    where: list[str] = []
    params: list = []

    severity = request.args.get("severity")
    if severity:
        if severity not in SEVERITIES:
            return error("severity must be one of sev1, sev2, sev3, sev4")
        where.append("severity = ?")
        params.append(severity)

    status = request.args.get("status")
    if status:
        if status not in STATUSES:
            return error("status must be one of " + ", ".join(STATUSES))
        where.append("status = ?")
        params.append(status)

    raw_open = request.args.get("open")
    if raw_open is not None:
        open_flag = parse_bool(raw_open)
        if open_flag is None:
            return error("open must be true or false")
        where.append("status = 'resolved'" if not open_flag else "status != 'resolved'")

    q = request.args.get("q")
    if q:
        pattern = "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(
            "(title LIKE ? ESCAPE '\\' OR service LIKE ? ESCAPE '\\' "
            "OR impact_summary LIKE ? ESCAPE '\\' OR commander LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 4)

    paging = parse_paging()
    if paging is None:
        return error("page and page_size must be integers")
    page, page_size = paging

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS n FROM incidents" + clause, params).fetchone()["n"]
    rows = db.execute(
        "SELECT * FROM incidents" + clause + " ORDER BY opened_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    now = now_utc()
    return jsonify(
        {
            "items": [incident_dict(row, now) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
@login_required
def create_incident():
    data = json_body()
    if data is None:
        return error("request body must be a JSON object")
    errors: dict[str, str] = {}
    title = require_text(data, "title", errors)
    service = require_text(data, "service", errors)
    severity = require_text(data, "severity", errors)
    commander = optional_text(data, "commander", errors)
    impact_summary = optional_text(data, "impact_summary", errors)
    if severity is not None and severity not in SEVERITIES:
        errors["severity"] = "severity must be one of sev1, sev2, sev3, sev4"
    if errors:
        return validation_error(errors)

    opened_at = now_utc()
    status = "investigating"
    db = get_db()
    cur = db.execute(
        "INSERT INTO incidents "
        "(title, service, severity, status, commander, impact_summary, opened_at, resolved_at, "
        "reopen_count, opened_by, sla_due_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)",
        (
            title,
            service,
            severity,
            status,
            commander,
            impact_summary,
            to_iso(opened_at),
            g.user["username"],
            sla_due_at(opened_at, severity),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM incidents WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(incident_dict(row)), 201


@app.get("/api/incidents/<int:incident_id>")
@login_required
def get_incident(incident_id: int):
    row = get_incident_or_none(incident_id)
    if row is None:
        return error("incident not found", 404)
    return jsonify(incident_dict(row))


@app.patch("/api/incidents/<int:incident_id>")
@login_required
def patch_incident(incident_id: int):
    row = get_incident_or_none(incident_id)
    if row is None:
        return error("incident not found", 404)
    data = json_body()
    if data is None:
        return error("request body must be a JSON object")

    errors: dict[str, str] = {}
    title = require_text(data, "title", errors) if "title" in data else None
    service = require_text(data, "service", errors) if "service" in data else None
    severity = require_text(data, "severity", errors) if "severity" in data else None
    status = require_text(data, "status", errors) if "status" in data else None
    commander = optional_text(data, "commander", errors)
    impact_summary = optional_text(data, "impact_summary", errors)
    if severity is not None and severity not in SEVERITIES:
        errors["severity"] = "severity must be one of sev1, sev2, sev3, sev4"
    if status is not None and status not in STATUSES:
        errors["status"] = "status must be one of " + ", ".join(STATUSES)
    if errors:
        return validation_error(errors)

    db = get_db()
    sets: list[str] = []
    params: list = []
    if "title" in data:
        sets.append("title = ?")
        params.append(title)
    if "service" in data:
        sets.append("service = ?")
        params.append(service)
    if "severity" in data:
        sets.append("severity = ?")
        params.append(severity)
        sets.append("sla_due_at = ?")
        params.append(sla_due_at(parse_iso(row["opened_at"]), severity))
    if "commander" in data:
        sets.append("commander = ?")
        params.append(commander)
    if "impact_summary" in data:
        sets.append("impact_summary = ?")
        params.append(impact_summary)

    now = now_utc()
    now_str = to_iso(now)
    status_changed = "status" in data and status != row["status"]
    if "status" in data:
        sets.append("status = ?")
        params.append(status)
        if status_changed:
            if status == "resolved":
                sets.append("resolved_at = ?")
                params.append(now_str)
            elif row["status"] == "resolved":
                sets.append("resolved_at = NULL")
                sets.append("reopen_count = reopen_count + 1")

    if sets:
        db.execute(f"UPDATE incidents SET {', '.join(sets)} WHERE id = ?", params + [incident_id])

    if status_changed:
        create_event(
            incident_id,
            "status_change",
            f"Status changed from {row['status']} to {status}",
            g.user["username"],
            now_str,
        )
    db.commit()

    updated = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return jsonify(incident_dict(updated, now))


@app.get("/api/incidents/<int:incident_id>/timeline")
@login_required
def get_timeline(incident_id: int):
    if get_incident_or_none(incident_id) is None:
        return error("incident not found", 404)
    rows = (
        get_db()
        .execute(
            "SELECT * FROM timeline_events WHERE incident_id = ? ORDER BY created_at ASC, id ASC",
            (incident_id,),
        )
        .fetchall()
    )
    return jsonify({"items": [event_dict(row) for row in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
@login_required
def post_timeline(incident_id: int):
    if get_incident_or_none(incident_id) is None:
        return error("incident not found", 404)
    data = json_body()
    if data is None:
        return error("request body must be a JSON object")
    errors: dict[str, str] = {}
    message = require_text(data, "message", errors, "message")
    event_type = "note"
    if "type" in data:
        raw_type = data.get("type")
        if raw_type is None or (isinstance(raw_type, str) and not raw_type.strip()):
            errors["type"] = "type is required"
        elif not isinstance(raw_type, str):
            errors["type"] = "type must be a string"
        else:
            event_type = raw_type.strip()
    if errors:
        return validation_error(errors)

    event = create_event(incident_id, event_type, message, g.user["username"], to_iso(now_utc()))
    return jsonify(event), 201


# --------------------------------------------------------------------------
# public stats
# --------------------------------------------------------------------------

@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    now = now_utc()
    cutoff = to_iso(now - timedelta(days=30))
    open_total = db.execute("SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved'").fetchone()["n"]
    open_by_severity = {}
    for severity in SEVERITIES:
        open_by_severity[severity] = db.execute(
            "SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved' AND severity = ?",
            (severity,),
        ).fetchone()["n"]
    sla_breached_open = db.execute(
        "SELECT COUNT(*) AS n FROM incidents WHERE status != 'resolved' AND sla_due_at < ?",
        (to_iso(now),),
    ).fetchone()["n"]
    resolved_last_30_days = db.execute(
        "SELECT COUNT(*) AS n FROM incidents WHERE resolved_at IS NOT NULL AND resolved_at >= ?",
        (cutoff,),
    ).fetchone()["n"]
    return jsonify(
        {
            "open_total": open_total,
            "open_by_severity": open_by_severity,
            "sla_breached_open": sla_breached_open,
            "resolved_last_30_days": resolved_last_30_days,
        }
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
