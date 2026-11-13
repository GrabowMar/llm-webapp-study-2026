"""Flask entry point."""

import os
import re
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "app.db"

USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
PASSWORD_MIN = 6
PASSWORD_MAX = 128
DEFAULT_PAGE_SIZE = 12
MAX_PAGE_SIZE = 100

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
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
    instructions TEXT NOT NULL,
    category TEXT NOT NULL,
    prep_minutes INTEGER NOT NULL,
    servings INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS ingredients (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (recipe_id, position)
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

SAMPLE_AUTHOR = "chef"
SAMPLE_RECIPES = [
    {
        "title": "Fluffy Buttermilk Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "200 g plain flour",
            "1 tsp baking powder",
            "1/2 tsp baking soda",
            "1 tbsp sugar",
            "Pinch of salt",
            "300 ml buttermilk",
            "1 egg",
            "2 tbsp melted butter",
        ],
        "instructions": (
            "Whisk the flour, baking powder, baking soda, sugar and salt in a large bowl.\n"
            "In another bowl, beat the buttermilk, egg and melted butter.\n"
            "Pour the wet ingredients into the dry ones and stir until just combined; a few lumps are fine.\n"
            "Heat a lightly greased pan over medium heat and cook 1/4 cup of batter per pancake "
            "until bubbles form, then flip and cook until golden."
        ),
    },
    {
        "title": "Classic Tomato Basil Pasta",
        "category": "Main",
        "prep_minutes": 25,
        "servings": 2,
        "ingredients": [
            "200 g spaghetti",
            "2 tbsp olive oil",
            "2 garlic cloves, sliced",
            "400 g canned chopped tomatoes",
            "Salt and pepper",
            "A handful of fresh basil",
            "Grated parmesan, to serve",
        ],
        "instructions": (
            "Cook the spaghetti in well-salted boiling water until al dente.\n"
            "Meanwhile, warm the olive oil and gently fry the garlic for 1 minute.\n"
            "Add the tomatoes, season and simmer for 10 minutes.\n"
            "Toss the drained pasta with the sauce and torn basil.\n"
            "Serve with parmesan."
        ),
    },
    {
        "title": "Chicken Stir-Fry",
        "category": "Main",
        "prep_minutes": 30,
        "servings": 3,
        "ingredients": [
            "2 chicken breasts, sliced",
            "1 red pepper, sliced",
            "1 broccoli head, in florets",
            "2 tbsp soy sauce",
            "1 tbsp honey",
            "1 tsp grated ginger",
            "1 tbsp vegetable oil",
        ],
        "instructions": (
            "Mix the soy sauce, honey and ginger in a small bowl.\n"
            "Heat the oil in a wok over high heat and brown the chicken.\n"
            "Add the vegetables and stir-fry for 4-5 minutes.\n"
            "Pour in the sauce, toss to coat and serve with rice."
        ),
    },
    {
        "title": "Chocolate Chip Cookies",
        "category": "Dessert",
        "prep_minutes": 35,
        "servings": 24,
        "ingredients": [
            "115 g butter, softened",
            "100 g brown sugar",
            "50 g white sugar",
            "1 egg",
            "1 tsp vanilla extract",
            "180 g plain flour",
            "1/2 tsp baking soda",
            "150 g chocolate chips",
        ],
        "instructions": (
            "Preheat the oven to 180 C and line two trays with baking paper.\n"
            "Cream the butter and sugars, then beat in the egg and vanilla.\n"
            "Stir in the flour and baking soda, then fold in the chocolate chips.\n"
            "Scoop spoonfuls onto the trays and bake for 10-12 minutes.\n"
            "Cool on the tray for 5 minutes before moving to a rack."
        ),
    },
]


class ApiError(Exception):
    def __init__(self, status, message, errors=None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors


def now_iso(dt=None):
    dt = dt or datetime.now(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn


def get_db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        seeded = conn.execute("SELECT value FROM meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            seed(conn)
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.commit()
    finally:
        conn.close()


def seed(conn):
    row = conn.execute("SELECT id FROM users WHERE username = ?", (SAMPLE_AUTHOR,)).fetchone()
    if row:
        user_id = row["id"]
    else:
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (SAMPLE_AUTHOR, generate_password_hash(secrets.token_urlsafe(32)), now_iso()),
        )
        user_id = cur.lastrowid
    base = datetime.now(timezone.utc) - timedelta(hours=len(SAMPLE_RECIPES))
    for i, recipe in enumerate(SAMPLE_RECIPES):
        insert_recipe(conn, user_id, recipe, now_iso(base + timedelta(hours=i)))


def insert_recipe(conn, user_id, data, created_at):
    cur = conn.execute(
        "INSERT INTO recipes (title, instructions, category, prep_minutes, servings, created_at, author_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            data["title"],
            data["instructions"],
            data["category"],
            data["prep_minutes"],
            data["servings"],
            created_at,
            user_id,
        ),
    )
    recipe_id = cur.lastrowid
    write_ingredients(conn, recipe_id, data["ingredients"])
    return recipe_id


def write_ingredients(conn, recipe_id, ingredients):
    conn.execute("DELETE FROM ingredients WHERE recipe_id = ?", (recipe_id,))
    conn.executemany(
        "INSERT INTO ingredients (recipe_id, position, text) VALUES (?, ?, ?)",
        [(recipe_id, i, text) for i, text in enumerate(ingredients)],
    )


# ---------- helpers ----------


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, "Request body must be a JSON object.")
    return data


def current_user():
    if "user" in g:
        return g.user
    g.user = None
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) == 2 and parts[0].lower() == "bearer" and parts[1].strip():
        row = get_db().execute(
            "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
            (parts[1].strip(),),
        ).fetchone()
        if row:
            g.user = {"id": row["id"], "username": row["username"]}
            g.token = parts[1].strip()
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if current_user() is None:
            raise ApiError(401, "Authentication required.")
        return fn(*args, **kwargs)

    return wrapper


def recipe_to_dict(row, ingredients):
    return {
        "id": row["id"],
        "title": row["title"],
        "ingredients": ingredients,
        "instructions": row["instructions"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "servings": row["servings"],
        "created_at": row["created_at"],
        "author": row["author"],
    }


RECIPE_SELECT = (
    "SELECT r.id, r.title, r.instructions, r.category, r.prep_minutes, r.servings,"
    " r.created_at, r.author_id, u.username AS author FROM recipes r JOIN users u ON u.id = r.author_id"
)


def load_recipe(recipe_id):
    db = get_db()
    row = db.execute(RECIPE_SELECT + " WHERE r.id = ?", (recipe_id,)).fetchone()
    if row is None:
        raise ApiError(404, "Recipe not found.")
    return row


def full_recipe(recipe_id):
    row = load_recipe(recipe_id)
    ingredients = [
        r["text"]
        for r in get_db().execute(
            "SELECT text FROM ingredients WHERE recipe_id = ? ORDER BY position", (recipe_id,)
        )
    ]
    return recipe_to_dict(row, ingredients)


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_recipe(data):
    errors = {}
    clean = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required."
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be at most 200 characters."
    else:
        clean["title"] = title.strip()

    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        errors["category"] = "Category is required."
    elif len(category.strip()) > 50:
        errors["category"] = "Category must be at most 50 characters."
    else:
        clean["category"] = category.strip()

    instructions = data.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        errors["instructions"] = "Instructions are required."
    elif len(instructions) > 20000:
        errors["instructions"] = "Instructions must be at most 20000 characters."
    else:
        clean["instructions"] = instructions.replace("\r\n", "\n").replace("\r", "\n").strip("\n")

    ingredients = data.get("ingredients")
    if not isinstance(ingredients, list) or len(ingredients) == 0:
        errors["ingredients"] = "At least one ingredient is required."
    elif len(ingredients) > 100:
        errors["ingredients"] = "A recipe can have at most 100 ingredients."
    else:
        items = []
        for i, item in enumerate(ingredients, start=1):
            if not isinstance(item, str) or not item.strip():
                errors["ingredients"] = f"Ingredient {i} must be a non-empty text."
                break
            if len(item.strip()) > 200:
                errors["ingredients"] = f"Ingredient {i} must be at most 200 characters."
                break
            items.append(item.strip())
        else:
            clean["ingredients"] = items

    prep = data.get("prep_minutes")
    if prep is None:
        errors["prep_minutes"] = "Prep time is required."
    elif not is_int(prep) or prep < 0 or prep > 10000:
        errors["prep_minutes"] = "Prep time must be a whole number of minutes between 0 and 10000."
    else:
        clean["prep_minutes"] = prep

    servings = data.get("servings")
    if servings is None:
        errors["servings"] = "Servings is required."
    elif not is_int(servings) or servings < 1 or servings > 1000:
        errors["servings"] = "Servings must be a whole number between 1 and 1000."
    else:
        clean["servings"] = servings

    if errors:
        raise ApiError(400, "Validation failed.", errors)
    return clean


def parse_positive_int(name, default):
    raw = request.args.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise ApiError(400, f"{name} must be a positive integer.", {name: f"{name} must be a positive integer."})
    if value < 1:
        raise ApiError(400, f"{name} must be a positive integer.", {name: f"{name} must be a positive integer."})
    return value


# ---------- error handling ----------


@app.errorhandler(ApiError)
def handle_api_error(err):
    body = {"error": err.message}
    if err.errors:
        body["errors"] = err.errors
    resp = jsonify(body)
    resp.status_code = err.status
    if err.status == 401:
        resp.headers["WWW-Authenticate"] = "Bearer"
    return resp


@app.errorhandler(HTTPException)
def handle_http_error(err):
    if request.path.startswith("/api"):
        resp = jsonify({"error": err.description or err.name})
        resp.status_code = err.code or 500
        return resp
    return err


@app.errorhandler(Exception)
def handle_unexpected(err):
    app.logger.exception("Unhandled error")
    return jsonify({"error": "Internal server error."}), 500


# ---------- routes ----------


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    elif not USERNAME_RE.match(username.strip()):
        errors["username"] = "Username must be 3-32 characters: letters, digits, '.', '_' or '-'."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    elif len(password) < PASSWORD_MIN:
        errors["password"] = f"Password must be at least {PASSWORD_MIN} characters."
    elif len(password) > PASSWORD_MAX:
        errors["password"] = f"Password must be at most {PASSWORD_MAX} characters."
    if errors:
        raise ApiError(400, "Validation failed.", errors)
    username = username.strip()
    db = get_db()
    try:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        raise ApiError(409, "Username is already taken.", {"username": "Username is already taken."})
    return {"id": cur.lastrowid, "username": username}, 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username or not password:
        raise ApiError(400, "Username and password are required.")
    db = get_db()
    row = db.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        raise ApiError(401, "Invalid username or password.")
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)", (token, row["id"], now_iso())
    )
    db.commit()
    return {"token": token, "username": row["username"]}


@app.post("/api/auth/logout")
@login_required
def logout():
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (g.token,))
    db.commit()
    return "", 204


@app.get("/api/auth/me")
@login_required
def me():
    return {"id": g.user["id"], "username": g.user["username"]}


@app.get("/api/categories")
def categories():
    rows = get_db().execute(
        "SELECT category FROM recipes GROUP BY category COLLATE NOCASE ORDER BY category COLLATE NOCASE"
    ).fetchall()
    return {"items": [r["category"] for r in rows]}


@app.get("/api/recipes")
def list_recipes():
    page = parse_positive_int("page", 1)
    page_size = min(parse_positive_int("page_size", DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    where = []
    params = []
    category = (request.args.get("category") or "").strip()
    if category:
        where.append("r.category = ? COLLATE NOCASE")
        params.append(category)
    q = (request.args.get("q") or "").strip()
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where.append("r.title LIKE ? ESCAPE '\\'")
        params.append(f"%{escaped}%")
    clause = (" WHERE " + " AND ".join(where)) if where else ""
    db = get_db()
    total = db.execute("SELECT COUNT(*) FROM recipes r" + clause, params).fetchone()[0]
    rows = db.execute(
        "SELECT r.id, r.title, r.category, r.prep_minutes, u.username AS author"
        " FROM recipes r JOIN users u ON u.id = r.author_id"
        + clause
        + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "category": r["category"],
            "prep_minutes": r["prep_minutes"],
            "author": r["author"],
        }
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@app.post("/api/recipes")
@login_required
def create_recipe():
    data = validate_recipe(json_body())
    db = get_db()
    recipe_id = insert_recipe(db, g.user["id"], data, now_iso())
    db.commit()
    return full_recipe(recipe_id), 201


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id):
    return full_recipe(recipe_id)


def check_author(recipe_id):
    row = load_recipe(recipe_id)
    if row["author_id"] != g.user["id"]:
        raise ApiError(403, "Only the author can change this recipe.")
    return row


@app.put("/api/recipes/<int:recipe_id>")
@login_required
def update_recipe(recipe_id):
    check_author(recipe_id)
    data = validate_recipe(json_body())
    db = get_db()
    db.execute(
        "UPDATE recipes SET title = ?, instructions = ?, category = ?, prep_minutes = ?, servings = ?"
        " WHERE id = ?",
        (
            data["title"],
            data["instructions"],
            data["category"],
            data["prep_minutes"],
            data["servings"],
            recipe_id,
        ),
    )
    write_ingredients(db, recipe_id, data["ingredients"])
    db.commit()
    return full_recipe(recipe_id)


@app.delete("/api/recipes/<int:recipe_id>")
@login_required
def delete_recipe(recipe_id):
    check_author(recipe_id)
    db = get_db()
    db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    db.commit()
    return "", 204


@app.route("/api", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
@app.route("/api/<path:path>", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
def api_not_found(path=""):
    raise ApiError(404, "Not found.")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").is_file():
        return "Frontend not built.", 404
    return send_from_directory(DIST, "index.html")


init_db()
