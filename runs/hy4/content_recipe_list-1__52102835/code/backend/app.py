"""Recipe book API, backed by SQLite."""

from __future__ import annotations

import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent.parent
DIST = BASE_DIR / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", str(BASE_DIR / "data")))
DB_PATH = DATA_DIR / "recipes.sqlite3"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False


SCHEMA = (
    """CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        instructions TEXT NOT NULL,
        category TEXT NOT NULL,
        prep_minutes INTEGER NOT NULL DEFAULT 0,
        servings INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
    )""",
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC, id DESC)",
    "CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(category)",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


SAMPLE_USERS = ("chef", "baker")

SAMPLE_RECIPES = (
    {
        "author": "chef",
        "title": "Fluffy Buttermilk Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "2 cups all-purpose flour",
            "2 tablespoons sugar",
            "2 teaspoons baking powder",
            "1 teaspoon baking soda",
            "2 cups buttermilk",
            "2 large eggs",
            "3 tablespoons melted butter",
            "Maple syrup, to serve",
        ],
        "instructions": (
            "Whisk the flour, sugar, baking powder and baking soda together in a large bowl.\n"
            "In a second bowl, beat the buttermilk and eggs, then stir in the melted butter.\n"
            "Pour the wet ingredients into the dry ingredients and fold until just combined; a few lumps are fine.\n"
            "Heat a lightly buttered skillet over medium heat and cook scoops of batter for 2-3 minutes per side.\n"
            "Serve warm with maple syrup."
        ),
    },
    {
        "author": "chef",
        "title": "Spaghetti Aglio e Olio",
        "category": "Dinner",
        "prep_minutes": 25,
        "servings": 2,
        "ingredients": [
            "200 g spaghetti",
            "4 cloves garlic, thinly sliced",
            "60 ml extra-virgin olive oil",
            "1 small dried chilli, crumbled",
            "A handful of flat-leaf parsley, chopped",
            "Sea salt and grated pecorino, to finish",
        ],
        "instructions": (
            "Bring a large pot of well-salted water to the boil and cook the spaghetti until al dente.\n"
            "Meanwhile, warm the olive oil with the garlic and chilli over a low heat until the garlic is pale gold.\n"
            "Add a ladle of pasta water to the oil and swirl to emulsify.\n"
            "Toss the drained spaghetti in the pan with the parsley and a little more pasta water.\n"
            "Finish with sea salt and pecorino."
        ),
    },
    {
        "author": "baker",
        "title": "Chocolate Chip Cookies",
        "category": "Dessert",
        "prep_minutes": 35,
        "servings": 24,
        "ingredients": [
            "225 g unsalted butter, softened",
            "150 g light brown sugar",
            "100 g caster sugar",
            "2 large eggs",
            "1 teaspoon vanilla extract",
            "340 g plain flour",
            "1 teaspoon bicarbonate of soda",
            "300 g dark chocolate chips",
        ],
        "instructions": (
            "Preheat the oven to 180 C and line two baking trays with parchment.\n"
            "Cream the butter with both sugars until light and fluffy, then beat in the eggs and vanilla.\n"
            "Fold in the flour and bicarbonate of soda, followed by the chocolate chips.\n"
            "Scoop walnut-sized balls onto the trays, leaving room to spread.\n"
            "Bake for 10-12 minutes until the edges are set but the centres are still soft.\n"
            "Cool on the tray for 5 minutes before transferring to a rack."
        ),
    },
    {
        "author": "baker",
        "title": "Garden Salad with Lemon Dressing",
        "category": "Lunch",
        "prep_minutes": 10,
        "servings": 2,
        "ingredients": [
            "1 little gem lettuce, leaves separated",
            "1 cucumber, sliced",
            "A handful of cherry tomatoes, halved",
            "3 tablespoons olive oil",
            "1 tablespoon lemon juice",
            "1 teaspoon Dijon mustard",
            "Salt and freshly ground black pepper",
        ],
        "instructions": (
            "Whisk the olive oil, lemon juice and Dijon mustard in a small bowl, then season with salt and pepper.\n"
            "Arrange the lettuce, cucumber and tomatoes in a wide serving bowl.\n"
            "Drizzle over the dressing just before serving and toss gently."
        ),
    },
    {
        "author": "chef",
        "title": "Shakshuka",
        "category": "Breakfast",
        "prep_minutes": 30,
        "servings": 4,
        "ingredients": [
            "2 tablespoons olive oil",
            "1 onion, finely chopped",
            "1 red pepper, sliced",
            "3 cloves garlic, crushed",
            "1 teaspoon smoked paprika",
            "1 teaspoon ground cumin",
            "800 g tinned chopped tomatoes",
            "4 large eggs",
            "Feta and fresh coriander, to serve",
        ],
        "instructions": (
            "Soften the onion and pepper in the olive oil over a medium heat for 8-10 minutes.\n"
            "Add the garlic, paprika and cumin and cook for another minute until fragrant.\n"
            "Pour in the tomatoes, season, and simmer for 10 minutes until thickened.\n"
            "Make four wells in the sauce and crack an egg into each one.\n"
            "Cover and cook for 6-8 minutes until the whites are set.\n"
            "Scatter with feta and coriander and serve straight from the pan."
        ),
    },
)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        for statement in SCHEMA:
            conn.execute(statement)
        seeded = conn.execute("SELECT value FROM meta WHERE key = 'seeded'").fetchone()
        count = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        if seeded is None and count == 0:
            base = datetime.now(timezone.utc) - timedelta(days=5)
            user_ids = {}
            for username in SAMPLE_USERS:
                conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (username, generate_password_hash(secrets.token_urlsafe(24)), base.isoformat()),
                )
                user_ids[username] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            for index, recipe in enumerate(SAMPLE_RECIPES):
                created_at = (base + timedelta(hours=index + 1)).isoformat(timespec="seconds").replace(
                    "+00:00", "Z"
                )
                conn.execute(
                    """INSERT INTO recipes
                       (title, ingredients, instructions, category, prep_minutes, servings,
                        created_at, author_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        recipe["title"],
                        json.dumps(recipe["ingredients"]),
                        recipe["instructions"],
                        recipe["category"],
                        recipe["prep_minutes"],
                        recipe["servings"],
                        created_at,
                        user_ids[recipe["author"]],
                    ),
                )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


init_db()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(_exception):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def api_error(message: str, status: int, errors: dict | None = None):
    payload = {"message": message, "error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


@app.errorhandler(HTTPException)
def handle_http_exception(exc: HTTPException):
    if request.path.startswith("/api"):
        return api_error(exc.description or exc.name, exc.code or 500)
    return exc


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


@app.route("/api/<path:_path>", methods=["OPTIONS"])
@app.route("/api/health", methods=["OPTIONS"])
def api_options(_path: str = ""):
    return "", 204


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return get_db().execute(
        """SELECT u.id, u.username FROM tokens t
           JOIN users u ON u.id = t.user_id WHERE t.token = ?""",
        (parts[1],),
    ).fetchone()


def issue_token(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    get_db().execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, _now()),
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
        return api_error("A JSON body with username and password is required.", 400)
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not 3 <= len(username.strip()) <= 50:
        errors["username"] = "Username must be between 3 and 50 characters."
    if not isinstance(password, str) or len(password) < 6:
        errors["password"] = "Password must be at least 6 characters."
    if errors:
        return api_error("Please correct the highlighted fields.", 400, errors)
    username = username.strip()
    if get_db().execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return api_error("That username is already taken.", 409, {"username": "That username is already taken."})
    conn = get_db()
    conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), _now()),
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    return jsonify({"id": user_id, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return api_error("A JSON body with username and password is required.", 400)
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return api_error("Username and password are required.", 400)
    user = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return api_error("Invalid username or password.", 401)
    return {"token": issue_token(user["id"])}


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return api_error("A valid sign-in token is required.", 401)
    return {"id": user["id"], "username": user["username"]}


@app.get("/api/categories")
def categories():
    rows = get_db().execute(
        "SELECT DISTINCT category FROM recipes ORDER BY category COLLATE NOCASE"
    ).fetchall()
    return jsonify([row["category"] for row in rows])


def _clean_int(value, field: str, errors: dict) -> int:
    if isinstance(value, bool):
        errors[field] = f"{field.replace('_', ' ').capitalize()} must be a whole number."
        return 0
    if isinstance(value, int):
        number = value
    elif isinstance(value, float) and value.is_integer():
        number = int(value)
    elif isinstance(value, str) and value.strip().isdigit():
        number = int(value.strip())
    else:
        errors[field] = f"{field.replace('_', ' ').capitalize()} must be a whole number."
        return 0
    if number < 0:
        errors[field] = f"{field.replace('_', ' ').capitalize()} cannot be negative."
        return 0
    return number


def parse_recipe(data):
    """Validate the request body and return (values, errors)."""
    if not isinstance(data, dict):
        return None, {"body": "A JSON object is required."}

    errors: dict = {}
    values: dict = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be 200 characters or fewer."
    else:
        values["title"] = title.strip()

    ingredients = data.get("ingredients", [])
    if isinstance(ingredients, str):
        ingredients = ingredients.splitlines()
    if not isinstance(ingredients, list):
        errors["ingredients"] = "Ingredients must be a list of strings."
    elif any(not isinstance(item, str) for item in ingredients):
        errors["ingredients"] = "Each ingredient must be a string."
    else:
        cleaned = [item.strip() for item in ingredients if item.strip()]
        if not cleaned:
            errors["ingredients"] = "Add at least one ingredient."
        elif len(cleaned) > 200:
            errors["ingredients"] = "Too many ingredients (maximum 200)."
        else:
            values["ingredients"] = cleaned

    instructions = data.get("instructions")
    if isinstance(instructions, list):
        instructions = "\n".join(str(line) for line in instructions)
    if not isinstance(instructions, str) or not instructions.strip():
        errors["instructions"] = "Instructions are required."
    else:
        values["instructions"] = instructions

    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        errors["category"] = "Category is required."
    elif len(category.strip()) > 100:
        errors["category"] = "Category must be 100 characters or fewer."
    else:
        values["category"] = category.strip()

    values["prep_minutes"] = _clean_int(data.get("prep_minutes", 0), "prep_minutes", errors)
    values["servings"] = _clean_int(data.get("servings", 0), "servings", errors)
    return values, errors


RECIPE_SELECT = """SELECT r.id, r.title, r.ingredients, r.instructions, r.category,
                          r.prep_minutes, r.servings, r.created_at, u.username AS author,
                          r.author_id
                   FROM recipes r JOIN users u ON u.id = r.author_id"""


def serialize_recipe(row) -> dict:
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


def serialize_list_item(row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "author": row["author"],
    }


def _positive_int(raw, default: int, maximum: int | None = None) -> int:
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    if value < 1:
        return default
    if maximum is not None:
        value = min(value, maximum)
    return value


@app.get("/api/recipes")
def list_recipes():
    category = request.args.get("category", "").strip()
    q = request.args.get("q", "").strip()
    page = _positive_int(request.args.get("page"), 1, 1_000_000)
    page_size = _positive_int(request.args.get("page_size"), 12, 100_000)

    clauses = []
    params: list = []
    if category:
        clauses.append("r.category = ? COLLATE NOCASE")
        params.append(category)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append("r.title LIKE ? ESCAPE '\\' COLLATE NOCASE")
        params.append(f"%{escaped}%")
    where = " WHERE " + " AND ".join(clauses) if clauses else ""

    conn = get_db()
    total = conn.execute(
        f"SELECT COUNT(*) FROM recipes r{where}", params
    ).fetchone()[0]
    rows = conn.execute(
        f"""SELECT r.id, r.title, r.category, r.prep_minutes, u.username AS author
            FROM recipes r JOIN users u ON u.id = r.author_id{where}
            ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?""",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return {
        "items": [serialize_list_item(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@app.post("/api/recipes")
def create_recipe():
    user = current_user()
    if user is None:
        return api_error("You must be signed in to add a recipe.", 401)
    values, errors = parse_recipe(request.get_json(silent=True))
    if errors:
        return api_error("Please correct the highlighted fields.", 400, errors)
    conn = get_db()
    conn.execute(
        """INSERT INTO recipes
           (title, ingredients, instructions, category, prep_minutes, servings, created_at, author_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            values["title"],
            json.dumps(values["ingredients"]),
            values["instructions"],
            values["category"],
            values["prep_minutes"],
            values["servings"],
            _now(),
            user["id"],
        ),
    )
    recipe_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    row = conn.execute(f"{RECIPE_SELECT} WHERE r.id = ?", (recipe_id,)).fetchone()
    return jsonify(serialize_recipe(row)), 201


def find_recipe(recipe_id: int):
    return get_db().execute(f"{RECIPE_SELECT} WHERE r.id = ?", (recipe_id,)).fetchone()


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id: int):
    row = find_recipe(recipe_id)
    if row is None:
        return api_error("Recipe not found.", 404)
    return jsonify(serialize_recipe(row))


@app.put("/api/recipes/<int:recipe_id>")
def update_recipe(recipe_id: int):
    user = current_user()
    if user is None:
        return api_error("You must be signed in to edit a recipe.", 401)
    row = find_recipe(recipe_id)
    if row is None:
        return api_error("Recipe not found.", 404)
    if row["author_id"] != user["id"]:
        return api_error("Only the author may edit this recipe.", 403)
    values, errors = parse_recipe(request.get_json(silent=True))
    if errors:
        return api_error("Please correct the highlighted fields.", 400, errors)
    conn = get_db()
    conn.execute(
        """UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, category = ?,
                              prep_minutes = ?, servings = ? WHERE id = ?""",
        (
            values["title"],
            json.dumps(values["ingredients"]),
            values["instructions"],
            values["category"],
            values["prep_minutes"],
            values["servings"],
            recipe_id,
        ),
    )
    conn.commit()
    return jsonify(serialize_recipe(find_recipe(recipe_id)))


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id: int):
    user = current_user()
    if user is None:
        return api_error("You must be signed in to delete a recipe.", 401)
    row = find_recipe(recipe_id)
    if row is None:
        return api_error("Recipe not found.", 404)
    if row["author_id"] != user["id"]:
        return api_error("Only the author may delete this recipe.", 403)
    conn = get_db()
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    return jsonify({"message": "Recipe deleted.", "id": recipe_id})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error("Not found.", 404)
    requested = DIST / path
    if path and requested.is_file() and DIST in requested.resolve().parents:
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
