"""Incident center Flask API + frontend server."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "incident-center.db"

SEVERITIES = ["sev1", "sev2", "sev3", "sev4"]
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
STATUSES = ["investigating", "identified", "mitigated", "resolved"]
OPEN_STATUSES = ("investigating", "identified", "mitigated")

EVENT_TYPES = ["comment", "update", "status_change", "escalation"]

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# helpers

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def from_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_db", None)
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        g._db = conn
    return conn


@app.teardown_appcontext
def close_db(exc):
    conn = getattr(g, "_db", None)
    if conn is not None:
        conn.close()


def init_db():
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
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS incidents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            service TEXT NOT NULL,
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
        CREATE INDEX IF NOT EXISTS idx_events_incident
            ON timeline_events (incident_id, id);
        """
    )
    conn.commit()


with app.app_context():
    init_db()


def error_response(message: str, status: int = 400, details: dict | None = None):
    body = {"error": message}
    if details:
        body["details"] = details
    return jsonify(body), status


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.* FROM users u JOIN tokens t ON t.user_id = u.id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def require_auth():
    user = current_user()
    if user is None:
        return None, error_response("authentication required", 401)
    return user, None


def sla_due_at(incident: sqlite3.Row) -> str:
    target = SLA_MINUTES.get(incident["severity"], SLA_MINUTES["sev4"])
    return to_iso(from_iso(incident["opened_at"]) + timedelta(minutes=target))


def is_sla_breached(incident: sqlite3.Row) -> bool:
    due = from_iso(sla_due_at(incident))
    if incident["resolved_at"]:
        return from_iso(incident["resolved_at"]) > due
    return now_utc() > due


def incident_to_dict(incident: sqlite3.Row) -> dict:
    return {
        "id": incident["id"],
        "title": incident["title"],
        "service": incident["service"],
        "severity": incident["severity"],
        "status": incident["status"],
        "commander": incident["commander"],
        "impact_summary": incident["impact_summary"],
        "opened_at": incident["opened_at"],
        "resolved_at": incident["resolved_at"],
        "reopen_count": incident["reopen_count"],
        "opened_by": incident["opened_by"],
        "sla_due_at": sla_due_at(incident),
        "sla_breached": bool(is_sla_breached(incident)),
    }


def event_to_dict(event: sqlite3.Row) -> dict:
    return {
        "id": event["id"],
        "type": event["type"],
        "message": event["message"],
        "created_at": event["created_at"],
        "author": event["author"],
    }


def add_event(incident_id: int, event_type: str, message: str, author: str):
    conn = get_db()
    conn.execute(
        "INSERT INTO timeline_events (incident_id, type, message, created_at, author)"
        " VALUES (?, ?, ?, ?, ?)",
        (incident_id, event_type, message, to_iso(now_utc()), author),
    )


def fetch_incident(incident_id: str):
    try:
        pk = int(incident_id)
    except (TypeError, ValueError):
        return None
    return get_db().execute("SELECT * FROM incidents WHERE id = ?", (pk,)).fetchone()


# ---------------------------------------------------------------------------
# health


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


# ---------------------------------------------------------------------------
# auth endpoints


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("JSON body required", 400)
    details = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        details["username"] = "username is required"
    elif len(username.strip()) < 3 or len(username.strip()) > 32:
        details["username"] = "username must be between 3 and 32 characters"
    if not isinstance(password, str) or not password:
        details["password"] = "password is required"
    if details:
        return error_response("validation failed", 400, details)
    username = username.strip()
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing:
        return error_response("validation failed", 409, {"username": "username already taken"})
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), to_iso(now_utc())),
    )
    conn.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("JSON body required", 400)
    username = data.get("username")
    password = data.get("password")
    user = (
        get_db()
        .execute("SELECT * FROM users WHERE username = ?", (username or "",))
        .fetchone()
    )
    if user is None or not check_password_hash(user["password_hash"], password or ""):
        return error_response("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], to_iso(now_utc())),
    )
    conn.commit()
    return jsonify({"token": token, "username": user["username"]}), 200


@app.get("/api/auth/me")
def me():
    user, err = require_auth()
    if err:
        return err
    return jsonify({"username": user["username"]})


# ---------------------------------------------------------------------------
# incident endpoints


def validate_incident_payload(data: dict, partial: bool) -> tuple[dict, dict]:
    fields: dict = {}
    details: dict = {}
    allowed = ["title", "service", "severity", "status", "commander", "impact_summary"]
    if not partial:
        allowed = ["title", "service", "severity", "commander", "impact_summary"]
    for key in data:
        if key not in allowed:
            details[key] = "unknown field"
    for key in allowed:
        if key not in data:
            continue
        value = data[key]
        if not isinstance(value, str):
            details[key] = f"{key} must be a string"
            continue
        value = value.strip()
        if key == "title":
            if not value:
                details[key] = "title is required"
            elif len(value) > 200:
                details[key] = "title must be at most 200 characters"
            else:
                fields[key] = value
        elif key == "service":
            if not value:
                details[key] = "service is required"
            elif len(value) > 100:
                details[key] = "service must be at most 100 characters"
            else:
                fields[key] = value
        elif key == "severity":
            if value not in SEVERITIES:
                details[key] = "severity must be one of: " + ", ".join(SEVERITIES)
            else:
                fields[key] = value
        elif key == "status":
            if value not in STATUSES:
                details[key] = "status must be one of: " + ", ".join(STATUSES)
            else:
                fields[key] = value
        elif key == "commander":
            if len(value) > 100:
                details[key] = "commander must be at most 100 characters"
            else:
                fields[key] = value
        elif key == "impact_summary":
            if len(value) > 2000:
                details[key] = "impact_summary must be at most 2000 characters"
            else:
                fields[key] = value
    if not partial:
        for key in ["title", "service", "severity"]:
            if key not in data:
                details[key] = f"{key} is required"
    return fields, details


@app.get("/api/incidents")
def list_incidents():
    user, err = require_auth()
    if err:
        return err

    args = request.args
    filters = []
    params: list = []

    severity = args.get("severity")
    if severity not in (None, ""):
        if severity not in SEVERITIES:
            return error_response("validation failed", 400, {"severity": "unknown severity"})
        filters.append("severity = ?")
        params.append(severity)

    status = args.get("status")
    if status not in (None, ""):
        if status not in STATUSES:
            return error_response("validation failed", 400, {"status": "unknown status"})
        filters.append("status = ?")
        params.append(status)

    open_param = args.get("open")
    if open_param not in (None, ""):
        lowered = open_param.lower()
        if lowered in ("1", "true", "yes"):
            filters.append("status != 'resolved'")
        elif lowered in ("0", "false", "no"):
            filters.append("status = 'resolved'")
        else:
            return error_response("validation failed", 400, {"open": "must be true or false"})

    q = args.get("q")
    if q not in (None, ""):
        like = f"%{q}%"
        filters.append("(title LIKE ? OR service LIKE ? OR impact_summary LIKE ?)")
        params.extend([like, like, like])

    def parse_int(name, default):
        raw = args.get(name)
        if raw in (None, ""):
            return default, None
        try:
            value = int(raw)
        except ValueError:
            return None, f"{name} must be an integer"
        if value < 1:
            return None, f"{name} must be at least 1"
        return value, None

    page, page_err = parse_int("page", 1)
    if page_err:
        return error_response("validation failed", 400, {"page": page_err})
    page_size, size_err = parse_int("page_size", 20)
    if size_err:
        return error_response("validation failed", 400, {"page_size": size_err})
    if page_size > 200:
        page_size = 200

    where = ("WHERE " + " AND ".join(filters)) if filters else ""
    conn = get_db()
    total = conn.execute(f"SELECT COUNT(*) AS c FROM incidents {where}", params).fetchone()["c"]
    rows = conn.execute(
        f"SELECT * FROM incidents {where} ORDER BY opened_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [incident_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
def create_incident():
    user, err = require_auth()
    if err:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("JSON body required", 400)
    fields, details = validate_incident_payload(data, partial=False)
    if details:
        return error_response("validation failed", 400, details)
    opened_at = to_iso(now_utc())
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO incidents (title, service, severity, status, commander,"
        " impact_summary, opened_at, resolved_at, reopen_count, opened_by)"
        " VALUES (?, ?, ?, 'investigating', ?, ?, ?, NULL, 0, ?)",
        (
            fields["title"],
            fields["service"],
            fields["severity"],
            fields.get("commander", ""),
            fields.get("impact_summary", ""),
            opened_at,
            user["username"],
        ),
    )
    incident_id = cur.lastrowid
    conn.commit()
    incident = fetch_incident(incident_id)
    return jsonify(incident_to_dict(incident)), 201


@app.get("/api/incidents/<incident_id>")
def get_incident(incident_id):
    user, err = require_auth()
    if err:
        return err
    incident = fetch_incident(incident_id)
    if incident is None:
        return error_response("incident not found", 404)
    return jsonify(incident_to_dict(incident))


@app.patch("/api/incidents/<incident_id>")
def patch_incident(incident_id):
    user, err = require_auth()
    if err:
        return err
    incident = fetch_incident(incident_id)
    if incident is None:
        return error_response("incident not found", 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data:
        return error_response("JSON body with at least one field required", 400)
    fields, details = validate_incident_payload(data, partial=True)
    if details:
        return error_response("validation failed", 400, details)
    if not fields:
        return error_response("no valid fields provided", 400)

    conn = get_db()
    sets = []
    params: list = []
    for key, value in fields.items():
        sets.append(f"{key} = ?")
        params.append(value)

    new_status = fields.get("status")
    old_status = incident["status"]
    if new_status and new_status != old_status:
        if new_status == "resolved":
            sets.append("resolved_at = ?")
            params.append(to_iso(now_utc()))
        elif old_status == "resolved":
            sets.append("resolved_at = NULL")
            sets.append("reopen_count = reopen_count + 1")
    conn.execute(
        f"UPDATE incidents SET {', '.join(sets)} WHERE id = ?", params + [incident["id"]]
    )
    if new_status and new_status != old_status:
        add_event(
            incident["id"],
            "status_change",
            f"Status changed from {old_status} to {new_status}",
            user["username"],
        )
    conn.commit()
    return jsonify(incident_to_dict(fetch_incident(incident["id"])))


@app.get("/api/incidents/<incident_id>/timeline")
def get_timeline(incident_id):
    user, err = require_auth()
    if err:
        return err
    incident = fetch_incident(incident_id)
    if incident is None:
        return error_response("incident not found", 404)
    rows = get_db().execute(
        "SELECT * FROM timeline_events WHERE incident_id = ? ORDER BY created_at ASC, id ASC",
        (incident["id"],),
    ).fetchall()
    return jsonify({"items": [event_to_dict(r) for r in rows]})


@app.post("/api/incidents/<incident_id>/timeline")
def post_timeline_event(incident_id):
    user, err = require_auth()
    if err:
        return err
    incident = fetch_incident(incident_id)
    if incident is None:
        return error_response("incident not found", 404)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error_response("JSON body required", 400)
    details = {}
    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        details["message"] = "message is required"
    elif len(message.strip()) > 2000:
        details["message"] = "message must be at most 2000 characters"
    event_type = data.get("type", "comment")
    if not isinstance(event_type, str) or not event_type.strip():
        details["type"] = "type must be a string"
    elif event_type.strip() not in EVENT_TYPES:
        details["type"] = "type must be one of: " + ", ".join(EVENT_TYPES)
    if details:
        return error_response("validation failed", 400, details)

    conn = get_db()
    created = to_iso(now_utc())
    cur = conn.execute(
        "INSERT INTO timeline_events (incident_id, type, message, created_at, author)"
        " VALUES (?, ?, ?, ?, ?)",
        (incident["id"], event_type.strip(), message.strip(), created, user["username"]),
    )
    conn.commit()
    event = conn.execute(
        "SELECT * FROM timeline_events WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(event_to_dict(event)), 201


# ---------------------------------------------------------------------------
# public stats


def bool_expr_open():
    return "status != 'resolved'"


@app.get("/api/public/stats")
def public_stats():
    conn = get_db()
    now = now_utc()
    open_total = conn.execute(
        f"SELECT COUNT(*) AS c FROM incidents WHERE {bool_expr_open()}"
    ).fetchone()["c"]
    by_severity = {sev: 0 for sev in SEVERITIES}
    for row in conn.execute(
        f"SELECT severity, COUNT(*) AS c FROM incidents WHERE {bool_expr_open()}"
        " GROUP BY severity"
    ):
        if row["severity"] in by_severity:
            by_severity[row["severity"]] = row["c"]

    breached = 0
    for row in conn.execute(
        f"SELECT id, severity, opened_at FROM incidents WHERE {bool_expr_open()}"
    ):
        due = from_iso(row["opened_at"]) + timedelta(
            minutes=SLA_MINUTES.get(row["severity"], SLA_MINUTES["sev4"])
        )
        if now > due:
            breached += 1

    cutoff = to_iso(now - timedelta(days=30))
    resolved_30 = conn.execute(
        "SELECT COUNT(*) AS c FROM incidents"
        " WHERE resolved_at IS NOT NULL AND resolved_at >= ?",
        (cutoff,),
    ).fetchone()["c"]

    return jsonify(
        {
            "open_total": open_total,
            "open_by_severity": by_severity,
            "sla_breached_open": breached,
            "resolved_last_30_days": resolved_30,
        }
    )


# ---------------------------------------------------------------------------
# frontend + errors


@app.errorhandler(404)
def not_found(exc):
    if request.path.startswith("/api/"):
        return error_response("not found", 404)
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(exc):
    if request.path.startswith("/api/"):
        return error_response("method not allowed", 405)
    return exc


@app.errorhandler(500)
def server_error(exc):
    return error_response("internal server error", 500)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response("not found", 404)
    if DIST.exists() and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
