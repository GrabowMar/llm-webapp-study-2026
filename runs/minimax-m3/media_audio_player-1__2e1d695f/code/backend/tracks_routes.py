"""Track routes: list, create, fetch, delete and count plays."""

from __future__ import annotations

from flask import Blueprint, g, jsonify, request

from auth import login_required
from common import error_response, get_db
from db import utc_now
from tracks import serialize_track, validate_track_payload

bp = Blueprint("tracks", __name__, url_prefix="/api/tracks")

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

TRACK_SELECT = """
SELECT t.*, u.username AS added_by
  FROM tracks t
  JOIN users u ON u.id = t.user_id
"""


def _positive_int(raw, default: int, minimum: int = 1, maximum: int | None = None) -> int:
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    if value < minimum:
        value = minimum
    if maximum is not None and value > maximum:
        value = maximum
    return value


def _like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _fetch_track(track_id: int):
    db = get_db()
    return db.execute(TRACK_SELECT + " WHERE t.id = ?", (track_id,)).fetchone()


@bp.get("")
@bp.get("/")
def list_tracks():
    db = get_db()

    term = (request.args.get("q") or "").strip()
    page = _positive_int(request.args.get("page"), 1)
    page_size = _positive_int(request.args.get("page_size"), DEFAULT_PAGE_SIZE, maximum=MAX_PAGE_SIZE)

    where = ""
    params: list = []
    if term:
        where = " WHERE (t.title LIKE ? ESCAPE '\\' OR t.artist LIKE ? ESCAPE '\\')"
        pattern = _like_pattern(term)
        params.extend([pattern, pattern])

    total = db.execute("SELECT COUNT(*) AS n FROM tracks t" + where, params).fetchone()["n"]

    offset = (page - 1) * page_size
    rows = db.execute(
        TRACK_SELECT + where + " ORDER BY t.created_at DESC, t.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()

    return (
        jsonify(
            {
                "items": [serialize_track(row) for row in rows],
                "total": total,
                "page": page,
                "page_size": page_size,
            }
        ),
        200,
    )


@bp.post("")
@bp.post("/")
@login_required
def create_track():
    payload = request.get_json(silent=True)
    values, errors = validate_track_payload(payload)
    if errors:
        message = errors.get("_") or next(iter(errors.values()))
        return error_response(message, 400, errors)

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO tracks (title, artist, url, duration, duration_seconds, play_count, created_at, user_id)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)
        """,
        (
            values["title"],
            values["artist"],
            values["url"],
            values["duration"],
            values["duration_seconds"],
            utc_now(),
            g.user["id"],
        ),
    )

    row = _fetch_track(cursor.lastrowid)
    return jsonify(serialize_track(row)), 201


@bp.get("/<int:track_id>")
def get_track(track_id: int):
    row = _fetch_track(track_id)
    if row is None:
        return error_response("Track not found", 404)
    return jsonify(serialize_track(row)), 200


@bp.delete("/<int:track_id>")
@login_required
def delete_track(track_id: int):
    db = get_db()
    row = db.execute(
        "SELECT id, user_id FROM tracks WHERE id = ?", (track_id,)
    ).fetchone()
    if row is None:
        return error_response("Track not found", 404)
    if row["user_id"] != g.user["id"]:
        return error_response("You can only delete tracks that you added", 403)

    db.execute("DELETE FROM tracks WHERE id = ?", (track_id,))
    return jsonify({"ok": True, "id": track_id}), 200


@bp.post("/<int:track_id>/plays")
def add_play(track_id: int):
    db = get_db()
    row = db.execute("SELECT id FROM tracks WHERE id = ?", (track_id,)).fetchone()
    if row is None:
        return error_response("Track not found", 404)

    db.execute("UPDATE tracks SET play_count = play_count + 1 WHERE id = ?", (track_id,))
    updated = _fetch_track(track_id)
    return jsonify(serialize_track(updated)), 200
