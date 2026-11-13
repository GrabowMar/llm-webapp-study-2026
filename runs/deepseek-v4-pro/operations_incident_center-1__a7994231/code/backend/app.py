"""Incident center API and frontend server."""

import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))

SEVERITIES = ["sev1", "sev2", "sev3", "sev4"]
STATUSES = ["investigating", "identified", "monitoring", "resolved"]

SLA_TARGETS_MINUTES = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}

app = Flask(__name__, static_folder=None)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(DATA_DIR / "incidents.db")
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = get_db()
    db.executescript(
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
            commander TEXT NOT NULL,
            impact_summary TEXT NOT NULL,
            opened_at TEXT NOT NULL,
            resolved_at TEXT,
            reopen_count INTEGER NOT NULL DEFAULT 0,
            opened_by TEXT NOT NULL,
            sla_due_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            incident_id INTEGER NOT NULL REFERENCES incidents(id),
            type TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            author TEXT NOT NULL
        );
        """
    )
    db.commit()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def parse_dt(value):
    if not value:
        return None
    return datetime.fromisoformat(value)


def compute_sla_due_at(opened_at, severity):
    opened = parse_dt(opened_at)
    target = SLA_TARGETS_MINUTES[severity]
    return (opened + timedelta(minutes=target)).isoformat(timespec="seconds")


def sla_breached_for(incident):
    due = parse_dt(incident["sla_due_at"])
    resolved = parse_dt(incident["resolved_at"])
    if resolved is not None:
        return resolved > due
    return datetime.now(timezone.utc) > due


def serialize_incident(row):
    incident = dict(row)
    incident["sla_breached"] = sla_breached_for(incident)
    return incident


def serialize_event(row):
    return {
        "id": row["id"],
        "type": row["type"],
        "message": row["message"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def current_user():
    token = request.headers.get("Authorization", "")
    if not token.startswith("Bearer "):
        return None
    token = token[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id "
        "WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    errors = []
    if not username:
        errors.append("username is required")
    if not password:
        errors.append("password is required")

    db = get_db()
    if username:
        exists = db.execute(
            "SELECT 1 FROM users WHERE username = ?", (username,)
        ).fetchone()
        if exists:
            errors.append("username is already taken")

    if errors:
        return jsonify({"error": "validation failed", "messages": errors}), 400

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid username or password"}), 401

    token = secrets.token_hex(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


# ---------------------------------------------------------------------------
# Incident routes
# ---------------------------------------------------------------------------

@app.get("/api/incidents")
@auth_required
def list_incidents():
    query = "SELECT * FROM incidents"
    conditions = []
    params = []

    severity = request.args.get("severity")
    if severity:
        if severity not in SEVERITIES:
            return jsonify({"error": "invalid severity"}), 400
        conditions.append("severity = ?")
        params.append(severity)

    status = request.args.get("status")
    if status:
        if status not in STATUSES:
            return jsonify({"error": "invalid status"}), 400
        conditions.append("status = ?")
        params.append(status)

    open_only = request.args.get("open")
    if open_only is not None:
        if open_only.lower() in ("1", "true", "yes"):
            conditions.append("resolved_at IS NULL")
        elif open_only.lower() in ("0", "false", "no"):
            conditions.append("resolved_at IS NOT NULL")

    q = request.args.get("q")
    if q:
        conditions.append(
            "(title LIKE ? OR service LIKE ? OR commander LIKE ? OR impact_summary LIKE ?)"
        )
        like = f"%{q}%"
        params.extend([like, like, like, like])

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    total = get_db().execute(
        "SELECT COUNT(*) FROM incidents"
        + ((" WHERE " + " AND ".join(conditions)) if conditions else ""),
        params,
    ).fetchone()[0]

    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", 20))
    except ValueError:
        page_size = 20
    page_size = max(1, min(100, page_size))

    query += " ORDER BY opened_at DESC LIMIT ? OFFSET ?"
    rows = get_db().execute(
        query, params + [page_size, (page - 1) * page_size]
    ).fetchall()

    items = [serialize_incident(r) for r in rows]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/incidents")
@auth_required
def create_incident():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    service = (data.get("service") or "").strip()
    severity = (data.get("severity") or "").strip()
    commander = (data.get("commander") or "").strip()
    impact_summary = (data.get("impact_summary") or "").strip()

    errors = []
    if not title:
        errors.append("title is required")
    if not service:
        errors.append("service is required")
    if severity not in SEVERITIES:
        errors.append("severity must be one of sev1, sev2, sev3, sev4")
    if not commander:
        errors.append("commander is required")
    if not impact_summary:
        errors.append("impact_summary is required")

    if errors:
        return jsonify({"error": "validation failed", "messages": errors}), 400

    opened_at = now_iso()
    sla_due_at = compute_sla_due_at(opened_at, severity)
    db = get_db()
    cursor = db.execute(
        "INSERT INTO incidents (title, service, severity, status, commander, "
        "impact_summary, opened_at, resolved_at, reopen_count, opened_by, sla_due_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)",
        (
            title,
            service,
            severity,
            "investigating",
            commander,
            impact_summary,
            opened_at,
            g.user["username"],
            sla_due_at,
        ),
    )
    incident_id = cursor.lastrowid
    db.execute(
        "INSERT INTO timeline (incident_id, type, message, created_at, author) "
        "VALUES (?, ?, ?, ?, ?)",
        (incident_id, "opened", f"Incident opened by {g.user['username']}", opened_at, g.user["username"]),
    )
    db.commit()

    row = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return jsonify(serialize_incident(row)), 201


@app.get("/api/incidents/<int:incident_id>")
@auth_required
def get_incident(incident_id):
    row = get_db().execute(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "incident not found"}), 404
    return jsonify(serialize_incident(row))


@app.patch("/api/incidents/<int:incident_id>")
@auth_required
def patch_incident(incident_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "incident not found"}), 404

    data = request.get_json(silent=True) or {}
    allowed = {
        "title": str,
        "service": str,
        "severity": str,
        "status": str,
        "commander": str,
        "impact_summary": str,
    }

    updates = {}
    errors = []
    for field, _ in allowed.items():
        if field in data:
            value = data[field]
            if value is None:
                continue
            if field == "title" and not str(value).strip():
                errors.append("title cannot be empty")
            elif field == "service" and not str(value).strip():
                errors.append("service cannot be empty")
            elif field == "commander" and not str(value).strip():
                errors.append("commander cannot be empty")
            elif field == "impact_summary" and not str(value).strip():
                errors.append("impact_summary cannot be empty")
            elif field == "severity" and value not in SEVERITIES:
                errors.append("severity must be one of sev1, sev2, sev3, sev4")
            elif field == "status" and value not in STATUSES:
                errors.append("status must be one of investigating, identified, monitoring, resolved")
            else:
                updates[field] = value

    if errors:
        return jsonify({"error": "validation failed", "messages": errors}), 400

    if not updates:
        return jsonify(serialize_incident(row))

    old_status = row["status"]
    new_status = updates.get("status", old_status)
    severity = updates.get("severity", row["severity"])

    now = now_iso()

    if new_status != old_status:
        updates["status"] = new_status
        if new_status == "resolved":
            updates["resolved_at"] = now
        elif old_status == "resolved":
            updates["resolved_at"] = None
            updates["reopen_count"] = row["reopen_count"] + 1

    if "severity" in updates:
        updates["sla_due_at"] = compute_sla_due_at(row["opened_at"], severity)

    assignments = ", ".join(f"{k} = ?" for k in updates)
    db.execute(
        f"UPDATE incidents SET {assignments} WHERE id = ?",
        list(updates.values()) + [incident_id],
    )

    if new_status != old_status:
        db.execute(
            "INSERT INTO timeline (incident_id, type, message, created_at, author) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                incident_id,
                "status_change",
                f"Status changed from {old_status} to {new_status}",
                now,
                g.user["username"],
            ),
        )

    db.commit()

    row = db.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    return jsonify(serialize_incident(row))


@app.get("/api/incidents/<int:incident_id>/timeline")
@auth_required
def list_timeline(incident_id):
    db = get_db()
    row = db.execute(
        "SELECT 1 FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "incident not found"}), 404
    rows = db.execute(
        "SELECT * FROM timeline WHERE incident_id = ? ORDER BY id ASC",
        (incident_id,),
    ).fetchall()
    return jsonify({"items": [serialize_event(r) for r in rows]})


@app.post("/api/incidents/<int:incident_id>/timeline")
@auth_required
def post_timeline(incident_id):
    db = get_db()
    row = db.execute(
        "SELECT 1 FROM incidents WHERE id = ?", (incident_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "incident not found"}), 404

    data = request.get_json(silent=True) or {}
    message = (data.get("message") or "").strip()
    event_type = (data.get("type") or "comment").strip()

    if not message:
        return jsonify({"error": "validation failed", "messages": ["message is required"]}), 400

    now = now_iso()
    cursor = db.execute(
        "INSERT INTO timeline (incident_id, type, message, created_at, author) "
        "VALUES (?, ?, ?, ?, ?)",
        (incident_id, event_type, message, now, g.user["username"]),
    )
    db.commit()
    event = db.execute("SELECT * FROM timeline WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(serialize_event(event)), 201


# ---------------------------------------------------------------------------
# Public stats
# ---------------------------------------------------------------------------

@app.get("/api/public/stats")
def public_stats():
    db = get_db()
    rows = db.execute("SELECT * FROM incidents").fetchall()

    open_total = 0
    open_by_severity = {s: 0 for s in SEVERITIES}
    sla_breached_open = 0
    resolved_last_30_days = 0

    cutoff = datetime.now(timezone.utc) - timedelta(days=30)

    for row in rows:
        incident = dict(row)
        resolved = parse_dt(incident["resolved_at"])
        if resolved is None:
            open_total += 1
            open_by_severity[incident["severity"]] += 1
            if sla_breached_for(incident):
                sla_breached_open += 1
        else:
            if resolved >= cutoff:
                resolved_last_30_days += 1

    return jsonify(
        {
            "open_total": open_total,
            "open_by_severity": open_by_severity,
            "sla_breached_open": sla_breached_open,
            "resolved_last_30_days": resolved_last_30_days,
        }
    )


# ---------------------------------------------------------------------------
# Health + frontend
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


with app.app_context():
    init_db()
