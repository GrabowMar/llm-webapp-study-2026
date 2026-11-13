"""Link previews: Flask JSON API and static frontend."""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from functools import wraps
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "previews.db"

MAX_BODY_BYTES = 2 * 1024 * 1024
FETCH_TIMEOUT = 10
USER_AGENT = "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)"

PREVIEW_FIELDS = (
    "id",
    "url",
    "final_url",
    "status_code",
    "title",
    "description",
    "image_url",
    "fetched_at",
)
PREVIEW_COLUMNS = ", ".join(PREVIEW_FIELDS)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS previews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    final_url   TEXT,
    status_code INTEGER,
    title       TEXT,
    description TEXT,
    image_url   TEXT,
    fetched_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_previews_user_id ON previews(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user_id ON tokens(user_id);
"""

app = Flask(__name__, static_folder=None)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH, timeout=15)) as conn:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.commit()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 10000")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(message: str, status: int):
    return jsonify({"error": message}), status


def request_body() -> dict:
    data = request.get_json(silent=True)
    if isinstance(data, dict):
        return data
    if request.form:
        return request.form.to_dict()
    try:
        parsed = json.loads(request.get_data(as_text=True))
        if isinstance(parsed, dict):
            return parsed
    except (ValueError, TypeError):
        pass
    return {}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    rounds = 180_000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds)
    return f"pbkdf2_sha256${rounds}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(rounds)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (AttributeError, TypeError, ValueError):
        return False


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user_id():
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT user_id FROM tokens WHERE token_hash = ?", (token_hash(token),)
    ).fetchone()
    return row["user_id"] if row else None


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        user_id = current_user_id()
        if user_id is None:
            return error("unauthorized", 401)
        g.user_id = user_id
        return view(*args, **kwargs)

    return wrapper


def serialize(row: sqlite3.Row) -> dict:
    return {field: row[field] for field in PREVIEW_FIELDS}


def owned_preview(preview_id: int):
    return get_db().execute(
        f"SELECT {PREVIEW_COLUMNS} FROM previews WHERE id = ? AND user_id = ?",
        (preview_id, g.user_id),
    ).fetchone()


def normalize_url(value) -> str | None:
    if not isinstance(value, str):
        return None
    url = value.strip()
    if not url or any(char.isspace() for char in url):
        return None
    if not re.match(r"^https?://", url, re.I):
        return None
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    return url


class FetchError(Exception):
    pass


def decode_body(raw: bytes, content_type: str) -> str:
    match = re.search(r"charset\s*=\s*[\"']?([\w.-]+)", content_type, re.I)
    encoding = match.group(1) if match else None
    if not encoding:
        head = raw[:4096].decode("ascii", errors="ignore")
        match = re.search(r"<meta[^>]+charset\s*=\s*[\"']?\s*([\w.-]+)", head, re.I)
        encoding = match.group(1) if match else "utf-8"
    try:
        return raw.decode(encoding, errors="replace")
    except LookupError:
        return raw.decode("utf-8", errors="replace")


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.title_chunks: list[str] = []
        self._in_title = False
        self._title_done = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "title":
            self._in_title = not self._title_done
            return
        if tag not in ("meta", "link"):
            return
        attributes: dict[str, str] = {}
        for name, value in attrs:
            if name is not None and value is not None:
                attributes.setdefault(name.lower(), value)
        if tag == "meta":
            key = (attributes.get("property") or attributes.get("name") or "").strip().lower()
            value = attributes.get("content")
        else:
            if "image_src" not in attributes.get("rel", "").lower():
                return
            key, value = "image_src", attributes.get("href")
        if key and value is not None:
            self.meta.setdefault(key, value)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data):
        if self._in_title:
            self.title_chunks.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "title" and self._in_title:
            self._in_title = False
            self._title_done = True


def plain_text(value) -> str | None:
    if value is None:
        return None
    text = re.sub(r"<[^>]*>", " ", value)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", " ", text)
    text = html.unescape(text)
    return " ".join(text.split()) or None


def extract_metadata(document: str, final_url: str) -> dict:
    parser = MetadataParser()
    try:
        parser.feed(document)
        parser.close()
    except (AssertionError, ValueError):
        pass
    meta = parser.meta
    title = plain_text(meta.get("og:title")) or plain_text("".join(parser.title_chunks))
    description = plain_text(meta.get("og:description")) or plain_text(meta.get("description"))
    image = None
    for key in ("og:image", "og:image:url", "og:image:secure_url", "twitter:image", "image_src"):
        candidate = plain_text(meta.get(key))
        if candidate:
            image = candidate
            break
    if image:
        image = urljoin(final_url, image)
    return {"title": title, "description": description, "image_url": image}


def fetch_preview(url: str) -> dict:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        response = urlopen(req, timeout=FETCH_TIMEOUT)
    except HTTPError as exc:
        response = exc
    except (URLError, OSError, ValueError) as exc:
        raise FetchError(str(exc)) from exc

    with closing(response):
        status = getattr(response, "status", None) or getattr(response, "code", None) or 200
        final_url = response.geturl() or url
        headers = response.headers
        content_type = headers.get("Content-Type", "") if headers else ""
        raw = response.read(MAX_BODY_BYTES + 1)

    metadata = extract_metadata(decode_body(raw, content_type), final_url)
    return {
        "final_url": final_url,
        "status_code": int(status),
        "title": metadata["title"],
        "description": metadata["description"],
        "image_url": metadata["image_url"],
        "fetched_at": utc_now(),
    }


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request_body()
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    username = username.strip()
    if not username or len(username) > 80 or not password or len(password) > 1024:
        return error("invalid username or password", 400)
    conn = get_db()
    try:
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, hash_password(password), utc_now()),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        return error("username already exists", 409)
    return jsonify({"id": cursor.lastrowid, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request_body()
    username, password = data.get("username"), data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error("username and password are required", 400)
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return error("invalid credentials", 401)
    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, created_at) VALUES (?, ?, ?)",
        (token_hash(token), row["id"], utc_now()),
    )
    conn.commit()
    return jsonify({"token": token})


@app.get("/api/auth/me")
@require_auth
def me():
    row = get_db().execute("SELECT username FROM users WHERE id = ?", (g.user_id,)).fetchone()
    return jsonify({"id": g.user_id, "username": row["username"]})


@app.post("/api/auth/logout")
@require_auth
def logout():
    header = request.headers.get("Authorization", "")
    get_db().execute(
        "DELETE FROM tokens WHERE token_hash = ?", (token_hash(header[7:].strip()),)
    )
    get_db().commit()
    return jsonify({"status": "ok"})


@app.post("/api/previews")
@require_auth
def create_preview():
    url = normalize_url(request_body().get("url"))
    if url is None:
        return error("a valid http(s) url is required", 400)
    try:
        fetched = fetch_preview(url)
    except FetchError as exc:
        return error(f"could not fetch url: {exc}", 502)
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO previews "
        "(user_id, url, final_url, status_code, title, description, image_url, fetched_at, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            g.user_id,
            url,
            fetched["final_url"],
            fetched["status_code"],
            fetched["title"],
            fetched["description"],
            fetched["image_url"],
            fetched["fetched_at"],
            fetched["fetched_at"],
        ),
    )
    conn.commit()
    row = conn.execute(
        f"SELECT {PREVIEW_COLUMNS} FROM previews WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return jsonify(serialize(row))


def positive_int(value, default: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return number if number >= 1 else default


@app.get("/api/previews")
@require_auth
def list_previews():
    page = positive_int(request.args.get("page"), 1)
    page_size = positive_int(request.args.get("page_size"), 20)
    conn = get_db()
    total = conn.execute(
        "SELECT COUNT(*) AS n FROM previews WHERE user_id = ?", (g.user_id,)
    ).fetchone()["n"]
    rows = conn.execute(
        f"SELECT {PREVIEW_COLUMNS} FROM previews WHERE user_id = ? "
        "ORDER BY id DESC LIMIT ? OFFSET ?",
        (g.user_id, page_size, (page - 1) * page_size),
    ).fetchall()
    return jsonify(
        {
            "items": [serialize(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/previews/<int:preview_id>")
@require_auth
def get_preview(preview_id: int):
    row = owned_preview(preview_id)
    if row is None:
        return error("not found", 404)
    return jsonify(serialize(row))


@app.post("/api/previews/<int:preview_id>/refresh")
@require_auth
def refresh_preview(preview_id: int):
    row = owned_preview(preview_id)
    if row is None:
        return error("not found", 404)
    try:
        fetched = fetch_preview(row["url"])
    except FetchError as exc:
        return error(f"could not fetch url: {exc}", 502)
    conn = get_db()
    conn.execute(
        "UPDATE previews SET final_url = ?, status_code = ?, title = ?, "
        "description = ?, image_url = ?, fetched_at = ? WHERE id = ? AND user_id = ?",
        (
            fetched["final_url"],
            fetched["status_code"],
            fetched["title"],
            fetched["description"],
            fetched["image_url"],
            fetched["fetched_at"],
            preview_id,
            g.user_id,
        ),
    )
    conn.commit()
    return jsonify(serialize(owned_preview(preview_id)))


@app.delete("/api/previews/<int:preview_id>")
@require_auth
def delete_preview(preview_id: int):
    if owned_preview(preview_id) is None:
        return error("not found", 404)
    conn = get_db()
    conn.execute(
        "DELETE FROM previews WHERE id = ? AND user_id = ?", (preview_id, g.user_id)
    )
    conn.commit()
    return "", 204


@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def unknown_api(path: str):
    return error("not found", 404)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)
