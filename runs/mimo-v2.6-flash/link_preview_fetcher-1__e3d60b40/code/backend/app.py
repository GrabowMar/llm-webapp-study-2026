"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

from db import close_db, get_db, init_db
from fetcher import FetchError, InvalidURL, fetch_preview
from security import hash_password, new_token, verify_password

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)
init_db()


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _json_body() -> dict:
    data = request.get_json(silent=True, force=True)
    return data if isinstance(data, dict) else {}


def _token_user_id() -> int | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    token = token.strip()
    if scheme.strip().lower() != "bearer" or not token:
        return None
    row = get_db().execute(
        "SELECT user_id FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    return int(row["user_id"]) if row else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user_id = _token_user_id()
        if user_id is None:
            return jsonify({"error": "authentication required"}), 401
        g.user_id = user_id
        return view(*args, **kwargs)

    return wrapped


def _preview_json(row: sqlite3.Row) -> dict:
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


def _get_own_preview(preview_id: int) -> sqlite3.Row | None:
    return get_db().execute(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?",
        (preview_id, g.user_id),
    ).fetchone()


def _page_params() -> tuple[int, int]:
    def parse(name: str, default: int, low: int, high: int) -> int:
        raw = request.args.get(name)
        if raw is None or not str(raw).strip():
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        return max(low, min(value, high))

    page = parse("page", 1, 1, 1_000_000)
    page_size = parse("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    return page, page_size


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = _json_body()
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    try:
        cursor = get_db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), utc_now()),
        )
        get_db().commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "username already taken"}), 409
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = _json_body()
    username = str(data.get("username") or "").strip()
    password = str(data.get("password") or "")
    row = None
    if username and password:
        row = get_db().execute(
            "SELECT id, password_hash FROM users WHERE username = ?", (username,)
        ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return jsonify({"error": "invalid username or password"}), 401
    token = new_token()
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], utc_now()),
    )
    get_db().commit()
    return jsonify({"token": token}), 200


@app.post("/api/previews")
@login_required
def create_preview():
    data = _json_body()
    url = str(data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400
    try:
        fetched = fetch_preview(url)
    except InvalidURL as error:
        return jsonify({"error": str(error)}), 400
    except FetchError as error:
        return jsonify({"error": str(error)}), 502

    now = utc_now()
    cursor = get_db().execute(
        """
        INSERT INTO previews
            (user_id, url, final_url, status_code, title, description, image_url, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            g.user_id,
            url,
            fetched.final_url,
            fetched.status_code,
            fetched.title,
            fetched.description,
            fetched.image_url,
            now,
        ),
    )
    get_db().commit()
    row = _get_own_preview(int(cursor.lastrowid))
    return jsonify(_preview_json(row)), 201


@app.get("/api/previews")
@login_required
def list_previews():
    page, page_size = _page_params()
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM previews WHERE user_id = ?", (g.user_id,)
    ).fetchone()[0]
    rows = db.execute(
        """
        SELECT * FROM previews WHERE user_id = ?
        ORDER BY id DESC LIMIT ? OFFSET ?
        """,
        (g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [_preview_json(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/previews/<int:preview_id>")
@login_required
def get_preview(preview_id: int):
    row = _get_own_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404
    return jsonify(_preview_json(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@login_required
def refresh_preview(preview_id: int):
    row = _get_own_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404
    try:
        fetched = fetch_preview(row["url"])
    except InvalidURL as error:
        return jsonify({"error": str(error)}), 400
    except FetchError as error:
        return jsonify({"error": str(error)}), 502
    get_db().execute(
        """
        UPDATE previews
        SET final_url = ?, status_code = ?, title = ?, description = ?,
            image_url = ?, fetched_at = ?
        WHERE id = ? AND user_id = ?
        """,
        (
            fetched.final_url,
            fetched.status_code,
            fetched.title,
            fetched.description,
            fetched.image_url,
            utc_now(),
            preview_id,
            g.user_id,
        ),
    )
    get_db().commit()
    return jsonify(_preview_json(_get_own_preview(preview_id)))


@app.delete("/api/previews/<int:preview_id>")
@login_required
def delete_preview(preview_id: int):
    row = _get_own_preview(preview_id)
    if row is None:
        return jsonify({"error": "preview not found"}), 404
    get_db().execute(
        "DELETE FROM previews WHERE id = ? AND user_id = ?",
        (preview_id, g.user_id),
    )
    get_db().commit()
    return "", 204


@app.route("/api/<path:rest>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def unknown_api(rest: str):
    return jsonify({"error": "not found"}), 404


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
