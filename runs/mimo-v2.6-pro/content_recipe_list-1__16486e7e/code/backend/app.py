"""Recipe book: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import json
import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "recipes.db"
DIST_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    category TEXT NOT NULL,
    prep_minutes INTEGER NOT NULL,
    servings INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
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
            "1/2 teaspoon salt",
            "2 cups buttermilk",
            "2 large eggs",
            "3 tablespoons melted butter",
        ],
        "instructions": (
            "Whisk the flour, sugar, baking powder, baking soda and salt in a large bowl.\n"
            "In a second bowl whisk the buttermilk, eggs and melted butter.\n"
            "Pour the wet mixture into the dry and stir until just combined; a few lumps are fine.\n"
            "Heat a lightly greased skillet over medium heat and ladle in about 1/4 cup of batter per pancake.\n"
            "Cook until bubbles form on the surface, flip, and cook until golden on the second side.\n"
            "Serve warm with maple syrup and butter."
        ),
    },
    {
        "title": "Creamy Tomato Basil Soup",
        "category": "Soup",
        "prep_minutes": 30,
        "servings": 6,
        "ingredients": [
            "2 tablespoons olive oil",
            "1 large onion, chopped",
            "3 cloves garlic, minced",
            "2 cans (28 oz) whole peeled tomatoes",
            "2 cups vegetable broth",
            "1/2 cup heavy cream",
            "1/2 cup fresh basil leaves",
            "1 teaspoon sugar",
            "Salt and black pepper to taste",
        ],
        "instructions": (
            "Warm the olive oil in a large pot over medium heat and cook the onion until soft, about 5 minutes.\n"
            "Add the garlic and cook for another minute until fragrant.\n"
            "Stir in the tomatoes with their juice, the broth, sugar, salt and pepper.\n"
            "Bring to a simmer and cook for 20 minutes.\n"
            "Blend the soup until smooth with an immersion blender.\n"
            "Stir in the cream and torn basil, warm through without boiling, and serve."
        ),
    },
    {
        "title": "Classic Spaghetti Carbonara",
        "category": "Dinner",
        "prep_minutes": 25,
        "servings": 4,
        "ingredients": [
            "400 g spaghetti",
            "200 g guanciale or pancetta, diced",
            "4 large egg yolks",
            "2 whole eggs",
            "1 cup finely grated Pecorino Romano",
            "1 teaspoon freshly ground black pepper",
            "Salt for the pasta water",
        ],
        "instructions": (
            "Bring a large pot of generously salted water to a boil and cook the spaghetti until al dente.\n"
            "Meanwhile crisp the guanciale in a wide pan over medium heat until the fat renders.\n"
            "Whisk the egg yolks, whole eggs, Pecorino and pepper together in a bowl.\n"
            "Reserve a cup of pasta water, then drain the spaghetti and add it to the pan off the heat.\n"
            "Quickly pour in the egg mixture and toss, adding splashes of pasta water until creamy.\n"
            "Serve immediately with extra Pecorino and pepper."
        ),
    },
    {
        "title": "Fudgy Chocolate Brownies",
        "category": "Dessert",
        "prep_minutes": 45,
        "servings": 12,
        "ingredients": [
            "200 g dark chocolate, chopped",
            "170 g unsalted butter",
            "1 1/2 cups sugar",
            "3 large eggs",
            "1 teaspoon vanilla extract",
            "1 cup all-purpose flour",
            "1/3 cup cocoa powder",
            "1/2 teaspoon salt",
        ],
        "instructions": (
            "Heat the oven to 175 C (350 F) and line a 23 cm square tin with parchment.\n"
            "Melt the chocolate and butter together over a pan of simmering water, then stir in the sugar.\n"
            "Beat in the eggs one at a time, then the vanilla.\n"
            "Sift in the flour, cocoa and salt and fold until just combined.\n"
            "Pour into the tin and bake for 30 to 35 minutes; the centre should still be slightly soft.\n"
            "Cool completely before cutting into squares."
        ),
    },
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        seeded = conn.execute("SELECT COUNT(*) AS n FROM recipes").fetchone()["n"]
        users = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if seeded == 0 and users == 0:
            seed_samples(conn)
        conn.commit()
    except sqlite3.IntegrityError:
        conn.rollback()
    finally:
        conn.close()


def seed_samples(conn: sqlite3.Connection) -> None:
    created = now_iso()
    secret = secrets.token_urlsafe(24)
    cur = conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        ("Sample Kitchen", generate_password_hash(secret), created),
    )
    author_id = cur.lastrowid
    base = datetime.now(timezone.utc)
    for i, recipe in enumerate(SAMPLE_RECIPES):
        created_at = (base - timedelta(hours=i + 1)).isoformat()
        conn.execute(
            "INSERT INTO recipes (title, ingredients, instructions, category,"
            " prep_minutes, servings, created_at, author_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                recipe["title"],
                json.dumps(recipe["ingredients"]),
                recipe["instructions"],
                recipe["category"],
                recipe["prep_minutes"],
                recipe["servings"],
                created_at,
                author_id,
            ),
        )


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def error(message: str, status: int, errors: dict | None = None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return body, status


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    return (
        get_db()
        .execute(
            "SELECT u.id, u.username FROM tokens t"
            " JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (token,),
        )
        .fetchone()
    )


def require_user():
    user = current_user()
    if user is None:
        return None, error("authentication required", 401)
    return user, None


def parse_int(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and re.fullmatch(r"-?\d+", value.strip()):
        return int(value.strip())
    return None


def validate_recipe(payload):
    """Validate a recipe body; return (clean, errors)."""
    errors: dict[str, str] = {}
    clean: dict = {}
    if not isinstance(payload, dict):
        return None, {"body": "request body must be a JSON object"}

    title = payload.get("title")
    if isinstance(title, str) and title.strip():
        clean["title"] = title.strip()
    else:
        errors["title"] = "title is required"

    ingredients = payload.get("ingredients")
    if isinstance(ingredients, list) and len(ingredients) > 0:
        cleaned = []
        valid = True
        for item in ingredients:
            if isinstance(item, str) and item.strip():
                cleaned.append(item.strip())
            else:
                valid = False
        if not valid:
            errors["ingredients"] = "ingredients must be non-empty strings"
        elif not cleaned:
            errors["ingredients"] = "ingredients must not be empty"
        else:
            clean["ingredients"] = cleaned
    else:
        errors["ingredients"] = "ingredients are required and must be a list"

    instructions = payload.get("instructions")
    if isinstance(instructions, str) and instructions.strip():
        clean["instructions"] = instructions.strip()
    else:
        errors["instructions"] = "instructions are required"

    category = payload.get("category")
    if isinstance(category, str) and category.strip():
        clean["category"] = category.strip()
    else:
        errors["category"] = "category is required"

    prep_minutes = parse_int(payload.get("prep_minutes"))
    if prep_minutes is None or prep_minutes < 0:
        errors["prep_minutes"] = "prep_minutes must be a non-negative integer"
    else:
        clean["prep_minutes"] = prep_minutes

    servings = parse_int(payload.get("servings"))
    if servings is None or servings < 1:
        errors["servings"] = "servings must be a positive integer"
    else:
        clean["servings"] = servings

    return clean, errors


def recipe_dict(row: sqlite3.Row) -> dict:
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


RECIPE_DETAIL_SQL = (
    "SELECT r.*, u.username AS author FROM recipes r"
    " JOIN users u ON u.id = r.author_id WHERE r.id = ?"
)


def get_recipe_row(recipe_id: int):
    return get_db().execute(RECIPE_DETAIL_SQL, (recipe_id,)).fetchone()


@app.get("/api/health")
def health():
    return {"status": "ok"}


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------

@app.post("/api/auth/register")
def register():
    payload = request.get_json(silent=True, force=True)
    errors: dict[str, str] = {}
    username = payload.get("username") if isinstance(payload, dict) else None
    password = payload.get("password") if isinstance(payload, dict) else None

    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    elif len(username.strip()) > 64:
        errors["username"] = "username must be at most 64 characters"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    elif len(password) > 256:
        errors["password"] = "password must be at most 256 characters"

    if errors:
        return error(next(iter(errors.values())), 400, errors)

    username = username.strip()
    db = get_db()
    taken = db.execute(
        "SELECT 1 FROM users WHERE username = ?", (username,)
    ).fetchone()
    if taken:
        return error("username is already taken", 409, {"username": "username is already taken"})

    created = now_iso()
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), created),
    )
    user_id = cur.lastrowid
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, created),
    )
    db.commit()
    return {"token": token, "username": username}, 201


@app.post("/api/auth/login")
def login():
    payload = request.get_json(silent=True, force=True)
    username = payload.get("username") if isinstance(payload, dict) else None
    password = payload.get("password") if isinstance(payload, dict) else None

    if not isinstance(username, str) or not username.strip() or not isinstance(password, str) or not password:
        return error("username and password are required", 400)

    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error("invalid username or password", 401)

    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, row["id"], now_iso()),
    )
    get_db().commit()
    return {"token": token}


# --------------------------------------------------------------------------
# Recipes
# --------------------------------------------------------------------------

@app.post("/api/recipes")
def create_recipe():
    user, err = require_user()
    if err:
        return err

    clean, errors = validate_recipe(request.get_json(silent=True, force=True))
    if errors:
        return error(next(iter(errors.values())), 400, errors)

    db = get_db()
    cur = db.execute(
        "INSERT INTO recipes (title, ingredients, instructions, category,"
        " prep_minutes, servings, created_at, author_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            clean["title"],
            json.dumps(clean["ingredients"]),
            clean["instructions"],
            clean["category"],
            clean["prep_minutes"],
            clean["servings"],
            now_iso(),
            user["id"],
        ),
    )
    db.commit()
    return recipe_dict(get_recipe_row(cur.lastrowid)), 201


@app.get("/api/recipes")
def list_recipes():
    page_raw = request.args.get("page", "1")
    size_raw = request.args.get("page_size", str(DEFAULT_PAGE_SIZE))

    page = parse_int(page_raw)
    if page is None or page < 1:
        return error("page must be a positive integer", 400)
    page_size = parse_int(size_raw)
    if page_size is None or not 1 <= page_size <= MAX_PAGE_SIZE:
        return error(f"page_size must be an integer between 1 and {MAX_PAGE_SIZE}", 400)

    where = []
    params: list = []

    category = request.args.get("category")
    if category is not None and category.strip():
        where.append("LOWER(r.category) = LOWER(?)")
        params.append(category.strip())

    q = request.args.get("q")
    if q is not None and q.strip():
        like = "%" + re.sub(r"([\\%_])", r"\\\1", q.strip()) + "%"
        where.append("r.title LIKE ? ESCAPE '\\'")
        params.append(like)

    clause = (" WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute(
        f"SELECT COUNT(*) AS n FROM recipes r{clause}", params
    ).fetchone()["n"]

    rows = db.execute(
        f"SELECT r.id, r.title, r.category, r.prep_minutes, u.username AS author"
        f" FROM recipes r JOIN users u ON u.id = r.author_id{clause}"
        f" ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
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
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    row = get_recipe_row(recipe_id)
    if row is None:
        return error("recipe not found", 404)
    return recipe_dict(row)


@app.put("/api/recipes/<int:recipe_id>")
def update_recipe(recipe_id: int):
    user, err = require_user()
    if err:
        return err

    row = get_recipe_row(recipe_id)
    if row is None:
        return error("recipe not found", 404)
    if row["author_id"] != user["id"]:
        return error("you can only edit your own recipes", 403)

    clean, errors = validate_recipe(request.get_json(silent=True, force=True))
    if errors:
        return error(next(iter(errors.values())), 400, errors)

    db = get_db()
    db.execute(
        "UPDATE recipes SET title = ?, ingredients = ?, instructions = ?,"
        " category = ?, prep_minutes = ?, servings = ? WHERE id = ?",
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
    db.commit()
    return recipe_dict(get_recipe_row(recipe_id))


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id: int):
    user, err = require_user()
    if err:
        return err

    row = get_recipe_row(recipe_id)
    if row is None:
        return error("recipe not found", 404)
    if row["author_id"] != user["id"]:
        return error("you can only delete your own recipes", 403)

    db = get_db()
    db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    db.commit()
    return "", 204


@app.get("/api/categories")
def list_categories():
    rows = get_db().execute(
        "SELECT DISTINCT category FROM recipes ORDER BY LOWER(category)"
    ).fetchall()
    return {"categories": [row["category"] for row in rows]}


# --------------------------------------------------------------------------
# Frontend
# --------------------------------------------------------------------------

@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if request.path.startswith("/api/"):
        return error("not found", 404)
    if (DIST_DIR / path).is_file():
        return send_from_directory(DIST_DIR, path)
    return send_from_directory(DIST_DIR, "index.html")


@app.errorhandler(404)
@app.errorhandler(405)
def handle_http_error(exc):
    if request.path.startswith("/api/"):
        return error("not found", exc.code)
    return frontend("index.html"), exc.code


@app.errorhandler(413)
def handle_too_large(_exc):
    return error("request body too large", 413)


init_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
