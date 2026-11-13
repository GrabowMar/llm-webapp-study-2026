"""Flask entry point: tagged notes API and frontend host."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path.cwd() / "data"))
DB_PATH = DATA_DIR / "notes.db"
SECRET_PATH = DATA_DIR / "secret.key"

TOKEN_MAX_AGE = 7 * 24 * 3600
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
TAG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")
MAX_TITLE = 200
MAX_CONTENT = 20000
MAX_TAGS = 10
MAX_TAG_LEN = 30
MIN_PASSWORD = 8
MAX_PASSWORD = 128
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024
app.json.sort_keys = False


def load_secret() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(SECRET_PATH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_hex(32))
    for _ in range(50):
        value = SECRET_PATH.read_text().strip()
        if value:
            return value
        import time

        time.sleep(0.05)
    raise RuntimeError("secret key unavailable")


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS notes_order
                ON notes (pinned DESC, updated_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS notes_user ON notes (user_id);
            CREATE TABLE IF NOT EXISTS note_tags (
                note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                tag TEXT NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag)
            );
            CREATE INDEX IF NOT EXISTS note_tags_tag ON note_tags (tag);
            """
        )
        conn.commit()
    finally:
        conn.close()


init_db()
serializer = URLSafeTimedSerializer(load_secret(), salt="auth-token")


def db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def next_after(previous: str) -> str:
    current = now_iso()
    if current > previous:
        return current
    prev = datetime.strptime(previous, "%Y-%m-%dT%H:%M:%S.%fZ")
    return (prev + timedelta(microseconds=1)).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def error(status: int, message: str, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    resp = jsonify(body)
    resp.status_code = status
    return resp


@app.errorhandler(HTTPException)
def http_error(exc: HTTPException):
    if request.path.startswith("/api"):
        return error(exc.code or 500, exc.description or exc.name)
    return exc


@app.errorhandler(Exception)
def unexpected(exc: Exception):
    app.logger.exception("unhandled error", exc_info=exc)
    return error(500, "Internal server error")


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if request.path.startswith("/api"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    try:
        user_id = serializer.loads(parts[1].strip(), max_age=TOKEN_MAX_AGE)
    except BadSignature:
        return None
    if not isinstance(user_id, int):
        return None
    return db().execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()


UNAUTHORIZED = "Authentication required"


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not USERNAME_RE.match(username.strip()):
        errors["username"] = (
            "Username must be 3-32 characters: letters, digits, '_', '.' or '-'"
        )
    if not isinstance(password, str) or not (
        MIN_PASSWORD <= len(password) <= MAX_PASSWORD
    ):
        errors["password"] = (
            f"Password must be {MIN_PASSWORD}-{MAX_PASSWORD} characters"
        )
    if errors:
        return error(400, "Validation failed", errors)
    username = username.strip()
    try:
        with db() as conn:
            conn.execute(
                "INSERT INTO users (username, password_hash, created_at) "
                "VALUES (?, ?, ?)",
                (username, generate_password_hash(password), now_iso()),
            )
    except sqlite3.IntegrityError:
        return error(
            409, "Username is already taken", {"username": "Username is already taken"}
        )
    user = db().execute(
        "SELECT id, username FROM users WHERE username = ?", (username,)
    ).fetchone()
    resp = jsonify({"id": user["id"], "username": user["username"]})
    resp.status_code = 201
    return resp


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "Username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password")
    return jsonify(
        {"token": serializer.dumps(row["id"]), "username": row["username"]}
    )


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return error(401, UNAUTHORIZED)
    return {"id": user["id"], "username": user["username"]}


def normalize_tags(value):
    if not isinstance(value, list):
        return None, "Tags must be a list of strings"
    tags = []
    for item in value:
        if not isinstance(item, str):
            return None, "Tags must be a list of strings"
        tag = item.strip().lower()
        if not tag:
            return None, "Tags must not be empty"
        if len(tag) > MAX_TAG_LEN:
            return None, f"Each tag must be at most {MAX_TAG_LEN} characters"
        if not TAG_RE.match(tag):
            return None, (
                "Tags may contain only letters, digits, '-' and '_' "
                "and must start with a letter or digit"
            )
        if tag not in tags:
            tags.append(tag)
    if len(tags) > MAX_TAGS:
        return None, f"A note can have at most {MAX_TAGS} tags"
    return tags, None


def validate_note(data: dict, partial: bool):
    errors = {}
    out = {}
    if "title" in data or not partial:
        title = data.get("title")
        if not isinstance(title, str) or not title.strip():
            errors["title"] = "Title is required"
        elif len(title.strip()) > MAX_TITLE:
            errors["title"] = f"Title must be at most {MAX_TITLE} characters"
        else:
            out["title"] = title.strip()
    if "content" in data or not partial:
        content = data.get("content", "")
        if not isinstance(content, str):
            errors["content"] = "Content must be a string"
        elif len(content) > MAX_CONTENT:
            errors["content"] = f"Content must be at most {MAX_CONTENT} characters"
        else:
            out["content"] = content
    if "tags" in data or not partial:
        tags, msg = normalize_tags(data.get("tags", []))
        if msg:
            errors["tags"] = msg
        else:
            out["tags"] = tags
    if "pinned" in data or not partial:
        pinned = data.get("pinned", False)
        if not isinstance(pinned, bool):
            errors["pinned"] = "Pinned must be true or false"
        else:
            out["pinned"] = pinned
    return out, errors


NOTE_SELECT = (
    "SELECT n.id, n.title, n.content, n.pinned, n.created_at, n.updated_at, "
    "u.username AS author FROM notes n JOIN users u ON u.id = n.user_id"
)


def serialize(rows):
    rows = list(rows)
    tags: dict[int, list[str]] = {r["id"]: [] for r in rows}
    if rows:
        marks = ",".join("?" for _ in rows)
        for t in db().execute(
            f"SELECT note_id, tag FROM note_tags WHERE note_id IN ({marks}) "
            "ORDER BY position",
            [r["id"] for r in rows],
        ):
            tags[t["note_id"]].append(t["tag"])
    return [
        {
            "id": r["id"],
            "title": r["title"],
            "content": r["content"],
            "tags": tags[r["id"]],
            "pinned": bool(r["pinned"]),
            "created_at": r["created_at"],
            "updated_at": r["updated_at"],
            "author": r["author"],
        }
        for r in rows
    ]


def fetch_note(note_id: int):
    return db().execute(NOTE_SELECT + " WHERE n.id = ?", (note_id,)).fetchone()


def write_tags(conn, note_id: int, tags: list[str]):
    conn.execute("DELETE FROM note_tags WHERE note_id = ?", (note_id,))
    conn.executemany(
        "INSERT INTO note_tags (note_id, tag, position) VALUES (?, ?, ?)",
        [(note_id, tag, i) for i, tag in enumerate(tags)],
    )


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def int_param(name: str, default: int, maximum: int | None = None):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be an integer"
    if value < 1:
        return None, f"{name} must be at least 1"
    if maximum is not None and value > maximum:
        return None, f"{name} must be at most {maximum}"
    return value, None


@app.get("/api/notes")
def list_notes():
    errors = {}
    page, msg = int_param("page", 1)
    if msg:
        errors["page"] = msg
    page_size, msg = int_param("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    if msg:
        errors["page_size"] = msg
    if errors:
        return error(400, "Invalid query parameters", errors)

    where = []
    params: list = []
    tag = request.args.get("tag", "").strip().lower()
    if tag:
        where.append("EXISTS (SELECT 1 FROM note_tags t WHERE t.note_id = n.id AND t.tag = ?)")
        params.append(tag)
    author = request.args.get("author", "").strip()
    if author:
        where.append("u.username = ?")
        params.append(author)
    q = request.args.get("q", "").strip()
    if q:
        like = f"%{escape_like(q)}%"
        where.append(
            "(n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\')"
        )
        params += [like, like]
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    total = db().execute(
        "SELECT COUNT(*) FROM notes n JOIN users u ON u.id = n.user_id" + clause,
        params,
    ).fetchone()[0]
    rows = db().execute(
        NOTE_SELECT
        + clause
        + " ORDER BY n.pinned DESC, n.updated_at DESC, n.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": serialize(rows),
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/notes")
def create_note():
    user = current_user()
    if user is None:
        return error(401, UNAUTHORIZED)
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    values, errors = validate_note(data, partial=False)
    if errors:
        return error(400, "Validation failed", errors)
    stamp = now_iso()
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO notes (user_id, title, content, pinned, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                user["id"],
                values["title"],
                values["content"],
                int(values["pinned"]),
                stamp,
                stamp,
            ),
        )
        write_tags(conn, cur.lastrowid, values["tags"])
    resp = jsonify(serialize([fetch_note(cur.lastrowid)])[0])
    resp.status_code = 201
    return resp


@app.get("/api/notes/<int:note_id>")
def get_note(note_id: int):
    row = fetch_note(note_id)
    if row is None:
        return error(404, "Note not found")
    return serialize([row])[0]


@app.patch("/api/notes/<int:note_id>")
def update_note(note_id: int):
    user = current_user()
    if user is None:
        return error(401, UNAUTHORIZED)
    row = db().execute(
        "SELECT user_id FROM notes WHERE id = ?", (note_id,)
    ).fetchone()
    if row is None:
        return error(404, "Note not found")
    if row["user_id"] != user["id"]:
        return error(403, "Only the author may change this note")
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    values, errors = validate_note(data, partial=True)
    if errors:
        return error(400, "Validation failed", errors)
    with db() as conn:
        owner = conn.execute(
            "SELECT user_id, updated_at FROM notes WHERE id = ?", (note_id,)
        ).fetchone()
        if owner is None:
            return error(404, "Note not found")
        if owner["user_id"] != user["id"]:
            return error(403, "Only the author may change this note")
        sets = ["updated_at = ?"]
        params: list = [next_after(owner["updated_at"])]
        for field in ("title", "content"):
            if field in values:
                sets.append(f"{field} = ?")
                params.append(values[field])
        if "pinned" in values:
            sets.append("pinned = ?")
            params.append(int(values["pinned"]))
        params.append(note_id)
        conn.execute(
            f"UPDATE notes SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
            params + [user["id"]],
        )
        if "tags" in values:
            write_tags(conn, note_id, values["tags"])
    return serialize([fetch_note(note_id)])[0]


@app.delete("/api/notes/<int:note_id>")
def delete_note(note_id: int):
    user = current_user()
    if user is None:
        return error(401, UNAUTHORIZED)
    row = db().execute(
        "SELECT user_id FROM notes WHERE id = ?", (note_id,)
    ).fetchone()
    if row is None:
        return error(404, "Note not found")
    if row["user_id"] != user["id"]:
        return error(403, "Only the author may delete this note")
    with db() as conn:
        conn.execute(
            "DELETE FROM notes WHERE id = ? AND user_id = ?", (note_id, user["id"])
        )
    return "", 204


@app.get("/api/tags")
def list_tags():
    rows = db().execute(
        "SELECT tag, COUNT(*) AS count FROM note_tags "
        "GROUP BY tag ORDER BY count DESC, tag ASC"
    ).fetchall()
    return {"items": [{"tag": r["tag"], "count": r["count"]} for r in rows]}


@app.route("/api", defaults={"path": ""})
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path: str):
    return error(404, "Not found")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
