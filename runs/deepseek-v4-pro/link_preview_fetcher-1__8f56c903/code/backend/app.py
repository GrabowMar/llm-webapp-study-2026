"""Link preview bookmarking app."""

import html
import re
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

app = Flask(__name__, static_folder=None)

USER_AGENT = (
    "Mozilla/5.0 (compatible; LinkPreviewBot/1.0; +https://example.com)"
)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS previews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                url TEXT NOT NULL,
                final_url TEXT NOT NULL,
                status_code INTEGER,
                title TEXT,
                description TEXT,
                image_url TEXT,
                fetched_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_previews_user ON previews(user_id, id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_user_by_token(token: str):
    row = get_db().execute(
        "SELECT u.* FROM users u JOIN sessions s ON s.user_id = u.id WHERE s.token = ?",
        (token,),
    ).fetchone()
    return row


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "unauthorized"}), 401
        token = auth[len("Bearer "):].strip()
        user = get_user_by_token(token)
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if existing is not None:
        return jsonify({"error": "username already taken"}), 409

    password_hash = generate_password_hash(password)
    cursor = db.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, password_hash),
    )
    db.commit()
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    db = get_db()
    user = db.execute(
        "SELECT * FROM users WHERE username = ?", (username,)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


def clean_text(value: str) -> str:
    if value is None:
        return None
    value = html.unescape(value)
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def _fetch(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=10) as resp:
        final_url = resp.geturl()
        status_code = resp.getcode()
        content_type = resp.headers.get("Content-Type", "")
        data = resp.read(1024 * 1024)
        if "charset=" in content_type:
            match = re.search(r"charset=([\w-]+)", content_type, re.IGNORECASE)
            encoding = match.group(1) if match else "utf-8"
        else:
            encoding = "utf-8"
        try:
            text = data.decode(encoding, errors="replace")
        except LookupError:
            text = data.decode("utf-8", errors="replace")
    return final_url, status_code, text


def _extract_meta(text: str) -> dict:
    title = None
    m = re.search(r"<title[^>]*>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
    if m:
        title = clean_text(re.sub(r"<[^>]+>", "", m.group(1)))

    description = None
    m = re.search(
        r'<meta[^>]+name=["\']description["\'][^>]*content=["\'](.*?)["\']',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]*name=["\']description["\']',
            text,
            re.IGNORECASE | re.DOTALL,
        )
    if m:
        description = clean_text(m.group(1))

    og_title = None
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']og:title["\'][^>]*content=["\'](.*?)["\']',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]*(?:property|name)=["\']og:title["\']',
            text,
            re.IGNORECASE | re.DOTALL,
        )
    if m:
        og_title = clean_text(m.group(1))

    og_description = None
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']og:description["\'][^>]*content=["\'](.*?)["\']',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]*(?:property|name)=["\']og:description["\']',
            text,
            re.IGNORECASE | re.DOTALL,
        )
    if m:
        og_description = clean_text(m.group(1))

    og_image = None
    m = re.search(
        r'<meta[^>]+(?:property|name)=["\']og:image["\'][^>]*content=["\'](.*?)["\']',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        m = re.search(
            r'<meta[^>]+content=["\'](.*?)["\'][^>]*(?:property|name)=["\']og:image["\']',
            text,
            re.IGNORECASE | re.DOTALL,
        )
    if m:
        og_image = clean_text(m.group(1))

    return {
        "title": og_title or title,
        "description": og_description or description,
        "image_url": og_image,
    }


def fetch_preview(url: str) -> dict:
    final_url, status_code, text = _fetch(url)
    meta = _extract_meta(text)
    return {
        "final_url": final_url,
        "status_code": status_code,
        "title": meta["title"],
        "description": meta["description"],
        "image_url": meta["image_url"],
    }


def preview_to_dict(row) -> dict:
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


@app.post("/api/previews")
@require_auth
def create_preview():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    if not url:
        return jsonify({"error": "url is required"}), 400
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return jsonify({"error": "invalid url"}), 400

    try:
        info = fetch_preview(url)
    except urllib.error.HTTPError as exc:
        info = {
            "final_url": exc.geturl(),
            "status_code": exc.code,
            "title": None,
            "description": None,
            "image_url": None,
        }
    except Exception as exc:
        return jsonify({"error": f"could not fetch url: {exc}"}), 422

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO previews
            (user_id, url, final_url, status_code, title, description, image_url, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            g.user["id"],
            url,
            info["final_url"],
            info["status_code"],
            info["title"],
            info["description"],
            info["image_url"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM previews WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(preview_to_dict(row)), 201


@app.get("/api/previews")
@require_auth
def list_previews():
    page = request.args.get("page", 1, type=int)
    page_size = request.args.get("page_size", 20, type=int)
    if page < 1:
        page = 1
    if page_size < 1:
        page_size = 20
    if page_size > 100:
        page_size = 100

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM previews WHERE user_id = ?", (g.user["id"],)
    ).fetchone()[0]
    rows = db.execute(
        """
        SELECT * FROM previews WHERE user_id = ?
        ORDER BY id DESC
        LIMIT ? OFFSET ?
        """,
        (g.user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [preview_to_dict(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def _own_preview(preview_id):
    db = get_db()
    row = db.execute(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?",
        (preview_id, g.user["id"]),
    ).fetchone()
    return row


@app.get("/api/previews/<int:preview_id>")
@require_auth
def get_preview(preview_id):
    row = _own_preview(preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(preview_to_dict(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@require_auth
def refresh_preview(preview_id):
    row = _own_preview(preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    try:
        info = fetch_preview(row["url"])
    except urllib.error.HTTPError as exc:
        info = {
            "final_url": exc.geturl(),
            "status_code": exc.code,
            "title": None,
            "description": None,
            "image_url": None,
        }
    except Exception as exc:
        return jsonify({"error": f"could not fetch url: {exc}"}), 422

    db = get_db()
    db.execute(
        """
        UPDATE previews
        SET final_url = ?, status_code = ?, title = ?, description = ?, image_url = ?, fetched_at = ?
        WHERE id = ?
        """,
        (
            info["final_url"],
            info["status_code"],
            info["title"],
            info["description"],
            info["image_url"],
            now_iso(),
            preview_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM previews WHERE id = ?", (preview_id,)).fetchone()
    return jsonify(preview_to_dict(row))


@app.delete("/api/previews/<int:preview_id>")
@require_auth
def delete_preview(preview_id):
    row = _own_preview(preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    db = get_db()
    db.execute("DELETE FROM previews WHERE id = ?", (preview_id,))
    db.commit()
    return jsonify({"deleted": preview_id})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
