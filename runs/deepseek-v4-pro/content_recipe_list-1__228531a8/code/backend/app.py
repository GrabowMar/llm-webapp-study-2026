"""Recipe book Flask application."""

import json
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "recipes.db"

app = Flask(__name__, static_folder=None)

DEFAULT_CATEGORIES = ["Breakfast", "Main", "Dessert", "Soup", "Salad"]


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
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
            prep_minutes INTEGER,
            servings INTEGER,
            created_at TEXT NOT NULL,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    db.commit()
    db.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def seed():
    db = get_db()
    count = db.execute("SELECT COUNT(*) AS c FROM recipes").fetchone()["c"]
    if count:
        return
    author_ids = []
    for username in ["alice", "bob"]:
        cur = db.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (username, generate_password_hash("password"), now_iso()),
        )
        author_ids.append(cur.lastrowid)
    samples = [
        {
            "title": "Fluffy Pancakes",
            "ingredients": ["2 cups flour", "2 eggs", "1 1/2 cups milk", "2 tbsp sugar", "1 tsp baking powder"],
            "instructions": "Whisk the dry ingredients together.\nAdd the eggs and milk and stir until smooth.\nCook on a buttered griddle until golden.",
            "category": "Breakfast",
            "prep_minutes": 25,
            "servings": 4,
            "author_id": author_ids[0],
        },
        {
            "title": "Tomato Basil Soup",
            "ingredients": ["6 ripe tomatoes", "1 onion", "2 cloves garlic", "1 cup vegetable stock", "fresh basil"],
            "instructions": "Saute the onion and garlic until soft.\nAdd tomatoes and stock, then simmer for 20 minutes.\nBlend and finish with basil.",
            "category": "Soup",
            "prep_minutes": 35,
            "servings": 4,
            "author_id": author_ids[1],
        },
        {
            "title": "Classic Caesar Salad",
            "ingredients": ["1 romaine lettuce", "croutons", "parmesan", "caesar dressing"],
            "instructions": "Tear the lettuce into bite-size pieces.\nToss with dressing and top with croutons and parmesan.",
            "category": "Salad",
            "prep_minutes": 15,
            "servings": 2,
            "author_id": author_ids[0],
        },
        {
            "title": "Chocolate Brownies",
            "ingredients": ["200 g dark chocolate", "150 g butter", "3 eggs", "200 g sugar", "100 g flour"],
            "instructions": "Melt the chocolate and butter together.\nBeat in the eggs and sugar, then fold in the flour.\nBake at 180 C for 25 minutes.",
            "category": "Dessert",
            "prep_minutes": 45,
            "servings": 9,
            "author_id": author_ids[1],
        },
    ]
    for r in samples:
        db.execute(
            "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes, servings, created_at, author_id)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                r["title"],
                json.dumps(r["ingredients"]),
                r["instructions"],
                r["category"],
                r["prep_minutes"],
                r["servings"],
                now_iso(),
                r["author_id"],
            ),
        )
    db.commit()


def recipe_to_dict(row, full=True):
    author = get_db().execute(
        "SELECT username FROM users WHERE id = ?", (row["author_id"],)
    ).fetchone()
    data = {
        "id": row["id"],
        "title": row["title"],
        "category": row["category"],
        "prep_minutes": row["prep_minutes"],
        "servings": row["servings"],
        "created_at": row["created_at"],
        "author": author["username"] if author else "unknown",
    }
    if full:
        data["ingredients"] = json.loads(row["ingredients"])
        data["instructions"] = row["instructions"]
    return data


def get_current_user():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    token = auth[len("Bearer "):].strip()
    if not token:
        return None
    row = get_db().execute(
        "SELECT u.id, u.username FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token = ?",
        (token,),
    ).fetchone()
    return row if row else None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = get_current_user()
        if user is None:
            return jsonify({"error": "Authentication required."}), 401
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def error(message, status=400):
    return jsonify({"error": message}), status


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if not username:
        return error("Username is required.")
    if not password:
        return error("Password is required.")
    if len(username) > 64:
        return error("Username must be 64 characters or fewer.")
    db = get_db()
    exists = db.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone()
    if exists:
        return error("Username is already taken.", 409)
    db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return jsonify({"username": username}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return error("Invalid username or password.", 401)
    token = secrets.token_hex(32)
    db.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user["id"], now_iso()),
    )
    db.commit()
    return jsonify({"token": token})


def validate_recipe(data):
    if not isinstance(data, dict):
        return "Invalid JSON body."
    title = (data.get("title") or "").strip()
    ingredients = data.get("ingredients")
    instructions = data.get("instructions")
    category = (data.get("category") or "").strip()
    if not title:
        return "Title is required."
    if not category:
        return "Category is required."
    if not instructions or not str(instructions).strip():
        return "Instructions are required."
    if not isinstance(ingredients, list):
        return "Ingredients must be a list."
    if not all(isinstance(i, str) and i.strip() for i in ingredients):
        return "Each ingredient must be a non-empty string."
    prep_minutes = data.get("prep_minutes")
    if prep_minutes is not None:
        if not isinstance(prep_minutes, int) or isinstance(prep_minutes, bool) or prep_minutes < 0:
            return "prep_minutes must be a non-negative integer."
    servings = data.get("servings")
    if servings is not None:
        if not isinstance(servings, int) or isinstance(servings, bool) or servings < 0:
            return "servings must be a non-negative integer."
    return None


@app.post("/api/recipes")
@auth_required
def create_recipe():
    data = request.get_json(silent=True) or {}
    err = validate_recipe(data)
    if err:
        return error(err)
    db = get_db()
    cur = db.execute(
        "INSERT INTO recipes (title, ingredients, instructions, category, prep_minutes, servings, created_at, author_id)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            data["title"].strip(),
            json.dumps(data.get("ingredients") or []),
            str(data["instructions"]),
            data["category"].strip(),
            data.get("prep_minutes"),
            data.get("servings"),
            now_iso(),
            g.user["id"],
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify(recipe_to_dict(row)), 201


@app.get("/api/recipes")
def list_recipes():
    db = get_db()
    category = (request.args.get("category") or "").strip()
    q = (request.args.get("q") or "").strip()

    try:
        page = max(1, int(request.args.get("page", "1")))
    except ValueError:
        page = 1
    try:
        page_size = int(request.args.get("page_size", "10"))
    except ValueError:
        page_size = 10
    page_size = max(1, min(100, page_size))

    where = []
    params = []
    if category:
        where.append("category = ?")
        params.append(category)
    if q:
        where.append("(title LIKE ? OR instructions LIKE ?)")
        like = f"%{q}%"
        params.extend([like, like])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    total = db.execute(
        f"SELECT COUNT(*) AS c FROM recipes {where_sql}", params
    ).fetchone()["c"]

    offset = (page - 1) * page_size
    rows = db.execute(
        f"SELECT * FROM recipes {where_sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
        params + [page_size, offset],
    ).fetchall()

    items = [
        {
            "id": r["id"],
            "title": r["title"],
            "category": r["category"],
            "prep_minutes": r["prep_minutes"],
            "author": recipe_to_dict(r, full=False)["author"],
        }
        for r in rows
    ]
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.get("/api/categories")
def list_categories():
    db = get_db()
    rows = db.execute(
        "SELECT DISTINCT category FROM recipes ORDER BY category"
    ).fetchall()
    cats = [r["category"] for r in rows]
    for c in DEFAULT_CATEGORIES:
        if c not in cats:
            cats.append(c)
    return jsonify({"categories": sorted(set(cats))})


@app.get("/api/recipes/<int:recipe_id>")
def get_recipe(recipe_id):
    db = get_db()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if row is None:
        return error("Recipe not found.", 404)
    return jsonify(recipe_to_dict(row))


@app.put("/api/recipes/<int:recipe_id>")
@auth_required
def update_recipe(recipe_id):
    db = get_db()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if row is None:
        return error("Recipe not found.", 404)
    if row["author_id"] != g.user["id"]:
        return error("You may only edit your own recipes.", 403)
    data = request.get_json(silent=True) or {}
    err = validate_recipe(data)
    if err:
        return error(err)
    db.execute(
        "UPDATE recipes SET title = ?, ingredients = ?, instructions = ?, category = ?, prep_minutes = ?, servings = ?"
        " WHERE id = ?",
        (
            data["title"].strip(),
            json.dumps(data.get("ingredients") or []),
            str(data["instructions"]),
            data["category"].strip(),
            data.get("prep_minutes"),
            data.get("servings"),
            recipe_id,
        ),
    )
    db.commit()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    return jsonify(recipe_to_dict(row))


@app.delete("/api/recipes/<int:recipe_id>")
@auth_required
def delete_recipe(recipe_id):
    db = get_db()
    row = db.execute("SELECT * FROM recipes WHERE id = ?", (recipe_id,)).fetchone()
    if row is None:
        return error("Recipe not found.", 404)
    if row["author_id"] != g.user["id"]:
        return error("You may only delete your own recipes.", 403)
    db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
    db.commit()
    return "", 204


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_db()
with app.app_context():
    seed()
