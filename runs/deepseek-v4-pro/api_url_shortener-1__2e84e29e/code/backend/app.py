"""Flask entry point."""

import os
import re
import secrets
from datetime import datetime
from datetime import timezone
from pathlib import Path

import jwt
from flask import Flask
from flask import g
from flask import jsonify
from flask import request
from flask import send_from_directory

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "app.sqlite"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

app = Flask(__name__, static_folder=None)
app.config["JWT_SECRET"] = os.environ.get("JWT_SECRET") or secrets.token_hex(32)

URL_RE = re.compile(r"^https?://", re.IGNORECASE)
MAX_URL_LENGTH = 2048
SHORT_CODE_LENGTH = 6


# ---------------------------------------------------------------------------
# database
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        import sqlite3

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


def init_db():
    import sqlite3

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_id INTEGER NOT NULL,
            original_url TEXT NOT NULL,
            short_code TEXT NOT NULL UNIQUE,
            click_count INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    conn.commit()
    conn.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def generate_short_code():
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    db = get_db()
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(SHORT_CODE_LENGTH))
        row = db.execute(
            "SELECT 1 FROM links WHERE short_code = ?", (code,)
        ).fetchone()
        if row is None:
            return code


def generate_token(user_id):
    payload = {
        "sub": str(user_id),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, app.config["JWT_SECRET"], algorithm="HS256")


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, app.config["JWT_SECRET"], algorithms=["HS256"]
        )
        user_id = int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
    db = get_db()
    return db.execute(
        "SELECT id, username FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def require_user():
    user = current_user()
    if user is None:
        return None
    return user


def require_admin():
    user = current_user()
    if user is None or user["username"] != "admin":
        return None
    return user


def serialize_link(row, base_url):
    return {
        "id": row["id"],
        "original_url": row["original_url"],
        "short_code": row["short_code"],
        "click_count": row["click_count"],
        "created_at": row["created_at"],
        "short_url": f"{base_url}/r/{row['short_code']}",
        "owner": row["owner"],
    }


def base_url():
    scheme = request.headers.get("X-Forwarded-Proto", request.scheme)
    host = request.headers.get("X-Forwarded-Host", request.host)
    return f"{scheme}://{host}"


# ---------------------------------------------------------------------------
# auth
# ---------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400
    if len(username) > 64:
        return jsonify({"error": "username is too long"}), 400
    if username == "admin":
        return jsonify({"error": "username is taken"}), 409

    db = get_db()
    if db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone():
        return jsonify({"error": "username is taken"}), 409

    from werkzeug.security import generate_password_hash

    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username and password are required"}), 400

    if username == "admin":
        if not ADMIN_PASSWORD:
            return jsonify({"error": "invalid credentials"}), 401
        if not secrets.compare_digest(password, ADMIN_PASSWORD):
            return jsonify({"error": "invalid credentials"}), 401
        db = get_db()
        row = db.execute(
            "SELECT id, username FROM users WHERE username = ?", ("admin",)
        ).fetchone()
        if row is None:
            from werkzeug.security import generate_password_hash

            cur = db.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                ("admin", generate_password_hash(ADMIN_PASSWORD), now_iso()),
            )
            db.commit()
            admin_id = cur.lastrowid
        else:
            admin_id = row["id"]
        return jsonify({"token": generate_token(admin_id), "username": "admin"}), 200

    from werkzeug.security import check_password_hash

    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify({"error": "invalid credentials"}), 401

    return jsonify({"token": generate_token(row["id"]), "username": row["username"]}), 200


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    return jsonify({"id": user["id"], "username": user["username"]})


# ---------------------------------------------------------------------------
# links
# ---------------------------------------------------------------------------

@app.post("/api/links")
def create_link():
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    data = request.get_json(silent=True) or {}
    original_url = (data.get("original_url") or "").strip()

    if not original_url:
        return jsonify({"error": "original_url is required"}), 400
    if len(original_url) > MAX_URL_LENGTH:
        return jsonify({"error": "original_url is too long"}), 400
    if not URL_RE.match(original_url):
        return jsonify({"error": "only http and https addresses are accepted"}), 400

    db = get_db()
    short_code = generate_short_code()
    cur = db.execute(
        "INSERT INTO links (owner_id, original_url, short_code, created_at) "
        "VALUES (?, ?, ?, ?)",
        (user["id"], original_url, short_code, now_iso()),
    )
    db.commit()

    row = db.execute(
        "SELECT l.*, u.username AS owner FROM links l "
        "JOIN users u ON u.id = l.owner_id WHERE l.id = ?",
        (cur.lastrowid,),
    ).fetchone()
    return jsonify(serialize_link(row, base_url())), 201


@app.get("/api/links")
def list_links():
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    page = max(1, request.args.get("page", 1, type=int))
    page_size = min(100, max(1, request.args.get("page_size", 20, type=int)))

    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM links WHERE owner_id = ? AND active = 1",
        (user["id"],),
    ).fetchone()[0]
    rows = db.execute(
        "SELECT l.*, u.username AS owner FROM links l "
        "JOIN users u ON u.id = l.owner_id "
        "WHERE l.owner_id = ? AND l.active = 1 "
        "ORDER BY l.id DESC LIMIT ? OFFSET ?",
        (user["id"], page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_link(r, base_url()) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/links/<int:link_id>")
def get_link(link_id):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    row = db.execute(
        "SELECT l.*, u.username AS owner FROM links l "
        "JOIN users u ON u.id = l.owner_id "
        "WHERE l.id = ? AND l.owner_id = ? AND l.active = 1",
        (link_id, user["id"]),
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404

    return jsonify(serialize_link(row, base_url()))


@app.delete("/api/links/<int:link_id>")
def delete_link(link_id):
    user = require_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    row = db.execute(
        "SELECT id, owner_id FROM links WHERE id = ?", (link_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404
    if row["owner_id"] != user["id"]:
        return jsonify({"error": "forbidden"}), 403

    db.execute("DELETE FROM links WHERE id = ?", (link_id,))
    db.commit()
    return jsonify({"deleted": True})


# ---------------------------------------------------------------------------
# admin
# ---------------------------------------------------------------------------

@app.get("/api/admin/links")
def admin_list_links():
    admin = require_admin()
    if admin is None:
        return jsonify({"error": "unauthorized"}), 401

    page = max(1, request.args.get("page", 1, type=int))
    page_size = min(100, max(1, request.args.get("page_size", 20, type=int)))

    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM links").fetchone()[0]
    rows = db.execute(
        "SELECT l.*, u.username AS owner FROM links l "
        "JOIN users u ON u.id = l.owner_id "
        "ORDER BY l.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [serialize_link(r, base_url()) for r in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.post("/api/admin/links/<int:link_id>/toggle")
def admin_toggle_link(link_id):
    admin = require_admin()
    if admin is None:
        return jsonify({"error": "unauthorized"}), 401

    db = get_db()
    row = db.execute(
        "SELECT id, active FROM links WHERE id = ?", (link_id,)
    ).fetchone()
    if row is None:
        return jsonify({"error": "not found"}), 404

    db.execute(
        "UPDATE links SET active = ? WHERE id = ?",
        (0 if row["active"] else 1, link_id),
    )
    db.commit()

    row = db.execute(
        "SELECT l.*, u.username AS owner FROM links l "
        "JOIN users u ON u.id = l.owner_id WHERE l.id = ?",
        (link_id,),
    ).fetchone()
    return jsonify(serialize_link(row, base_url()))


# ---------------------------------------------------------------------------
# redirect
# ---------------------------------------------------------------------------

@app.get("/r/<code>")
def redirect_link(code):
    db = get_db()
    row = db.execute(
        "SELECT original_url, active FROM links WHERE short_code = ?", (code,)
    ).fetchone()
    if row is None or not row["active"]:
        return jsonify({"error": "not found"}), 404

    db.execute(
        "UPDATE links SET click_count = click_count + 1 WHERE short_code = ?",
        (code,),
    )
    db.commit()

    from flask import redirect

    return redirect(row["original_url"], code=302)


# ---------------------------------------------------------------------------
# frontend
# ---------------------------------------------------------------------------

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path.startswith("r/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
