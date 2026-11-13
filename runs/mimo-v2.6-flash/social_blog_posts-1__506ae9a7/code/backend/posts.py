"""Post endpoints."""

import re
from datetime import datetime, timedelta, timezone

from flask import jsonify, request

from auth import api_error, current_user, require_admin, require_auth
from db import get_conn

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100

LINE_BREAKS = re.compile(r"(?:\r\n|\r|\n)+")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def excerpt(content: str) -> str:
    return LINE_BREAKS.sub(" ", content)[:200]


def normalize_tags(value):
    """Return a cleaned tag list, or raise ValueError."""
    if value is None:
        return []
    if not isinstance(value, list):
        raise ValueError("Tags must be a list of strings")
    tags = []
    for item in value:
        if not isinstance(item, str):
            raise ValueError("Tags must be a list of strings")
        tag = item.strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def validate_body(body):
    errors = []
    title = body.get("title")
    content = body.get("content")
    if not isinstance(title, str) or not title.strip():
        errors.append("Title is required")
    if not isinstance(content, str):
        errors.append("Content is required")
    tags = None
    if "tags" in body:
        try:
            tags = normalize_tags(body.get("tags"))
        except ValueError as exc:
            errors.append(str(exc))
    if errors:
        return None, errors
    return {"title": title, "content": content, "tags": tags}, None


def load_post(post_id: int):
    with get_conn() as conn:
        row = conn.execute(
            """SELECT p.*, u.username AS author
               FROM posts p JOIN users u ON u.id = p.author_id
               WHERE p.id = ?""",
            (post_id,),
        ).fetchone()
        if not row:
            return None
        tags = [
            r["tag"]
            for r in conn.execute(
                "SELECT tag FROM tags WHERE post_id = ? ORDER BY rowid", (post_id,)
            )
        ]
    post = dict(row)
    post["tags"] = tags
    return post


def save_tags(post_id: int, tags) -> None:
    with get_conn() as conn:
        conn.execute("DELETE FROM tags WHERE post_id = ?", (post_id,))
        for tag in tags:
            conn.execute("INSERT INTO tags (post_id, tag) VALUES (?, ?)", (post_id, tag))


def serialize(post: dict, *, with_status: bool = False) -> dict:
    data = {
        "id": post["id"],
        "title": post["title"],
        "content": post["content"],
        "tags": post["tags"],
        "created_at": post["created_at"],
        "updated_at": post["updated_at"],
        "author": post["author"],
        "excerpt": excerpt(post["content"]),
    }
    if with_status:
        data["taken_down"] = bool(post["taken_down"])
    return data


def visible_to(post: dict, user) -> bool:
    if not post["taken_down"]:
        return True
    return bool(user and user["is_admin"])


def touch_updated(post: dict) -> str:
    previous = post["updated_at"]
    now = datetime.now(timezone.utc)
    try:
        prev_dt = datetime.fromisoformat(previous)
        if prev_dt.tzinfo is None:
            prev_dt = prev_dt.replace(tzinfo=timezone.utc)
        if now <= prev_dt:
            now = prev_dt + timedelta(microseconds=1)
    except ValueError:
        pass
    return now.isoformat(timespec="microseconds")


def register_routes(app):
    @app.get("/api/posts")
    def list_posts():
        user = current_user()
        args = request.args

        def param(name: str) -> str:
            value = args.get(name, "")
            return value.strip() if isinstance(value, str) else ""

        try:
            page = int(args.get("page", 1))
        except (TypeError, ValueError):
            page = 1
        try:
            page_size = int(args.get("page_size", DEFAULT_PAGE_SIZE))
        except (TypeError, ValueError):
            page_size = DEFAULT_PAGE_SIZE
        page = max(1, page)
        page_size = max(1, min(MAX_PAGE_SIZE, page_size))

        q = param("q")
        tag = param("tag")
        author = param("author")
        include_taken_down = (
            bool(user and user["is_admin"]) and args.get("include_taken_down") in ("1", "true", "yes")
        )

        where = []
        params = []
        if not include_taken_down:
            where.append("p.taken_down = 0")
        if q:
            pattern = "%" + q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
            where.append(
                "(LOWER(p.title) LIKE ? ESCAPE '\\' OR LOWER(p.content) LIKE ? ESCAPE '\\')"
            )
            params.extend([pattern, pattern])
        if tag:
            where.append("p.id IN (SELECT post_id FROM tags WHERE tag = ?)")
            params.append(tag)
        if author:
            where.append("u.username = ?")
            params.append(author)
        where_sql = " AND ".join(where) if where else "1=1"

        with get_conn() as conn:
            total = conn.execute(
                f"""SELECT COUNT(*) AS n
                    FROM posts p JOIN users u ON u.id = p.author_id
                    WHERE {where_sql}""",
                params,
            ).fetchone()["n"]
            rows = conn.execute(
                f"""SELECT p.*, u.username AS author
                    FROM posts p JOIN users u ON u.id = p.author_id
                    WHERE {where_sql}
                    ORDER BY p.created_at DESC, p.id DESC
                    LIMIT ? OFFSET ?""",
                [*params, page_size, (page - 1) * page_size],
            ).fetchall()
            items = []
            for row in rows:
                tags = [
                    r["tag"]
                    for r in conn.execute(
                        "SELECT tag FROM tags WHERE post_id = ? ORDER BY rowid",
                        (row["id"],),
                    )
                ]
                post = dict(row)
                post["tags"] = tags
                items.append(
                    serialize(post, with_status=include_taken_down)
                )

        return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})

    @app.post("/api/posts")
    @require_auth
    def create_post():
        user = current_user()
        body = request.get_json(silent=True, force=True) or {}
        values, errors = validate_body(body)
        if errors:
            return api_error(400, errors[0])
        now = utcnow()
        with get_conn() as conn:
            cur = conn.execute(
                """INSERT INTO posts (author_id, title, content, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (user["id"], values["title"].strip(), values["content"], now, now),
            )
            post_id = cur.lastrowid
        save_tags(post_id, values["tags"] or [])
        post = load_post(post_id)
        return jsonify(serialize(post)), 201

    @app.get("/api/posts/<int:post_id>")
    def get_post(post_id: int):
        post = load_post(post_id)
        if not post or not visible_to(post, current_user()):
            return api_error(404, "Post not found")
        user = current_user()
        return jsonify(serialize(post, with_status=bool(user and user["is_admin"])))

    @app.put("/api/posts/<int:post_id>")
    @require_auth
    def update_post(post_id: int):
        user = current_user()
        post = load_post(post_id)
        if not post or not visible_to(post, user):
            return api_error(404, "Post not found")
        if post["author_id"] != user["id"]:
            return api_error(403, "Only the author can change this post")
        body = request.get_json(silent=True, force=True) or {}
        values, errors = validate_body(body)
        if errors:
            return api_error(400, errors[0])
        tags = values["tags"] if values["tags"] is not None else []
        updated_at = touch_updated(post)
        with get_conn() as conn:
            conn.execute(
                """UPDATE posts SET title = ?, content = ?, updated_at = ? WHERE id = ?""",
                (values["title"].strip(), values["content"], updated_at, post_id),
            )
        save_tags(post_id, tags)
        post = load_post(post_id)
        return jsonify(serialize(post, with_status=bool(user["is_admin"])))

    @app.delete("/api/posts/<int:post_id>")
    @require_auth
    def delete_post(post_id: int):
        user = current_user()
        post = load_post(post_id)
        if not post or not visible_to(post, user):
            return api_error(404, "Post not found")
        if post["author_id"] != user["id"]:
            return api_error(403, "Only the author can delete this post")
        with get_conn() as conn:
            conn.execute("DELETE FROM posts WHERE id = ?", (post_id,))
        return jsonify({"ok": True})

    @app.post("/api/admin/posts/<int:post_id>/toggle")
    @require_admin
    def toggle_post(post_id: int):
        post = load_post(post_id)
        if not post:
            return api_error(404, "Post not found")
        with get_conn() as conn:
            conn.execute(
                "UPDATE posts SET taken_down = 1 - taken_down WHERE id = ?", (post_id,)
            )
        post = load_post(post_id)
        return jsonify(serialize(post, with_status=True))
