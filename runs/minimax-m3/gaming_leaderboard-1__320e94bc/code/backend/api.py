"""JSON API for the game leaderboard."""

import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import connect, get_db

api = Blueprint("api", __name__, url_prefix="/api")

ADMIN_USERNAME = "admin"
# The admin password is read from the environment when the app starts.
# An unset or empty value disables admin sign-in entirely.
ADMIN_PASSWORD = (os.environ.get("ADMIN_PASSWORD") or "").strip()

PASSWORD_HASH_METHOD = "pbkdf2:sha256:260000"
DEFAULT_LEADERBOARD_LIMIT = 100
MAX_LEADERBOARD_LIMIT = 1000
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def now_iso() -> str:
    """Current UTC timestamp in a sortable ISO-8601 format."""

    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def error(message: str, status: int):
    return jsonify({"error": message}), status


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def bearer_token() -> str | None:
    header = request.headers.get("Authorization", "") or ""
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    return token or None


def current_user():
    """Return the row of the signed-in user, or ``None`` when there is none."""

    token = bearer_token()
    if not token:
        return None
    db = get_db()
    return db.execute(
        "SELECT u.id AS id, u.username AS username, u.is_admin AS is_admin "
        "FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("sign in to use this endpoint", 401)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return error("sign in to use this endpoint", 401)
        if not user["is_admin"]:
            return error("admin access required", 403)
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def score_to_dict(row, username: str) -> dict:
    return {
        "id": row["id"],
        "score": row["score"],
        "achieved_at": row["achieved_at"],
        "is_hidden": bool(row["is_hidden"]),
        "player": username,
    }


def period_cutoff(period: str) -> str | None:
    """Return the oldest ``achieved_at`` that still counts for ``period``."""

    name = (period or "").strip().lower()
    if name in {"all", "all-time", "alltime", "all_time", "lifetime", "total", "ever"}:
        return None

    now = datetime.now(timezone.utc)
    if name in {"today", "day", "daily", "24h", "this-day"}:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif name in {"week", "weekly", "7d", "this-week"}:
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
    else:
        return None
    return start.isoformat(timespec="microseconds").replace("+00:00", "Z")


def like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def leaderboard_entries(cutoff: str | None = None, player: str | None = None) -> list[dict]:
    """Best visible score per player, ranked. Hidden scores never count."""

    db = get_db()
    sql = (
        "SELECT s.player_id AS player_id, s.score AS score, "
        "s.achieved_at AS achieved_at, u.username AS username "
        "FROM scores s JOIN users u ON u.id = s.player_id "
        "WHERE s.is_hidden = 0"
    )
    params: list[object] = []
    if cutoff:
        sql += " AND s.achieved_at >= ?"
        params.append(cutoff)
    if player:
        sql += " AND u.username LIKE ? ESCAPE '\\'"
        params.append(like_pattern(player))
    sql += " ORDER BY s.score DESC, s.achieved_at DESC, s.id DESC"

    best: dict[int, dict] = {}
    for row in db.execute(sql, params).fetchall():
        best.setdefault(
            row["player_id"],
            {
                "player_id": row["player_id"],
                "player": row["username"],
                "score": row["score"],
                "achieved_at": row["achieved_at"],
            },
        )

    ordered = sorted(
        best.values(),
        key=lambda entry: (-entry["score"], entry["player"].lower(), entry["player_id"]),
    )

    ranked = []
    previous_score = None
    rank = 0
    for index, entry in enumerate(ordered):
        if entry["score"] != previous_score:
            rank = index + 1
            previous_score = entry["score"]
        ranked.append({**entry, "rank": rank})
    return ranked


def rank_of_player(player_id: int, cutoff: str | None = None) -> int | None:
    for entry in leaderboard_entries(cutoff=cutoff):
        if entry["player_id"] == player_id:
            return entry["rank"]
    return None


def parse_int_arg(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db = get_db()
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    db.commit()
    return token


def ensure_admin_user() -> int:
    """Create or refresh the admin account from ``ADMIN_PASSWORD``."""

    db = connect()
    try:
        row = db.execute(
            "SELECT id AS id, password_hash AS password_hash "
            "FROM users WHERE username = ? COLLATE NOCASE",
            (ADMIN_USERNAME,),
        ).fetchone()

        if row is None:
            cursor = db.execute(
                "INSERT INTO users (username, password_hash, is_admin, created_at) "
                "VALUES (?, ?, 1, ?)",
                (
                    ADMIN_USERNAME,
                    generate_password_hash(ADMIN_PASSWORD, method=PASSWORD_HASH_METHOD),
                    now_iso(),
                ),
            )
            db.commit()
            return int(cursor.lastrowid)

        if not check_password_hash(row["password_hash"], ADMIN_PASSWORD):
            db.execute(
                "UPDATE users SET password_hash = ?, is_admin = 1 WHERE id = ?",
                (
                    generate_password_hash(ADMIN_PASSWORD, method=PASSWORD_HASH_METHOD),
                    row["id"],
                ),
            )
            db.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
            db.commit()
        else:
            db.execute("UPDATE users SET is_admin = 1 WHERE id = ?", (row["id"],))
            db.commit()
        return int(row["id"])
    finally:
        db.close()


def disable_admin_account() -> None:
    """Admin sign-in is switched off: no admin rights and no live tokens."""

    db = connect()
    try:
        row = db.execute(
            "SELECT id AS id FROM users WHERE username = ? COLLATE NOCASE", (ADMIN_USERNAME,)
        ).fetchone()
        if row is None:
            return
        db.execute("UPDATE users SET is_admin = 0 WHERE id = ?", (row["id"],))
        db.execute("DELETE FROM tokens WHERE user_id = ?", (row["id"],))
        db.commit()
    finally:
        db.close()


def setup_admin() -> None:
    if ADMIN_PASSWORD:
        ensure_admin_user()
    else:
        disable_admin_account()


# --------------------------------------------------------------------------- #
# health
# --------------------------------------------------------------------------- #


@api.get("/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------- #
# accounts
# --------------------------------------------------------------------------- #


@api.post("/auth/register")
def register():
    data = body()
    username = str(data.get("username") or "").strip()
    password = data.get("password")

    if not username:
        return error("username is required", 400)
    if len(username) > 64:
        return error("username is too long", 400)
    if not isinstance(password, str) or not password:
        return error("password is required", 400)
    if len(password) > 512:
        return error("password is too long", 400)
    if username.lower() == ADMIN_USERNAME:
        return error("that username is taken", 409)

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, is_admin, created_at) VALUES (?, ?, 0, ?)",
            (
                username,
                generate_password_hash(password, method=PASSWORD_HASH_METHOD),
                now_iso(),
            ),
        )
        db.commit()
    except Exception:  # unique constraint violation
        db.rollback()
        return error("that username is taken", 409)

    return jsonify({"id": int(cursor.lastrowid), "username": username}), 201


@api.post("/auth/login")
def login():
    data = body()
    username = str(data.get("username") or "").strip()
    password = data.get("password")

    db = get_db()
    if username.lower() == ADMIN_USERNAME:
        if not ADMIN_PASSWORD:
            return error("admin sign-in is disabled", 401)
        if not isinstance(password, str) or not hmac.compare_digest(password, ADMIN_PASSWORD):
            return error("invalid username or password", 401)
        user_id = ensure_admin_user()
        username = ADMIN_USERNAME
    else:
        if not username or not isinstance(password, str) or not password:
            return error("invalid username or password", 401)
        row = db.execute(
            "SELECT id AS id, username AS username, password_hash AS password_hash "
            "FROM users WHERE username = ? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return error("invalid username or password", 401)
        user_id = int(row["id"])
        username = row["username"]

    token = issue_token(user_id)
    return jsonify({"token": token}), 200


@api.post("/auth/logout")
@require_user
def logout():
    token = bearer_token()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify({"ok": True}), 200


@api.get("/auth/me")
@require_user
def me():
    user = g.user
    return jsonify(
        {
            "id": user["id"],
            "username": user["username"],
            "is_admin": bool(user["is_admin"]),
        }
    ), 200


# --------------------------------------------------------------------------- #
# leaderboard
# --------------------------------------------------------------------------- #


@api.get("/leaderboard")
def leaderboard():
    period = request.args.get("period", "all")
    cutoff = period_cutoff(period)
    player = (request.args.get("player") or "").strip()
    limit = parse_int_arg("limit", DEFAULT_LEADERBOARD_LIMIT, 0, MAX_LEADERBOARD_LIMIT)

    entries = leaderboard_entries(cutoff=cutoff, player=player or None)
    items = [
        {
            "rank": entry["rank"],
            "player": entry["player"],
            "score": entry["score"],
            "achieved_at": entry["achieved_at"],
        }
        for entry in entries[:limit]
    ]
    return jsonify({"items": items, "total": len(entries)}), 200


# --------------------------------------------------------------------------- #
# scores
# --------------------------------------------------------------------------- #


def parse_score(raw) -> int:
    if isinstance(raw, bool) or raw is None:
        raise ValueError("score must be a number")
    if isinstance(raw, int):
        value = raw
    elif isinstance(raw, float):
        if not raw.is_integer():
            raise ValueError("score must be a whole number")
        value = int(raw)
    elif isinstance(raw, str):
        try:
            value = int(raw.strip())
        except (TypeError, ValueError):
            raise ValueError("score must be a number")
    else:
        raise ValueError("score must be a number")
    if value < 0:
        raise ValueError("score must not be negative")
    return value


@api.post("/scores")
@require_user
def submit_score():
    data = body()
    if "score" not in data:
        return error("score is required", 400)
    try:
        value = parse_score(data.get("score"))
    except ValueError as exc:
        return error(str(exc), 400)

    user = g.user
    db = get_db()
    previous = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE player_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]
    personal_best = previous is None or value > previous

    cursor = db.execute(
        "INSERT INTO scores (player_id, score, achieved_at, is_hidden) VALUES (?, ?, ?, 0)",
        (user["id"], value, now_iso()),
    )
    db.commit()

    row = db.execute(
        "SELECT id AS id, score AS score, achieved_at AS achieved_at, is_hidden AS is_hidden "
        "FROM scores WHERE id = ?",
        (cursor.lastrowid,),
    ).fetchone()

    payload = score_to_dict(row, user["username"])
    payload["rank"] = rank_of_player(int(user["id"]))
    payload["personal_best"] = personal_best
    return jsonify(payload), 201


@api.get("/scores")
@require_user
def my_scores():
    user = g.user
    db = get_db()
    rows = db.execute(
        "SELECT s.id AS id, s.score AS score, s.achieved_at AS achieved_at, "
        "s.is_hidden AS is_hidden, u.username AS username "
        "FROM scores s JOIN users u ON u.id = s.player_id "
        "WHERE s.player_id = ? ORDER BY s.achieved_at DESC, s.id DESC",
        (user["id"],),
    ).fetchall()

    best = db.execute(
        "SELECT MAX(score) AS best FROM scores WHERE player_id = ? AND is_hidden = 0",
        (user["id"],),
    ).fetchone()["best"]

    return jsonify(
        {
            "items": [score_to_dict(row, row["username"]) for row in rows],
            "best_score": best,
        }
    ), 200


# --------------------------------------------------------------------------- #
# admin
# --------------------------------------------------------------------------- #


@api.get("/admin/scores")
@require_admin
def admin_scores():
    page = parse_int_arg("page", 1, 1, 100000)
    page_size = parse_int_arg("page_size", DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE)

    db = get_db()
    total = int(db.execute("SELECT COUNT(*) AS count FROM scores").fetchone()["count"])
    rows = db.execute(
        "SELECT s.id AS id, s.score AS score, s.achieved_at AS achieved_at, "
        "s.is_hidden AS is_hidden, u.username AS username "
        "FROM scores s JOIN users u ON u.id = s.player_id "
        "ORDER BY s.achieved_at DESC, s.id DESC LIMIT ? OFFSET ?",
        (page_size, (page - 1) * page_size),
    ).fetchall()

    return jsonify(
        {
            "items": [score_to_dict(row, row["username"]) for row in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    ), 200


def _set_hidden(score_id: int, hidden: bool):
    db = get_db()
    row = db.execute(
        "SELECT s.id AS id, s.score AS score, s.achieved_at AS achieved_at, "
        "s.is_hidden AS is_hidden, u.username AS username "
        "FROM scores s JOIN users u ON u.id = s.player_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    if row is None:
        return error("score not found", 404)
    db.execute("UPDATE scores SET is_hidden = ? WHERE id = ?", (1 if hidden else 0, score_id))
    db.commit()
    row = db.execute(
        "SELECT s.id AS id, s.score AS score, s.achieved_at AS achieved_at, "
        "s.is_hidden AS is_hidden, u.username AS username "
        "FROM scores s JOIN users u ON u.id = s.player_id WHERE s.id = ?",
        (score_id,),
    ).fetchone()
    return jsonify(score_to_dict(row, row["username"])), 200


@api.post("/admin/scores/<int:score_id>/toggle")
@require_admin
def toggle_score(score_id: int):
    db = get_db()
    row = db.execute("SELECT is_hidden AS is_hidden FROM scores WHERE id = ?", (score_id,)).fetchone()
    if row is None:
        return error("score not found", 404)
    return _set_hidden(score_id, not bool(row["is_hidden"]))


@api.post("/admin/scores/<int:score_id>/hide")
@require_admin
def hide_score(score_id: int):
    return _set_hidden(score_id, True)


@api.post("/admin/scores/<int:score_id>/show")
@require_admin
def show_score(score_id: int):
    return _set_hidden(score_id, False)
