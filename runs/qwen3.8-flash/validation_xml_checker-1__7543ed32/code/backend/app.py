"""Flask entry point: XML well-formedness API + frontend static server."""

import re
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import auth
from db import get_conn, init_db, now_iso
from xmlcheck import check_xml

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

PREVIEW_LEN = 200
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.:@-]{3,64}$")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

init_db()


def json_body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def current_user() -> dict | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return auth.user_for_token(header[7:].strip())
    return None


def require_user():
    user = current_user()
    if user is None:
        return None, (jsonify({"error": "authentication required"}), 401)
    return user, None


def row_to_check(row) -> dict:
    return {
        "id": row["id"],
        "xml_preview": row["xml_preview"],
        "valid": bool(row["valid"]),
        "error": row["error"],
        "line": row["line"],
        "column": row["column"],
        "root_element": row["root_element"],
        "created_at": row["created_at"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    if not USERNAME_RE.match(username):
        return jsonify({"error": "username must be 3-64 characters (letters, digits, _.:@-)"}), 400
    if len(password) < 6:
        return jsonify({"error": "password must be at least 6 characters"}), 400
    if auth.create_user(username, password) is None:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = str(body.get("username") or "").strip()
    password = str(body.get("password") or "")
    user_id = auth.verify_user(username, password)
    if user_id is None:
        return jsonify({"error": "invalid username or password"}), 401
    return jsonify({"token": auth.issue_token(user_id)}), 200


@app.post("/api/validate/xml")
def validate_xml():
    body = json_body()
    if "xml" not in body or body["xml"] is None:
        return jsonify({"error": "field 'xml' is required"}), 400
    xml = body["xml"]
    if not isinstance(xml, str):
        return jsonify({"error": "field 'xml' must be a string"}), 400
    return jsonify(check_xml(xml)), 200


@app.post("/api/validations")
def create_validation():
    user, err = require_user()
    if err:
        return err
    body = json_body()
    if "xml" not in body or body["xml"] is None:
        return jsonify({"error": "field 'xml' is required"}), 400
    xml = body["xml"]
    if not isinstance(xml, str):
        return jsonify({"error": "field 'xml' must be a string"}), 400
    result = check_xml(xml)
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO validations"
            " (user_id, xml_preview, valid, error, line, \"column\", root_element, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user["id"],
                xml[:PREVIEW_LEN],
                1 if result["valid"] else 0,
                result["error"],
                result["line"],
                result["column"],
                result["root_element"],
                now_iso(),
            ),
        )
        row = conn.execute(
            "SELECT * FROM validations WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
    return jsonify(row_to_check(row)), 201


@app.get("/api/validations")
def list_validations():
    user, err = require_user()
    if err:
        return err
    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        return jsonify({"error": "page must be an integer"}), 400
    try:
        page_size = min(100, max(1, int(request.args.get("page_size", 10))))
    except ValueError:
        return jsonify({"error": "page_size must be an integer"}), 400

    where = ["user_id = ?"]
    params: list = [user["id"]]
    valid = request.args.get("valid")
    if valid is not None and valid != "":
        if valid.lower() in ("true", "1"):
            where.append("valid = 1")
        elif valid.lower() in ("false", "0"):
            where.append("valid = 0")
        else:
            return jsonify({"error": "valid must be true or false"}), 400
    clause = " AND ".join(where)

    with get_conn() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) AS n FROM validations WHERE {clause}", params
        ).fetchone()["n"]
        rows = conn.execute(
            f"SELECT * FROM validations WHERE {clause}"
            " ORDER BY id DESC LIMIT ? OFFSET ?",
            (*params, page_size, (page - 1) * page_size),
        ).fetchall()

    return jsonify(
        {
            "items": [row_to_check(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.delete("/api/validations/<int:check_id>")
def delete_validation(check_id: int):
    user, err = require_user()
    if err:
        return err
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM validations WHERE id = ? AND user_id = ?",
            (check_id, user["id"]),
        )
        if cur.rowcount == 0:
            return jsonify({"error": "not found"}), 404
    return jsonify({"deleted": check_id}), 200


@app.errorhandler(404)
def api_not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return e


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "document too large"}), 413


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
