"""Recipe book: Flask JSON API plus the built frontend."""

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).resolve()
DB_PATH = DATA_DIR / "recipes.db"
TOKEN_TTL = timedelta(days=30)
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 10

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
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
CREATE INDEX IF NOT EXISTS recipes_created ON recipes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS recipes_category ON recipes(category COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

SAMPLES = [
    {
        "title": "Classic Margherita Pizza",
        "category": "Main course",
        "prep_minutes": 30,
        "servings": 2,
        "ingredients": [
            "300 g pizza dough",
            "120 ml tomato passata",
            "200 g fresh mozzarella",
            "A handful of fresh basil leaves",
            "2 tbsp olive oil",
            "Salt",
        ],
        "instructions": "Heat the oven to its highest setting with a baking tray inside.\n"
        "Stretch the dough into a thin round on a sheet of baking paper.\n"
        "Spread the passata, tear over the mozzarella and drizzle with oil.\n"
        "Slide onto the hot tray and bake for 8 to 10 minutes.\n"
        "Top with basil and serve immediately.",
    },
    {
        "title": "Creamy Tomato Soup",
        "category": "Soup",
        "prep_minutes": 35,
        "servings": 4,
        "ingredients": [
            "1 kg ripe tomatoes",
            "1 onion, chopped",
            "2 cloves garlic",
            "500 ml vegetable stock",
            "100 ml cream",
            "1 tbsp butter",
        ],
        "instructions": "Melt the butter and soften the onion and garlic.\n"
        "Add the quartered tomatoes and stock and simmer for 20 minutes.\n"
        "Blend until smooth, stir in the cream and season to taste.",
    },
    {
        "title": "Fluffy Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "200 g plain flour",
            "2 tsp baking powder",
            "1 tbsp sugar",
            "250 ml milk",
            "1 egg",
            "30 g melted butter",
        ],
        "instructions": "Whisk the dry ingredients together.\n"
        "Beat in the milk, egg and butter until just combined.\n\n"
        "Cook ladlefuls in a hot greased pan until bubbles form, flip and cook for another minute.",
    },
    {
        "title": "Chocolate Mug Cake",
        "category": "Dessert",
        "prep_minutes": 5,
        "servings": 1,
        "ingredients": [
            "4 tbsp plain flour",
            "3 tbsp sugar",
            "2 tbsp cocoa powder",
            "3 tbsp milk",
            "2 tbsp vegetable oil",
        ],
        "instructions": "Mix everything in a large mug until smooth.\n"
        "Microwave for 90 seconds and let it cool slightly before eating.",
    },
]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute("BEGIN IMMEDIATE")
        seeded = conn.execute("SELECT 1 FROM meta WHERE key = 'seeded'").fetchone()
        if not seeded:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                (
                    "chef",
                    generate_password_hash(secrets.token_urlsafe(32)),
                    now_iso(),
                ),
            )
            chef_id = cur.lastrowid
            base = datetime.now(timezone.utc)
            for i, s in enumerate(SAMPLES):
                created = (base - timedelta(minutes=len(SAMPLES) - i)).strftime(
                    "%Y-%m-%dT%H:%M:%S.%fZ"
                )
                conn.execute(
                    "INSERT INTO recipes (title, ingredients, instructions, category,"
                    " prep_minutes, servings, created_at, author_id)"
                    " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        s["title"],
                        json.dumps(s["ingredients"]),
                        s["instructions"],
                        s["category"],
                        s["prep_minutes"],
                        s["servings"],
                        created,
                        chef_id,
                    ),
                )
            conn.execute("INSERT INTO meta (key, value) VALUES ('seeded', '1')")
        conn.commit()
    finally:
        conn.close()


def db():
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error(status, message, errors=None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status


@app.errorhandler(HTTPException)
def http_error(exc):
    if request.path.startswith("/api/") or request.path == "/api":
        return error(exc.code or 500, exc.description or exc.name)
    return exc


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


def current_user():
    header = request.headers.get("Authorization", "")
    parts = header.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token:
        return None
    row = db().execute(
        "SELECT u.id, u.username, t.expires_at FROM tokens t JOIN users u ON u.id = t.user_id"
        " WHERE t.token_hash = ?",
        (hash_token(token),),
    ).fetchone()
    if row is None or row["expires_at"] < now_iso():
        return None
    return {"id": row["id"], "username": row["username"]}


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


# ---------- auth ----------


def credentials():
    data = json_body()
    if data is None:
        return None, None, error(400, "Request body must be a JSON object")
    username = data.get("username")
    password = data.get("password")
    return username, password, None


@app.post("/api/auth/register")
def register():
    username, password, err = credentials()
    if err:
        return err
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required"
    else:
        username = username.strip()
        if not 3 <= len(username) <= 32:
            errors["username"] = "Username must be 3 to 32 characters long"
        elif any(c.isspace() or not c.isprintable() for c in username):
            errors["username"] = "Username must not contain whitespace"
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required"
    elif len(password) < 6:
        errors["password"] = "Password must be at least 6 characters long"
    elif len(password) > 200:
        errors["password"] = "Password must be at most 200 characters long"
    if errors:
        return error(400, "Validation failed", errors)
    try:
        db().execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), now_iso()),
        )
        db().commit()
    except sqlite3.IntegrityError:
        return error(409, "Username is already taken", {"username": "Username is already taken"})
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    username, password, err = credentials()
    if err:
        return err
    if not isinstance(username, str) or not isinstance(password, str):
        return error(400, "Username and password are required")
    row = db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?",
        (username.strip(),),
    ).fetchone()
    if row is None or not check_password_hash(row["password_hash"], password):
        return error(401, "Invalid username or password")
    token = secrets.token_urlsafe(32)
    conn = db()
    conn.execute("DELETE FROM tokens WHERE expires_at < ?", (now_iso(),))
    conn.execute(
        "INSERT INTO tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
        (
            hash_token(token),
            row["id"],
            (datetime.now(timezone.utc) + TOKEN_TTL).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
        ),
    )
    conn.commit()
    return jsonify({"token": token, "username": row["username"]})


@app.get("/api/auth/me")
def me():
    user = current_user()
    if user is None:
        return error(401, "Authentication required")
    return jsonify({"username": user["username"]})


# ---------- recipes ----------

RECIPE_COLUMNS = (
    "r.id, r.title, r.ingredients, r.instructions, r.category, r.prep_minutes,"
    " r.servings, r.created_at, r.author_id, u.username AS author"
)


def full_recipe(row):
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


def is_int(value):
    return isinstance(value, int) and not isinstance(value, bool)


def validate_recipe(data):
    errors = {}
    clean = {}

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > 200:
        errors["title"] = "Title must be at most 200 characters long"
    else:
        clean["title"] = title.strip()

    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        errors["category"] = "Category is required"
    elif len(category.strip()) > 60:
        errors["category"] = "Category must be at most 60 characters long"
    else:
        clean["category"] = category.strip()

    instructions = data.get("instructions")
    if not isinstance(instructions, str) or not instructions.strip():
        errors["instructions"] = "Instructions are required"
    elif len(instructions) > 20000:
        errors["instructions"] = "Instructions must be at most 20000 characters long"
    else:
        clean["instructions"] = instructions.strip()

    ingredients = data.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        errors["ingredients"] = "At least one ingredient is required"
    elif len(ingredients) > 200:
        errors["ingredients"] = "At most 200 ingredients are allowed"
    elif not all(isinstance(i, str) and i.strip() for i in ingredients):
        errors["ingredients"] = "Each ingredient must be a non-empty string"
    elif any(len(i.strip()) > 300 for i in ingredients):
        errors["ingredients"] = "Each ingredient must be at most 300 characters long"
    else:
        clean["ingredients"] = [i.strip() for i in ingredients]

    prep = data.get("prep_minutes")
    if not is_int(prep) or prep < 0:
        errors["prep_minutes"] = "Prep time must be a whole number of minutes, 0 or more"
    elif prep > 100000:
        errors["prep_minutes"] = "Prep time is too large"
    else:
        clean["prep_minutes"] = prep

    servings = data.get("servings")
    if not is_int(servings) or servings < 1:
        errors["servings"] = "Servings must be a whole number, 1 or more"
    elif servings > 10000:
        errors["servings"] = "Servings is too large"
    else:
        clean["servings"] = servings

    return clean, errors


def fetch_recipe(recipe_id):
    return db().execute(
        f"SELECT {RECIPE_COLUMNS} FROM recipes r JOIN users u ON u.id = r.author_id"
        " WHERE r.id = ?",
        (recipe_id,),
    ).fetchone()


@app.post("/api/recipes")
def create_recipe():
    user = current_user()
    if user is None:
        return error(401, "Authentication required")
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    clean, errors = validate_recipe(data)
    if errors:
        return error(400, "Validation failed", errors)
    conn = db()
    cur = conn.execute(
        "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes,"
        " servings, created_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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
    conn.commit()
    return jsonify(full_recipe(fetch_recipe(cur.lastrowid))), 201


def positive_int_arg(name, default):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default, None
    try:
        value = int(raw)
    except ValueError:
        return None, f"{name} must be a positive integer"
    if value < 1:
        return None, f"{name} must be a positive integer"
    return value, None


def like_escape(text):
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/recipes")
def list_recipes():
    page, err = positive_int_arg("page", 1)
    if err:
        return error(400, err, {"page": err})
    page_size, err = positive_int_arg("page_size", DEFAULT_PAGE_SIZE)
    if err:
        return error(400, err, {"page_size": err})
    page_size = min(page_size, MAX_PAGE_SIZE)

    where = []
    params = []
    category = request.args.get("category", "").strip()
    if category:
        where.append("r.category = ? COLLATE NOCASE")
        params.append(category)
    q = request.args.get("q", "").strip()
    if q:
        where.append("r.title LIKE ? ESCAPE '\\'")
        params.append(f"%{like_escape(q)}%")
    clause = f" WHERE {' AND '.join(where)}" if where else ""

    conn = db()
    total = conn.execute(f"SELECT COUNT(*) FROM recipes r{clause}", params).fetchone()[0]
    rows = conn.execute(
        "SELECT r.id, r.title, r.category, r.prep_minutes, u.username AS author"
        f" FROM recipes r JOIN users u ON u.id = r.author_id{clause}"
        " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
        [*params, page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        {
            "items": [
                {
                    "id": r["id"],
                    "title": r["title"],
                    "category": r["category"],
                    "prep_minutes": r["prep_minutes"],
                    "author": r["author"],
                }
                for r in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@app.get("/api/categories")
def list_categories():
    rows = db().execute(
        "SELECT MIN(category) AS category FROM recipes GROUP BY category COLLATE NOCASE"
        " ORDER BY category COLLATE NOCASE"
    ).fetchall()
    return jsonify({"items": [r["category"] for r in rows]})


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id):
    row = fetch_recipe(recipe_id)
    if row is None:
        return error(404, "Recipe not found")
    return jsonify(full_recipe(row))


@app.put("/api/recipes/<int:recipe_id>")
def update_recipe(recipe_id):
    user = current_user()
    if user is None:
        return error(401, "Authentication required")
    row = fetch_recipe(recipe_id)
    if row is None:
        return error(404, "Recipe not found")
    if row["author_id"] != user["id"]:
        return error(403, "Only the author may change this recipe")
    data = json_body()
    if data is None:
        return error(400, "Request body must be a JSON object")
    clean, errors = validate_recipe(data)
    if errors:
        return error(400, "Validation failed", errors)
    conn = db()
    conn.execute(
        "UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, category = ?,"
        " prep_minutes = ?, servings = ? WHERE id = ?",
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
    conn.commit()
    return jsonify(full_recipe(fetch_recipe(recipe_id)))


@app.delete("/api/recipes/<int:recipe_id>")
def delete_recipe(recipe_id):
    user = current_user()
    if user is None:
        return error(401, "Authentication required")
    row = fetch_recipe(recipe_id)
    if row is None:
        return error(404, "Recipe not found")
    if row["author_id"] != user["id"]:
        return error(403, "Only the author may delete this recipe")
    conn = db()
    conn.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    conn.commit()
    return "", 204


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path == "api" or path.startswith("api/"):
        return error(404, "Not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
