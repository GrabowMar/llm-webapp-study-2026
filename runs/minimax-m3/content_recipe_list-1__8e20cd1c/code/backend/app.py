"""Recipe book: JSON API under /api plus the built frontend served from /."""

from __future__ import annotations

import functools
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from flask import Flask, g, jsonify, request, send_from_directory
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR") or (Path.cwd() / "data"))
DB_PATH = DATA_DIR / "recipes.db"

TOKEN_MAX_AGE = 60 * 60 * 24 * 30
DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100
USERNAME_MAX = 40
PASSWORD_MAX = 200
TITLE_MAX = 200
CATEGORY_MAX = 60

app = Flask(__name__, static_folder=None)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_secret_key() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    key_path = DATA_DIR / "secret_key"
    key = secrets.token_hex(32)
    try:
        handle = os.open(key_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return key_path.read_text().strip()
    with os.fdopen(handle, "w") as stream:
        stream.write(key)
    return key_path.read_text().strip() or key


SECRET_KEY = load_secret_key()
serializer = URLSafeTimedSerializer(SECRET_KEY, salt="recipe-book-auth")


def issue_token(user_id: int) -> str:
    return serializer.dumps({"uid": user_id})


def read_token() -> int | None:
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        return None
    token = header[7:].strip()
    if not token:
        return None
    try:
        payload = serializer.loads(token, max_age=TOKEN_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None
    uid = payload.get("uid")
    return uid if isinstance(uid, int) else None


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        connection = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")
        connection.execute("PRAGMA foreign_keys=ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(_exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def api_error(message: str, status: int = 400, errors: dict[str, str] | None = None):
    payload: dict[str, Any] = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def require_auth(view: Callable):
    @functools.wraps(view)
    def wrapper(*args, **kwargs):
        uid = read_token()
        if uid is None:
            return api_error("Authentication required.", 401)
        row = get_db().execute("SELECT id, username FROM users WHERE id = ?", (uid,)).fetchone()
        if row is None:
            return api_error("Authentication required.", 401)
        g.user = {"id": row["id"], "username": row["username"]}
        return view(*args, **kwargs)

    return wrapper


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'Other',
    prep_minutes INTEGER NOT NULL DEFAULT 0,
    servings INTEGER NOT NULL DEFAULT 1,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS recipes_created_at_idx ON recipes (created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recipes_category_idx ON recipes (category);
"""


SAMPLE_RECIPES = [
    {
        "title": "Fluffy Buttermilk Pancakes",
        "category": "Breakfast",
        "prep_minutes": 15,
        "servings": 4,
        "ingredients": [
            "2 cups all-purpose flour",
            "2 tablespoons sugar",
            "2 teaspoons baking powder",
            "1 teaspoon baking soda",
            "2 cups buttermilk",
            "2 large eggs",
            "4 tablespoons butter, melted",
            "1 pinch of salt",
        ],
        "instructions": (
            "Whisk the flour, sugar, baking powder, baking soda and salt in a large bowl.\n"
            "Pour in the buttermilk, eggs and melted butter and whisk until just combined. A few lumps are fine.\n"
            "Rest the batter for 10 minutes so the flour hydrates.\n"
            "Heat a non-stick pan over medium heat, drop rounds of batter and flip when bubbles appear.\n"
            "Serve warm with butter and maple syrup."
        ),
    },
    {
        "title": "Classic Margherita Pizza",
        "category": "Dinner",
        "prep_minutes": 30,
        "servings": 2,
        "ingredients": [
            "300 g bread flour",
            "1 teaspoon instant yeast",
            "1 teaspoon salt",
            "200 ml warm water",
            "1 tablespoon olive oil",
            "150 g tomato passata",
            "125 g mozzarella, torn",
            "A handful of fresh basil leaves",
        ],
        "instructions": (
            "Mix flour, yeast, salt and warm water into a soft dough and knead for 5 minutes.\n"
            "Leave the dough to rise in a warm place for 90 minutes until doubled in size.\n"
            "Roll the dough into a thin round and leave it to relax for 10 minutes.\n"
            "Spread the passata over the base, scatter the mozzarella and bake at 250 C for 8 minutes.\n"
            "Finish with basil leaves and a drizzle of olive oil."
        ),
    },
    {
        "title": "Thai Green Curry",
        "category": "Dinner",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "400 ml coconut milk",
            "2 tablespoons green curry paste",
            "300 g chicken thigh, sliced",
            "150 g Thai eggplant, quartered",
            "100 g green beans",
            "1 tablespoon fish sauce",
            "1 teaspoon sugar",
            "150 g jasmine rice",
        ],
        "instructions": (
            "Simmer the thick coconut cream from the top of the tin with the curry paste until the oil separates.\n"
            "Add the chicken and cook for 5 minutes, then stir in the rest of the coconut milk.\n"
            "Add the eggplant and beans and simmer until tender.\n"
            "Season with fish sauce and sugar.\n"
            "Serve over steamed jasmine rice with fresh Thai basil."
        ),
    },
    {
        "title": "Chocolate Lava Cakes",
        "category": "Dessert",
        "prep_minutes": 25,
        "servings": 4,
        "ingredients": [
            "150 g dark chocolate, 70% cocoa",
            "100 g butter",
            "2 eggs",
            "2 egg yolks",
            "60 g caster sugar",
            "50 g plain flour",
            "Cocoa powder for dusting",
        ],
        "instructions": (
            "Melt the chocolate and butter together and let it cool slightly.\n"
            "Whisk the eggs, yolks and sugar until pale, then fold in the chocolate mixture.\n"
            "Sift in the flour and mix until smooth.\n"
            "Divide between buttered ramekins and chill for 20 minutes.\n"
            "Bake at 200 C for 10 minutes, dust with cocoa and serve straight away."
        ),
    },
]


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=15, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    try:
        connection.executescript(SCHEMA)
        connection.commit()
        seed_samples(connection)
        connection.commit()
    finally:
        connection.close()


def seed_samples(connection: sqlite3.Connection) -> None:
    connection.execute("BEGIN IMMEDIATE")
    existing = connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    if existing:
        connection.rollback()
        return
    chef = connection.execute("SELECT id FROM users WHERE username = ?", ("chef",)).fetchone()
    if chef is None:
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            ("chef", generate_password_hash(secrets.token_urlsafe(24)), now_iso()),
        )
        chef_id = cursor.lastrowid
    else:
        chef_id = chef["id"]
    base = datetime.now(timezone.utc).replace(microsecond=0)
    for offset, recipe in enumerate(SAMPLE_RECIPES):
        stamp = (base - timedelta(days=len(SAMPLE_RECIPES) - offset)).isoformat().replace("+00:00", "Z")
        connection.execute(
            "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes, servings, author_id, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                recipe["title"],
                json.dumps(recipe["ingredients"]),
                recipe["instructions"],
                recipe["category"],
                recipe["prep_minutes"],
                recipe["servings"],
                chef_id,
                stamp,
            ),
        )
    connection.commit()


init_db()


def recipe_dict(row: sqlite3.Row) -> dict[str, Any]:
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


def as_integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value) if value.is_integer() else None
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def validate_recipe(data: Any) -> tuple[dict[str, Any], dict[str, str]]:
    errors: dict[str, str] = {}
    cleaned: dict[str, Any] = {}

    if not isinstance(data, dict):
        return cleaned, {"title": "Send the recipe fields as a JSON object."}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > TITLE_MAX:
        errors["title"] = f"Title must be {TITLE_MAX} characters or fewer."
    else:
        cleaned["title"] = title.strip()

    ingredients = data.get("ingredients")
    if ingredients is None and "ingredients" not in data:
        ingredients = []
    if isinstance(ingredients, str):
        ingredients = ingredients.splitlines()
    if not isinstance(ingredients, list):
        errors["ingredients"] = "Ingredients must be a list of items."
    else:
        items: list[str] = []
        broken = False
        for item in ingredients:
            if item is None:
                continue
            if not isinstance(item, str):
                errors["ingredients"] = "Ingredients must be a list of text items."
                broken = True
                break
            text = item.strip()
            if text:
                items.append(text)
        if not broken:
            cleaned["ingredients"] = items

    instructions = data.get("instructions")
    if instructions is None and "instructions" not in data:
        instructions = ""
    if not isinstance(instructions, str):
        errors["instructions"] = "Instructions must be text."
    else:
        cleaned["instructions"] = instructions.strip()

    category = data.get("category")
    if category is None and "category" not in data:
        cleaned["category"] = "Other"
    elif not isinstance(category, str):
        errors["category"] = "Category must be text."
    elif len(category.strip()) > CATEGORY_MAX:
        errors["category"] = f"Category must be {CATEGORY_MAX} characters or fewer."
    else:
        cleaned["category"] = category.strip() or "Other"

    prep_minutes = data.get("prep_minutes")
    if prep_minutes is None and "prep_minutes" not in data:
        cleaned["prep_minutes"] = 0
    else:
        number = as_integer(prep_minutes)
        if number is None or number < 0:
            errors["prep_minutes"] = "Prep minutes must be a number of minutes."
        else:
            cleaned["prep_minutes"] = number

    servings = data.get("servings")
    if servings is None and "servings" not in data:
        cleaned["servings"] = 1
    else:
        number = as_integer(servings)
        if number is None or number < 1:
            errors["servings"] = "Servings must be at least 1."
        else:
            cleaned["servings"] = number

    return cleaned, errors


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    username = data.get("username")
    username = username.strip() if isinstance(username, str) else ""
    password = data.get("password")
    password = password if isinstance(password, str) else ""

    errors: dict[str, str] = {}
    if not username:
        errors["username"] = "Username is required."
    elif len(username) > USERNAME_MAX:
        errors["username"] = f"Username must be {USERNAME_MAX} characters or fewer."
    if not password:
        errors["password"] = "Password is required."
    elif len(password) > PASSWORD_MAX:
        errors["password"] = "Password is too long."
    if errors:
        return api_error("Please fix the highlighted fields.", 400, errors)

    db = get_db()
    taken = db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if taken is not None:
        message = "That username is already taken."
        return api_error(message, 409, {"username": message})

    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    user_id = int(cursor.lastrowid)
    return jsonify({"id": user_id, "username": username, "token": issue_token(user_id)}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    username = data.get("username")
    username = username.strip() if isinstance(username, str) else ""
    password = data.get("password")
    password = password if isinstance(password, str) else ""

    if not username or not password:
        return api_error("Username and password are required.", 400, {
            "username": "Username is required." if not username else "",
            "password": "Password is required." if not password else "",
        })

    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return api_error("Incorrect username or password.", 401)

    return jsonify({"token": issue_token(row["id"])})


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify({"id": g.user["id"], "username": g.user["username"]})


@app.get("/api/recipes")
def list_recipes():
    page = request.args.get("page", type=int) or 1
    page_size = request.args.get("page_size", type=int) or DEFAULT_PAGE_SIZE
    page = max(1, page)
    page_size = min(max(1, page_size), MAX_PAGE_SIZE)
    category = (request.args.get("category") or "").strip()
    query = (request.args.get("q") or "").strip()

    clauses: list[str] = []
    params: list[Any] = []
    if category and category.lower() != "all":
        clauses.append("LOWER(r.category) = LOWER(?)")
        params.append(category)
    if query:
        clauses.append("LOWER(r.title) LIKE LOWER(?)")
        params.append(f"%{query}%")
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""

    db = get_db()
    total = db.execute(f"SELECT COUNT(*) FROM recipes r{where}", params).fetchone()[0]
    rows = db.execute(
        "SELECT r.id, r.title, r.category, r.prep_minutes, u.username AS author"
        f" FROM recipes r JOIN users u ON u.id = r.author_id{where}"
        " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
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
    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    row = get_db().execute(
        "SELECT r.*, u.username AS author FROM recipes r JOIN users u ON u.id = r.author_id WHERE r.id = ?",
        (recipe_id,),
    ).fetchone()
    if row is None:
        return api_error("Recipe not found.", 404)
    return jsonify(recipe_dict(row))


@app.get("/api/categories")
def list_categories():
    rows = get_db().execute(
        "SELECT category, COUNT(*) AS count FROM recipes GROUP BY category ORDER BY category COLLATE NOCASE"
    ).fetchall()
    return jsonify([{"category": row["category"], "count": row["count"]} for row in rows])


@app.post("/api/recipes")
@require_auth
def create_recipe():
    cleaned, errors = validate_recipe(request.get_json(silent=True))
    if errors:
        return api_error("Please fix the highlighted fields.", 400, errors)

    db = get_db()
    cursor = db.execute(
        "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes, servings, author_id, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            cleaned["title"],
            json.dumps(cleaned["ingredients"]),
            cleaned["instructions"],
            cleaned["category"],
            cleaned["prep_minutes"],
            cleaned["servings"],
            g.user["id"],
            now_iso(),
        ),
    )
    db.commit()
    row = db.execute(
        "SELECT r.*, u.username AS author FROM recipes r JOIN users u ON u.id = r.author_id WHERE r.id = ?",
        (cursor.lastrowid,),
    ).fetchone()
    return jsonify(recipe_dict(row)), 201


@app.put("/api/recipes/<int:recipe_id>")
@require_auth
def update_recipe(recipe_id: int):
    db = get_db()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if row is None:
        return api_error("Recipe not found.", 404)
    if row["author_id"] != g.user["id"]:
        return api_error("Only the author can change this recipe.", 403)

    cleaned, errors = validate_recipe(request.get_json(silent=True))
    if errors:
        return api_error("Please fix the highlighted fields.", 400, errors)

    db.execute(
        "UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, category = ?, prep_minutes = ?, servings = ?"
        " WHERE id = ?",
        (
            cleaned["title"],
            json.dumps(cleaned["ingredients"]),
            cleaned["instructions"],
            cleaned["category"],
            cleaned["prep_minutes"],
            cleaned["servings"],
            recipe_id,
        ),
    )
    db.commit()
    updated = db.execute(
        "SELECT r.*, u.username AS author FROM recipes r JOIN users u ON u.id = r.author_id WHERE r.id = ?",
        (recipe_id,),
    ).fetchone()
    return jsonify(recipe_dict(updated))


@app.delete("/api/recipes/<int:recipe_id>")
@require_auth
def delete_recipe(recipe_id: int):
    db = get_db()
    row = db.execute("SELECT author_id FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if row is None:
        return api_error("Recipe not found.", 404)
    if row["author_id"] != g.user["id"]:
        return api_error("Only the author can delete this recipe.", 403)
    db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    db.commit()
    return "", 204


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api"):
        return api_error("Not found.", 404)
    return serve_index()


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api"):
        return api_error("Method not allowed.", 405)
    return serve_index()


def serve_index():
    index = DIST / "index.html"
    if not index.is_file():
        return "The frontend build is missing. Run `npm run build` inside frontend/.", 404
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return api_error("Not found.", 404)
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return serve_index()
