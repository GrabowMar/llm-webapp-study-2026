"""Flask entry point.

The app exposes the JSON API under ``/api`` and serves the built frontend
from ``frontend/dist`` for every other path.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask, g, jsonify, request, send_from_directory

import db
from auth import (
    authenticate,
    create_token,
    create_user,
    current_user,
    login_required,
    utc_now,
)
from xmlcheck import check_document

DIST = BACKEND_DIR.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(db.close_db)


def json_error(message: str, status: int) -> Tuple[Any, int]:
    return jsonify({"error": message}), status


def body_payload() -> Dict[str, Any]:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def bool_arg(name: str) -> Optional[bool]:
    raw = request.args.get(name)
    if raw is None:
        return None
    value = raw.strip().lower()
    if value in ("true", "1", "yes", "on"):
        return True
    if value in ("false", "0", "no", "off"):
        return False
    return None


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    payload = body_payload()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("username is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("password is required", 400)

    user_id, error = create_user(username.strip(), password)
    if user_id is None:
        return json_error(error or "could not create the account", 409)

    token = create_token(user_id)
    return jsonify({"id": user_id, "username": username.strip(), "token": token}), 201


@app.post("/api/auth/login")
def login():
    payload = body_payload()
    username = payload.get("username")
    password = payload.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("username is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("password is required", 400)

    user = authenticate(username.strip(), password)
    if user is None:
        return json_error("invalid username or password", 401)

    token = create_token(int(user["id"]))
    return jsonify({"id": int(user["id"]), "username": user["username"], "token": token}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return json_error("authentication required", 401)
    return jsonify({"id": int(user["id"]), "username": user["username"]}), 200


@app.post("/api/validate/xml")
def validate_xml():
    payload = body_payload()
    xml_text = payload.get("xml")
    if not isinstance(xml_text, str):
        return json_error("xml is required", 400)
    return jsonify(check_document(xml_text)), 200


@app.post("/api/validations")
@login_required
def create_validation():
    payload = body_payload()
    xml_text = payload.get("xml")
    if not isinstance(xml_text, str):
        return json_error("xml is required", 400)

    result = check_document(xml_text)
    cursor = db.get_db().execute(
        "INSERT INTO validations "
        "(user_id, xml_preview, valid, error, err_line, err_column, root_element, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            int(g.user["id"]),
            xml_text[:200],
            1 if result["valid"] else 0,
            result["error"],
            result["line"],
            result["column"],
            result["root_element"],
            utc_now(),
        ),
    )
    db.get_db().commit()

    row = db.get_db().execute(
        "SELECT * FROM validations WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(db.serialize_validation(row)), 201


@app.get("/api/validations")
@login_required
def list_validations():
    user_id = int(g.user["id"])
    valid_filter = bool_arg("valid")
    page = int_arg("page", 1, 1, 1_000_000)
    page_size = int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    total = db.count_validations(user_id, valid_filter)
    rows = db.fetch_validations(user_id, valid_filter, page_size, (page - 1) * page_size)

    return jsonify(
        {
            "items": [db.serialize_validation(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


@app.delete("/api/validations/<int:validation_id>")
@login_required
def delete_validation(validation_id: int):
    cursor = db.get_db().execute(
        "DELETE FROM validations WHERE id = ? AND user_id = ?",
        (validation_id, int(g.user["id"])),
    )
    db.get_db().commit()
    if cursor.rowcount == 0:
        return json_error("validation not found", 404)
    return "", 204


@app.errorhandler(404)
def not_found(_error: Any):
    if request.path.startswith("/api/"):
        return json_error("not found", 404)
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return json_error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


db.init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
