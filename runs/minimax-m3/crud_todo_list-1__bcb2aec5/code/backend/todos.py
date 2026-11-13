"""Todo routes: create, list, read, update and delete."""

from __future__ import annotations

import re
import sqlite3
from datetime import date

from flask import Blueprint, g, jsonify, request

from db import execute, query_all, query_one, utc_now
from security import require_auth

bp = Blueprint("todos", __name__, url_prefix="/api/todos")

MAX_TITLE_LENGTH = 200
MAX_DESCRIPTION_LENGTH = 2000
MAX_PRIORITY_LENGTH = 32
DEFAULT_PRIORITY = "medium"
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

PRIORITY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _-]*$")
DATE_PATTERN = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$")


class ValidationError(Exception):
    """Raised when the client sends a field the API cannot accept."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _body() -> dict:
    payload = request.get_json(silent=True)
    if payload is None:
        raise ValidationError("request body must be JSON")
    if not isinstance(payload, dict):
        raise ValidationError("request body must be a JSON object")
    return payload


def _validate_title(value, *, required: bool) -> str | None:
    if value is None:
        if required:
            raise ValidationError("title is required")
        return None
    if not isinstance(value, str):
        raise ValidationError("title must be a string")
    title = value.strip()
    if not title:
        raise ValidationError("title is required")
    if len(title) > MAX_TITLE_LENGTH:
        raise ValidationError(f"title must be at most {MAX_TITLE_LENGTH} characters")
    return title


def _validate_description(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError("description must be a string")
    description = value.strip()
    if not description:
        return None
    if len(description) > MAX_DESCRIPTION_LENGTH:
        raise ValidationError(f"description must be at most {MAX_DESCRIPTION_LENGTH} characters")
    return description


def _validate_priority(value) -> str:
    if not isinstance(value, str):
        raise ValidationError("priority must be a string")
    priority = value.strip()
    if not priority:
        raise ValidationError("priority is required")
    if len(priority) > MAX_PRIORITY_LENGTH:
        raise ValidationError(f"priority must be at most {MAX_PRIORITY_LENGTH} characters")
    if not PRIORITY_PATTERN.match(priority):
        raise ValidationError("priority may only contain letters, numbers, spaces, '-' and '_'")
    return priority


def _validate_due_date(value) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError("due_date must be a date string in YYYY-MM-DD format")
    text = value.strip()
    if not text:
        return None
    match = DATE_PATTERN.match(text)
    if not match:
        raise ValidationError("due_date must be a date in YYYY-MM-DD format")
    year, month, day = (int(part) for part in match.groups())
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        raise ValidationError("due_date must be a valid date in YYYY-MM-DD format") from None


def _validate_completed(value) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "1", "yes", "on"):
            return True
        if lowered in ("false", "0", "no", "off"):
            return False
    raise ValidationError("completed must be a boolean")


def _serialize(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "priority": row["priority"],
        "due_date": row["due_date"],
        "completed": bool(row["completed"]),
        "completed_at": row["completed_at"],
        "created_at": row["created_at"],
    }


def _owned_todo(todo_id: int, user_id: int) -> sqlite3.Row | None:
    return query_one(
        "SELECT * FROM todos WHERE id = ? AND user_id = ?",
        (todo_id, user_id),
    )


def _int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        raise ValidationError(f"{name} must be an integer") from None


@bp.get("")
@bp.get("/")
@require_auth
def list_todos():
    page = _int_arg("page", 1)
    page_size = _int_arg("page_size", DEFAULT_PAGE_SIZE)
    if page < 1:
        raise ValidationError("page must be at least 1")
    if page_size < 1:
        raise ValidationError("page_size must be at least 1")
    page_size = min(page_size, MAX_PAGE_SIZE)

    clauses = ["user_id = ?"]
    params: list = [g.user["id"]]

    completed_raw = request.args.get("completed")
    if completed_raw is not None and completed_raw != "":
        completed = _validate_completed(completed_raw)
        clauses.append("completed = ?")
        params.append(1 if completed else 0)

    priority = request.args.get("priority")
    if priority is not None and priority.strip():
        clauses.append("LOWER(priority) = LOWER(?)")
        params.append(priority.strip())

    where = " AND ".join(clauses)
    total = query_one(f"SELECT COUNT(*) AS n FROM todos WHERE {where}", tuple(params))["n"]

    rows = query_all(
        f"""
        SELECT * FROM todos
         WHERE {where}
         ORDER BY completed ASC,
                  CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC,
                  due_date ASC,
                  created_at DESC,
                  id DESC
         LIMIT ? OFFSET ?
        """,
        tuple(params) + (page_size, (page - 1) * page_size),
    )

    items = [_serialize(row) for row in rows]
    return jsonify(
        {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "remaining": max(0, total - ((page - 1) * page_size + len(items))),
        }
    )


@bp.post("")
@bp.post("/")
@require_auth
def create_todo():
    payload = _body()
    title = _validate_title(payload.get("title"), required=True)
    description = _validate_description(payload.get("description"))
    priority = (
        _validate_priority(payload["priority"])
        if "priority" in payload and payload["priority"] is not None
        else DEFAULT_PRIORITY
    )
    due_date = _validate_due_date(payload.get("due_date"))
    completed = _validate_completed(payload.get("completed", False))
    timestamp = utc_now()

    cursor = execute(
        """
        INSERT INTO todos
            (user_id, title, description, priority, due_date, completed, completed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            g.user["id"],
            title,
            description,
            priority,
            due_date,
            1 if completed else 0,
            timestamp if completed else None,
            timestamp,
        ),
    )
    row = _owned_todo(cursor.lastrowid, g.user["id"])
    return jsonify(_serialize(row)), 201


@bp.get("/<int:todo_id>")
@require_auth
def get_todo(todo_id: int):
    row = _owned_todo(todo_id, g.user["id"])
    if row is None:
        return jsonify({"error": "todo not found"}), 404
    return jsonify(_serialize(row))


@bp.patch("/<int:todo_id>")
@require_auth
def update_todo(todo_id: int):
    row = _owned_todo(todo_id, g.user["id"])
    if row is None:
        return jsonify({"error": "todo not found"}), 404

    payload = _body()
    updates: dict = {}

    if "title" in payload:
        title = _validate_title(payload["title"], required=True)
        if title is not None:
            updates["title"] = title
    if "description" in payload:
        updates["description"] = _validate_description(payload["description"])
    if "priority" in payload:
        updates["priority"] = _validate_priority(payload["priority"])
    if "due_date" in payload:
        updates["due_date"] = _validate_due_date(payload["due_date"])

    if "completed" in payload:
        completed = _validate_completed(payload["completed"])
        if completed != bool(row["completed"]):
            updates["completed"] = 1 if completed else 0
            updates["completed_at"] = utc_now() if completed else None

    if updates:
        assignments = ", ".join(f"{column} = ?" for column in updates)
        execute(
            f"UPDATE todos SET {assignments} WHERE id = ? AND user_id = ?",
            tuple(updates.values()) + (todo_id, g.user["id"]),
        )

    row = _owned_todo(todo_id, g.user["id"])
    return jsonify(_serialize(row))


@bp.delete("/<int:todo_id>")
@require_auth
def delete_todo(todo_id: int):
    row = _owned_todo(todo_id, g.user["id"])
    if row is None:
        return jsonify({"error": "todo not found"}), 404
    execute("DELETE FROM todos WHERE id = ? AND user_id = ?", (todo_id, g.user["id"]))
    return jsonify({"status": "deleted", "id": todo_id})
