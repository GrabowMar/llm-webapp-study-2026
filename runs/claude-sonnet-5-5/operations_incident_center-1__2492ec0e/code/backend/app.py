"""Incident center: Flask JSON API plus the built frontend."""

import hashlib
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash, safe_join

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "incidents.db"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
STATUSES = ("investigating", "identified", "monitoring", "resolved")
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
TOKEN_TTL = timedelta(days=7)
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
EVENT_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]{0,29}$")
DUMMY_HASH = generate_password_hash("not-a-real-password")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.json.sort_keys = False


def now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


def db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
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
    opened_by INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_incidents_opened ON incidents(opened_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id INTEGER NOT NULL REFERENCES incidents(id),
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    author INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_events_incident ON events(incident_id, created_at, id);
"""


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15, isolation_level=None)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
    finally:
        conn.close()


init_db()


class ApiError(Exception):
    def __init__(self, status, message, fields=None):
        self.status = status
        self.message = message
        self.fields = fields


def error_response(status, message, fields=None):
    body = {"error": message}
    if fields:
        body["fields"] = fields
    return jsonify(body), status


@app.errorhandler(ApiError)
def handle_api_error(exc):
    return error_response(exc.status, exc.message, exc.fields)


@app.errorhandler(HTTPException)
def handle_http_error(exc):
    return error_response(exc.code or 500, exc.description or exc.name)


@app.errorhandler(Exception)
def handle_unexpected(_exc):
    app.logger.exception("unhandled error")
    return error_response(500, "Internal server error")


def validation(fields):
    return ApiError(400, "Validation failed", fields)


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object")
    return data


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise ApiError(401, "Authentication required")
    token = parts[1].strip()
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or parse(row["expires_at"]) <= now():
        raise ApiError(401, "Invalid or expired token")
    return row


@app.before_request
def guard():
    path = request.path
    if request.method == "OPTIONS" or not path.startswith("/api/incidents"):
        return None
    g.user = current_user()
    return None


# ---------------------------------------------------------------- accounts


def credentials():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    return data, username, password


@app.post("/api/auth/register")
def register():
    _, username, password = credentials()
    fields = {}
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        fields["username"] = (
            "Username must be 3-32 characters: letters, digits, '.', '_' or '-'"
        )
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        fields["password"] = "Password must be 8-128 characters"
    if fields:
        raise validation(fields)
    username = username.strip()
    conn = db()
    try:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), fmt(now())),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "Username already taken", {"username": "Username already taken"})
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    _, username, password = credentials()
    if not isinstance(username, str) or not isinstance(password, str):
        raise validation({"username": "Required", "password": "Required"})
    row = db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None:
        check_password_hash(DUMMY_HASH, password)
        raise ApiError(401, "Invalid username or password")
    if not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute("DELETE FROM tokens WHERE expires_at <= ?", (fmt(now()),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], fmt(now() + TOKEN_TTL)),
    )
    return jsonify({"token": token})


# --------------------------------------------------------------- incidents

INCIDENT_SELECT = (
    "SELECT i.*, u.username AS opened_by_name FROM incidents i "
    "JOIN users u ON u.id = i.opened_by"
)


def sla_due(opened_at: str, severity: str) -> datetime:
    return parse(opened_at) + timedelta(minutes=SLA_MINUTES[severity])


def incident_json(row, at=None):
    at = at or now()
    due = sla_due(row["opened_at"], row["severity"])
    if row["resolved_at"]:
        breached = parse(row["resolved_at"]) > due
    else:
        breached = at > due
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
        "opened_by": row["opened_by_name"],
        "sla_due_at": fmt(due),
        "sla_breached": breached,
    }


def event_json(row):
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author_name"],
    }


def load_incident(incident_id: int):
    row = db().execute(INCIDENT_SELECT + " WHERE i.id = ?", (incident_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Incident not found")
    return row


def clean_text(value, field, fields, *, required, max_len):
    if value is None:
        if required:
            fields[field] = "Required"
        return None
    if not isinstance(value, str):
        fields[field] = "Must be a string"
        return None
    value = value.strip()
    if not value:
        if required:
            fields[field] = "Required"
        return None
    if len(value) > max_len:
        fields[field] = f"Must be at most {max_len} characters"
        return None
    return value


def clean_enum(value, field, fields, allowed):
    if not isinstance(value, str) or value not in allowed:
        fields[field] = "Must be one of: " + ", ".join(allowed)
        return None
    return value


def parse_bool(value):
    v = value.strip().lower()
    if v in ("1", "true", "yes", "on"):
        return True
    if v in ("0", "false", "no", "off"):
        return False
    raise validation({"open": "Must be true or false"})


def parse_int(name, default, minimum, maximum):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise validation({name: "Must be an integer"})
    if value < minimum or (maximum is not None and value > maximum):
        limit = f"between {minimum} and {maximum}" if maximum else f"at least {minimum}"
        raise validation({name: f"Must be {limit}"})
    return value


@app.get("/api/incidents")
def list_incidents():
    where, params = [], []
    severity = request.args.get("severity")
    if severity:
        if severity not in SEVERITIES:
            raise validation({"severity": "Must be one of: " + ", ".join(SEVERITIES)})
        where.append("i.severity = ?")
        params.append(severity)
    status = request.args.get("status")
    if status:
        if status not in STATUSES:
            raise validation({"status": "Must be one of: " + ", ".join(STATUSES)})
        where.append("i.status = ?")
        params.append(status)
    open_arg = request.args.get("open")
    if open_arg:
        where.append("i.status != 'resolved'" if parse_bool(open_arg) else "i.status = 'resolved'")
    q = (request.args.get("q") or "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        where.append(
            "(i.title LIKE ? ESCAPE '\\' OR i.service LIKE ? ESCAPE '\\' "
            "OR i.impact_summary LIKE ? ESCAPE '\\' OR i.commander LIKE ? ESCAPE '\\')"
        )
        params.extend([like] * 4)
    page = parse_int("page", 1, 1, None)
    page_size = parse_int("page_size", 20, 1, 100)
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM incidents i{clause}", params).fetchone()[0]
    rows = conn.execute(
        f"{INCIDENT_SELECT}{clause} ORDER BY i.opened_at DESC, i.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    at = now()
    return jsonify(
        {
            "items": [incident_json(r, at) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
def create_incident():
    data = json_body()
    fields = {}
    title = clean_text(data.get("title"), "title", fields, required=True, max_len=200)
    service = clean_text(data.get("service"), "service", fields, required=True, max_len=100)
    severity = clean_enum(data.get("severity"), "severity", fields, SEVERITIES)
    commander = clean_text(data.get("commander"), "commander", fields, required=False, max_len=100)
    impact = clean_text(
        data.get("impact_summary"), "impact_summary", fields, required=False, max_len=2000
    )
    if fields:
        raise validation(fields)
    cur = db().execute(
        "INSERT INTO incidents (title, service, severity, status, commander, impact_summary, "
        "opened_at, opened_by) VALUES (?, ?, ?, 'investigating', ?, ?, ?, ?)",
        (title, service, severity, commander, impact, fmt(now()), g.user["id"]),
    )
    return jsonify(incident_json(load_incident(cur.lastrowid))), 201


@app.get("/api/incidents/<int:incident_id>")
def get_incident(incident_id):
    return jsonify(incident_json(load_incident(incident_id)))


@app.patch("/api/incidents/<int:incident_id>")
def update_incident(incident_id):
    data = json_body()
    fields = {}
    changes = {}
    if "title" in data:
        v = clean_text(data["title"], "title", fields, required=True, max_len=200)
        changes["title"] = v
    if "service" in data:
        v = clean_text(data["service"], "service", fields, required=True, max_len=100)
        changes["service"] = v
    if "severity" in data:
        changes["severity"] = clean_enum(data["severity"], "severity", fields, SEVERITIES)
    if "status" in data:
        changes["status"] = clean_enum(data["status"], "status", fields, STATUSES)
    if "commander" in data:
        changes["commander"] = clean_text(
            data["commander"], "commander", fields, required=False, max_len=100
        )
    if "impact_summary" in data:
        changes["impact_summary"] = clean_text(
            data["impact_summary"], "impact_summary", fields, required=False, max_len=2000
        )
    if fields:
        raise validation(fields)

    conn = db()
    conn.execute("BEGIN IMMEDIATE")
    try:
        row = load_incident(incident_id)
        old_status = row["status"]
        new_status = changes.get("status", old_status)
        if new_status != old_status:
            stamp = fmt(now())
            if new_status == "resolved":
                changes["resolved_at"] = stamp
            elif old_status == "resolved":
                changes["resolved_at"] = None
                changes["reopen_count"] = row["reopen_count"] + 1
            conn.execute(
                "INSERT INTO events (incident_id, type, message, created_at, author) "
                "VALUES (?, 'status_change', ?, ?, ?)",
                (
                    incident_id,
                    f"Status changed from {old_status} to {new_status}",
                    stamp,
                    g.user["id"],
                ),
            )
        if changes:
            assignments = ", ".join(f"{k} = ?" for k in changes)
            conn.execute(
                f"UPDATE incidents SET {assignments} WHERE id = ?",
                [*changes.values(), incident_id],
            )
        conn.execute("COMMIT")
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    return jsonify(incident_json(load_incident(incident_id)))


@app.get("/api/incidents/<int:incident_id>/timeline")
def get_timeline(incident_id):
    load_incident(incident_id)
    rows = db().execute(
        "SELECT e.*, u.username AS author_name FROM events e JOIN users u ON u.id = e.author "
        "WHERE e.incident_id = ? ORDER BY e.created_at ASC, e.id ASC",
        (incident_id,),
    ).fetchall()
    return jsonify({"items": [event_json(r) for r in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
def post_timeline(incident_id):
    data = json_body()
    load_incident(incident_id)
    fields = {}
    message = clean_text(data.get("message"), "message", fields, required=True, max_len=2000)
    etype = data.get("type", "note")
    if etype is None:
        etype = "note"
    if not isinstance(etype, str) or not EVENT_TYPE_RE.match(etype):
        fields["type"] = "Must be a lowercase identifier of at most 30 characters"
    elif etype == "status_change":
        fields["type"] = "status_change events are created by status updates"
    if fields:
        raise validation(fields)
    conn = db()
    cur = conn.execute(
        "INSERT INTO events (incident_id, type, message, created_at, author) "
        "VALUES (?, ?, ?, ?, ?)",
        (incident_id, etype, message, fmt(now()), g.user["id"]),
    )
    row = conn.execute(
        "SELECT e.*, u.username AS author_name FROM events e JOIN users u ON u.id = e.author "
        "WHERE e.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(event_json(row)), 201


# ------------------------------------------------------------------- public


@app.get("/api/public/stats")
def public_stats():
    conn = db()
    at = now()
    by_sev = {s: 0 for s in SEVERITIES}
    breached = 0
    for row in conn.execute(
        "SELECT severity, opened_at FROM incidents WHERE status != 'resolved'"
    ):
        by_sev[row["severity"]] += 1
        if at > sla_due(row["opened_at"], row["severity"]):
            breached += 1
    resolved = conn.execute(
        "SELECT COUNT(*) FROM incidents WHERE status = 'resolved' AND resolved_at >= ?",
        (fmt(at - timedelta(days=30)),),
    ).fetchone()[0]
    return jsonify(
        {
            "open_total": sum(by_sev.values()),
            "open_by_severity": by_sev,
            "sla_breached_open": breached,
            "resolved_last_30_days": resolved,
        }
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ----------------------------------------------------------------- frontend


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>")
def api_not_found(path):
    raise ApiError(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    target = safe_join(str(DIST), path)
    if target and Path(target).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
