"""Recipe book: JSON API under /api plus the built frontend, data in ./data."""

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "recipes.db"
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    created_at    REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT    NOT NULL,
    ingredients  TEXT    NOT NULL,
    instructions TEXT    NOT NULL,
    category     TEXT    NOT NULL,
    prep_minutes INTEGER NOT NULL,
    servings     INTEGER NOT NULL,
    created_at   REAL    NOT NULL,
    author_id    INTEGER NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC, id DESC);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(DB_PATH, timeout=30)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def now() -> float:
    return datetime.now(timezone.utc).timestamp()


def to_iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds")


# --------------------------------------------------------------------------- #
# Passwords / auth
# --------------------------------------------------------------------------- #

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex),
                                n=2**14, r=8, p=1)
    except ValueError:
        return False
    return secrets.compare_digest(digest.hex(), digest_hex)


def current_user():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t "
        "JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return dict(row) if row else None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if user is None:
            return jsonify(error="A valid Bearer token is required."), 401
        g.user = user
        return fn(*args, **kwargs)
    return wrapper


def issue_token(db, user_id: int) -> str:
    token = secrets.token_hex(32)
    db.execute("INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
               (token, user_id, now()))
    return token


# --------------------------------------------------------------------------- #
# Recipe helpers
# --------------------------------------------------------------------------- #

def parse_recipe(data):
    """Validate a recipe payload. Returns (fields, error_message)."""
    if not isinstance(data, dict):
        return None, "Request body must be a JSON object."

    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        return None, "'title' is required and must be a non-empty string."

    category = data.get("category")
    if not isinstance(category, str) or not category.strip():
        return None, "'category' is required and must be a non-empty string."

    ingredients = data.get("ingredients", [])
    if not isinstance(ingredients, list):
        return None, "'ingredients' must be a list of strings."
    cleaned = []
    for i, item in enumerate(ingredients):
        if not isinstance(item, str) or not item.strip():
            return None, f"Ingredient at position {i + 1} must be a non-empty string."
        cleaned.append(item.strip())

    instructions = data.get("instructions", "")
    if not isinstance(instructions, str) or not instructions.strip():
        return None, "'instructions' is required and must be a non-empty string."

    prep = data.get("prep_minutes", 0)
    if isinstance(prep, bool) or not isinstance(prep, int) or prep < 0:
        return None, "'prep_minutes' must be an integer of 0 or more."

    servings = data.get("servings", 1)
    if isinstance(servings, bool) or not isinstance(servings, int) or servings < 1:
        return None, "'servings' must be an integer of 1 or more."

    return {
        "title": title.strip(),
        "category": category.strip(),
        "ingredients": cleaned,
        "instructions": instructions.strip(),
        "prep_minutes": prep,
        "servings": servings,
    }, None


def full_recipe(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "ingredients": json.loads(row["ingredients"]),
        "instructions": row["instructions"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "servings": row["servings"],
        "created_at": to_iso(row["created_at"]),
        "author": row["author"],
    }


def list_item(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "author": row["author"],
    }


RECIPE_SELECT = (
    "SELECT r.*, u.username AS author FROM recipes r "
    "JOIN users u ON u.id = r.author_id "
)


def get_recipe_or_404():
    row = get_db().execute(RECIPE_SELECT + "WHERE r.id = ?", (request.view_args["id"],)).fetchone()
    if row is None:
        return None, (jsonify(error="Recipe not found."), 404)
    return row, None


# --------------------------------------------------------------------------- #
# Seed data (first start only)
# --------------------------------------------------------------------------- #

SAMPLE_USER = "demo"

SAMPLE_RECIPES = [
    {
        "title": "Fluffy Buttermilk Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "2 cups all-purpose flour",
            "2 tbsp sugar",
            "2 tsp baking powder",
            "1/2 tsp baking soda",
            "1/2 tsp salt",
            "2 cups buttermilk",
            "2 eggs",
            "3 tbsp melted butter",
        ],
        "instructions": (
            "Whisk flour, sugar, baking powder, baking soda and salt together.\n"
            "In another bowl beat the eggs with buttermilk and melted butter.\n"
            "Fold the wet mix into the dry until just combined; a few lumps are fine.\n"
            "Cook spoonfuls on a greased griddle over medium heat until bubbles form, then flip.\n"
            "Serve warm with maple syrup."
        ),
    },
    {
        "title": "Shakshuka with Feta",
        "category": "Breakfast",
        "prep_minutes": 30,
        "servings": 2,
        "ingredients": [
            "1 tbsp olive oil",
            "1 onion, finely chopped",
            "1 red bell pepper, diced",
            "2 garlic cloves, minced",
            "1 tsp smoked paprika",
            "1 can (400 g) crushed tomatoes",
            "4 eggs",
            "80 g feta, crumbled",
            "Salt and black pepper to taste",
        ],
        "instructions": (
            "Soften onion and pepper in olive oil over medium heat, about 8 minutes.\n"
            "Add garlic and paprika and fry until fragrant.\n"
            "Pour in the tomatoes, season and simmer 10 minutes.\n"
            "Make four wells and crack an egg into each. Cover and cook 6-8 minutes.\n"
            "Top with feta and serve with crusty bread."
        ),
    },
    {
        "title": "Spaghetti Carbonara",
        "category": "Dinner",
        "prep_minutes": 25,
        "servings": 4,
        "ingredients": [
            "400 g spaghetti",
            "150 g pancetta, diced",
            "3 egg yolks",
            "1 whole egg",
            "60 g Pecorino Romano, grated",
            "Black pepper, freshly ground",
            "Salt for the pasta water",
        ],
        "instructions": (
            "Boil the spaghetti in well salted water until al dente. Reserve a cup of pasta water.\n"
            "Crisp the pancetta in a large pan over medium heat.\n"
            "Whisk eggs, yolks and Pecorino with plenty of black pepper.\n"
            "Toss the hot drained pasta with the pancetta off the heat.\n"
            "Add the egg mix quickly with splashes of pasta water until glossy. Serve at once."
        ),
    },
    {
        "title": "Thai Green Curry with Chicken",
        "category": "Dinner",
        "prep_minutes": 40,
        "servings": 4,
        "ingredients": [
            "500 g chicken thigh, sliced",
            "3 tbsp green curry paste",
            "400 ml coconut milk",
            "1 bamboo shoot can, drained",
            "1 red chilli, sliced",
            "1 tbsp fish sauce",
            "1 tsp palm sugar",
            "Handful of Thai basil leaves",
            "Steamed jasmine rice, to serve",
        ],
        "instructions": (
            "Fry the curry paste in a spoonful of coconut cream from the can until fragrant.\n"
            "Add the chicken and coat with the paste.\n"
            "Pour in the remaining coconut milk and simmer 15 minutes.\n"
            "Add bamboo shoots, fish sauce and sugar; adjust to a salty-sweet balance.\n"
            "Stir through the basil and serve over jasmine rice."
        ),
    },
    {
        "title": "Chocolate Chip Cookies",
        "category": "Dessert",
        "prep_minutes": 35,
        "servings": 24,
        "ingredients": [
            "225 g butter, softened",
            "200 g light brown sugar",
            "100 g caster sugar",
            "1 egg",
            "1 tsp vanilla extract",
            "300 g plain flour",
            "1 tsp baking soda",
            "1/2 tsp salt",
            "200 g dark chocolate chips",
        ],
        "instructions": (
            "Beat butter with both sugars until pale, then beat in the egg and vanilla.\n"
            "Fold in flour, baking soda and salt, then most of the chocolate chips.\n"
            "Scoop tablespoon-sized balls onto lined trays and chill 15 minutes.\n"
            "Bake at 180 C fan for 10-12 minutes until golden at the edges.\n"
            "Press the remaining chips on top and cool on the tray."
        ),
    },
]


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        # IMMEDIATE serialises seeding across gunicorn workers.
        conn.execute("BEGIN IMMEDIATE")
        count = conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0]
        if count == 0:
            existing = conn.execute(
                "SELECT id FROM users WHERE username = ?", (SAMPLE_USER,)
            ).fetchone()
            if existing:
                user_id = existing[0]
            else:
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (SAMPLE_USER, hash_password(secrets.token_hex(16)), now()),
                )
                user_id = cur.lastrowid
            for r in SAMPLE_RECIPES:
                conn.execute(
                    "INSERT INTO recipes (title, ingredients, instructions, category, "
                    "prep_minutes, servings, created_at, author_id) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        r["title"],
                        json.dumps(r["ingredients"]),
                        r["instructions"],
                        r["category"],
                        r["prep_minutes"],
                        r["servings"],
                        now(),
                        user_id,
                    ),
                )
        conn.commit()
    finally:
        conn.close()


# --------------------------------------------------------------------------- #
# API routes
# --------------------------------------------------------------------------- #

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Request body must be a JSON object."), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not username.strip():
        return jsonify(error="'username' is required and must be a non-empty string."), 400
    if not isinstance(password, str) or not password:
        return jsonify(error="'password' is required and must be a non-empty string."), 400
    username = username.strip()
    db = get_db()
    if db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
        return jsonify(error=f"Username '{username}' is already taken."), 409
    cur = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), now()),
    )
    token = issue_token(db, cur.lastrowid)
    db.commit()
    return jsonify(username=username, token=token), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(error="Request body must be a JSON object."), 400
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str):
        return jsonify(error="'username' and 'password' are required."), 400
    row = get_db().execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(password, row["password_hash"]):
        return jsonify(error="Invalid username or password."), 401
    token = issue_token(get_db(), row["id"])
    get_db().commit()
    return jsonify(token=token), 200


@app.get("/api/auth/me")
@auth_required
def me():
    return jsonify(username=g.user["username"])


@app.post("/api/auth/logout")
@auth_required
def logout():
    header = request.headers.get("Authorization", "")
    token = header[len("Bearer "):].strip()
    db = get_db()
    db.execute("DELETE FROM tokens WHERE token = ?", (token,))
    db.commit()
    return jsonify(message="Signed out."), 200


@app.get("/api/recipes")
def list_recipes():
    db = get_db()
    page_raw = request.args.get("page", "1")
    size_raw = request.args.get("page_size", "10")
    try:
        page = int(page_raw)
        page_size = int(size_raw)
    except ValueError:
        return jsonify(error="'page' and 'page_size' must be integers."), 400
    page = max(1, page)
    page_size = min(max(1, page_size), 100)

    where, params = [], []
    category = request.args.get("category")
    if category:
        where.append("LOWER(r.category) = LOWER(?)")
        params.append(category.strip())
    q = request.args.get("q")
    if q:
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        if escaped:
            where.append("r.title LIKE ? ESCAPE '\\'")
            params.append(f"%{escaped}%")
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    total = db.execute(
        f"SELECT COUNT(*) FROM recipes r {clause}", params
    ).fetchone()[0]
    rows = db.execute(
        RECIPE_SELECT + clause + " ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?",
        params + [page_size, (page - 1) * page_size],
    ).fetchall()
    return jsonify(
        items=[list_item(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@app.get("/api/categories")
def categories():
    rows = get_db().execute(
        "SELECT DISTINCT category FROM recipes ORDER BY category"
    ).fetchall()
    return jsonify(categories=[r["category"] for r in rows])


@app.get("/api/recipes/<int:id>")
def get_recipe(id: int):
    row, err = get_recipe_or_404()
    if row is None:
        return err
    return jsonify(full_recipe(row))


@app.post("/api/recipes")
@auth_required
def create_recipe():
    fields, error = parse_recipe(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400
    db = get_db()
    ts = now()
    cur = db.execute(
        "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes, "
        "servings, created_at, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            fields["title"],
            json.dumps(fields["ingredients"]),
            fields["instructions"],
            fields["category"],
            fields["prep_minutes"],
            fields["servings"],
            ts,
            g.user["id"],
        ),
    )
    db.commit()
    row = db.execute(RECIPE_SELECT + "WHERE r.id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(full_recipe(row)), 201


def _owned_recipe_or_response():
    row, err = get_recipe_or_404()
    if row is None:
        return None, err
    if row["author_id"] != g.user["id"]:
        return None, (jsonify(error="Only the author can modify this recipe."), 403)
    return row, None


@app.put("/api/recipes/<int:id>")
@auth_required
def update_recipe(id: int):
    row, err = _owned_recipe_or_response()
    if row is None:
        return err
    fields, error = parse_recipe(request.get_json(silent=True))
    if error:
        return jsonify(error=error), 400
    db = get_db()
    db.execute(
        "UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, category = ?, "
        "prep_minutes = ?, servings = ? WHERE id = ?",
        (
            fields["title"],
            json.dumps(fields["ingredients"]),
            fields["instructions"],
            fields["category"],
            fields["prep_minutes"],
            fields["servings"],
            id,
        ),
    )
    db.commit()
    updated = db.execute(RECIPE_SELECT + "WHERE r.id = ?", (id,)).fetchone()
    return jsonify(full_recipe(updated))


@app.delete("/api/recipes/<int:id>")
@auth_required
def delete_recipe(id: int):
    row, err = _owned_recipe_or_response()
    if row is None:
        return err
    db = get_db()
    db.execute("DELETE FROM recipes WHERE id = ?", (id,))
    db.commit()
    return "", 204


# --------------------------------------------------------------------------- #
# Frontend serving + JSON error handling
# --------------------------------------------------------------------------- #

@app.errorhandler(HTTPException)
def handle_http_exception(exc):
    if request.path.startswith("/api"):
        return jsonify(error=exc.description or exc.name), exc.code
    return exc


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify(error="Not found."), 404
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
