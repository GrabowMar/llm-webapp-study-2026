"""Incident center: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "incident_center.db"
DIST = BASE_DIR / "frontend" / "dist"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
STATUSES = ("investigating", "identified", "mitigating", "monitoring", "resolved")
DEFAULT_PAGE = 1
DEFAULT_PAGE_SIZE = 50
REOPEN_STATUS = "investigating"

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
    service TEXT NOT NULL DEFAULT '',
    severity TEXT NOT NULL,
    status TEXT NOT NULL,
    commander TEXT NOT NULL DEFAULT '',
    impact_summary TEXT NOT NULL DEFAULT '',
    opened_at TEXT NOT NULL,
    resolved_at TEXT,
    reopen_count INTEGER NOT NULL DEFAULT 0,
    opened_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS timeline_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_opened_at ON incidents(opened_at);
CREATE INDEX IF NOT EXISTS idx_incidents_resolved_at ON incidents(resolved_at);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON timeline_events(incident_id, id);
"""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def api_error(status: int, message: str, errors: dict | None = None):
    body = {"error": message, "message": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def validation_error(errors: dict):
    message = "; ".join(str(value) for value in errors.values())
    return api_error(400, message, errors)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        g.db = db
    return g.db


def serialize_incident(row: sqlite3.Row) -> dict:
    opened_at = parse_ts(row["opened_at"])
    due_at = opened_at + timedelta(minutes=SLA_MINUTES[row["severity"]])
    resolved_at = parse_ts(row["resolved_at"]) if row["resolved_at"] else None
    breached = (
        resolved_at is not None and resolved_at > due_at
    ) or (resolved_at is None and datetime.now(timezone.utc) > due_at)
    return {
        "id": row["id"],
        "title": row["title"],
        "service": row["service"],
        "severity": row["severity"],
        "status": row["status"],
        "commander": row["commander"],
        "impact_summary": row["impact_summary"],
        "opened_at": row["opened_at"],
        "resolved_at": row["resolved_at"],
        "reopen_count": row["reopen_count"],
        "opened_by": row["opened_by"],
        "sla_due_at": due_at.isoformat(),
        "sla_breached": breached,
    }


def serialize_event(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


def insert_event(
    db: sqlite3.Connection, incident_id: int, event_type: str, message: str, author: str
) -> sqlite3.Cursor:
    return db.execute(
        "INSERT INTO timeline_events (incident_id, type, message, created_at, author)"
        " VALUES (?, ?, ?, ?, ?)",
        (incident_id, event_type, message, now_iso(), author),
    )


def get_current_user() -> str | None:
    header = request.headers.get("Authorization", "")
    if len(header) < 8 or header[:7].lower() != "bearer ":
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.username AS username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row["username"] if row else None


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        username = get_current_user()
        if username is None:
            return api_error(401, "authentication required")
        g.user = username
        return view(*args, **kwargs)

    return wrapper


def string_field(data: dict, key: str, errors: dict, *, required: bool = False):
    if key not in data:
        if required:
            errors[key] = f"{key} is required"
        return None
    value = data[key]
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        errors[key] = f"{key} must be a string"
        return None
    if required and not value.strip():
        errors[key] = f"{key} is required"
        return None
    return value


def timestamp_field(data: dict, key: str, errors: dict, *, nullable: bool = False):
    if key not in data:
        return None, False
    value = data[key]
    if value is None and nullable:
        return None, True
    if not isinstance(value, str):
        errors[key] = f"{key} must be an ISO 8601 timestamp" + (" or null" if nullable else "")
        return None, True
    try:
        parse_ts(value)
    except ValueError:
        errors[key] = f"{key} must be an ISO 8601 timestamp" + (" or null" if nullable else "")
        return None, True
    return value, True


app = Flask(__name__, static_folder=None)


@app.teardown_appcontext
def close_db(_exception):
    db = g.pop("db", None)
    if db is not None:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True, force=True) or {}
    if not isinstance(data, dict):
        return api_error(400, "request body must be a JSON object")
    errors: dict = {}
    username = string_field(data, "username", errors, required=True)
    password = string_field(data, "password", errors, required=True)
    if errors:
        return validation_error(errors)
    username = username.strip()
    db = get_db()
    existing = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return api_error(409, "username already taken", {"username": "username already taken"})
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True, force=True) or {}
    if not isinstance(data, dict):
        return api_error(401, "invalid username or password")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return api_error(401, "invalid username or password")
    db = get_db()
    user = db.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return api_error(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/incidents")
@require_auth
def list_incidents():
    clauses: list[str] = []
    params: list = []

    severity = request.args.get("severity")
    if severity:
        if severity not in SEVERITIES:
            return api_error(
                400,
                "severity must be one of " + ", ".join(SEVERITIES),
                {"severity": "severity must be one of " + ", ".join(SEVERITIES)},
            )
        clauses.append("severity = ?")
        params.append(severity)

    status = request.args.get("status")
    if status:
        if status not in STATUSES:
            return api_error(
                400,
                "status must be one of " + ", ".join(STATUSES),
                {"status": "status must be one of " + ", ".join(STATUSES)},
            )
        clauses.append("status = ?")
        params.append(status)

    open_raw = request.args.get("open")
    if open_raw is not None:
        value = open_raw.strip().lower()
        if value in ("true", "1", "yes"):
            clauses.append("resolved_at IS NULL")
        elif value in ("false", "0", "no"):
            clauses.append("resolved_at IS NOT NULL")
        else:
            return api_error(400, "open must be true or false", {"open": "open must be true or false"})

    q = request.args.get("q")
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        clauses.append(
            "(title LIKE ? ESCAPE '\\' OR service LIKE ? ESCAPE '\\'"
            " OR commander LIKE ? ESCAPE '\\' OR impact_summary LIKE ? ESCAPE '\\')"
        )
        params.extend([like, like, like, like])

    page_raw = request.args.get("page")
    page_size_raw = request.args.get("page_size")
    try:
        page = int(page_raw) if page_raw is not None else DEFAULT_PAGE
        if page < 1:
            raise ValueError
    except ValueError:
        return api_error(400, "page must be a positive integer", {"page": "page must be a positive integer"})
    try:
        page_size = int(page_size_raw) if page_size_raw is not None else DEFAULT_PAGE_SIZE
        if page_size < 1:
            raise ValueError
    except ValueError:
        return api_error(
            400, "page_size must be a positive integer", {"page_size": "page_size must be a positive integer"}
        )

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) AS n FROM incidents {where}", params).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM incidents {where} ORDER BY opened_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_incident(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
@require_auth
def create_incident():
    data = request.get_json(silent=True, force=True) or {}
    if not isinstance(data, dict):
        return api_error(400, "request body must be a JSON object")
    errors: dict = {}
    title = string_field(data, "title", errors, required=True)
    service = string_field(data, "service", errors, required=True)
    commander = string_field(data, "commander", errors)
    impact_summary = string_field(data, "impact_summary", errors)
    severity = data.get("severity")
    if severity not in SEVERITIES:
        errors["severity"] = "severity must be one of " + ", ".join(SEVERITIES)
    opened_at, _ = timestamp_field(data, "opened_at", errors)
    if errors:
        return validation_error(errors)
    if opened_at is None:
        opened_at = now_iso()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO incidents (title, service, severity, status, commander, impact_summary,"
        " opened_at, resolved_at, reopen_count, opened_by)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)",
        (
            title,
            service or "",
            severity,
            "investigating",
            commander or "",
            impact_summary or "",
            opened_at,
            g.user,
        ),
    )
    incident_id = cursor.lastrowid
    db.commit()
    row = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return jsonify(serialize_incident(row)), 201


def fetch_incident(incident_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()


@app.get("/api/incidents/<int:incident_id>")
@require_auth
def get_incident(incident_id: int):
    row = fetch_incident(incident_id)
    if row is None:
        return api_error(404, "incident not found")
    return jsonify(serialize_incident(row))


@app.patch("/api/incidents/<int:incident_id>")
@require_auth
def update_incident(incident_id: int):
    db = get_db()
    row = fetch_incident(incident_id)
    if row is None:
        return api_error(404, "incident not found")
    data = request.get_json(silent=True, force=True)
    if data is None:
        data = {}
    if not isinstance(data, dict):
        return api_error(400, "request body must be a JSON object")

    errors: dict = {}
    updates: dict = {}

    if "title" in data:
        value = string_field(data, "title", errors, required=True)
        if value is not None:
            updates["title"] = value
    if "service" in data:
        value = string_field(data, "service", errors)
        if value is not None or "service" not in errors:
            updates["service"] = value or ""
    if "commander" in data:
        value = string_field(data, "commander", errors)
        if value is not None or "commander" not in errors:
            updates["commander"] = value or ""
    if "impact_summary" in data:
        value = string_field(data, "impact_summary", errors)
        if value is not None or "impact_summary" not in errors:
            updates["impact_summary"] = value or ""
    if "severity" in data:
        severity = data["severity"]
        if severity not in SEVERITIES:
            errors["severity"] = "severity must be one of " + ", ".join(SEVERITIES)
        else:
            updates["severity"] = severity
    if "status" in data:
        status = data["status"]
        if not isinstance(status, str) or status not in STATUSES:
            errors["status"] = "status must be one of " + ", ".join(STATUSES)
        else:
            updates["status"] = status
    opened_at, opened_given = timestamp_field(data, "opened_at", errors)
    if opened_given and opened_at is not None:
        updates["opened_at"] = opened_at
    resolved_at, resolved_given = timestamp_field(data, "resolved_at", errors, nullable=True)
    if resolved_given:
        updates["resolved_at"] = resolved_at
    if errors:
        return validation_error(errors)

    old_status = row["status"]
    status_given = "status" in data
    new_status = updates["status"] if status_given else old_status

    if resolved_given and not status_given:
        if updates["resolved_at"] is not None:
            if old_status != "resolved":
                new_status = "resolved"
        elif old_status == "resolved":
            new_status = REOPEN_STATUS

    if resolved_given:
        final_resolved = updates["resolved_at"]
    elif new_status == "resolved":
        final_resolved = row["resolved_at"] or now_iso()
    elif old_status == "resolved" and new_status != "resolved":
        final_resolved = None
    else:
        final_resolved = row["resolved_at"]

    reopen_count = row["reopen_count"]
    if old_status == "resolved" and new_status != "resolved":
        reopen_count += 1

    sets = {
        key: value
        for key, value in updates.items()
        if key not in ("status", "resolved_at")
    }
    sets["status"] = new_status
    sets["resolved_at"] = final_resolved
    sets["reopen_count"] = reopen_count
    assignments = ", ".join(f"{key} = ?" for key in sets)
    db.execute(
        f"UPDATE incidents SET {assignments} WHERE id = ?",
        [*sets.values(), incident_id],
    )
    if new_status != old_status:
        insert_event(
            db,
            incident_id,
            "status_change",
            f"Status changed from {old_status} to {new_status}",
            g.user,
        )
    db.commit()
    row = fetch_incident(incident_id)
    return jsonify(serialize_incident(row))


@app.get("/api/incidents/<int:incident_id>/timeline")
@require_auth
def get_timeline(incident_id: int):
    if fetch_incident(incident_id) is None:
        return api_error(404, "incident not found")
    rows = get_db().execute(
        "SELECT * FROM timeline_events WHERE incident_id = ? ORDER BY id ASC",
        (incident_id,),
    ).fetchall()
    return jsonify({"items": [serialize_event(row) for row in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
@require_auth
def add_timeline_event(incident_id: int):
    if fetch_incident(incident_id) is None:
        return api_error(404, "incident not found")
    data = request.get_json(silent=True, force=True) or {}
    if not isinstance(data, dict):
        return api_error(400, "request body must be a JSON object")
    errors: dict = {}
    message = string_field(data, "message", errors, required=True)
    event_type = data.get("type", "note")
    if event_type is None:
        event_type = "note"
    if not isinstance(event_type, str) or not event_type.strip():
        errors["type"] = "type must be a non-empty string"
    if errors:
        return validation_error(errors)
    db = get_db()
    cursor = insert_event(db, incident_id, event_type, message, g.user)
    db.commit()
    row = db.execute(
        "SELECT * FROM timeline_events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_event(row)), 201


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    open_rows = db.execute(
        "SELECT severity, opened_at FROM incidents WHERE resolved_at IS NULL"
    ).fetchall()
    open_by_severity = {severity: 0 for severity in SEVERITIES}
    sla_breached_open = 0
    now = datetime.now(timezone.utc)
    for row in open_rows:
        severity = row["severity"]
        if severity in open_by_severity:
            open_by_severity[severity] += 1
        due_at = parse_ts(row["opened_at"]) + timedelta(minutes=SLA_MINUTES[severity])
        if now > due_at:
            sla_breached_open += 1

    cutoff = now - timedelta(days=30)
    resolved_last_30_days = 0
    for row in db.execute(
        "SELECT resolved_at FROM incidents WHERE resolved_at IS NOT NULL"
    ).fetchall():
        try:
            resolved_at = parse_ts(row["resolved_at"])
        except ValueError:
            continue
        if resolved_at >= cutoff:
            resolved_last_30_days += 1

    return jsonify(
        {
            "open_total": len(open_rows),
            "open_by_severity": open_by_severity,
            "sla_breached_open": sla_breached_open,
            "resolved_last_30_days": resolved_last_30_days,
        }
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error(404, "not found")
    if path:
        candidate = (DIST / path).resolve()
        if candidate.is_file() and DIST.resolve() in candidate.parents:
            return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(404)
def not_found(_error):
    if request.path == "/api" or request.path.startswith("/api/"):
        return api_error(404, "not found")
    return "Not found", 404


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path == "/api" or request.path.startswith("/api/"):
        return api_error(405, "method not allowed")
    return "Method not allowed", 405


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
