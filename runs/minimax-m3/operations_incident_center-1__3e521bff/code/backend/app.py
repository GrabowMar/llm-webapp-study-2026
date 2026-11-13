"""Flask entry point for the incident center.

The app exposes a JSON API under ``/api`` and serves the built React frontend
from ``frontend/dist``.  Data is stored in SQLite under ``./data``.
"""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "incident_center.db"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
SLA_TARGET_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}

# Statuses an incident may hold.  ``resolved``/``closed`` are terminal.
STATUSES = ("investigating", "identified", "monitoring", "resolved", "open", "closed")
TERMINAL_STATUSES = ("resolved", "closed")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,64}$")

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# database helpers
# ---------------------------------------------------------------------------


def get_db() -> sqlite3.Connection:
    """Return the request scoped SQLite connection."""
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=30000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS incidents (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                title          TEXT NOT NULL,
                service        TEXT NOT NULL DEFAULT '',
                severity       TEXT NOT NULL,
                status         TEXT NOT NULL DEFAULT 'investigating',
                commander      TEXT NOT NULL DEFAULT '',
                impact_summary TEXT NOT NULL DEFAULT '',
                opened_at      TEXT NOT NULL,
                resolved_at    TEXT,
                reopen_count   INTEGER NOT NULL DEFAULT 0,
                opened_by      TEXT NOT NULL DEFAULT '',
                opened_by_id   INTEGER
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL,
                type        TEXT NOT NULL DEFAULT 'note',
                message     TEXT NOT NULL DEFAULT '',
                created_at  TEXT NOT NULL,
                author      TEXT NOT NULL DEFAULT '',
                author_id   INTEGER,
                FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_incidents_opened_at
                ON incidents (opened_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_timeline_incident
                ON timeline_events (incident_id, created_at, id);
            """
        )
        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def error(message: str, status: int = 400, errors: dict | None = None):
    payload: dict = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def body() -> dict:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    return {}


def as_text(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip()
    return None


# ---------------------------------------------------------------------------
# authentication
# ---------------------------------------------------------------------------


def user_for_token(token: str | None):
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id AS id, u.username AS username FROM tokens t"
        " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "") or ""
    if header.lower().startswith("bearer "):
        token = header[7:].strip()
        return token or None
    return None


def current_user():
    if "_user" not in g:
        g._user = user_for_token(bearer_token())
    return g._user


def require_user():
    user = current_user()
    if user is None:
        return error("authentication required", 401)
    return user


# ---------------------------------------------------------------------------
# serialization
# ---------------------------------------------------------------------------


def serialize_incident(row: sqlite3.Row, reference: datetime | None = None) -> dict:
    reference = reference or now_utc()
    opened_at = parse_iso(row["opened_at"])
    severity = row["severity"]
    target = SLA_TARGET_MINUTES.get(severity, SLA_TARGET_MINUTES["sev4"])
    due_at = opened_at + timedelta(minutes=target)
    resolved_at = parse_iso(row["resolved_at"])
    if resolved_at is not None:
        breached = resolved_at > due_at
    else:
        breached = reference > due_at
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
        "sla_due_at": to_iso(due_at),
        "sla_breached": bool(breached),
    }


def serialize_event(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


# ---------------------------------------------------------------------------
# api: health
# ---------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# api: auth
# ---------------------------------------------------------------------------


@app.post("/api/auth/register")
def register():
    data = body()
    username = as_text(data.get("username"))
    password = data.get("password")

    errors: dict[str, str] = {}
    if not username:
        errors["username"] = "username is required"
    elif not USERNAME_RE.match(username):
        errors["username"] = (
            "username must be 3-64 characters and may only contain letters, "
            "digits, dots, dashes and underscores"
        )
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    elif len(password) < 6:
        errors["password"] = "password must be at least 6 characters"
    if errors:
        return error("validation failed", 400, errors)

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return error("username is already taken", 400, {"username": "username is already taken"})

    created_at = to_iso(now_utc())
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), created_at),
        )
    except sqlite3.IntegrityError:
        db.rollback()
        return error("username is already taken", 400, {"username": "username is already taken"})

    user_id = cursor.lastrowid
    db.commit()
    return jsonify({"id": user_id, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = body()
    username = as_text(data.get("username"))
    password = data.get("password")
    if not username or not isinstance(password, str) or not password:
        return error("username and password are required", 400)

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], to_iso(now_utc())),
    )
    db.commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.post("/api/auth/logout")
def logout():
    token = bearer_token()
    if token:
        db = get_db()
        db.execute("DELETE FROM tokens WHERE token = ?", (token,))
        db.commit()
    return jsonify({"status": "ok"}), 200


@app.get("/api/auth/me")
def me():
    user = require_user()
    if isinstance(user, tuple):
        return user
    return jsonify({"id": user["id"], "username": user["username"]})


# ---------------------------------------------------------------------------
# api: incidents
# ---------------------------------------------------------------------------


def parse_bool(value) -> bool | None:
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in ("1", "true", "yes", "on"):
        return True
    if text in ("0", "false", "no", "off"):
        return False
    return None


def fetch_incident(incident_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()


@app.get("/api/incidents")
def list_incidents():
    user = require_user()
    if isinstance(user, tuple):
        return user

    where: list[str] = []
    params: list = []

    severity = as_text(request.args.get("severity"))
    if severity:
        wanted = [s.strip().lower() for s in severity.split(",") if s.strip()]
        wanted = [s for s in wanted if s in SEVERITIES]
        if wanted:
            where.append(
                "LOWER(severity) IN (%s)" % ",".join("?" for _ in wanted)
            )
            params.extend(wanted)

    status = as_text(request.args.get("status"))
    if status:
        wanted = [s.strip().lower() for s in status.split(",") if s.strip()]
        wanted = [s for s in wanted if s in STATUSES]
        if wanted:
            where.append(
                "LOWER(status) IN (%s)" % ",".join("?" for _ in wanted)
            )
            params.extend(wanted)

    only_open = parse_bool(request.args.get("open"))
    if only_open is True:
        where.append("LOWER(status) NOT IN (%s)" % ",".join("?" for _ in TERMINAL_STATUSES))
        params.extend(TERMINAL_STATUSES)
    elif only_open is False:
        where.append("LOWER(status) IN (%s)" % ",".join("?" for _ in TERMINAL_STATUSES))
        params.extend(TERMINAL_STATUSES)

    query = as_text(request.args.get("q"))
    if query:
        needle = f"%{query.lower()}%"
        where.append(
            "(LOWER(title) LIKE ? OR LOWER(service) LIKE ? OR LOWER(commander) LIKE ?"
            " OR LOWER(impact_summary) LIKE ? OR LOWER(opened_by) LIKE ?"
            " OR CAST(id AS TEXT) = ?)"
        )
        params.extend([needle, needle, needle, needle, needle, query])

    clause = (" WHERE " + " AND ".join(where)) if where else ""

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS n FROM incidents" + clause, params
    ).fetchone()["n"]

    page = 1
    raw_page = as_text(request.args.get("page"))
    if raw_page:
        try:
            page = int(raw_page)
        except ValueError:
            page = 1
    page = max(1, page)

    page_size = DEFAULT_PAGE_SIZE
    raw_size = as_text(request.args.get("page_size"))
    if raw_size:
        try:
            page_size = int(raw_size)
        except ValueError:
            page_size = DEFAULT_PAGE_SIZE
    if page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    page_size = min(page_size, MAX_PAGE_SIZE)

    rows = db.execute(
        "SELECT * FROM incidents" + clause + " ORDER BY opened_at DESC, id DESC"
        " LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()

    reference = now_utc()
    return jsonify(
        {
            "items": [serialize_incident(row, reference) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
def create_incident():
    user = require_user()
    if isinstance(user, tuple):
        return user

    data = body()
    errors: dict[str, str] = {}

    title = as_text(data.get("title"))
    if not title:
        errors["title"] = "title is required"

    severity = (as_text(data.get("severity")) or "").lower()
    if not severity:
        errors["severity"] = "severity is required"
    elif severity not in SEVERITIES:
        errors["severity"] = "severity must be one of " + ", ".join(SEVERITIES)

    service = as_text(data.get("service"))
    commander = as_text(data.get("commander"))
    impact_summary = as_text(data.get("impact_summary"))

    status = (as_text(data.get("status")) or "investigating").lower()
    if status not in STATUSES:
        errors["status"] = "status must be one of " + ", ".join(STATUSES)

    if errors:
        return error("validation failed", 400, errors)

    opened_at = to_iso(now_utc())
    resolved_at = to_iso(now_utc()) if status in TERMINAL_STATUSES else None
    db = get_db()
    cursor = db.execute(
        "INSERT INTO incidents (title, service, severity, status, commander,"
        " impact_summary, opened_at, resolved_at, reopen_count, opened_by, opened_by_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        (
            title,
            service or "",
            severity,
            status,
            commander or "",
            impact_summary or "",
            opened_at,
            resolved_at,
            user["username"],
            user["id"],
        ),
    )
    incident_id = cursor.lastrowid
    db.commit()

    row = fetch_incident(incident_id)
    return jsonify(serialize_incident(row)), 201


@app.get("/api/incidents/<int:incident_id>")
def get_incident(incident_id: int):
    user = require_user()
    if isinstance(user, tuple):
        return user

    row = fetch_incident(incident_id)
    if row is None:
        return error("incident not found", 404)
    return jsonify(serialize_incident(row))


@app.patch("/api/incidents/<int:incident_id>")
def patch_incident(incident_id: int):
    user = require_user()
    if isinstance(user, tuple):
        return user

    row = fetch_incident(incident_id)
    if row is None:
        return error("incident not found", 404)

    data = body()
    errors: dict[str, str] = {}

    updates: dict[str, object] = {}

    if "title" in data:
        title = as_text(data.get("title"))
        if not title:
            errors["title"] = "title cannot be empty"
        else:
            updates["title"] = title

    if "service" in data:
        updates["service"] = as_text(data.get("service")) or ""

    if "commander" in data:
        updates["commander"] = as_text(data.get("commander")) or ""

    if "impact_summary" in data:
        updates["impact_summary"] = as_text(data.get("impact_summary")) or ""

    if "severity" in data:
        severity = (as_text(data.get("severity")) or "").lower()
        if severity not in SEVERITIES:
            errors["severity"] = "severity must be one of " + ", ".join(SEVERITIES)
        else:
            updates["severity"] = severity

    old_status = row["status"]
    new_status = None
    if "status" in data:
        new_status = (as_text(data.get("status")) or "").lower()
        if new_status not in STATUSES:
            errors["status"] = "status must be one of " + ", ".join(STATUSES)

    if errors:
        return error("validation failed", 400, errors)

    db = get_db()
    status_changed = new_status is not None and new_status != old_status
    if status_changed:
        updates["status"] = new_status

    if updates:
        assignments = ", ".join(f"{key} = ?" for key in updates)
        db.execute(
            f"UPDATE incidents SET {assignments} WHERE id = ?",
            list(updates.values()) + [incident_id],
        )

    if status_changed:
        if new_status in TERMINAL_STATUSES:
            if not row["resolved_at"]:
                db.execute(
                    "UPDATE incidents SET resolved_at = ? WHERE id = ?",
                    (to_iso(now_utc()), incident_id),
                )
        else:
            if old_status in TERMINAL_STATUSES:
                db.execute(
                    "UPDATE incidents SET reopen_count = reopen_count + 1, resolved_at = NULL"
                    " WHERE id = ?",
                    (incident_id,),
                )
        db.execute(
            "INSERT INTO timeline_events (incident_id, type, message, created_at,"
            " author, author_id) VALUES (?, 'status_change', ?, ?, ?, ?)",
            (
                incident_id,
                f"Status changed from {old_status} to {new_status}",
                to_iso(now_utc()),
                user["username"],
                user["id"],
            ),
        )

    db.commit()
    return jsonify(serialize_incident(fetch_incident(incident_id)))


# ---------------------------------------------------------------------------
# api: timeline
# ---------------------------------------------------------------------------


@app.get("/api/incidents/<int:incident_id>/timeline")
def list_timeline(incident_id: int):
    row = fetch_incident(incident_id)
    if row is None:
        return error("incident not found", 404)
    rows = get_db().execute(
        "SELECT * FROM timeline_events WHERE incident_id = ?"
        " ORDER BY created_at ASC, id ASC",
        (incident_id,),
    ).fetchall()
    return jsonify({"items": [serialize_event(event) for event in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
def create_timeline_event(incident_id: int):
    user = require_user()
    if isinstance(user, tuple):
        return user

    row = fetch_incident(incident_id)
    if row is None:
        return error("incident not found", 404)

    data = body()
    message = as_text(data.get("message"))
    if not message:
        return error("validation failed", 400, {"message": "message is required"})

    event_type = as_text(data.get("type")) or "note"
    db = get_db()
    cursor = db.execute(
        "INSERT INTO timeline_events (incident_id, type, message, created_at, author,"
        " author_id) VALUES (?, ?, ?, ?, ?, ?)",
        (
            incident_id,
            event_type,
            message,
            to_iso(now_utc()),
            user["username"],
            user["id"],
        ),
    )
    db.commit()
    event = db.execute(
        "SELECT * FROM timeline_events WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize_event(event)), 201


# ---------------------------------------------------------------------------
# api: public stats
# ---------------------------------------------------------------------------


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    reference = now_utc()

    open_clause = "LOWER(status) NOT IN (%s)" % ",".join("?" for _ in TERMINAL_STATUSES)
    open_rows = db.execute(
        "SELECT * FROM incidents WHERE " + open_clause, list(TERMINAL_STATUSES)
    ).fetchall()

    open_by_severity = {severity: 0 for severity in SEVERITIES}
    breached_open = 0
    for row in open_rows:
        severity = row["severity"]
        if severity in open_by_severity:
            open_by_severity[severity] += 1
        opened_at = parse_iso(row["opened_at"])
        target = SLA_TARGET_MINUTES.get(severity, SLA_TARGET_MINUTES["sev4"])
        if reference > opened_at + timedelta(minutes=target):
            breached_open += 1

    cutoff = reference - timedelta(days=30)
    resolved_last_30_days = 0
    for row in db.execute(
        "SELECT resolved_at FROM incidents WHERE resolved_at IS NOT NULL"
    ).fetchall():
        resolved_at = parse_iso(row["resolved_at"])
        if resolved_at is not None and resolved_at >= cutoff:
            resolved_last_30_days += 1

    return jsonify(
        {
            "open_total": len(open_rows),
            "open_by_severity": open_by_severity,
            "sla_breached_open": breached_open,
            "resolved_last_30_days": resolved_last_30_days,
        }
    )


# ---------------------------------------------------------------------------
# frontend
# ---------------------------------------------------------------------------


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    return frontend("index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return (
            "<!doctype html><html><head><title>Incident center</title></head>"
            "<body><p>The frontend build is missing.</p></body></html>",
            200,
        )
    return send_from_directory(DIST, "index.html")


init_db()
