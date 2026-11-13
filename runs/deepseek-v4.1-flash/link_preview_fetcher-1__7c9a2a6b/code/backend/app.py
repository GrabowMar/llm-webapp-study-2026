"""Link preview bookmarking app: Flask API plus frontend build."""

from __future__ import annotations

import gzip
import hashlib
import os
import re
import secrets
import sqlite3
import zlib
from datetime import datetime, timezone
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from flask import Flask, abort, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DIST = BASE_DIR.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "app.db"

MAX_FETCH_BYTES = 5 * 1024 * 1024
FETCH_TIMEOUT = 15
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)


class FetchError(Exception):
    pass


class PreviewParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.in_title = False
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        if tag == "title":
            self.in_title = True
            return
        if tag != "meta":
            return
        values = {key.lower(): (value or "") for key, value in attrs}
        content = values.get("content")
        if content is None:
            return
        key = (values.get("property") or values.get("name") or "").strip().lower()
        if key and key not in self.meta:
            self.meta[key] = content

    def handle_startendtag(self, tag: str, attrs) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)


def utc_now() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = unescape(value)
    value = re.sub(r"<[^>]*>", " ", value)
    value = " ".join(value.split())
    return value or None


def get_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA busy_timeout = 30000")
    return connection


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = get_db()
    try:
        connection.execute("PRAGMA journal_mode = WAL")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
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
                fetched_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_previews_user
                ON previews (user_id, id DESC);
            CREATE INDEX IF NOT EXISTS idx_tokens_hash
                ON tokens (token_hash);
            """
        )
        connection.commit()
    finally:
        connection.close()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def current_user() -> sqlite3.Row:
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        abort(401)
    connection = get_db()
    try:
        row = connection.execute(
            """
            SELECT users.*
            FROM tokens
            JOIN users ON users.id = tokens.user_id
            WHERE tokens.token_hash = ?
            """,
            (hash_token(token.strip()),),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        abort(401)
    g.user = row
    return row


def preview_dict(row: sqlite3.Row) -> dict:
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


def normalise_url(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("url must be a string")
    url = value.strip()
    if not url:
        raise ValueError("url is required")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValueError("url must be an absolute http(s) URL")
    return url


def decode_body(raw: bytes, charset: str | None) -> str:
    if not charset:
        match = re.search(rb"charset=[\"']?([\w.-]+)", raw[:4096], re.IGNORECASE)
        if match:
            charset = match.group(1).decode("ascii", "ignore")
    for encoding in (charset, "utf-8", "latin-1"):
        if not encoding:
            continue
        try:
            return raw.decode(encoding)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="replace")


def fetch_preview(url: str) -> dict:
    req = Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
        },
    )
    try:
        try:
            response = urlopen(req, timeout=FETCH_TIMEOUT)
        except HTTPError as error:
            response = error
        with response:
            status_code = getattr(response, "status", None) or response.getcode()
            final_url = response.geturl() or url
            raw = response.read(MAX_FETCH_BYTES)
            charset = response.headers.get_content_charset()
            encoding = (response.headers.get("Content-Encoding") or "").lower()
    except (URLError, ValueError, OSError) as error:
        raise FetchError(str(error)) from error

    if encoding == "gzip":
        try:
            raw = gzip.decompress(raw)
        except OSError:
            pass
    elif encoding == "deflate":
        try:
            raw = zlib.decompress(raw)
        except zlib.error:
            try:
                raw = zlib.decompress(raw, -zlib.MAX_WBITS)
            except zlib.error:
                pass

    html = decode_body(raw, charset)
    parser = PreviewParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass

    title = clean_text(parser.meta.get("og:title")) or clean_text(
        "".join(parser.title_parts)
    )
    description = clean_text(parser.meta.get("og:description")) or clean_text(
        parser.meta.get("description")
    )
    image = parser.meta.get("og:image") or parser.meta.get("og:image:url")
    image_url = None
    if image and image.strip():
        image_url = urljoin(final_url, image.strip())

    return {
        "final_url": final_url,
        "status_code": int(status_code),
        "title": title,
        "description": description,
        "image_url": image_url,
        "fetched_at": utc_now(),
    }


def json_body() -> dict:
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else {}


@app.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    if request.path.startswith("/api") or request.path == "/api":
        messages = {
            401: "authentication required",
            403: "forbidden",
            404: "not found",
            405: "method not allowed",
        }
        message = messages.get(error.code, error.description)
        return jsonify({"error": message}), error.code
    return error


@app.errorhandler(FetchError)
def handle_fetch_error(error: FetchError):
    return jsonify({"error": "could not fetch the page"}), 502


@app.errorhandler(404)
def handle_not_found(error):
    if request.path.startswith("/api"):
        return jsonify({"error": "not found"}), 404
    return send_from_directory(DIST, "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify({"error": "username is required"}), 400
    if not isinstance(password, str) or not password:
        return jsonify({"error": "password is required"}), 400
    username = username.strip()
    if len(username) > 150:
        return jsonify({"error": "username is too long"}), 400
    if len(password) > 1024:
        return jsonify({"error": "password is too long"}), 400

    connection = get_db()
    try:
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), utc_now()),
        )
        connection.commit()
        user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        connection.rollback()
        return jsonify({"error": "username is already taken"}), 409
    finally:
        connection.close()
    return jsonify({"id": user_id, "username": username}), 201


@app.post("/api/auth/login")
def login():
    body = json_body()
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "username and password are required"}), 400

    connection = get_db()
    try:
        user = connection.execute(
            "SELECT * FROM users WHERE username = ?", (username.strip(),)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify({"error": "invalid username or password"}), 401
        token = secrets.token_urlsafe(32)
        connection.execute(
            "INSERT INTO tokens (user_id, token_hash, created_at) VALUES (?, ?, ?)",
            (user["id"], hash_token(token), utc_now()),
        )
        connection.commit()
    finally:
        connection.close()
    return jsonify({"token": token}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    return jsonify({"username": user["username"]})


@app.post("/api/previews")
def create_preview():
    user = current_user()
    body = json_body()
    try:
        url = normalise_url(body.get("url"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    data = fetch_preview(url)
    now = utc_now()
    connection = get_db()
    try:
        cursor = connection.execute(
            """
            INSERT INTO previews
                (user_id, url, final_url, status_code, title, description,
                 image_url, fetched_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                url,
                data["final_url"],
                data["status_code"],
                data["title"],
                data["description"],
                data["image_url"],
                data["fetched_at"],
                now,
            ),
        )
        connection.commit()
        row = connection.execute(
            "SELECT * FROM previews WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()
    finally:
        connection.close()
    return jsonify(preview_dict(row)), 201


@app.get("/api/previews")
def list_previews():
    user = current_user()

    def positive_int(name: str, default: int) -> int:
        raw = request.args.get(name)
        if raw is None or raw == "":
            return default
        try:
            value = int(raw)
        except (TypeError, ValueError):
            return default
        return value if value > 0 else default

    page = positive_int("page", 1)
    page_size = min(positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    offset = (page - 1) * page_size

    connection = get_db()
    try:
        total = connection.execute(
            "SELECT COUNT(*) AS count FROM previews WHERE user_id = ?",
            (user["id"],),
        ).fetchone()["count"]
        rows = connection.execute(
            """
            SELECT * FROM previews
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ? OFFSET ?
            """,
            (user["id"], page_size, offset),
        ).fetchall()
    finally:
        connection.close()

    return jsonify(
        {
            "items": [preview_dict(row) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


def owned_preview(preview_id: int) -> sqlite3.Row:
    user = current_user()
    connection = get_db()
    try:
        row = connection.execute(
            "SELECT * FROM previews WHERE id = ? AND user_id = ?",
            (preview_id, user["id"]),
        ).fetchone()
    finally:
        connection.close()
    if row is None:
        abort(404)
    return row


@app.get("/api/previews/<int:preview_id>")
def get_preview(preview_id: int):
    return jsonify(preview_dict(owned_preview(preview_id)))


@app.post("/api/previews/<int:preview_id>/refresh")
def refresh_preview(preview_id: int):
    row = owned_preview(preview_id)
    data = fetch_preview(row["url"])
    connection = get_db()
    try:
        connection.execute(
            """
            UPDATE previews
            SET final_url = ?, status_code = ?, title = ?, description = ?,
                image_url = ?, fetched_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                data["final_url"],
                data["status_code"],
                data["title"],
                data["description"],
                data["image_url"],
                data["fetched_at"],
                preview_id,
                row["user_id"],
            ),
        )
        connection.commit()
        updated = connection.execute(
            "SELECT * FROM previews WHERE id = ?", (preview_id,)
        ).fetchone()
    finally:
        connection.close()
    if updated is None:
        abort(404)
    return jsonify(preview_dict(updated))


@app.delete("/api/previews/<int:preview_id>")
def delete_preview(preview_id: int):
    row = owned_preview(preview_id)
    connection = get_db()
    try:
        connection.execute(
            "DELETE FROM previews WHERE id = ? AND user_id = ?",
            (preview_id, row["user_id"]),
        )
        connection.commit()
    finally:
        connection.close()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        abort(404)
    target = (DIST / path).resolve()
    try:
        target.relative_to(DIST.resolve())
    except ValueError:
        abort(404)
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
