"""JSON API: accounts and recipes."""

from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Blueprint, g, jsonify, request
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_db, utcnow

api = Blueprint("api", __name__, url_prefix="/api")

SESSION_DAYS = 30
MAX_TITLE = 200
MAX_CATEGORY = 50
MAX_INGREDIENTS = 100
MAX_INGREDIENT_LENGTH = 200
MAX_INSTRUCTIONS = 5000
MAX_PREP_MINUTES = 10080
MAX_SERVINGS = 1000


def error_response(message: str, status: int, errors: dict | None = None):
    body: dict = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


def validation_error(errors: dict):
    return error_response("Validation failed.", 400, errors)


def parse_json_body() -> dict | None:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


def get_token() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer ") :].strip()
    return token or None


def get_current_user() -> dict | None:
    token = get_token()
    if not token:
        return None
    with get_db() as conn:
        row = conn.execute(
            """SELECT u.id AS id, u.username AS username, s.expires_at AS expires_at
               FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = ?""",
            (token,),
        ).fetchone()
    if row is None or row["expires_at"] <= utcnow():
        return None
    return {"id": row["id"], "username": row["username"]}


def require_auth(handler):
    @wraps(handler)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return error_response("Authentication required.", 401)
        g.user = user
        return handler(*args, **kwargs)

    return wrapper


@api.post("/auth/register")
def register():
    data = parse_json_body()
    if data is None:
        return error_response("Invalid JSON body.", 400)

    errors: dict[str, list[str]] = {}
    username = data.get("username")
    password = data.get("password")

    if not isinstance(username, str) or not username.strip():
        errors["username"] = ["Username is required."]
    elif len(username.strip()) > 50:
        errors["username"] = ["Username must be 50 characters or fewer."]

    if not isinstance(password, str) or not password:
        errors["password"] = ["Password is required."]
    elif len(password) > 128:
        errors["password"] = ["Password must be 128 characters or fewer."]

    if errors:
        return validation_error(errors)

    username = username.strip()
    with get_db() as conn:
        try:
            cursor = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (username, generate_password_hash(password), utcnow()),
            )
        except sqlite3.IntegrityError:
            return error_response("Username already taken.", 409)
        user_id = cursor.lastrowid

    return jsonify({"id": user_id, "username": username}), 201


@api.post("/auth/login")
def login():
    data = parse_json_body()
    if data is None:
        return error_response("Invalid JSON body.", 400)

    username = data.get("username")
    password = data.get("password")
    if (
        not isinstance(username, str)
        or not username.strip()
        or not isinstance(password, str)
        or not password
    ):
        errors: dict[str, list[str]] = {}
        if not isinstance(username, str) or not username.strip():
            errors["username"] = ["Username is required."]
        if not isinstance(password, str) or not password:
            errors["password"] = ["Password is required."]
        return validation_error(errors)

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username.strip(),),
        ).fetchone()
        if row is None or not check_password_hash(row["password_hash"], password):
            return error_response("Invalid username or password.", 401)
        token = secrets.token_urlsafe(32)
        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
        ).isoformat(timespec="seconds")
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, row["id"], utcnow(), expires_at),
        )

    return jsonify({"token": token}), 200


@api.get("/auth/me")
@require_auth
def me():
    return jsonify({"username": g.user["username"]})


@api.post("/auth/logout")
def logout():
    token = get_token()
    if token:
        with get_db() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return jsonify({"status": "ok"}), 200


# ---------------------------------------------------------------------------
# Recipe validation and serialisation
# ---------------------------------------------------------------------------


def _validate_non_empty_text(
    value,
    field: str,
    label: str,
    limit: int,
    errors: dict,
    required_message: str | None = None,
) -> str | None:
    if not isinstance(value, str) or not value.strip():
        errors.setdefault(field, []).append(
            required_message or f"{label} is required."
        )
        return None
    text = value.strip()
    if len(text) > limit:
        errors.setdefault(field, []).append(
            f"{label} must be {limit} characters or fewer."
        )
        return None
    return text


def _validate_optional_int(
    value, field: str, label: str, maximum: int, errors: dict
) -> int | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    number: int | None = None
    if isinstance(value, bool):
        number = None
    elif isinstance(value, int):
        number = value
    elif isinstance(value, float) and value.is_integer():
        number = int(value)
    elif isinstance(value, str) and value.strip().lstrip("+-").isdigit():
        number = int(value.strip())
    if number is None or number < 0 or number > maximum:
        errors.setdefault(field, []).append(
            f"{label} must be a whole number between 0 and {maximum}."
        )
        return None
    return number


def validate_recipe(payload: dict) -> tuple[dict | None, dict]:
    """Validate recipe fields; returns (clean values, field errors)."""
    errors: dict[str, list[str]] = {}
    clean: dict = {}

    title = _validate_non_empty_text(
        payload.get("title"), "title", "Title", MAX_TITLE, errors
    )
    if title is not None:
        clean["title"] = title

    category = _validate_non_empty_text(
        payload.get("category"), "category", "Category", MAX_CATEGORY, errors
    )
    if category is not None:
        clean["category"] = category

    ingredients = payload.get("ingredients")
    if not isinstance(ingredients, list):
        errors.setdefault("ingredients", []).append("Ingredients are required.")
    elif not ingredients:
        errors.setdefault("ingredients", []).append(
            "Add at least one ingredient."
        )
    elif len(ingredients) > MAX_INGREDIENTS:
        errors.setdefault("ingredients", []).append(
            f"A recipe can have at most {MAX_INGREDIENTS} ingredients."
        )
    else:
        cleaned: list[str] = []
        for item in ingredients:
            if not isinstance(item, str) or not item.strip():
                errors.setdefault("ingredients", []).append(
                    "Each ingredient must be non-empty text."
                )
                cleaned = []
                break
            if len(item.strip()) > MAX_INGREDIENT_LENGTH:
                errors.setdefault("ingredients", []).append(
                    f"Each ingredient must be {MAX_INGREDIENT_LENGTH} characters or fewer."
                )
                cleaned = []
                break
            cleaned.append(item.strip())
        if cleaned:
            clean["ingredients"] = cleaned

    instructions = _validate_non_empty_text(
        payload.get("instructions"),
        "instructions",
        "Instructions",
        MAX_INSTRUCTIONS,
        errors,
        required_message="Instructions are required.",
    )
    if instructions is not None:
        clean["instructions"] = instructions

    prep_minutes = _validate_optional_int(
        payload.get("prep_minutes"),
        "prep_minutes",
        "Prep minutes",
        MAX_PREP_MINUTES,
        errors,
    )
    if "prep_minutes" not in errors:
        clean["prep_minutes"] = prep_minutes

    servings = _validate_optional_int(
        payload.get("servings"), "servings", "Servings", MAX_SERVINGS, errors
    )
    if "servings" not in errors:
        clean["servings"] = servings

    if errors:
        return None, errors
    return clean, errors


def fetch_recipe(conn, recipe_id: int):
    return conn.execute(
        """SELECT r.id, r.title, r.ingredients, r.instructions, r.category,
                  r.prep_minutes, r.servings, r.author_id, r.created_at,
                  u.username AS author
           FROM recipes r
           JOIN users u ON u.id = r.author_id
           WHERE r.id = ?""",
        (recipe_id,),
    ).fetchone()


def full_recipe(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "ingredients": json.loads(row["ingredients"]),
        "instructions": row["instructions"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "servings": row["servings"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


def query_int(name: str, default: int, minimum: int, maximum: int | None) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(str(raw).strip())
    except ValueError:
        return default
    if value < minimum:
        value = minimum
    if maximum is not None and value > maximum:
        value = maximum
    return value


# ---------------------------------------------------------------------------
# Recipes
# ---------------------------------------------------------------------------


@api.get("/recipes")
def list_recipes():
    category = (request.args.get("category") or "").strip()
    q = (request.args.get("q") or "").strip()
    page = query_int("page", 1, 1, None)
    page_size = query_int("page_size", 10, 1, 500)

    where: list[str] = []
    params: list = []
    if category:
        where.append("r.category = ? COLLATE NOCASE")
        params.append(category)
    if q:
        escaped = (
            q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        where.append("r.title LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) FROM recipes r {clause}", params
        ).fetchone()[0]
        rows = conn.execute(
            f"""SELECT r.id, r.title, r.category, r.prep_minutes,
                       u.username AS author
                FROM recipes r
                JOIN users u ON u.id = r.author_id
                {clause}
                ORDER BY r.created_at DESC, r.id DESC
                LIMIT ? OFFSET ?""",
            [*params, page_size, (page - 1) * page_size],
        ).fetchall()

    items = [
        {
            "id": row["id"],
            "title": row["title"],
            "category": row["category"],
            "prep_minutes": row["prep_minutes"],
            "author": row["author"],
        }
        for row in rows
    ]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@api.get("/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    with get_db() as conn:
        row = fetch_recipe(conn, recipe_id)
    if row is None:
        return error_response("Recipe not found.", 404)
    return jsonify(full_recipe(row))


@api.post("/recipes")
@require_auth
def create_recipe():
    data = parse_json_body()
    if data is None:
        return error_response("Invalid JSON body.", 400)

    clean, errors = validate_recipe(data)
    if errors:
        return validation_error(errors)

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO recipes
               (title, ingredients, instructions, category, prep_minutes,
                servings, author_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                clean["title"],
                json.dumps(clean["ingredients"]),
                clean["instructions"],
                clean["category"],
                clean["prep_minutes"],
                clean["servings"],
                g.user["id"],
                utcnow(),
            ),
        )
        row = fetch_recipe(conn, cursor.lastrowid)

    return jsonify(full_recipe(row)), 201


@api.put("/recipes/<int:recipe_id>")
@require_auth
def update_recipe(recipe_id: int):
    with get_db() as conn:
        existing = fetch_recipe(conn, recipe_id)
        if existing is None:
            return error_response("Recipe not found.", 404)
        if existing["author_id"] != g.user["id"]:
            return error_response(
                "Only the author can change this recipe.", 403
            )

        data = parse_json_body()
        if data is None:
            return error_response("Invalid JSON body.", 400)

        merged = {
            "title": existing["title"],
            "ingredients": json.loads(existing["ingredients"]),
            "instructions": existing["instructions"],
            "category": existing["category"],
            "prep_minutes": existing["prep_minutes"],
            "servings": existing["servings"],
        }
        provided = {key: value for key, value in data.items() if key in merged}
        if not provided:
            return error_response("No recipe fields were provided.", 400)
        merged.update(provided)

        clean, errors = validate_recipe(merged)
        if errors:
            return validation_error(errors)

        conn.execute(
            """UPDATE recipes
               SET title = ?, ingredients = ?, instructions = ?, category = ?,
                   prep_minutes = ?, servings = ?
               WHERE id = ?""",
            (
                clean["title"],
                json.dumps(clean["ingredients"]),
                clean["instructions"],
                clean["category"],
                clean["prep_minutes"],
                clean["servings"],
                recipe_id,
            ),
        )
        row = fetch_recipe(conn, recipe_id)

    return jsonify(full_recipe(row))


@api.delete("/recipes/<int:recipe_id>")
@require_auth
def delete_recipe(recipe_id: int):
    with get_db() as conn:
        existing = fetch_recipe(conn, recipe_id)
        if existing is None:
            return error_response("Recipe not found.", 404)
        if existing["author_id"] != g.user["id"]:
            return error_response("Only the author can delete this recipe.", 403)
        conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))

    return jsonify({"message": "Recipe deleted."}), 200


@api.get("/categories")
def categories():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT category FROM recipes ORDER BY category COLLATE NOCASE"
        ).fetchall()
    return jsonify({"items": [row["category"] for row in rows]})
