"""Flask entry point for the incident center."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
STATUSES = ("investigating", "identified", "monitoring", "resolved")
EVENT_TYPES = ("note", "update", "action", "communication")
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
    opened_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_incidents_opened ON incidents(opened_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_incident ON events(incident_id, id);
"""




def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def fmt(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


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


def json_body() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def current_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "Authentication required")
    row = (
        get_db()
        .execute(
            "SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id WHERE tokens.token = ?",
            (token,),
        )
        .fetchone()
    )
    if row is None:
        raise ApiError(401, "Invalid or expired token")
    return row




def sla_due(opened_at: datetime, severity: str) -> datetime:
    return opened_at + timedelta(minutes=SLA_MINUTES[severity])


def is_breached(row, now: datetime | None = None) -> bool:
    now = now or utcnow()
    due = sla_due(parse_dt(row["opened_at"]), row["severity"])
    resolved_at = parse_dt(row["resolved_at"])
    if row["status"] == "resolved" and resolved_at is not None:
        return resolved_at > due
    return now > due


def incident_json(row, now: datetime | None = None) -> dict:
    opened_at = parse_dt(row["opened_at"])
    return {
        "id": row["id"],
        "title": row["title"],
        "service": row["service"],
        "severity": row["severity"],
        "status": row["status"],
        "commander": row["commander"],
        "impact_summary": row["impact_summary"],
        "opened_at": fmt(opened_at),
        "resolved_at": fmt(parse_dt(row["resolved_at"])),
        "reopen_count": row["reopen_count"],
        "opened_by": row["opened_by"],
        "sla_due_at": fmt(sla_due(opened_at, row["severity"])),
        "sla_breached": is_breached(row, now),
    }


def event_json(row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": fmt(parse_dt(row["created_at"])),
        "author": row["author"],
    }




def check_text(data, field, label, errors, *, required, max_len, nullable=False):
    if field not in data:
        if required:
            errors[field] = f"{label} is required"
        return None
    value = data[field]
    if value is None:
        if nullable and not required:
            return None
        errors[field] = f"{label} is required"
        return None
    if not isinstance(value, str):
        errors[field] = f"{label} must be a string"
        return None
    value = value.strip()
    if not value:
        if nullable and not required:
            return None
        errors[field] = f"{label} is required" if required else f"{label} must not be empty"
        return None
    if len(value) > max_len:
        errors[field] = f"{label} must be at most {max_len} characters"
        return None
    return value


def check_choice(data, field, label, choices, errors, *, required):
    if field not in data:
        if required:
            errors[field] = f"{label} is required"
        return None
    value = data[field]
    if not isinstance(value, str) or value not in choices:
        errors[field] = f"{label} must be one of: {', '.join(choices)}"
        return None
    return value




@app.get("/api/health")
def health():
    return {"status": "ok"}




@app.post("/api/auth/register")
def register():
    data = json_body()
    errors = {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    elif not USERNAME_RE.match(username.strip()):
        errors["username"] = (
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-'"
        )
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters"
    elif len(password) > 256:
        errors["password"] = "Password must be at most 256 characters"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    username = username.strip()
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), fmt(utcnow())),
        )
        db.commit()
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(
            400,
            "Username and password are required",
            {
                k: f"{k.capitalize()} is required"
                for k, v in (("username", username), ("password", password))
                if not isinstance(v, str) or not v
            },
        )
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], fmt(utcnow())),
    )
    db.commit()
    return {"token": token, "username": user["username"]}


@app.get("/api/auth/me")
def me():
    user = current_user()
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/auth/logout")
def logout():
    current_user()
    token = request.headers.get("Authorization", "").partition(" ")[2].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return "", 204




def load_incident(incident_id: int):
    row = get_db().execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Incident not found")
    return row


def parse_bool(value: str, name: str) -> bool:
    v = value.strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    raise ApiError(400, f"Invalid value for {name}", {name: f"{name} must be true or false"})


def parse_positive_int(value: str | None, name: str, default: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        number = int(value)
    except ValueError:
        raise ApiError(400, f"Invalid value for {name}", {name: f"{name} must be a positive integer"})
    if number < 1:
        raise ApiError(400, f"Invalid value for {name}", {name: f"{name} must be a positive integer"})
    return number


def parse_multi(value: str | None, name: str, choices) -> list[str]:
    if value is None or value.strip() == "":
        return []
    items = [v.strip().lower() for v in value.split(",") if v.strip()]
    bad = [v for v in items if v not in choices]
    if bad:
        raise ApiError(
            400,
            f"Invalid value for {name}",
            {name: f"{name} must be one of: {', '.join(choices)}"},
        )
    return items


@app.get("/api/incidents")
def list_incidents():
    current_user()
    args = request.args
    where, params = [], []

    severities = parse_multi(args.get("severity"), "severity", SEVERITIES)
    if severities:
        where.append(f"severity IN ({','.join('?' * len(severities))})")
        params.extend(severities)

    statuses = parse_multi(args.get("status"), "status", STATUSES)
    if statuses:
        where.append(f"status IN ({','.join('?' * len(statuses))})")
        params.extend(statuses)

    open_arg = args.get("open")
    if open_arg is not None and open_arg.strip() != "":
        if parse_bool(open_arg, "open"):
            where.append("status != 'resolved'")
        else:
            where.append("status = 'resolved'")

    q = (args.get("q") or "").strip()
    if q:
        like = "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        where.append(
            "(LOWER(title) LIKE ? ESCAPE '\\' OR LOWER(service) LIKE ? ESCAPE '\\'"
            " OR LOWER(COALESCE(impact_summary, '')) LIKE ? ESCAPE '\\'"
            " OR LOWER(COALESCE(commander, '')) LIKE ? ESCAPE '\\')"
        )
        params.extend([like] * 4)

    page = parse_positive_int(args.get("page"), "page", 1)
    page_size = min(parse_positive_int(args.get("page_size"), "page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)

    clause = f"WHERE {' AND '.join(where)}" if where else ""
    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM incidents {clause}", params).fetchone()[0]
    rows = db.execute(
        f"SELECT * FROM incidents {clause} ORDER BY opened_at DESC, id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    now = utcnow()
    return {
        "items": [incident_json(r, now) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/incidents")
def create_incident():
    user = current_user()
    data = json_body()
    errors: dict = {}
    title = check_text(data, "title", "Title", errors, required=True, max_len=200)
    service = check_text(data, "service", "Service", errors, required=True, max_len=100)
    severity = check_choice(data, "severity", "Severity", SEVERITIES, errors, required=True)
    commander = check_text(data, "commander", "Commander", errors, required=False, max_len=100, nullable=True)
    impact = check_text(
        data, "impact_summary", "Impact summary", errors, required=False, max_len=5000, nullable=True
    )
    now = utcnow()
    opened_at = now
    if data.get("opened_at") is not None:
        raw = data["opened_at"]
        try:
            if not isinstance(raw, str):
                raise ValueError
            opened_at = parse_dt(raw)
            if opened_at > now + timedelta(minutes=1):
                errors["opened_at"] = "Opened at must not be in the future"
        except ValueError:
            errors["opened_at"] = "Opened at must be an ISO 8601 date-time"
    if errors:
        raise ApiError(400, "Validation failed", errors)
    db = get_db()
    cur = db.execute(
        "INSERT INTO incidents (title, service, severity, status, commander, impact_summary,"
        " opened_at, resolved_at, reopen_count, opened_by) VALUES (?, ?, ?, 'investigating', ?, ?, ?, NULL, 0, ?)",
        (title, service, severity, commander, impact, fmt(opened_at), user["username"]),
    )
    db.commit()
    return jsonify(incident_json(load_incident(cur.lastrowid))), 201


@app.get("/api/incidents/<int:incident_id>")
def get_incident(incident_id: int):
    current_user()
    return incident_json(load_incident(incident_id))


@app.patch("/api/incidents/<int:incident_id>")
def update_incident(incident_id: int):
    user = current_user()
    row = load_incident(incident_id)
    data = json_body()
    errors: dict = {}
    updates: dict = {}

    for field, label, max_len in (("title", "Title", 200), ("service", "Service", 100)):
        if field in data:
            value = check_text(data, field, label, errors, required=True, max_len=max_len)
            if value is not None:
                updates[field] = value
    for field, label, max_len in (("commander", "Commander", 100), ("impact_summary", "Impact summary", 5000)):
        if field in data:
            value = check_text(data, field, label, errors, required=False, max_len=max_len, nullable=True)
            if field not in errors:
                updates[field] = value
    if "severity" in data:
        value = check_choice(data, "severity", "Severity", SEVERITIES, errors, required=True)
        if value is not None:
            updates["severity"] = value
    new_status = None
    if "status" in data:
        new_status = check_choice(data, "status", "Status", STATUSES, errors, required=True)
    if errors:
        raise ApiError(400, "Validation failed", errors)

    now = utcnow()
    event = None
    old_status = row["status"]
    if new_status is not None and new_status != old_status:
        updates["status"] = new_status
        if new_status == "resolved":
            updates["resolved_at"] = fmt(now)
        elif old_status == "resolved":
            updates["resolved_at"] = None
            updates["reopen_count"] = row["reopen_count"] + 1
        event = f"Status changed from {old_status} to {new_status}"

    db = get_db()
    if updates:
        assignments = ", ".join(f"{k} = ?" for k in updates)
        db.execute(f"UPDATE incidents SET {assignments} WHERE id = ?", [*updates.values(), incident_id])
    if event:
        db.execute(
            "INSERT INTO events (incident_id, type, message, created_at, author) VALUES (?, 'status_change', ?, ?, ?)",
            (incident_id, event, fmt(now), user["username"]),
        )
    db.commit()
    return incident_json(load_incident(incident_id))


@app.get("/api/incidents/<int:incident_id>/timeline")
def get_timeline(incident_id: int):
    current_user()
    load_incident(incident_id)
    rows = (
        get_db()
        .execute("SELECT * FROM events WHERE incident_id = ? ORDER BY created_at ASC, id ASC", (incident_id,))
        .fetchall()
    )
    return {"items": [event_json(r) for r in rows]}


@app.post("/api/incidents/<int:incident_id>/timeline")
def add_timeline_event(incident_id: int):
    user = current_user()
    load_incident(incident_id)
    data = json_body()
    errors: dict = {}
    message = check_text(data, "message", "Message", errors, required=True, max_len=5000)
    event_type = "note"
    if data.get("type") is not None:
        event_type = check_choice(data, "type", "Type", EVENT_TYPES, errors, required=True)
    if errors:
        raise ApiError(400, "Validation failed", errors)
    db = get_db()
    cur = db.execute(
        "INSERT INTO events (incident_id, type, message, created_at, author) VALUES (?, ?, ?, ?, ?)",
        (incident_id, event_type, message, fmt(utcnow()), user["username"]),
    )
    db.commit()
    row = db.execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(event_json(row)), 201




@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    now = utcnow()
    open_rows = db.execute(
        "SELECT severity, status, opened_at, resolved_at FROM incidents WHERE status != 'resolved'"
    ).fetchall()
    by_severity = {s: 0 for s in SEVERITIES}
    breached = 0
    for r in open_rows:
        by_severity[r["severity"]] = by_severity.get(r["severity"], 0) + 1
        if is_breached(r, now):
            breached += 1
    resolved_recent = db.execute(
        "SELECT COUNT(*) FROM incidents WHERE status = 'resolved' AND resolved_at >= ?",
        (fmt(now - timedelta(days=30)),),
    ).fetchone()[0]
    return {
        "open_total": len(open_rows),
        "open_by_severity": by_severity,
        "sla_breached_open": breached,
        "resolved_last_30_days": resolved_recent,
    }




@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        raise ApiError(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
