"""Flask entry point: link preview API + frontend hosting."""

import hashlib
import hmac
import re
import secrets
import sqlite3
import unicodedata
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, g, jsonify, request, send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "app.db"

PBKDF2_ITERATIONS = 240_000
FETCH_TIMEOUT = 10
MAX_BODY_BYTES = 1_000_000
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash BLOB NOT NULL,
    salt BLOB NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS previews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    final_url TEXT,
    status_code INTEGER,
    title TEXT,
    description TEXT,
    image_url TEXT,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_previews_user ON previews (user_id, id DESC);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode = WAL")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = _connect()
    return g.db


@app.teardown_appcontext
def _close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# --- auth -----------------------------------------------------------------


def _hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)


def current_user():
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token.strip(),),
    ).fetchone()
    return row


def login_required(view):
    from functools import wraps

    @wraps(view)
    def wrapped(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify({"error": "authentication required"}), 401
        g.user = user
        return view(*args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip() or not password:
        return jsonify({"error": "username and password are required"}), 400
    username = username.strip()
    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return jsonify({"error": "username already taken"}), 409
    salt = secrets.token_bytes(16)
    db.execute(
        "INSERT INTO users (username, password_hash, salt, created_at) VALUES (?, ?, ?, ?)",
        (username, _hash_password(password, salt), salt, _now()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400
    row = get_db().execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    if row is None or not hmac.compare_digest(row["password_hash"], _hash_password(password, row["salt"])):
        return jsonify({"error": "invalid credentials"}), 401
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, row["id"], _now()))
    db.commit()
    return jsonify({"token": token}), 200


@app.post("/api/auth/logout")
@login_required
def logout():
    header = request.headers.get("Authorization", "")
    _, _, token = header.partition(" ")
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token.strip(),))
    db.commit()
    return "", 204


# --- page fetching / parsing ----------------------------------------------


class _MetaParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self._in_title = False
        self.title_done = False
        self.metas: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        if tag == "title" and not self.title_done:
            self._in_title = True
        elif tag == "meta":
            attr = {k.lower(): (v or "") for k, v in attrs if k}
            key = (attr.get("property") or attr.get("name") or "").strip().lower()
            content = attr.get("content")
            if key and content is not None:
                self.metas.setdefault(key, content)

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self._in_title = False
            self.title_done = True

    def handle_data(self, data):
        if self._in_title:
            self.title_parts.append(data)


_WHITESPACE_RE = re.compile(r"\s+")
_STRIP_TAGS_RE = re.compile(r"<[^>]*>")
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _plain_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = _STRIP_TAGS_RE.sub(" ", value)
    value = unicodedata.normalize("NFC", value)
    value = _CONTROL_CHARS_RE.sub("", value)
    value = _WHITESPACE_RE.sub(" ", value).strip()
    return value or None


def _parse_preview_html(html_text: str, base_url: str) -> dict:
    parser = _MetaParser()
    try:
        parser.feed(html_text)
        parser.close()
    except Exception:
        pass
    title = _plain_text(" ".join(parser.title_parts))
    description = _plain_text(parser.metas.get("description"))
    og_title = _plain_text(parser.metas.get("og:title"))
    og_description = _plain_text(parser.metas.get("og:description"))
    og_image = parser.metas.get("og:image", "").strip()
    image_url = None
    if og_image:
        image_url = urljoin(base_url, og_image)
    return {
        "title": og_title or title,
        "description": og_description or description,
        "image_url": image_url,
    }


def _normalize_url(url: str) -> str:
    url = url.strip()
    if url and not urlparse(url).scheme:
        url = "https://" + url
    return url


def _fetch_preview_data(url: str) -> dict:
    resp = requests.get(
        url,
        timeout=FETCH_TIMEOUT,
        allow_redirects=True,
        stream=True,
        headers={"User-Agent": "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)"},
    )
    try:
        raw = resp.raw.read(MAX_BODY_BYTES + 1, decode_content=True)
        truncated = len(raw) > MAX_BODY_BYTES
        body = raw[:MAX_BODY_BYTES]
        encoding = resp.encoding or "utf-8"
        try:
            text = body.decode(encoding, errors="replace")
        except LookupError:
            text = body.decode("utf-8", errors="replace")
        ctype = resp.headers.get("Content-Type", "")
        meta = {}
        if truncated or "html" in ctype.lower() or not ctype:
            meta = _parse_preview_html(text, str(resp.url))
        image = meta.get("image_url")
        if image:
            parsed = urlparse(image)
            if parsed.scheme not in ("http", "https"):
                image = None
        return {
            "final_url": str(resp.url),
            "status_code": resp.status_code,
            "title": meta.get("title"),
            "description": meta.get("description"),
            "image_url": image,
        }
    finally:
        resp.close()


# --- previews ---------------------------------------------------------------


def _serialize(row: sqlite3.Row) -> dict:
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


def _get_owned_preview(db, user_id: int, preview_id: int):
    return db.execute(
        "SELECT * FROM previews WHERE id = ? AND user_id = ?",
        (preview_id, user_id),
    ).fetchone()


def _create_or_update(db, user_id: int, preview_id: int | None, url: str):
    data = _fetch_preview_data(url)
    fetched_at = _now()
    if preview_id is None:
        cur = db.execute(
            "INSERT INTO previews (user_id, url, final_url, status_code, title, description, image_url, fetched_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, url, data["final_url"], data["status_code"], data["title"], data["description"], data["image_url"], fetched_at),
        )
        preview_id = cur.lastrowid
    else:
        db.execute(
            "UPDATE previews SET final_url = ?, status_code = ?, title = ?, description = ?, image_url = ?, fetched_at = ?"
            " WHERE id = ? AND user_id = ?",
            (data["final_url"], data["status_code"], data["title"], data["description"], data["image_url"], fetched_at, preview_id, user_id),
        )
    db.commit()
    return _get_owned_preview(db, user_id, preview_id)


@app.post("/api/previews")
@login_required
def create_preview():
    data = request.get_json(silent=True) or {}
    url = data.get("url")
    if not isinstance(url, str) or not url.strip():
        return jsonify({"error": "url is required"}), 400
    url = _normalize_url(url)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return jsonify({"error": "invalid url"}), 400
    try:
        row = _create_or_update(get_db(), g.user["id"], None, url)
    except requests.RequestException:
        return jsonify({"error": "could not fetch url"}), 400
    return jsonify(_serialize(row)), 201


@app.get("/api/previews")
@login_required
def list_previews():
    def _int_arg(name, default):
        raw = request.args.get(name)
        if raw is None:
            return default
        try:
            value = int(raw)
        except ValueError:
            return default
        return max(value, 1)

    page = _int_arg("page", 1)
    page_size = min(_int_arg("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    db = get_db()
    total = db.execute("SELECT COUNT(*) AS c FROM previews WHERE user_id = ?", (g.user["id"],)).fetchone()["c"]
    rows = db.execute(
        "SELECT * FROM previews WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (g.user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [_serialize(r) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/previews/<int:preview_id>")
@login_required
def get_preview(preview_id: int):
    row = _get_owned_preview(get_db(), g.user["id"], preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    return jsonify(_serialize(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@login_required
def refresh_preview(preview_id: int):
    db = get_db()
    row = _get_owned_preview(db, g.user["id"], preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    try:
        row = _create_or_update(db, g.user["id"], preview_id, row["url"])
    except requests.RequestException:
        return jsonify({"error": "could not fetch url"}), 400
    return jsonify(_serialize(row))


@app.delete("/api/previews/<int:preview_id>")
@login_required
def delete_preview(preview_id: int):
    db = get_db()
    row = _get_owned_preview(db, g.user["id"], preview_id)
    if row is None:
        return jsonify({"error": "not found"}), 404
    db.execute("DELETE FROM previews WHERE id = ?", (preview_id,))
    db.commit()
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.errorhandler(404)
def not_found(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(err):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    candidate = (DIST / path).resolve()
    if candidate.is_file() and candidate.is_relative_to(DIST):
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


_init_db()
