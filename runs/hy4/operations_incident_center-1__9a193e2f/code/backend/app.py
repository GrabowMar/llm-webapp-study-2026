import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "incidents.db"

SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
RESOLVED_STATUS = "resolved"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 1000

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
    opened_by TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_timeline_incident ON timeline(incident_id, id);
CREATE INDEX IF NOT EXISTS idx_incidents_opened ON incidents(opened_at DESC, id DESC);
"""

app = Flask(__name__, static_folder=None)


def utcnow():
    return datetime.now(timezone.utc)


def fmt(value):
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds")


def parse_dt(value):
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    result = datetime.fromisoformat(text)
    if result.tzinfo is None:
        result = result.replace(tzinfo=timezone.utc)
    return result.astimezone(timezone.utc)


@contextmanager
def connection():
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connection() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)


def is_resolved(status):
    return str(status).strip().lower() == RESOLVED_STATUS


def incident_dict(row):
    opened_at = parse_dt(row["opened_at"])
    due_at = opened_at + timedelta(minutes=SLA_MINUTES.get(row["severity"], 1440))
    resolved_raw = row["resolved_at"]
    resolved_at = parse_dt(resolved_raw) if resolved_raw else None
    breached = resolved_at > due_at if resolved_at is not None else utcnow() > due_at
    return {
        "id": row["id"],
        "title": row["title"],
        "service": row["service"],
        "severity": row["severity"],
        "status": row["status"],
        "commander": row["commander"],
        "impact_summary": row["impact_summary"],
        "opened_at": fmt(opened_at),
        "resolved_at": fmt(resolved_at) if resolved_at is not None else None,
        "reopen_count": int(row["reopen_count"]),
        "opened_by": row["opened_by"],
        "sla_due_at": fmt(due_at),
        "sla_breached": breached,
    }


def event_dict(row):
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": fmt(parse_dt(row["created_at"])),
        "author": row["author"],
    }


def get_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def api_error(status, message, errors=None):
    payload = {"error": message, "message": message}
    if errors is not None:
        payload["errors"] = errors
    return jsonify(payload), status


@app.before_request
def resolve_auth():
    g.username = None
    if not request.path.startswith("/api"):
        return None
    header = request.headers.get("Authorization", "")
    if not header.strip():
        return None
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not token:
        return api_error(401, "authentication required")
    with connection() as conn:
        row = conn.execute(
            "SELECT u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        ).fetchone()
    if row is None:
        return api_error(401, "authentication required")
    g.username = row["username"]
    return None


def auth_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if g.get("username") is None:
            return api_error(401, "authentication required")
        return view(*args, **kwargs)

    return wrapped


def parse_bool(value):
    if value is None:
        return None
    normalized = value.strip().lower()
    if normalized in ("1", "true", "yes", "on"):
        return True
    if normalized in ("0", "false", "no", "off"):
        return False
    return None


def parse_positive_int(value, default):
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    return result if result >= 1 else default


def validate_optional_text(data, errors):
    values = {}
    for key, default in (
        ("service", ""),
        ("commander", ""),
        ("impact_summary", ""),
    ):
        raw = data.get(key, default)
        if raw is None:
            values[key] = ""
        elif isinstance(raw, str):
            values[key] = raw
        else:
            errors[key] = f"{key} must be a string"
            values[key] = ""
    return values


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = get_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    elif len(username.strip()) > 100:
        errors["username"] = "username must be at most 100 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    if errors:
        return api_error(400, "validation failed", errors)

    username = username.strip()
    now = fmt(utcnow())
    token = secrets.token_urlsafe(32)
    with connection() as conn:
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if existing is not None:
            return api_error(409, "username already taken", {"username": "username already taken"})
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now),
        )
        user_id = cursor.lastrowid
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, now),
        )
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    data = get_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        return api_error(401, "invalid username or password")
    with connection() as conn:
        row = conn.execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error(401, "invalid username or password")
    token = secrets.token_urlsafe(32)
    with connection() as conn:
        conn.execute(
            "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], fmt(utcnow())),
        )
    return jsonify({"token": token})


@app.get("/api/auth/me")
@auth_required
def me():
    return jsonify({"username": g.username})


@app.get("/api/incidents")
@auth_required
def list_incidents():
    args = request.args
    severity = args.get("severity")
    status = args.get("status")
    open_filter = parse_bool(args.get("open"))
    query = (args.get("q") or "").strip()
    page = parse_positive_int(args.get("page"), 1)
    page_size = min(parse_positive_int(args.get("page_size"), DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

    with connection() as conn:
        rows = conn.execute("SELECT * FROM incidents").fetchall()

    items = [incident_dict(row) for row in rows]
    items.sort(key=lambda item: (item["opened_at"], item["id"]), reverse=True)

    def matches(item):
        if severity and item["severity"] != severity:
            return False
        if status and item["status"] != status:
            return False
        resolved = is_resolved(item["status"])
        if open_filter is True and resolved:
            return False
        if open_filter is False and not resolved:
            return False
        if query:
            haystack = " ".join(
                str(item[key] or "") for key in ("title", "service", "commander", "impact_summary")
            ).lower()
            if query.lower() not in haystack:
                return False
        return True

    items = [item for item in items if matches(item)]
    total = len(items)
    start = (page - 1) * page_size
    return jsonify(
        {
            "items": items[start : start + page_size],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
@auth_required
def create_incident():
    data = get_body()
    errors = {}
    title = data.get("title")
    severity = data.get("severity")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "title is required"
    if not isinstance(severity, str) or severity not in SLA_MINUTES:
        errors["severity"] = "severity must be one of sev1, sev2, sev3, sev4"
    optional = validate_optional_text(data, errors)
    if errors:
        return api_error(400, "validation failed", errors)

    with connection() as conn:
        cursor = conn.execute(
            """INSERT INTO incidents
               (title, service, severity, status, commander, impact_summary,
                opened_at, resolved_at, reopen_count, opened_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)""",
            (
                title.strip(),
                optional["service"],
                severity,
                "investigating",
                optional["commander"],
                optional["impact_summary"],
                fmt(utcnow()),
                g.username,
            ),
        )
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(incident_dict(row)), 201


@app.get("/api/incidents/<int:incident_id>")
@auth_required
def get_incident(incident_id):
    with connection() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if row is None:
        return api_error(404, "incident not found")
    return jsonify(incident_dict(row))


@app.patch("/api/incidents/<int:incident_id>")
@auth_required
def update_incident(incident_id):
    data = get_body()
    with connection() as conn:
        row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if row is None:
            return api_error(404, "incident not found")

        current = dict(row)
        errors = {}
        updates = {}
        for key in ("title", "service", "severity", "status", "commander", "impact_summary", "opened_by"):
            if key not in data:
                continue
            value = data[key]
            strict = key in ("title", "severity", "status")
            if not isinstance(value, str) or (strict and not value.strip()):
                errors[key] = f"{key} must be a non-empty string"
            else:
                updates[key] = value.strip() if strict else value

        if "severity" in updates and updates["severity"] not in SLA_MINUTES:
            errors["severity"] = "severity must be one of sev1, sev2, sev3, sev4"

        if "reopen_count" in data:
            try:
                count = int(data["reopen_count"])
                if count < 0:
                    raise ValueError
                updates["reopen_count"] = count
            except (TypeError, ValueError):
                errors["reopen_count"] = "reopen_count must be a non-negative integer"

        for key in ("opened_at", "resolved_at"):
            if key in data:
                if data[key] is None or data[key] == "":
                    updates[key] = None
                else:
                    try:
                        updates[key] = fmt(parse_dt(data[key]))
                    except (TypeError, ValueError):
                        errors[key] = f"{key} must be an ISO 8601 timestamp"

        if errors:
            return api_error(400, "validation failed", errors)

        old_status = current["status"]
        new_status = updates.get("status", old_status)
        status_changed = "status" in updates and new_status != old_status
        if status_changed:
            was_resolved = is_resolved(old_status)
            now_resolved = is_resolved(new_status)
            if now_resolved and not was_resolved:
                updates.setdefault("resolved_at", fmt(utcnow()))
            elif was_resolved and not now_resolved:
                updates["resolved_at"] = None
                updates["reopen_count"] = int(current["reopen_count"]) + 1

        if updates:
            assignments = ", ".join(f"{key} = ?" for key in updates)
            conn.execute(
                f"UPDATE incidents SET {assignments} WHERE id = ?",
                (*updates.values(), incident_id),
            )
        if status_changed:
            conn.execute(
                """INSERT INTO timeline (incident_id, type, message, created_at, author)
                   VALUES (?, ?, ?, ?, ?)""",
                (
                    incident_id,
                    "status_change",
                    f"Status changed from {old_status} to {new_status}",
                    fmt(utcnow()),
                    g.username,
                ),
            )
        updated = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return jsonify(incident_dict(updated))


@app.get("/api/incidents/<int:incident_id>/timeline")
@auth_required
def get_timeline(incident_id):
    with connection() as conn:
        exists = conn.execute("SELECT 1 FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if exists is None:
            return api_error(404, "incident not found")
        rows = conn.execute(
            "SELECT * FROM timeline WHERE incident_id = ? ORDER BY created_at ASC, id ASC",
            (incident_id,),
        ).fetchall()
    return jsonify({"items": [event_dict(row) for row in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
@auth_required
def post_timeline(incident_id):
    data = get_body()
    errors = {}
    message = data.get("message")
    event_type = data.get("type", "note")
    if not isinstance(message, str) or not message.strip():
        errors["message"] = "message is required"
    if not isinstance(event_type, str) or not event_type.strip():
        errors["type"] = "type must be a non-empty string"
    if errors:
        return api_error(400, "validation failed", errors)

    with connection() as conn:
        exists = conn.execute("SELECT 1 FROM incidents WHERE id = ?", (incident_id,)).fetchone()
        if exists is None:
            return api_error(404, "incident not found")
        cursor = conn.execute(
            """INSERT INTO timeline (incident_id, type, message, created_at, author)
               VALUES (?, ?, ?, ?, ?)""",
            (incident_id, event_type.strip(), message.strip(), fmt(utcnow()), g.username),
        )
        row = conn.execute("SELECT * FROM timeline WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(event_dict(row)), 201


@app.get("/api/public/stats")
def public_stats():
    with connection() as conn:
        rows = conn.execute("SELECT * FROM incidents").fetchall()
    items = [incident_dict(row) for row in rows]
    open_items = [item for item in items if not is_resolved(item["status"])]
    by_severity = {severity: 0 for severity in SEVERITIES}
    for item in open_items:
        if item["severity"] in by_severity:
            by_severity[item["severity"]] += 1
    cutoff = utcnow() - timedelta(days=30)
    resolved_recent = sum(
        1
        for item in items
        if item["resolved_at"] is not None and parse_dt(item["resolved_at"]) >= cutoff
    )
    return jsonify(
        {
            "open_total": len(open_items),
            "open_by_severity": by_severity,
            "sla_breached_open": sum(1 for item in open_items if item["sla_breached"]),
            "resolved_last_30_days": resolved_recent,
        }
    )


@app.errorhandler(404)
def handle_404(_error):
    if request.path.startswith("/api"):
        return api_error(404, "not found")
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def handle_405(_error):
    return api_error(405, "method not allowed")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error(404, "not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
