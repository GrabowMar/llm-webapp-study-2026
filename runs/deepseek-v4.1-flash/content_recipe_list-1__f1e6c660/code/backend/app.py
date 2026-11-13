"""Recipe book: Flask JSON API and static frontend host."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = DATA_DIR / "recipe_book.sqlite3"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    category TEXT NOT NULL,
    prep_minutes INTEGER NOT NULL,
    servings INTEGER NOT NULL,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_recipes_user_id ON recipes(user_id);
"""

SAMPLE_RECIPES = [
    {
        "title": "Lemon Blueberry Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "1 1/2 cups all-purpose flour",
            "2 tablespoons sugar",
            "2 teaspoons baking powder",
            "1 cup milk",
            "1 egg",
            "1 cup blueberries",
            "Zest of 1 lemon",
        ],
        "instructions": (
            "Whisk the flour, sugar and baking powder in a large bowl.\n"
            "Beat in the milk and egg until the batter is smooth.\n"
            "Fold in the blueberries and lemon zest.\n"
            "Cook ladlefuls on a lightly buttered griddle until golden on both sides."
        ),
    },
    {
        "title": "Roasted Tomato Pasta",
        "category": "Dinner",
        "prep_minutes": 35,
        "servings": 2,
        "ingredients": [
            "250 g cherry tomatoes",
            "200 g spaghetti",
            "3 garlic cloves",
            "2 tablespoons olive oil",
            "A handful of basil",
            "Salt and black pepper",
        ],
        "instructions": (
            "Heat the oven to 200°C.\n"
            "Toss the tomatoes and garlic with olive oil, salt and pepper.\n"
            "Roast for 20 minutes until the tomatoes burst.\n"
            "Cook the pasta until al dente and toss it with the roasted tomatoes and basil."
        ),
    },
    {
        "title": "Chocolate Olive Oil Cake",
        "category": "Dessert",
        "prep_minutes": 50,
        "servings": 8,
        "ingredients": [
            "180 g dark chocolate",
            "150 ml olive oil",
            "200 g sugar",
            "3 eggs",
            "120 g flour",
            "30 g cocoa powder",
            "1 teaspoon baking powder",
        ],
        "instructions": (
            "Heat the oven to 170°C and line a round cake tin.\n"
            "Melt the chocolate gently and stir in the olive oil.\n"
            "Whisk the eggs with the sugar until pale, then fold in the chocolate mixture.\n"
            "Sift in the flour, cocoa and baking powder and fold until just combined.\n"
            "Bake for 35 minutes, then cool before slicing."
        ),
    },
    {
        "title": "Crunchy Rainbow Salad",
        "category": "Lunch",
        "prep_minutes": 15,
        "servings": 3,
        "ingredients": [
            "2 carrots",
            "1 red pepper",
            "1/2 cucumber",
            "1 apple",
            "Juice of 1 lime",
            "2 tablespoons olive oil",
            "A handful of parsley",
        ],
        "instructions": (
            "Julienne the carrots, pepper, cucumber and apple.\n"
            "Whisk the lime juice and olive oil into a dressing.\n"
            "Toss everything together with the chopped parsley and serve straight away."
        ),
    },
]


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        g.db = connection
    return g.db


@app.teardown_appcontext
def close_db(exception: BaseException | None) -> None:
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.executescript(SCHEMA)

    user_count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    recipe_count = connection.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
    if user_count == 0 and recipe_count == 0:
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            ("chef", generate_password_hash(secrets.token_urlsafe(32)), now_iso()),
        )
        chef_id = cursor.lastrowid
        base = datetime.now(timezone.utc).replace(microsecond=0)
        for index, recipe in enumerate(SAMPLE_RECIPES):
            created_at = (base - timedelta(minutes=index * 17)).isoformat().replace(
                "+00:00", "Z"
            )
            connection.execute(
                """
                INSERT INTO recipes
                    (user_id, title, ingredients, instructions, category,
                     prep_minutes, servings, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    chef_id,
                    recipe["title"],
                    json.dumps(recipe["ingredients"]),
                    recipe["instructions"],
                    recipe["category"],
                    recipe["prep_minutes"],
                    recipe["servings"],
                    created_at,
                ),
            )
    connection.commit()
    connection.close()


init_db()


def auth_error(message: str = "Authentication required."):
    return jsonify({"error": message}), 401


def get_current_user() -> sqlite3.Row | None:
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        return None
    return (
        get_db()
        .execute(
            """
            SELECT u.id, u.username
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (parts[1].strip(),),
        )
        .fetchone()
    )


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return auth_error()
        g.user = user
        return view(*args, **kwargs)

    return wrapped


def as_integer(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str):
        text = value.strip()
        if text and text.lstrip("-").isdigit():
            return int(text)
    return None


def validate_recipe(data: Any) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    if not isinstance(data, dict):
        return None, {
            "error": "Request body must be a JSON object.",
            "errors": {},
        }

    errors: dict[str, str] = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be at most 200 characters."
    else:
        title = title.strip()

    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        errors["category"] = "Category is required."
    elif len(category.strip()) > 100:
        errors["category"] = "Category must be at most 100 characters."
    else:
        category = category.strip()

    instructions = data.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        errors["instructions"] = "Instructions are required."
    else:
        instructions = instructions.strip()

    raw_ingredients = data.get("ingredients")
    ingredients: list[str] = []
    if not isinstance(raw_ingredients, list):
        errors["ingredients"] = "Ingredients must be a list."
    elif not raw_ingredients:
        errors["ingredients"] = "At least one ingredient is required."
    else:
        for ingredient in raw_ingredients:
            if not isinstance(ingredient, str) or not ingredient.strip():
                errors["ingredients"] = "Each ingredient must be non-empty text."
                break
            ingredients.append(ingredient.strip())

    prep_minutes = as_integer(data.get("prep_minutes"))
    if prep_minutes is None:
        errors["prep_minutes"] = "Prep time is required and must be a whole number."
    elif prep_minutes < 0:
        errors["prep_minutes"] = "Prep time cannot be negative."

    servings = as_integer(data.get("servings"))
    if servings is None:
        errors["servings"] = "Servings is required and must be a whole number."
    elif servings < 1:
        errors["servings"] = "Servings must be at least 1."

    if errors:
        return None, {"error": "Please fix the highlighted fields.", "errors": errors}

    return (
        {
            "title": title,
            "category": category,
            "instructions": instructions,
            "ingredients": ingredients,
            "prep_minutes": prep_minutes,
            "servings": servings,
        },
        None,
    )


RECIPE_SELECT = """
SELECT r.id, r.title, r.ingredients, r.instructions, r.category,
       r.prep_minutes, r.servings, r.created_at, r.user_id,
       u.username AS author
FROM recipes r
JOIN users u ON u.id = r.user_id
"""


def full_recipe(row: sqlite3.Row) -> dict[str, Any]:
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


def fetch_recipe(recipe_id: int) -> sqlite3.Row | None:
    return get_db().execute(RECIPE_SELECT + " WHERE r.id = ?", (recipe_id,)).fetchone()


def make_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )
    get_db().commit()
    return token


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return (
            jsonify(
                {
                    "error": "Request body must be a JSON object.",
                    "errors": {},
                }
            ),
            400,
        )

    username = data.get("username")
    password = data.get("password")
    errors: dict[str, str] = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif len(username.strip()) > 50:
        errors["username"] = "Username must be at most 50 characters."
    else:
        username = username.strip()
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."

    if errors:
        return (
            jsonify({"error": "Please fix the highlighted fields.", "errors": errors}),
            400,
        )

    db = get_db()
    try:
        cursor = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        return (
            jsonify(
                {
                    "error": "That username is already taken.",
                    "errors": {"username": "That username is already taken."},
                }
            ),
            400,
        )

    token = make_token(cursor.lastrowid)
    return jsonify({"token": token}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return (
            jsonify(
                {
                    "error": "Request body must be a JSON object.",
                    "errors": {},
                }
            ),
            400,
        )

    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify({"error": "Invalid username or password."}), 401

    user = (
        get_db()
        .execute(
            "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
            (username.strip(),),
        )
        .fetchone()
    )
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid username or password."}), 401

    token = make_token(user["id"])
    return jsonify({"token": token})


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"username": g.user["username"]})


@app.get("/api/categories")
def categories():
    rows = get_db().execute(
        "SELECT DISTINCT category FROM recipes ORDER BY category COLLATE NOCASE"
    )
    return jsonify([row["category"] for row in rows])


@app.get("/api/recipes")
def list_recipes():
    page = as_integer(request.args.get("page"))
    page_size = as_integer(request.args.get("page_size"))
    page = page if page is not None and page > 0 else 1
    page_size = page_size if page_size is not None and page_size > 0 else 10
    page_size = min(page_size, 100)

    clauses: list[str] = []
    params: list[Any] = []

    category = request.args.get("category", "").strip()
    if category:
        clauses.append("r.category = ? COLLATE NOCASE")
        params.append(category)

    query = request.args.get("q", "").strip()
    if query:
        clauses.append("LOWER(r.title) LIKE LOWER(?)")
        params.append(f"%{query}%")

    where = " WHERE " + " AND ".join(clauses) if clauses else ""
    db = get_db()
    total = db.execute(
        "SELECT COUNT(*) FROM recipes r" + where, params
    ).fetchone()[0]

    rows = db.execute(
        RECIPE_SELECT
        + where
        + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
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
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    row = fetch_recipe(recipe_id)
    if row is None:
        return jsonify({"error": "Recipe not found."}), 404
    return jsonify(full_recipe(row))


@app.post("/api/recipes")
@login_required
def create_recipe():
    recipe, error = validate_recipe(request.get_json(silent=True))
    if error is not None:
        return jsonify(error), 400

    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO recipes
            (user_id, title, ingredients, instructions, category,
             prep_minutes, servings, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            g.user["id"],
            recipe["title"],
            json.dumps(recipe["ingredients"]),
            recipe["instructions"],
            recipe["category"],
            recipe["prep_minutes"],
            recipe["servings"],
            now_iso(),
        ),
    )
    db.commit()
    return jsonify(full_recipe(fetch_recipe(cursor.lastrowid))), 201


@app.put("/api/recipes/<int:recipe_id>")
@login_required
def update_recipe(recipe_id: int):
    row = fetch_recipe(recipe_id)
    if row is None:
        return jsonify({"error": "Recipe not found."}), 404
    if row["user_id"] != g.user["id"]:
        return jsonify({"error": "You may only edit your own recipes."}), 403

    recipe, error = validate_recipe(request.get_json(silent=True))
    if error is not None:
        return jsonify(error), 400

    db = get_db()
    db.execute(
        """
        UPDATE recipes
        SET title = ?, ingredients = ?, instructions = ?, category = ?,
            prep_minutes = ?, servings = ?
        WHERE id = ?
        """,
        (
            recipe["title"],
            json.dumps(recipe["ingredients"]),
            recipe["instructions"],
            recipe["category"],
            recipe["prep_minutes"],
            recipe["servings"],
            recipe_id,
        ),
    )
    db.commit()
    return jsonify(full_recipe(fetch_recipe(recipe_id)))


@app.delete("/api/recipes/<int:recipe_id>")
@login_required
def delete_recipe(recipe_id: int):
    row = fetch_recipe(recipe_id)
    if row is None:
        return jsonify({"error": "Recipe not found."}), 404
    if row["user_id"] != g.user["id"]:
        return jsonify({"error": "You may only delete your own recipes."}), 403

    db = get_db()
    db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    db.commit()
    return "", 204


@app.errorhandler(404)
def not_found(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found."}), 404
    return send_from_directory(DIST, "index.html")


@app.errorhandler(405)
def method_not_allowed(error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Method not allowed."}), 405
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404
    target = DIST / path
    if target.is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8000")),
        debug=os.environ.get("FLASK_DEBUG") == "1",
    )
