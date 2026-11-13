"""Link bookmarking app with page previews."""

from __future__ import annotations

import ipaddress
import json
import re
import secrets
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from functools import wraps
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Callable

from flask import Flask, Response, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path("data")
DB_PATH = DATA_DIR / "app.db"

FETCH_TIMEOUT = 15
MAX_BODY_BYTES = 5 * 1024 * 1024
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
USER_AGENT = "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS previews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    final_url TEXT NOT NULL DEFAULT '',
    status_code INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL DEFAULT '',
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_previews_user ON previews(user_id, id);
"""

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clean_text(value: str) -> str:
    """Turn text taken from a fetched page into plain text."""
    value = re.sub(r"<[^>]*>", " ", value)
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def preview_dict(row: sqlite3.Row) -> dict[str, Any]:
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


def error(message: str, status: int) -> tuple[Response, int]:
    return jsonify({"error": message}), status


def get_json_body() -> dict[str, Any]:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    if request.data:
        try:
            parsed = json.loads(request.data)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
    return {}


class PageParser(HTMLParser):
    """Extracts <title> and interesting <meta> values from an HTML page."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._in_title = False
        self._title_parts: list[str] = []
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "title":
            self._in_title = True
            return
        if tag != "meta":
            return
        data = {key.lower(): value for key, value in attrs if value is not None}
        name = (data.get("property") or data.get("name") or "").strip().lower()
        content = data.get("content")
        if name and content is not None and name not in self.meta:
            self.meta[name] = content

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)

    @property
    def title(self) -> str:
        return clean_text("".join(self._title_parts))


def decode_body(body: bytes, charset: str | None) -> str:
    candidates: list[str] = []
    if charset:
        candidates.append(charset)
    head = body[:4096].decode("ascii", errors="replace")
    match = re.search(r"charset=[\"']?([\w.:-]+)", head, re.IGNORECASE)
    if match:
        candidates.append(match.group(1))
    candidates.append("utf-8")
    for encoding in candidates:
        try:
            return body.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return body.decode("utf-8", errors="replace")


def is_loopback(host: str) -> bool:
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def fetch_page(url: str) -> dict[str, Any]:
    """Fetch ``url`` and build preview values from the returned page."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError("url must be an absolute http(s) URL")

    request_ = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
    )
    if is_loopback(parts.hostname or ""):
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    else:
        opener = urllib.request.build_opener()

    charset: str | None = None
    try:
        with opener.open(request_, timeout=FETCH_TIMEOUT) as response:
            body = response.read(MAX_BODY_BYTES)
            status_code = response.status
            final_url = response.geturl()
            charset = response.headers.get_content_charset()
    except urllib.error.HTTPError as exc:
        body = exc.read(MAX_BODY_BYTES)
        status_code = exc.code
        final_url = exc.geturl() or url
        if exc.headers is not None:
            charset = exc.headers.get_content_charset()

    parser = PageParser()
    try:
        parser.feed(decode_body(body, charset))
        parser.close()
    except Exception:
        pass

    title = clean_text(parser.meta.get("og:title", "")) or parser.title
    description = clean_text(
        parser.meta.get("og:description", "") or parser.meta.get("description", "")
    )
    image = clean_text(parser.meta.get("og:image", ""))
    image_url = urllib.parse.urljoin(final_url, image) if image else ""

    return {
        "final_url": final_url,
        "status_code": status_code,
        "title": title,
        "description": description,
        "image_url": image_url,
        "fetched_at": utcnow(),
    }


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------


def current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token.strip(),),
        )
        .fetchone()
    )


def login_required(view: Callable[..., Any]) -> Callable[..., Any]:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        user = current_user()
        if user is None:
            return error("authentication required", 401)
        return view(user, *args, **kwargs)

    return wrapped


@app.post("/api/auth/register")
def register():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not username or not password:
        return error("username and password are required", 400)
    db = get_db()
    try:
        db.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(password)),
        )
        db.commit()
    except sqlite3.IntegrityError:
        return error("username already taken", 409)
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = get_json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute("INSERT INTO tokens (token, user_id) VALUES (?, ?)", (token, row["id"]))
    db.commit()
    return jsonify({"token": token})


# --------------------------------------------------------------------------
# previews
# --------------------------------------------------------------------------


def get_user_preview(user_id: int, preview_id: int) -> sqlite3.Row | None:
    return (
        get_db()
        .execute(
            "SELECT * FROM previews WHERE id = ? AND user_id = ?", (preview_id, user_id)
        )
        .fetchone()
    )


def store_preview(user_id: int, url: str, fetched: dict[str, Any], preview_id: int | None = None) -> sqlite3.Row:
    db = get_db()
    if preview_id is None:
        cursor = db.execute(
            "INSERT INTO previews"
            " (user_id, url, final_url, status_code, title, description, image_url, fetched_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                user_id,
                url,
                fetched["final_url"],
                fetched["status_code"],
                fetched["title"],
                fetched["description"],
                fetched["image_url"],
                fetched["fetched_at"],
            ),
        )
        preview_id = cursor.lastrowid
    else:
        db.execute(
            "UPDATE previews SET final_url = ?, status_code = ?, title = ?,"
            " description = ?, image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
            (
                fetched["final_url"],
                fetched["status_code"],
                fetched["title"],
                fetched["description"],
                fetched["image_url"],
                fetched["fetched_at"],
                preview_id,
                user_id,
            ),
        )
    db.commit()
    return db.execute("SELECT * FROM previews WHERE id = ?", (preview_id,)).fetchone()


@app.post("/api/previews")
@login_required
def create_preview(user: sqlite3.Row):
    data = get_json_body()
    url = data.get("url")
    if not isinstance(url, str) or not url.strip():
        return error("url is required", 400)
    url = url.strip()
    try:
        fetched = fetch_page(url)
    except ValueError:
        return error("url must be an absolute http(s) URL", 400)
    except Exception:
        return error("could not fetch url", 502)
    row = store_preview(user["id"], url, fetched)
    return jsonify(preview_dict(row)), 201


@app.get("/api/previews")
@login_required
def list_previews(user: sqlite3.Row):
    try:
        page = int(request.args.get("page", "1"))
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", str(DEFAULT_PAGE_SIZE)))
    except ValueError:
        page_size = DEFAULT_PAGE_SIZE
    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) AS c FROM previews WHERE user_id = ?", (user["id"],)
    ).fetchone()["c"]
    rows = db.execute(
        "SELECT * FROM previews WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?",
        (user["id"], page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [preview_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/previews/<int:preview_id>")
@login_required
def get_preview(user: sqlite3.Row, preview_id: int):
    row = get_user_preview(user["id"], preview_id)
    if row is None:
        return error("preview not found", 404)
    return jsonify(preview_dict(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@login_required
def refresh_preview(user: sqlite3.Row, preview_id: int):
    row = get_user_preview(user["id"], preview_id)
    if row is None:
        return error("preview not found", 404)
    try:
        fetched = fetch_page(row["url"])
    except ValueError:
        return error("url must be an absolute http(s) URL", 400)
    except Exception:
        return error("could not fetch url", 502)
    row = store_preview(user["id"], row["url"], fetched, preview_id=preview_id)
    return jsonify(preview_dict(row))


@app.delete("/api/previews/<int:preview_id>")
@login_required
def delete_preview(user: sqlite3.Row, preview_id: int):
    db = get_db()
    cursor = db.execute(
        "DELETE FROM previews WHERE id = ? AND user_id = ?", (preview_id, user["id"])
    )
    db.commit()
    if cursor.rowcount == 0:
        return error("preview not found", 404)
    return "", 204


# --------------------------------------------------------------------------
# health + frontend
# --------------------------------------------------------------------------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error("not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
