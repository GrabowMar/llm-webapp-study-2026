"""Flask entry point: JSON API for link previews plus the built frontend."""

import sqlite3
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

import db
from auth import hash_password, issue_token, require_auth, verify_password
from fetcher import fetch, normalize_url
from utils import now_iso

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024


def serialize_preview(row) -> dict:
    """Convert a preview row into its JSON representation."""
    return {
        "id": row["id"],
        "url": row["url"],
        "final_url": row["final_url"],
        "status_code": row["status_code"],
        "title": row["title"],
        "description": row["description"],
        "image_url": row["image_url"],
        "fetched_at": row["fetched_at"],
    }


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def credentials() -> tuple[str, str]:
    raw = body()
    username = str(raw.get("username") or "").strip()
    password = raw.get("password")
    if not isinstance(password, str):
        password = ""
    return username, password


def paginate() -> tuple[int, int]:
    def as_int(name: str, default: int) -> int:
        try:
            return int(request.args.get(name, default))
        except (TypeError, ValueError):
            return default

    page = max(1, as_int("page", 1))
    page_size = min(MAX_PAGE_SIZE, max(1, as_int("page_size", DEFAULT_PAGE_SIZE)))
    return page, page_size


db.init_app(app)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if len(username) > 128:
        return jsonify({"error": "username is too long"}), 400
    if len(password) > 512:
        return jsonify({"error": "password is too long"}), 400

    timestamp = now_iso()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), timestamp),
        )
    except sqlite3.IntegrityError:
        return jsonify({"error": "username is already taken"}), 409

    user_id = cursor.lastrowid
    token = issue_token(user_id)
    return jsonify({"id": user_id, "username": username, "token": token}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    row = db.query_one("SELECT id, username, password_hash FROM users WHERE username = ?", (username,))
    if row is None or not verify_password(password, row["password_hash"]):
        return jsonify({"error": "invalid username or password"}), 401

    token = issue_token(row["id"])
    return jsonify({"token": token, "username": row["username"], "id": row["id"]}), 200


@app.post("/api/previews")
@require_auth
def create_preview():
    raw_url = str(body().get("url") or "").strip()
    if not raw_url:
        return jsonify({"error": "url is required"}), 400

    target = normalize_url(raw_url)
    if target is None:
        return jsonify({"error": "url must be an http or https address"}), 400

    result = fetch(target)
    timestamp = now_iso()
    cursor = db.execute(
        "INSERT INTO previews "
        "(user_id, url, final_url, status_code, title, description, image_url, fetched_at, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user["id"],
            raw_url,
            result.final_url,
            result.status_code,
            result.title,
            result.description,
            result.image_url,
            timestamp,
            timestamp,
        ),
    )
    row = db.query_one("SELECT * FROM previews WHERE id = ?", (cursor.lastrowid,))
    return jsonify(serialize_preview(row)), 201


@app.get("/api/previews")
@require_auth
def list_previews():
    page, page_size = paginate()
    user_id = g.user["id"]

    total = db.query_one("SELECT COUNT(*) AS count FROM previews WHERE user_id = ?", (user_id,))["count"]
    rows = db.query(
        "SELECT * FROM previews WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (user_id, page_size, (page - 1) * page_size),
    )
    return jsonify(
        {
            "items": [serialize_preview(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def owned_preview(preview_id: int):
    return db.query_one(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user["id"])
    )


@app.get("/api/previews/<int:preview_id>")
@require_auth
def get_preview(preview_id: int):
    row = owned_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404
    return jsonify(serialize_preview(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@require_auth
def refresh_preview(preview_id: int):
    row = owned_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404

    target = normalize_url(row["url"]) or row["url"]
    result = fetch(target)
    timestamp = now_iso()
    db.execute(
        "UPDATE previews SET final_url = ?, status_code = ?, title = ?, description = ?, "
        "image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
        (
            result.final_url,
            result.status_code,
            result.title,
            result.description,
            result.image_url,
            timestamp,
            preview_id,
            g.user["id"],
        ),
    )
    updated = db.query_one("SELECT * FROM previews WHERE id = ?", (preview_id,))
    return jsonify(serialize_preview(updated)), 200


@app.delete("/api/previews/<int:preview_id>")
@require_auth
def delete_preview(preview_id: int):
    row = owned_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404
    db.execute("DELETE FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user["id"]))
    return "", 204


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return serve_frontend()


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return serve_frontend()


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    return serve_frontend(path)


def serve_frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "frontend build not found"}), 404


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
