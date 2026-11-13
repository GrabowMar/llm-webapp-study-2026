"""Incident center API and frontend host."""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "incident_center.db"

SEVERITIES = ("sev1", "sev2", "sev3", "sev4")
SLA_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
OPEN_STATUSES_SQL = "status != 'resolved'"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(value: datetime) -> str:
    return value.isoformat()


def parse_iso(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_error: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
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
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS timeline_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                author TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_incidents_opened
                ON incidents(opened_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_incidents_severity
                ON incidents(severity);
            CREATE INDEX IF NOT EXISTS idx_incidents_status
                ON incidents(status);
            CREATE INDEX IF NOT EXISTS idx_timeline_incident
                ON timeline_events(incident_id, created_at, id);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()


def api_error(message: str, status: int, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def json_body() -> dict[str, Any] | None:
    if not request.is_json:
        return None
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return None
    return body


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    token = token.strip()
    row = get_db().execute(
        """
        SELECT users.id, users.username
        FROM tokens JOIN users ON users.id = tokens.user_id
        WHERE tokens.token = ?
        """,
        (token,),
    ).fetchone()
    return row


def auth_required(view: Callable[..., Any]):
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any):
        user = current_user()
        if user is None:
            return api_error("Authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def incident_payload(row: sqlite3.Row) -> dict[str, Any]:
    opened_at = parse_iso(row["opened_at"])
    due_at = opened_at + timedelta(minutes=SLA_MINUTES.get(row["severity"], 0))
    if row["resolved_at"] is not None:
        resolved_at = parse_iso(row["resolved_at"])
        breached = resolved_at > due_at
    else:
        breached = now() > due_at
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
        "sla_due_at": iso(due_at),
        "sla_breached": breached,
    }


def event_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


def fetch_incident(incident_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()


def add_event(incident_id: int, event_type: str, message: str, author: str) -> None:
    get_db().execute(
        """
        INSERT INTO timeline_events (incident_id, type, message, created_at, author)
        VALUES (?, ?, ?, ?, ?)
        """,
        (incident_id, event_type, message, iso(now()), author),
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    if body is None:
        return api_error("A JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    errors: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return api_error("Please correct the highlighted fields", 400, errors)

    username = username.strip()
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return api_error(
            "Username is already taken", 409, {"username": "Username is already taken."}
        )
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), iso(now())),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    if body is None:
        return api_error("A JSON body is required", 400)
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return api_error("Username and password are required", 400)
    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return api_error("Invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], iso(now())),
    )
    db.commit()
    return jsonify({"token": token}), 200


@app.get("/api/incidents")
@auth_required
def list_incidents():
    db = get_db()
    clauses: list[str] = []
    params: list[Any] = []

    severity = request.args.get("severity", "").strip()
    if severity:
        if severity not in SEVERITIES:
            return api_error("Unknown severity", 400)
        clauses.append("severity = ?")
        params.append(severity)

    status = request.args.get("status", "").strip()
    if status:
        clauses.append("status = ?")
        params.append(status)

    open_param = request.args.get("open", "").strip().lower()
    if open_param in ("1", "true", "yes", "on"):
        clauses.append(OPEN_STATUSES_SQL)
    elif open_param in ("0", "false", "no", "off"):
        clauses.append("status = 'resolved'")

    q = request.args.get("q", "").strip()
    if q:
        like = f"%{q}%"
        clauses.append(
            "(title LIKE ? COLLATE NOCASE OR service LIKE ? COLLATE NOCASE "
            "OR commander LIKE ? COLLATE NOCASE "
            "OR impact_summary LIKE ? COLLATE NOCASE)"
        )
        params.extend([like, like, like, like])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    try:
        page = int(request.args.get("page", "1"))
    except (TypeError, ValueError):
        page = 1
    try:
        page_size = int(request.args.get("page_size", "20"))
    except (TypeError, ValueError):
        page_size = 20
    page = max(page, 1)
    page_size = max(1, page_size)

    total = db.execute(
        f"SELECT COUNT(*) AS n FROM incidents {where}", params
    ).fetchone()["n"]
    rows = db.execute(
        f"SELECT * FROM incidents {where} ORDER BY opened_at DESC, id DESC "
        "LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [incident_payload(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/incidents")
@auth_required
def create_incident():
    body = json_body()
    if body is None:
        return api_error("A JSON body is required", 400)

    errors: dict[str, str] = {}
    title = body.get("title")
    service = body.get("service")
    severity = body.get("severity")
    commander = body.get("commander")
    impact_summary = body.get("impact_summary")

    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    if not isinstance(service, str) or not service.strip():
        errors["service"] = "Service is required."
    if not isinstance(severity, str) or severity not in SEVERITIES:
        errors["severity"] = "Severity must be one of sev1, sev2, sev3 or sev4."
    if commander is not None and not isinstance(commander, str):
        errors["commander"] = "Commander must be text."
    if impact_summary is not None and not isinstance(impact_summary, str):
        errors["impact_summary"] = "Impact summary must be text."
    if errors:
        return api_error("Please correct the highlighted fields", 400, errors)

    db = get_db()
    stamp = iso(now())
    cur = db.execute(
        """
        INSERT INTO incidents
            (title, service, severity, status, commander, impact_summary,
             opened_at, resolved_at, reopen_count, opened_by, updated_at)
        VALUES (?, ?, ?, 'investigating', ?, ?, ?, NULL, 0, ?, ?)
        """,
        (
            title.strip(),
            service.strip(),
            severity,
            commander.strip() if isinstance(commander, str) else None,
            impact_summary.strip() if isinstance(impact_summary, str) else None,
            stamp,
            g.user["username"],
            stamp,
        ),
    )
    db.commit()
    return jsonify(incident_payload(fetch_incident(cur.lastrowid))), 201


@app.get("/api/incidents/<int:incident_id>")
@auth_required
def get_incident(incident_id: int):
    row = fetch_incident(incident_id)
    if row is None:
        return api_error("Incident not found", 404)
    return jsonify(incident_payload(row))


@app.patch("/api/incidents/<int:incident_id>")
@auth_required
def update_incident(incident_id: int):
    row = fetch_incident(incident_id)
    if row is None:
        return api_error("Incident not found", 404)
    body = json_body()
    if body is None:
        return api_error("A JSON body is required", 400)

    errors: dict[str, str] = {}
    updates: dict[str, Any] = {}

    if "title" in body:
        title = body["title"]
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required."
        else:
            updates["title"] = title.strip()

    if "service" in body:
        service = body["service"]
        if not isinstance(service, str) or not service.strip():
            errors["service"] = "Service is required."
        else:
            updates["service"] = service.strip()

    if "severity" in body:
        severity = body["severity"]
        if not isinstance(severity, str) or severity not in SEVERITIES:
            errors["severity"] = "Severity must be one of sev1, sev2, sev3 or sev4."
        else:
            updates["severity"] = severity

    if "status" in body:
        status = body["status"]
        if not isinstance(status, str) or not status.strip():
            errors["status"] = "Status is required."
        else:
            updates["status"] = status.strip()

    if "commander" in body:
        commander = body["commander"]
        if commander is not None and not isinstance(commander, str):
            errors["commander"] = "Commander must be text."
        else:
            updates["commander"] = commander.strip() if isinstance(commander, str) else None

    if "impact_summary" in body:
        impact_summary = body["impact_summary"]
        if impact_summary is not None and not isinstance(impact_summary, str):
            errors["impact_summary"] = "Impact summary must be text."
        else:
            updates["impact_summary"] = (
                impact_summary.strip() if isinstance(impact_summary, str) else None
            )

    if errors:
        return api_error("Please correct the highlighted fields", 400, errors)

    old_status = row["status"]
    new_status = updates.get("status", old_status)
    timestamp = iso(now())

    if "status" in updates and new_status != old_status:
        if new_status == "resolved":
            updates["resolved_at"] = timestamp
        elif old_status == "resolved":
            updates["resolved_at"] = None
            updates["reopen_count"] = row["reopen_count"] + 1

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        get_db().execute(
            f"UPDATE incidents SET {assignments}, updated_at = ? WHERE id = ?",
            [*updates.values(), timestamp, incident_id],
        )
        if "status" in updates and new_status != old_status:
            add_event(
                incident_id,
                "status_change",
                f"Status changed from {old_status} to {new_status}",
                g.user["username"],
            )
        get_db().commit()

    return jsonify(incident_payload(fetch_incident(incident_id)))


@app.get("/api/incidents/<int:incident_id>/timeline")
@auth_required
def get_timeline(incident_id: int):
    if fetch_incident(incident_id) is None:
        return api_error("Incident not found", 404)
    rows = get_db().execute(
        "SELECT * FROM timeline_events WHERE incident_id = ? "
        "ORDER BY created_at ASC, id ASC",
        (incident_id,),
    ).fetchall()
    return jsonify({"items": [event_payload(row) for row in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
@auth_required
def create_timeline_event(incident_id: int):
    if fetch_incident(incident_id) is None:
        return api_error("Incident not found", 404)
    body = json_body()
    if body is None:
        return api_error("A JSON body is required", 400)

    message = body.get("message")
    event_type = body.get("type", "comment")
    errors: dict[str, str] = {}
    if not isinstance(message, str) or not message.strip():
        errors["message"] = "Message is required."
    if not isinstance(event_type, str) or not event_type.strip():
        errors["type"] = "Type is required."
    if errors:
        return api_error("Please correct the highlighted fields", 400, errors)

    db = get_db()
    cur = db.execute(
        """
        INSERT INTO timeline_events (incident_id, type, message, created_at, author)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            incident_id,
            event_type.strip(),
            message.strip(),
            iso(now()),
            g.user["username"],
        ),
    )
    db.commit()
    event = db.execute(
        "SELECT * FROM timeline_events WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    return jsonify(event_payload(event)), 201


@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    open_by_severity = {severity: 0 for severity in SEVERITIES}
    rows = db.execute(
        f"SELECT severity, COUNT(*) AS n FROM incidents "
        f"WHERE {OPEN_STATUSES_SQL} GROUP BY severity"
    ).fetchall()
    for row in rows:
        if row["severity"] in open_by_severity:
            open_by_severity[row["severity"]] = row["n"]

    open_rows = db.execute(
        f"SELECT * FROM incidents WHERE {OPEN_STATUSES_SQL}"
    ).fetchall()
    current = now()
    breached_open = sum(1 for row in open_rows if incident_payload(row)["sla_breached"])
    cutoff = current - timedelta(days=30)
    resolved_last_30 = db.execute(
        "SELECT COUNT(*) AS n FROM incidents "
        "WHERE resolved_at IS NOT NULL AND resolved_at >= ?",
        (iso(cutoff),),
    ).fetchone()["n"]

    return jsonify(
        {
            "open_total": sum(open_by_severity.values()),
            "open_by_severity": open_by_severity,
            "sla_breached_open": breached_open,
            "resolved_last_30_days": resolved_last_30,
        }
    )


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return api_error("Not found", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("Not found", 404)
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
