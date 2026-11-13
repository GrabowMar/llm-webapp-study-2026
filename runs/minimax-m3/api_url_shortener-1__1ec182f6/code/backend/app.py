"""Flask entry point: JSON API for the URL shortener plus the built frontend."""

from __future__ import annotations

import os
import secrets
import string
import sys
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urlsplit

from flask import Flask, g, jsonify, redirect, request, send_from_directory
from itsdangerous import URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

try:  # pragma: no cover - import style depends on how the module is loaded
    from . import db
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import db  # type: ignore[no-redef]

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

ADMIN_USERNAME = "admin"
SHORT_CODE_ALPHABET = string.ascii_lowercase + string.digits
SHORT_CODE_LENGTH = 7
TOKEN_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
MAX_URL_LENGTH = 8192
MAX_USERNAME_LENGTH = 64
MAX_PASSWORD_LENGTH = 256

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _secret_key() -> bytes:
    """Return the signing key, persisted in the data directory when not given."""
    env_key = os.environ.get("SECRET_KEY", "").strip()
    if env_key:
        return env_key.encode("utf-8")
    db.DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_file = db.DATA_DIR / "secret_key"
    if key_file.is_file():
        stored = key_file.read_text(encoding="utf-8").strip()
        if stored:
            return stored.encode("utf-8")
    key = secrets.token_hex(32)
    key_file.write_text(key, encoding="utf-8")
    try:
        key_file.chmod(0o600)
    except OSError:
        pass
    return key.encode("utf-8")


serializer = URLSafeTimedSerializer(_secret_key(), salt="url-shortener-auth")


def admin_password() -> str:
    """The configured admin password, empty when admin sign-in is disabled."""
    return os.environ.get("ADMIN_PASSWORD", "").strip()


ADMIN_ENABLED = bool(admin_password())


def json_error(message: str, status: int) -> tuple[Any, int]:
    """JSON error body used by every API endpoint."""
    return jsonify({"error": message, "message": message}), status


def get_conn() -> Any:
    """Return the SQLite connection bound to the current request."""
    conn = getattr(g, "_db_conn", None)
    if conn is None:
        conn = db.connect()
        g._db_conn = conn
    return conn


@app.teardown_appcontext
def close_conn(_exc: BaseException | None) -> None:
    conn = getattr(g, "_db_conn", None)
    if conn is not None:
        conn.close()
        g._db_conn = None


def bootstrap() -> None:
    """Create the schema and keep the admin account in sync with the environment."""
    db.init_db()
    password = admin_password()
    conn = db.connect()
    try:
        row = conn.execute("SELECT id FROM users WHERE username = ?", (ADMIN_USERNAME,)).fetchone()
        if password:
            password_hash = generate_password_hash(password)
            if row is None:
                conn.execute(
                    "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 1, ?)",
                    (ADMIN_USERNAME, password_hash, now_iso()),
                )
            else:
                conn.execute(
                    "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                    (password_hash, row["id"]),
                )
        elif row is not None:
            conn.execute(
                "UPDATE users SET is_admin = 0, password_hash = ? WHERE id = ?",
                (generate_password_hash(secrets.token_urlsafe(32)), row["id"]),
            )
    finally:
        conn.close()


def issue_token(user_id: int, username: str) -> str:
    return serializer.dumps({"uid": user_id, "username": username})


def current_user() -> dict[str, Any] | None:
    """Return the signed-in user for this request, or None."""
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    try:
        payload = serializer.loads(token, max_age=TOKEN_MAX_AGE_SECONDS)
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    row = get_conn().execute(
        "SELECT id, username, is_admin FROM users WHERE id = ?", (payload.get("uid"),)
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])}


def require_user(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return json_error("authentication required", 401)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def require_admin(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return json_error("authentication required", 401)
        if not user["is_admin"]:
            return json_error("admin access required", 403)
        g.user = user
        return view(*args, **kwargs)

    return wrapper


def serialize_link(row: Any) -> dict[str, Any]:
    """Public representation of a link row."""
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"/r/{row['short_code']}",
        "owner": row["owner_username"],
        "owner_id": row["user_id"],
        "is_active": bool(row["is_active"]),
    }


def generate_short_code() -> str:
    """Return an unused short code."""
    conn = get_conn()
    for _ in range(32):
        code = "".join(secrets.choice(SHORT_CODE_ALPHABET) for _ in range(SHORT_CODE_LENGTH))
        exists = conn.execute("SELECT 1 FROM links WHERE short_code = ?", (code,)).fetchone()
        if exists is None:
            return code
    raise RuntimeError("unable to generate a unique short code")


def request_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


def pagination_args() -> tuple[int, int]:
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", DEFAULT_PAGE_SIZE, type=int)
    if page is None or page < 1:
        page = 1
    if page_size is None or page_size < 1:
        page_size = DEFAULT_PAGE_SIZE
    page_size = min(page_size, MAX_PAGE_SIZE)
    return page, page_size


def validate_url(raw: Any) -> tuple[str | None, str | None]:
    """Return (url, None) when valid, otherwise (None, message)."""
    if raw is None:
        return None, "a url is required"
    if not isinstance(raw, str):
        return None, "a url is required"
    url = raw.strip()
    if not url:
        return None, "a url is required"
    if len(url) > MAX_URL_LENGTH:
        return None, "the url is too long"
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https"):
        return None, "only http and https urls are accepted"
    if not parts.netloc:
        return None, "the url must contain a host"
    return url, None


@app.get("/api/health")
def health() -> Any:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register() -> Any:
    body = request_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("a username is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("a password is required", 400)
    username = username.strip()
    if len(username) > MAX_USERNAME_LENGTH:
        return json_error("the username is too long", 400)
    if len(password) > MAX_PASSWORD_LENGTH:
        return json_error("the password is too long", 400)

    conn = get_conn()
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if existing is not None:
        return json_error("that username is already taken", 409)
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
    except Exception:
        return json_error("that username is already taken", 409)
    return (
        jsonify({"id": cursor.lastrowid, "username": username, "is_admin": False}),
        201,
    )


@app.post("/api/auth/login")
def login() -> Any:
    body = request_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return json_error("a username is required", 400)
    if not isinstance(password, str) or not password:
        return json_error("a password is required", 400)
    username = username.strip()

    if username == ADMIN_USERNAME and not admin_password():
        return json_error("invalid username or password", 401)

    row = get_conn().execute(
        "SELECT id, username, password_hash, is_admin FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return json_error("invalid username or password", 401)

    token = issue_token(row["id"], row["username"])
    return jsonify(
        {
            "token": token,
            "user": {"id": row["id"], "username": row["username"], "is_admin": bool(row["is_admin"])},
        }
    )


@app.get("/api/me")
@require_user
def me() -> Any:
    user = g.user
    return jsonify({"id": user["id"], "username": user["username"], "is_admin": user["is_admin"]})


@app.post("/api/links")
@require_user
def create_link() -> Any:
    body = request_body()
    raw = None
    for key in ("url", "original_url", "long_url", "target", "address", "link"):
        if key in body:
            raw = body[key]
            break
    url, error = validate_url(raw)
    if error is not None:
        return json_error(error, 400)

    conn = get_conn()
    short_code = generate_short_code()
    cursor = conn.execute(
        "INSERT INTO links (user_id, original_url, short_code, click_count, is_active, created_at)"
        " VALUES (?, ?, ?, 0, 1, ?)",
        (g.user["id"], url, short_code, now_iso()),
    )
    row = conn.execute(
        "SELECT l.*, u.username AS owner_username FROM links l JOIN users u ON u.id = l.user_id"
        " WHERE l.id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(serialize_link(row)), 201


@app.get("/api/links")
def list_links() -> Any:
    page, page_size = pagination_args()
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) AS n FROM links WHERE is_active = 1").fetchone()["n"]
    rows = conn.execute(
        "SELECT l.*, u.username AS owner_username FROM links l JOIN users u ON u.id = l.user_id"
        " WHERE l.is_active = 1 ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/links/<int:link_id>")
def get_link(link_id: int) -> Any:
    row = get_conn().execute(
        "SELECT l.*, u.username AS owner_username FROM links l JOIN users u ON u.id = l.user_id"
        " WHERE l.id = ? AND l.is_active = 1",
        (link_id,),
    ).fetchone()
    if row is None:
        return json_error("link not found", 404)
    return jsonify(serialize_link(row))


@app.delete("/api/links/<int:link_id>")
@require_user
def delete_link(link_id: int) -> Any:
    conn = get_conn()
    row = conn.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    if row is None or not row["is_active"]:
        return json_error("link not found", 404)
    if row["user_id"] != g.user["id"]:
        return json_error("only the owner of a link may delete it", 403)
    conn.execute("DELETE FROM links WHERE id = ?", (link_id,))
    return "", 204


@app.get("/api/admin/links")
@require_admin
def admin_list_links() -> Any:
    page, page_size = pagination_args()
    conn = get_conn()
    total = conn.execute("SELECT COUNT(*) AS n FROM links").fetchone()["n"]
    rows = conn.execute(
        "SELECT l.*, u.username AS owner_username FROM links l JOIN users u ON u.id = l.user_id"
        " ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize_link(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
@require_admin
def admin_toggle_link(link_id: int) -> Any:
    conn = get_conn()
    row = conn.execute("SELECT * FROM links WHERE id = ?", (link_id,)).fetchone()
    if row is None:
        return json_error("link not found", 404)
    new_state = 0 if row["is_active"] else 1
    conn.execute("UPDATE links SET is_active = ? WHERE id = ?", (new_state, link_id))
    updated = conn.execute(
        "SELECT l.*, u.username AS owner_username FROM links l JOIN users u ON u.id = l.user_id"
        " WHERE l.id = ?",
        (link_id,),
    ).fetchone()
    return jsonify(serialize_link(updated))


@app.get("/r/<code>")
def follow(code: str) -> Any:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, original_url FROM links WHERE short_code = ? AND is_active = 1", (code,)
    ).fetchone()
    if row is None:
        return json_error("link not found", 404)
    conn.execute("UPDATE links SET click_count = click_count + 1 WHERE id = ?", (row["id"],))
    return redirect(row["original_url"], code=302)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html") -> Any:
    if path == "api" or path.startswith("api/"):
        return json_error("not found", 404)
    if path == "r" or path.startswith("r/"):
        return json_error("link not found", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    index = DIST / "index.html"
    if index.is_file():
        return send_from_directory(DIST, "index.html")
    return (
        "The frontend build is missing. Run 'npm run build' inside the frontend directory.",
        404,
    )


@app.errorhandler(404)
def handle_404(error: Any) -> Any:
    if request.path.startswith("/api"):
        return json_error("not found", 404)
    return frontend()


@app.errorhandler(405)
def handle_405(error: Any) -> Any:
    if request.path.startswith("/api"):
        return json_error("method not allowed", 405)
    return ("Method Not Allowed", 405)


@app.errorhandler(500)
def handle_500(error: Any) -> Any:  # pragma: no cover - defensive
    if request.path.startswith("/api"):
        return json_error("internal server error", 500)
    return ("Internal Server Error", 500)


bootstrap()
