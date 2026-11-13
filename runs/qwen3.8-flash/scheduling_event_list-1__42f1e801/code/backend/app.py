"""Flask entry point: JSON API under /api plus the frontend build."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_connection

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,64}$")

DT_RE = re.compile(
    r"^(\d{4})-(\d{2})-(\d{2})"
    r"(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?"
    r"(Z|z|[+-]\d{2}:?\d{2})?$"
)

ERR_MESSAGES: dict[int, str] = {
    400: "Bad request",
    401: "Authentication required",
    404: "Not found",
    405: "Method not allowed",
    409: "Conflict",
    413: "Request entity too large",
    422: "Validation failed",
    500: "Internal server error",
}


# ---------------------------------------------------------------- helpers ---


def conn() -> sqlite3.Connection:
    if "eventcal_conn" not in g:
        g.eventcal_conn = get_connection()
    return g.eventcal_conn


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def error(status: int, message: str, fields: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message, "message": message}
    if fields:
        payload["fields"] = fields
    return jsonify(payload), status


def parse_dt(value: Any, field: str, require_time: bool = False) -> tuple[datetime | None, str | None]:
    """Parse an ISO-9601-ish date-time; naive values are taken as UTC."""
    if not isinstance(value, str) or not value.strip():
        return None, f"{field} is required"
    match = DT_RE.match(value.strip())
    if not match:
        return None, f"{field} must be an ISO 9601 date-time, e.g. 2024-01-31T14:30"
    if require_time and match.group(4) is None:
        return None, f"{field} must include a time, e.g. 2024-01-31T14:30"
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    hour, minute = int(match.group(4) or 0), int(match.group(5) or 0)
    second = int(match.group(6) or 0)
    micro = 0
    if match.group(7):
        micro = int(match.group(7)[:6].ljust(6, "0"))
    offset = match.group(8)
    if offset is None or offset in ("Z", "z"):
        tz: timezone = timezone.utc
    else:
        sign = 1 if offset[0] == "+" else -1
        digits = offset[1:].replace(":", "")
        total_minutes = sign * (int(digits[:2]) * 60 + int(digits[2:]))
        if abs(total_minutes) >= 24 * 60:
            return None, f"{field} has an invalid UTC offset"
        tz = timezone(timedelta(minutes=total_minutes))
    try:
        dt = datetime(year, month, day, hour, minute, second, micro, tz)
    except ValueError:
        return None, f"{field} is not a valid date-time"
    return dt.astimezone(timezone.utc), None


def to_z(dt: datetime) -> str:
    out = dt.strftime("%Y-%m-%dT%H:%M:%S")
    if dt.microsecond:
        out += f".{dt.microsecond:06d}".rstrip("0")
    return out + "Z"


def clean_str(value: Any, max_len: int = 4000) -> tuple[str | None, str | None]:
    if value is None:
        return None, None
    if isinstance(value, (bool, int, float)):
        value = str(value)
    if not isinstance(value, str):
        return None, "must be a string or null"
    text = value.strip()
    if not text:
        return None, None
    if len(text) > max_len:
        return None, f"must be at most {max_len} characters"
    return text, None


def event_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "location": row["location"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "created_at": row["created_at"],
        "created_by": row["created_by"],
    }


# ------------------------------------------------------------------ auth ---


def current_user() -> dict[str, Any] | None:
    if "eventcal_user" in g:
        return g.eventcal_user
    user = None
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        token = header[7:].strip()
        if token:
            row = conn().execute(
                "SELECT u.id, u.username FROM tokens t "
                "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
                (token,),
            ).fetchone()
            if row is not None:
                user = {"id": row["id"], "username": row["username"]}
    g.eventcal_user = user
    return user


def require_user():
    user = current_user()
    if user is None:
        return None, error(401, "Authentication required")
    return user, None


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "Request body must be a JSON object")
    fields: dict[str, str] = {}
    username = data.get("username")
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        fields["username"] = (
            "Username must be 3-64 characters (letters, digits, '_', '-', '.')"
        )
    password = data.get("password")
    if not isinstance(password, str) or len(password) < 8:
        fields["password"] = "Password must be at least 8 characters"
    if fields:
        return error(422, "Validation failed", fields)
    username = username.strip()
    try:
        conn().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utc_now_iso()),
        )
        conn().commit()
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken",
                     {"username": "Username is already taken"})
    return jsonify({"message": "User registered"}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(401, "Invalid username or password")
    row = conn().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password")
    token = secrets.token_hex(32)
    conn().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utc_now_iso()),
    )
    conn().commit()
    return jsonify({"token": token, "username": row["username"]}), 200


@app.post("/api/auth/logout")
def logout():
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        conn().execute("DELETE FROM tokens WHERE token = ?", (header[7:].strip(),))
        conn().commit()
    return jsonify({"ok": True}), 200


@app.get("/api/auth/me")
def me():
    user, err = require_user()
    if err is not None:
        return err
    return jsonify({"username": user["username"]}), 200


# ---------------------------------------------------------------- events ---


@app.get("/api/events")
def list_events():
    clauses: list[str] = []
    args: list[str] = []
    errors: dict[str, str] = {}
    params = request.args

    if "start_date" in params:
        dt, err = parse_dt(params["start_date"], "start_date")
        if err:
            errors["start_date"] = (
                "start_date must be an ISO date (YYYY-MM-DD) or date-time"
            )
        else:
            clauses.append("end_time > ?")
            args.append(to_z(dt))
    if "end_date" in params:
        raw = (params["end_date"] or "").strip()
        date_only = bool(re.match(r"^\d{4}-\d{2}-\d{2}$", raw))
        dt, err = parse_dt(raw, "end_date")
        if err:
            errors["end_date"] = (
                "end_date must be an ISO date (YYYY-MM-DD) or date-time"
            )
        else:
            if date_only:
                dt = dt + timedelta(days=1)
            clauses.append("start_time < ?")
            args.append(to_z(dt))
    if errors:
        return error(400, "Invalid query parameters", errors)

    sql = "SELECT * FROM events"
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY start_time ASC, id ASC"
    rows = conn().execute(sql, args).fetchall()
    items = [event_row_to_dict(r) for r in rows]
    return jsonify({"items": items, "total": len(items)}), 200


def validate_event_payload(data: dict) -> tuple[dict | None, dict[str, str]]:
    fields: dict[str, str] = {}
    values: dict[str, Any] = {}

    title = data.get("title")
    if isinstance(title, (bool, int, float)):
        title = str(title)
    if not isinstance(title, str) or not title.strip():
        fields["title"] = "title is required and must not be empty"
    elif len(title.strip()) > 200:
        fields["title"] = "title must be at most 200 characters"
    else:
        values["title"] = title.strip()

    description, err = clean_str(data.get("description"))
    if err:
        fields["description"] = f"description {err}"
    else:
        values["description"] = description

    location, err = clean_str(data.get("location"), max_len=500)
    if err:
        fields["location"] = f"location {err}"
    else:
        values["location"] = location

    start, err = parse_dt(data.get("start_time"), "start_time", require_time=True)
    if err:
        fields["start_time"] = err
    else:
        values["start_dt"] = start

    end, err = parse_dt(data.get("end_time"), "end_time", require_time=True)
    if err:
        fields["end_time"] = err
    else:
        values["end_dt"] = end

    if not fields and values["end_dt"] <= values["start_dt"]:
        fields["end_time"] = "end_time must be after start_time"

    if fields:
        return None, fields

    values["start_time"] = to_z(values.pop("start_dt"))
    values["end_time"] = to_z(values.pop("end_dt"))
    return values, {}


@app.post("/api/events")
def create_event():
    user, err = require_user()
    if err is not None:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "Request body must be a JSON object")
    values, fields = validate_event_payload(data)
    if values is None:
        return error(422, "Validation failed", fields)
    cur = conn().execute(
        "INSERT INTO events (title, description, location, start_time, end_time,"
        " created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            values["title"],
            values["description"],
            values["location"],
            values["start_time"],
            values["end_time"],
            utc_now_iso(),
            user["username"],
        ),
    )
    conn().commit()
    row = conn().execute("SELECT * FROM events WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(event_row_to_dict(row)), 201


def get_event_row_or_404(event_id: int):
    row = conn().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        return None, error(404, "Event not found")
    return row, None


@app.get("/api/events/<int:event_id>")
def get_event(event_id: int):
    row, err = get_event_row_or_404(event_id)
    if err is not None:
        return err
    return jsonify(event_row_to_dict(row)), 200


@app.put("/api/events/<int:event_id>")
def update_event(event_id: int):
    user, err = require_user()
    if err is not None:
        return err
    row, err = get_event_row_or_404(event_id)
    if err is not None:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return error(400, "Request body must be a JSON object")
    # PUT replaces the event: missing optional fields are cleared.
    values, fields = validate_event_payload(data)
    if values is None:
        return error(422, "Validation failed", fields)
    conn().execute(
        "UPDATE events SET title = ?, description = ?, location = ?,"
        " start_time = ?, end_time = ? WHERE id = ?",
        (
            values["title"],
            values["description"],
            values["location"],
            values["start_time"],
            values["end_time"],
            event_id,
        ),
    )
    conn().commit()
    row = conn().execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    return jsonify(event_row_to_dict(row)), 200


@app.delete("/api/events/<int:event_id>")
def delete_event(event_id: int):
    user, err = require_user()
    if err is not None:
        return err
    cur = conn().execute("DELETE FROM events WHERE id = ?", (event_id,))
    conn().commit()
    if cur.rowcount == 0:
        return error(404, "Event not found")
    return jsonify({"deleted": event_id}), 200


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"}), 200


# --------------------------------------------------------------- frontend ---


def serve_spa(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error(404, "Not found")
    return serve_spa(path)


# -------------------------------------------------------- error handlers ---


@app.errorhandler(404)
def handle_404(_e):
    if request.path.startswith("/api/"):
        return error(404, "Not found")
    return serve_spa()


@app.errorhandler(405)
def handle_405(_e):
    if request.path.startswith("/api/"):
        return error(405, "Method not allowed")
    return serve_spa()


@app.errorhandler(413)
def handle_413(_e):
    return error(413, "Request body too large")


@app.errorhandler(HTTPException)
def handle_http_exception(e: HTTPException):
    if request.path.startswith("/api/"):
        message = ERR_MESSAGES.get(e.code or 500) or e.description
        return error(e.code or 500, message)
    return serve_spa(), e.code


@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        return handle_http_exception(e)
    app.logger.exception("Unhandled error")
    if request.path.startswith("/api/"):
        return error(500, "Internal server error")
    return serve_spa(), 500


@app.teardown_request
def close_conn(_exc):
    c = g.pop("eventcal_conn", None)
    if c is not None:
        c.close()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=True)
