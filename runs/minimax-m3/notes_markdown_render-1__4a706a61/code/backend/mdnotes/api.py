"""JSON API for accounts, notes and rendered note HTML."""

from typing import Any

from flask import Blueprint, Response, g, jsonify, request

from .auth import (
    bearer_token,
    create_user,
    current_user,
    find_user,
    issue_token,
    require_auth,
    revoke_token,
    verify_credentials,
)
from .db import get_db, utcnow
from .rendering import render_markdown

api = Blueprint("api", __name__)

MAX_TITLE_LENGTH = 300
MAX_BODY_LENGTH = 200_000


def error(message: str, status: int) -> tuple[Response, int]:
    return jsonify({"error": message}), status


def body_payload() -> Any:
    payload = request.get_json(silent=True)
    if payload is None:
        return {}
    return payload if isinstance(payload, dict) else {}


def note_json(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "body": row["body"],
        "published": bool(row["published"]),
        "updated_at": row["updated_at"],
        "author": row["username"],
    }


def fetch_note(note_id: int, user_id: int) -> Any:
    return get_db().execute(
        "SELECT notes.id AS id, notes.title AS title, notes.body AS body, "
        "notes.published AS published, notes.updated_at AS updated_at, "
        "users.username AS username "
        "FROM notes JOIN users ON users.id = notes.user_id "
        "WHERE notes.id = ? AND notes.user_id = ?",
        (note_id, user_id),
    ).fetchone()


def fetch_published_note(note_id: int) -> Any:
    return get_db().execute(
        "SELECT notes.id AS id, notes.title AS title, notes.body AS body, "
        "notes.published AS published, notes.updated_at AS updated_at, "
        "users.username AS username "
        "FROM notes JOIN users ON users.id = notes.user_id "
        "WHERE notes.id = ? AND notes.published = 1",
        (note_id,),
    ).fetchone()


def html_response(markdown: str) -> Response:
    return Response(render_markdown(markdown), mimetype="text/html")


@api.get("/health")
def health():
    return jsonify({"status": "ok"})


@api.post("/auth/register")
def register():
    payload = body_payload()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not username.strip():
        return error("username is required", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    username = username.strip()
    if len(username) > 64:
        return error("username is too long", 400)
    if len(password) < 4:
        return error("password must be at least 4 characters", 400)
    if find_user(username) is not None:
        return error("username is already taken", 409)
    user = create_user(username, password)
    return jsonify({"id": user["id"], "username": user["username"]}), 201


@api.post("/auth/login")
def login():
    payload = body_payload()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    user = verify_credentials(username.strip(), password)
    if user is None:
        return error("invalid username or password", 401)
    return jsonify({"token": issue_token(user["id"])})


@api.post("/auth/logout")
@require_auth
def logout():
    token = bearer_token()
    if token is not None:
        revoke_token(token)
    return jsonify({"status": "ok"})


@api.get("/auth/me")
@require_auth
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@api.get("/notes")
@require_auth
def list_notes():
    user = current_user()
    rows = get_db().execute(
        "SELECT id, title, published, updated_at FROM notes "
        "WHERE user_id = ? ORDER BY updated_at DESC, id DESC",
        (user["id"],),
    ).fetchall()
    return jsonify(
        {
            "items": [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "published": bool(row["published"]),
                    "updated_at": row["updated_at"],
                }
                for row in rows
            ]
        }
    )


@api.post("/notes")
@require_auth
def create_note():
    user = current_user()
    payload = body_payload()
    title = payload.get("title", "")
    body = payload.get("body", "")
    published = payload.get("published", False)
    if title is None:
        title = ""
    if body is None:
        body = ""
    if not isinstance(title, str) or not isinstance(body, str):
        return error("title and body must be strings", 400)
    if not isinstance(published, bool):
        return error("published must be a boolean", 400)
    title = title.strip()[:MAX_TITLE_LENGTH]
    body = body[:MAX_BODY_LENGTH]
    now = utcnow()
    db = get_db()
    cursor = db.execute(
        "INSERT INTO notes (user_id, title, body, published, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (user["id"], title, body, 1 if published else 0, now, now),
    )
    db.commit()
    row = fetch_note(cursor.lastrowid, user["id"])
    return jsonify(note_json(row)), 201


@api.get("/notes/<int:note_id>")
@require_auth
def get_note(note_id: int):
    user = current_user()
    row = fetch_note(note_id, user["id"])
    if row is None:
        return error("note not found", 404)
    return jsonify(note_json(row))


@api.patch("/notes/<int:note_id>")
@require_auth
def update_note(note_id: int):
    user = current_user()
    row = fetch_note(note_id, user["id"])
    if row is None:
        return error("note not found", 404)
    payload = body_payload()
    title = row["title"]
    body = row["body"]
    published = bool(row["published"])
    if "title" in payload:
        value = payload["title"]
        if value is None:
            value = ""
        if not isinstance(value, str):
            return error("title must be a string", 400)
        title = value.strip()[:MAX_TITLE_LENGTH]
    if "body" in payload:
        value = payload["body"]
        if value is None:
            value = ""
        if not isinstance(value, str):
            return error("body must be a string", 400)
        body = value[:MAX_BODY_LENGTH]
    if "published" in payload:
        value = payload["published"]
        if not isinstance(value, bool):
            return error("published must be a boolean", 400)
        published = value
    db = get_db()
    db.execute(
        "UPDATE notes SET title = ?, body = ?, published = ?, updated_at = ? WHERE id = ?",
        (title, body, 1 if published else 0, utcnow(), note_id),
    )
    db.commit()
    return jsonify(note_json(fetch_note(note_id, user["id"])))


@api.delete("/notes/<int:note_id>")
@require_auth
def delete_note(note_id: int):
    user = current_user()
    row = fetch_note(note_id, user["id"])
    if row is None:
        return error("note not found", 404)
    db = get_db()
    db.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    db.commit()
    return "", 204


@api.get("/notes/<int:note_id>/html")
@require_auth
def note_html(note_id: int):
    user = current_user()
    row = fetch_note(note_id, user["id"])
    if row is None:
        return error("note not found", 404)
    return html_response(row["body"])


@api.post("/notes/render")
@require_auth
def render_preview():
    payload = body_payload()
    source = payload.get("body", "")
    if source is None:
        source = ""
    if not isinstance(source, str):
        return error("body must be a string", 400)
    return html_response(source[:MAX_BODY_LENGTH])


@api.get("/public/notes/<int:note_id>")
def public_note(note_id: int):
    row = fetch_published_note(note_id)
    if row is None:
        return error("note not found", 404)
    return jsonify(
        {
            "id": row["id"],
            "title": row["title"],
            "author": row["username"],
            "published": True,
            "updated_at": row["updated_at"],
        }
    )


@api.get("/public/notes/<int:note_id>/html")
def public_note_html(note_id: int):
    row = fetch_published_note(note_id)
    if row is None:
        return error("note not found", 404)
    return html_response(row["body"])
