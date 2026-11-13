"""Flask entry point."""

import hashlib
import secrets
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

import db
from extract import extract_preview
from fetcher import FetchError, fetch_page, parse_url

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
TOKEN_TTL = 7 * 24 * 3600
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20
MAX_PAGE = 1_000_000

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024
app.teardown_appcontext(db.close_db)
db.init_db()

_DUMMY_HASH = generate_password_hash("dummy-password")


def error(message, status):
    return jsonify({"error": message}), status


@app.errorhandler(HTTPException)
def handle_http(exc):
    if request.path.startswith("/api/"):
        return error(exc.description or exc.name, exc.code or 500)
    return exc


@app.errorhandler(Exception)
def handle_unexpected(exc):
    app.logger.exception("unhandled error")
    return error("internal server error", 500)


@app.after_request
def security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        token = token.strip()
        if scheme.lower() != "bearer" or not token:
            return error("authentication required", 401)
        row = db.get_db().execute(
            "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id "
            "WHERE t.token_hash = ?",
            (hash_token(token),),
        ).fetchone()
        if row is None or row["expires_at"] < time.time():
            return error("authentication required", 401)
        g.user_id = row["id"]
        g.username = row["username"]
        return fn(*args, **kwargs)

    return wrapper


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def credentials():
    data = json_body()
    if data is None:
        return None, None
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return None, None
    return username, password


@app.post("/api/auth/register")
def register():
    username, password = credentials()
    if username is None:
        return error("username and password are required", 400)
    username = username.strip()
    if not 1 <= len(username) <= 64 or any(ord(c) < 32 or ord(c) == 127 for c in username):
        return error("username must be 1-64 characters", 400)
    if not 1 <= len(password) <= 256:
        return error("password must be 1-256 characters", 400)
    conn = db.get_db()
    try:
        conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        conn.commit()
    except db.sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password = credentials()
    if username is None:
        return error("username and password are required", 400)
    conn = db.get_db()
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    ok = check_password_hash(row["password_hash"] if row else _DUMMY_HASH, password)
    if row is None or not ok:
        return error("invalid username or password", 401)
    token = secrets.token_urlsafe(32)
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (time.time(),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (hash_token(token), row["id"], int(time.time()) + TOKEN_TTL),
    )
    conn.commit()
    return jsonify({"token": token}), 200


@app.get("/api/me")
@require_auth
def me():
    return jsonify({"username": g.username})


@app.post("/api/auth/logout")
@require_auth
def logout():
    header = request.headers.get("Authorization", "")
    token = header.partition(" ")[2].strip()
    conn = db.get_db()
    conn.execute("DELETE FROM tokens WHERE token_hash = ?", (hash_token(token),))
    conn.commit()
    return "", 204


def serialize(row):
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


def build_preview(url):
    page = fetch_page(url)
    data = {"title": None, "description": None, "image_url": None}
    if page["html"] is not None:
        data = extract_preview(page["html"], page["final_url"])
    return {**data, "final_url": page["final_url"], "status_code": page["status_code"]}


def fetch_or_error(url):
    try:
        return build_preview(url), None
    except FetchError as exc:
        return None, error(exc.message, exc.status)


def get_owned(preview_id):
    return db.get_db().execute(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user_id)
    ).fetchone()


@app.post("/api/previews")
@require_auth
def create_preview():
    data = json_body()
    if data is None or not isinstance(data.get("url"), str):
        return error("url is required", 400)
    try:
        url = parse_url(data["url"])[0]
    except FetchError as exc:
        return error(exc.message, exc.status)
    result, err = fetch_or_error(url)
    if err:
        return err
    conn = db.get_db()
    cur = conn.execute(
        "INSERT INTO previews (user_id, url, final_url, status_code, title, description, image_url, fetched_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user_id,
            url,
            result["final_url"],
            result["status_code"],
            result["title"],
            result["description"],
            result["image_url"],
            now_iso(),
        ),
    )
    conn.commit()
    row = get_owned(cur.lastrowid)
    return jsonify(serialize(row)), 201


def int_param(name, default, low, high):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        return None
    if not low <= value <= high:
        return None
    return value


@app.get("/api/previews")
@require_auth
def list_previews():
    page = int_param("page", 1, 1, MAX_PAGE)
    page_size = int_param("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)
    if page is None or page_size is None:
        return error("invalid page or page_size", 400)
    conn = db.get_db()
    total = conn.execute(
        "SELECT COUNT(*) FROM previews WHERE user_id = ?", (g.user_id,)
    ).fetchone()[0]
    rows = conn.execute(
        "SELECT * FROM previews WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {"items": [serialize(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    )


@app.get("/api/previews/<int:preview_id>")
@require_auth
def get_preview(preview_id):
    row = get_owned(preview_id)
    if row is None:
        return error("preview not found", 404)
    return jsonify(serialize(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@require_auth
def refresh_preview(preview_id):
    row = get_owned(preview_id)
    if row is None:
        return error("preview not found", 404)
    result, err = fetch_or_error(row["url"])
    if err:
        return err
    conn = db.get_db()
    conn.execute(
        "UPDATE previews SET final_url = ?, status_code = ?, title = ?, description = ?, "
        "image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
        (
            result["final_url"],
            result["status_code"],
            result["title"],
            result["description"],
            result["image_url"],
            now_iso(),
            preview_id,
            g.user_id,
        ),
    )
    conn.commit()
    return jsonify(serialize(get_owned(preview_id)))


@app.delete("/api/previews/<int:preview_id>")
@require_auth
def delete_preview(preview_id):
    conn = db.get_db()
    cur = conn.execute("DELETE FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user_id))
    conn.commit()
    if cur.rowcount == 0:
        return error("preview not found", 404)
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.route("/api/<path:_path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(_path):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
