"""Task CRUD API."""

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from auth import current_user_id
from db import connect
from errors import ApiError

tasks_bp = Blueprint("tasks", __name__, url_prefix="/api/tasks")

STATUSES = ["todo", "in_progress", "done"]
PRIORITIES = ["low", "medium", "high"]
MAX_TITLE = 200
MAX_DESCRIPTION = 5000

TASK_FIELDS = ("title", "description", "status", "priority", "position")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def serialize(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "status": row["status"],
        "priority": row["priority"],
        "position": row["position"],
        "updated_at": row["updated_at"],
    }


def _json_body(patch: bool = False) -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "Request body must be a JSON object")
    if patch and not any(field in body for field in TASK_FIELDS):
        raise ApiError(400, "No fields to update")
    return body


def _validate_title(value) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, "Validation failed", {"title": "Title is required"})
    if len(value.strip()) > MAX_TITLE:
        raise ApiError(
            400,
            "Validation failed",
            {"title": f"Title must be at most {MAX_TITLE} characters"},
        )
    return value.strip()


def _validate_description(value) -> str:
    if not isinstance(value, str):
        raise ApiError(400, "Validation failed", {"description": "Description must be text"})
    if len(value) > MAX_DESCRIPTION:
        raise ApiError(
            400,
            "Validation failed",
            {"description": f"Description must be at most {MAX_DESCRIPTION} characters"},
        )
    return value


def _validate_status(value) -> str:
    if not isinstance(value, str) or value not in STATUSES:
        raise ApiError(
            400,
            "Validation failed",
            {"status": "Status must be one of: " + ", ".join(STATUSES)},
        )
    return value


def _validate_priority(value) -> str:
    if not isinstance(value, str) or value not in PRIORITIES:
        raise ApiError(
            400,
            "Validation failed",
            {"priority": "Priority must be one of: " + ", ".join(PRIORITIES)},
        )
    return value


def _validate_position(value) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ApiError(400, "Validation failed", {"position": "Position must be a whole number"})
    if value < 1:
        raise ApiError(400, "Validation failed", {"position": "Position must be 1 or greater"})
    return value


def _column_ids(conn, status: str, exclude_id: int | None = None) -> list[int]:
    sql = "SELECT id FROM tasks WHERE status = ?"
    params: list = [status]
    if exclude_id is not None:
        sql += " AND id != ?"
        params.append(exclude_id)
    sql += " ORDER BY position, id"
    return [row["id"] for row in conn.execute(sql, params).fetchall()]


def _rebalance(conn, status: str) -> None:
    """Assign gap-free positions 1..n to all tasks of a column."""
    for offset, task_id in enumerate(_column_ids(conn, status)):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (offset + 1, task_id))


def _place(conn, ordered_ids: list[int]) -> None:
    for offset, task_id in enumerate(ordered_ids):
        conn.execute("UPDATE tasks SET position = ? WHERE id = ?", (offset + 1, task_id))


@tasks_bp.get("")
def list_tasks():
    status_filter = request.args.get("status") or None
    priority_filter = request.args.get("priority") or None
    if status_filter is not None and status_filter not in STATUSES:
        raise ApiError(
            400, "Validation failed", {"status": "Status must be one of: " + ", ".join(STATUSES)}
        )
    if priority_filter is not None and priority_filter not in PRIORITIES:
        raise ApiError(
            400,
            "Validation failed",
            {"priority": "Priority must be one of: " + ", ".join(PRIORITIES)},
        )

    sql = "SELECT * FROM tasks WHERE 1=1"
    params: list = []
    if status_filter:
        sql += " AND status = ?"
        params.append(status_filter)
    if priority_filter:
        sql += " AND priority = ?"
        params.append(priority_filter)
    case = " ORDER BY CASE status "
    for index, name in enumerate(STATUSES):
        case += f"WHEN '{name}' THEN {index} "
    case += "ELSE 99 END, position, id"

    conn = connect()
    try:
        rows = conn.execute(sql + case, params).fetchall()
    finally:
        conn.close()

    items = [serialize(row) for row in rows]
    counts = {name: 0 for name in STATUSES}
    for item in items:
        counts[item["status"]] += 1
    return jsonify({"items": items, "total": len(items), "counts": counts})


@tasks_bp.post("")
def create_task():
    current_user_id()
    body = _json_body()
    title = _validate_title(body.get("title"))
    description = _validate_description(body.get("description", ""))
    status = _validate_status(body.get("status", "todo"))
    priority = _validate_priority(body.get("priority", "medium"))
    if "position" in body:
        _validate_position(body["position"])

    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        position = len(_column_ids(conn, status)) + 1
        cur = conn.execute(
            "INSERT INTO tasks (title, description, status, priority, position, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (title, description, status, priority, position, now_iso()),
        )
        task_id = cur.lastrowid
        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    finally:
        conn.close()
    return jsonify(serialize(row)), 201


@tasks_bp.get("/<int:task_id>")
def get_task(task_id: int):
    conn = connect()
    try:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "Task not found")
    finally:
        conn.close()
    return jsonify(serialize(row))


@tasks_bp.patch("/<int:task_id>")
def update_task(task_id: int):
    current_user_id()
    body = _json_body(patch=True)

    updates: dict = {}
    if "title" in body:
        updates["title"] = _validate_title(body["title"])
    if "description" in body:
        updates["description"] = _validate_description(body["description"])
    if "status" in body:
        updates["status"] = _validate_status(body["status"])
    if "priority" in body:
        updates["priority"] = _validate_priority(body["priority"])
    if "position" in body:
        updates["position"] = _validate_position(body["position"])

    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "Task not found")
        source_status = row["status"]
        target_status = updates.get("status", source_status)
        status_changed = target_status != source_status
        position = updates.get("position")
        moving = status_changed or position is not None

        if moving:
            if status_changed:
                conn.execute(
                    "UPDATE tasks SET status = ? WHERE id = ?", (target_status, task_id)
                )
                _rebalance(conn, source_status)
            others = _column_ids(conn, target_status, exclude_id=task_id)
            max_position = len(others) + 1
            if position is None:
                position = max_position
            elif position > max_position:
                conn.rollback()
                raise ApiError(
                    400,
                    "Validation failed",
                    {"position": f"Position must be between 1 and {max_position}"},
                )
            others.insert(position - 1, task_id)
            _place(conn, others)

        field_updates = {k: v for k, v in updates.items() if k in ("title", "description", "priority", "status")}
        if field_updates:
            assignments = ", ".join(f"{column} = ?" for column in field_updates)
            conn.execute(
                f"UPDATE tasks SET {assignments}, updated_at = ? WHERE id = ?",
                [*field_updates.values(), now_iso(), task_id],
            )
        else:
            conn.execute(
                "UPDATE tasks SET updated_at = ? WHERE id = ?", (now_iso(), task_id)
            )

        conn.commit()
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    finally:
        conn.close()
    return jsonify(serialize(row))


@tasks_bp.delete("/<int:task_id>")
def delete_task(task_id: int):
    current_user_id()
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise ApiError(404, "Task not found")
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        _rebalance(conn, row["status"])
        conn.commit()
    finally:
        conn.close()
    return "", 204
