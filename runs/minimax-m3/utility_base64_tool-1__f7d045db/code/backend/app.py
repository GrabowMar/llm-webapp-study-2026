"""Flask entry point: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory

try:  # package import
    from . import auth, codec, db
except ImportError:  # top-level import (gunicorn: "app:app")
    import auth  # type: ignore[no-redef]
    import codec  # type: ignore[no-redef]
    import db  # type: ignore[no-redef]

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


def error(message: str, status: int = 400):
    """Return a JSON error payload."""
    return jsonify(error=message, message=message), status


def json_body() -> dict[str, Any]:
    """Return the request body as a JSON object (empty when it is not one)."""
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def serialize_conversion(row: sqlite3.Row, include_output: bool = False) -> dict[str, Any]:
    """Build the public representation of a conversion."""
    data: dict[str, Any] = {
        "id": row["id"],
        "direction": row["direction"],
        "input_preview": codec.preview(row["input"]),
        "output_preview": codec.preview(row["output"]),
        "created_at": row["created_at"],
    }
    if include_output:
        data["output"] = row["output"]
    return data


def paginate() -> tuple[int, int]:
    """Read and normalize the paging parameters of a request."""
    def positive_int(name: str, default: int, maximum: int | None = None) -> int:
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        if value < 1:
            return default
        if maximum is not None and value > maximum:
            return maximum
        return value

    page = positive_int("page", 1)
    page_size = positive_int("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return page, page_size


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.post("/api/auth/register")
def register():
    payload = json_body()
    try:
        username = auth.normalize_username(payload.get("username"))
        password = auth.normalize_password(payload.get("password"))
    except auth.AuthError as exc:
        return error(str(exc), 400)

    try:
        user = auth.create_user(username, password)
    except auth.AuthError as exc:
        return error(str(exc), 409)

    return jsonify(id=user["id"], username=user["username"]), 201


@app.post("/api/auth/login")
def login():
    payload = json_body()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username:
        return error("Username and password are required", 400)

    user = auth.verify_user(username, password)
    if user is None:
        return error("Invalid username or password", 401)

    token = auth.issue_token(user["id"])
    return jsonify(token=token, username=user["username"])


@app.get("/api/auth/me")
@auth.require_auth
def me():
    return jsonify(id=g.user["id"], username=g.user["username"])


@app.post("/api/base64/encode")
def encode_endpoint():
    payload = json_body()
    text = payload.get("text")
    if not isinstance(text, str):
        return error("Field 'text' must be a string", 400)
    return jsonify(encoded=codec.encode_text(text))


@app.post("/api/base64/decode")
def decode_endpoint():
    payload = json_body()
    encoded = payload.get("encoded")
    if not isinstance(encoded, str):
        return error("Field 'encoded' must be a string", 400)
    try:
        text = codec.decode_base64(encoded)
    except codec.ConversionError as exc:
        return error(str(exc), 400)
    return jsonify(text=text)


@app.post("/api/conversions")
@auth.require_auth
def create_conversion():
    payload = json_body()
    direction = payload.get("direction")
    source = payload.get("input")
    if not isinstance(direction, str) or direction not in ("encode", "decode"):
        return error("Field 'direction' must be 'encode' or 'decode'", 400)
    if not isinstance(source, str):
        return error("Field 'input' must be a string", 400)

    try:
        output = codec.convert(direction, source)
    except codec.ConversionError as exc:
        return error(str(exc), 400)

    with db.get_conn() as conn:
        cursor = conn.execute(
            "INSERT INTO conversions (user_id, direction, input, output, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (g.user["id"], direction, source, output, db.now_iso()),
        )
        row = conn.execute(
            "SELECT * FROM conversions WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()

    return jsonify(serialize_conversion(row, include_output=True))


@app.get("/api/conversions")
@auth.require_auth
def list_conversions():
    page, page_size = paginate()
    offset = (page - 1) * page_size
    with db.get_conn() as conn:
        total = conn.execute(
            "SELECT COUNT(*) AS count FROM conversions WHERE user_id = ?", (g.user["id"],)
        ).fetchone()["count"]
        rows = conn.execute(
            "SELECT * FROM conversions WHERE user_id = ? "
            "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            (g.user["id"], page_size, offset),
        ).fetchall()

    return jsonify(
        items=[serialize_conversion(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.delete("/api/conversions/<int:conversion_id>")
@auth.require_auth
def delete_conversion(conversion_id: int):
    with db.get_conn() as conn:
        cursor = conn.execute(
            "DELETE FROM conversions WHERE id = ? AND user_id = ?",
            (conversion_id, g.user["id"]),
        )
        deleted = cursor.rowcount
    if not deleted:
        return error("Conversion not found", 404)
    return "", 204


@app.errorhandler(404)
def not_found(_exc):
    if request.path.startswith("/api/"):
        return error("Not found", 404)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return error("Not found", 404)

@app.errorhandler(405)
def method_not_allowed(_exc):
    if request.path.startswith("/api/"):
        return error("Method not allowed", 405)
    return error("Method not allowed", 405)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return error("Frontend build is not available", 404)


db.init_db()
