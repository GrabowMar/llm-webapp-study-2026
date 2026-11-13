import hashlib
import json
import os
import re
import secrets
import sqlite3
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, current_app, g, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

SAMPLES = [
    {
        "title": "Lemon & herb roast chicken", "category": "Dinner", "prep_minutes": 60, "servings": 4, "author": "olivia",
        "ingredients": ["1 whole chicken (about 1.5 kg)", "2 lemons, halved", "3 tablespoons olive oil", "4 garlic cloves, crushed", "A handful of fresh rosemary and thyme", "Sea salt and freshly ground black pepper"],
        "instructions": "Preheat the oven to 200°C (400°F). Pat the chicken dry and place in a roasting dish.\n\nMix the olive oil, garlic, salt and pepper. Rub all over the chicken. Tuck the lemon halves and herbs around it.\n\nRoast for 50–60 minutes, until golden and the thickest part reaches 74°C (165°F).\n\nRest for 10 minutes before carving. Spoon the lemony pan juices over the chicken and serve.",
    },
    {
        "title": "Creamy tomato & basil pasta", "category": "Dinner", "prep_minutes": 25, "servings": 2, "author": "marco",
        "ingredients": ["200 g rigatoni", "2 tablespoons olive oil", "2 garlic cloves, finely chopped", "400 g crushed tomatoes", "80 ml cream", "A handful of fresh basil", "30 g grated Parmesan", "Salt and black pepper"],
        "instructions": "Bring a large pot of salted water to a boil. Cook the pasta until al dente, reserving a cup of pasta water.\n\nWarm the olive oil in a pan. Gently cook the garlic for 1 minute, then add the tomatoes and simmer for 10 minutes.\n\nStir in the cream and torn basil. Add the pasta and a splash of pasta water, tossing until glossy.\n\nFinish with Parmesan, fresh basil and black pepper.",
    },
    {
        "title": "Summer peach & burrata salad", "category": "Lunch", "prep_minutes": 15, "servings": 2, "author": "olivia",
        "ingredients": ["2 ripe peaches, sliced", "1 ball of burrata (125 g)", "80 g rocket", "A handful of cherry tomatoes, halved", "2 tablespoons extra virgin olive oil", "1 tablespoon balsamic glaze", "Fresh basil and flaky sea salt"],
        "instructions": "Arrange the rocket on a large serving plate. Scatter over the peaches and tomatoes.\n\nTear the burrata into generous pieces and nestle it among the fruit.\n\nDrizzle with olive oil and balsamic glaze. Finish with basil and flaky sea salt.\n\nServe straight away with crusty bread.",
    },
    {
        "title": "Fluffy blueberry pancakes", "category": "Breakfast", "prep_minutes": 20, "servings": 3, "author": "emma",
        "ingredients": ["180 g plain flour", "2 teaspoons baking powder", "2 tablespoons sugar", "1 egg", "200 ml milk", "2 tablespoons melted butter", "100 g blueberries", "Maple syrup, to serve"],
        "instructions": "Whisk the flour, baking powder and sugar in a bowl. In another bowl, whisk the egg, milk and melted butter.\n\nFold the wet ingredients into the dry ingredients until just combined, then gently stir in the blueberries.\n\nHeat a lightly buttered pan over medium heat. Add small ladles of batter and cook until bubbles form, about 2 minutes.\n\nFlip and cook for another minute. Stack and serve with maple syrup and extra blueberries.",
    },
    {
        "title": "Rustic strawberry galette", "category": "Dessert", "prep_minutes": 45, "servings": 6, "author": "emma",
        "ingredients": ["1 sheet of shortcrust pastry", "400 g strawberries, sliced", "3 tablespoons sugar", "1 tablespoon cornflour", "1 teaspoon vanilla extract", "1 egg, beaten", "Vanilla ice cream, to serve"],
        "instructions": "Preheat the oven to 190°C (375°F). Roll the pastry into a circle on a lined baking tray.\n\nToss the strawberries with sugar, cornflour and vanilla. Pile into the centre, leaving a 5 cm border.\n\nFold the pastry edges over the fruit. Brush the pastry with beaten egg and sprinkle with a little sugar.\n\nBake for 30–35 minutes, until golden and bubbling. Cool slightly and serve with vanilla ice cream.",
    },
]


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(current_app.config["DATABASE"], timeout=30)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL
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
            author_id INTEGER NOT NULL REFERENCES users(id)
        );
        CREATE INDEX IF NOT EXISTS recipes_newest ON recipes(created_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    """)
    with db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM metadata WHERE key = 'seeded'").fetchone():
            return
        for sample in reversed(SAMPLES):
            db.execute("INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)",
                       (sample["author"], generate_password_hash(secrets.token_urlsafe(48))))
            author_id = db.execute("SELECT id FROM users WHERE username = ?", (sample["author"],)).fetchone()["id"]
            insert_recipe(db, sample, author_id)
        db.execute("INSERT INTO metadata VALUES ('seeded', '1')")


def insert_recipe(db, fields, author_id):
    return db.execute(
        """INSERT INTO recipes
        (title, ingredients, instructions, category, prep_minutes, servings, created_at, author_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (fields["title"], json.dumps(fields["ingredients"]), fields["instructions"],
         fields["category"], fields["prep_minutes"], fields["servings"],
         datetime.now(timezone.utc).isoformat(), author_id),
    ).lastrowid


def error(message, status=400, errors=None):
    body = {"error": message}
    if errors:
        body["errors"] = errors
    return body, status


def json_body():
    body = request.get_json(silent=True)
    return body if isinstance(body, dict) else None


def validate_account(body):
    errors = {}
    username = body.get("username")
    password = body.get("password")
    if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{3,30}", username):
        errors["username"] = "Use 3–30 letters, numbers, dots, hyphens or underscores."
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        errors["password"] = "Password must be between 8 and 128 characters."
    return errors


def validate_recipe(body):
    errors = {}
    fields = {}
    for field, limit in (("title", 120), ("category", 60), ("instructions", 20000)):
        value = body.get(field)
        if not isinstance(value, str) or not value.strip() or len(value) > limit:
            errors[field] = f"{field.replace('_', ' ').capitalize()} is required and must be at most {limit} characters."
        else:
            fields[field] = value if field == "instructions" else value.strip()
    ingredients = body.get("ingredients")
    if not isinstance(ingredients, list) or not 1 <= len(ingredients) <= 100:
        errors["ingredients"] = "Add between 1 and 100 ingredients."
    elif any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in ingredients):
        errors["ingredients"] = "Each ingredient must contain 1–500 characters. Remove unused rows."
    else:
        fields["ingredients"] = [item.strip() for item in ingredients]
    for field, minimum, maximum in (("prep_minutes", 0, 1440), ("servings", 1, 100)):
        value = body.get(field)
        if type(value) is not int or not minimum <= value <= maximum:
            errors[field] = f"{field.replace('_', ' ').capitalize()} must be a whole number between {minimum} and {maximum}."
        else:
            fields[field] = value
    return fields, errors


def authenticated(handler):
    @wraps(handler)
    def wrapped(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            return error("Please sign in to continue.", 401)
        g.token_hash = hashlib.sha256(token.encode()).hexdigest()
        g.user = get_db().execute(
            """SELECT users.* FROM tokens JOIN users ON users.id = tokens.user_id
            WHERE token_hash = ? AND expires_at > ?""", (g.token_hash, int(time.time())),
        ).fetchone()
        if g.user is None:
            return error("Your session has expired. Please sign in again.", 401)
        return handler(*args, **kwargs)
    return wrapped


def find_recipe(recipe_id):
    return get_db().execute(
        """SELECT recipes.*, users.username AS author FROM recipes
        JOIN users ON recipes.author_id = users.id WHERE recipes.id = ?""", (recipe_id,),
    ).fetchone()


def serialize_recipe(row, full=True):
    result = {field: row[field] for field in ("id", "title", "category", "prep_minutes", "author")}
    if full:
        result.update(ingredients=json.loads(row["ingredients"]), instructions=row["instructions"],
                      servings=row["servings"], created_at=row["created_at"])
    return result


def create_app(config=None):
    app = Flask(__name__, static_folder=None)
    app.config.update(DATABASE=os.environ.get("RECIPE_DATABASE", str(Path.cwd() / "data" / "recipes.sqlite3")),
                      MAX_CONTENT_LENGTH=1024 * 1024)
    if config:
        app.config.update(config)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)

    @app.teardown_appcontext
    def close_db(exception=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    with app.app_context():
        init_db()

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/auth/register")
    def register():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        errors = validate_account(body)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        try:
            with db:
                db.execute("INSERT INTO users (username, password_hash) VALUES (?, ?)",
                           (body["username"], generate_password_hash(body["password"])))
        except sqlite3.IntegrityError:
            return error("That username is already taken.", 409, {"username": "Choose a different username."})
        return {"username": body["username"]}, 201

    @app.post("/api/auth/login")
    def login():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        if not isinstance(body.get("username"), str) or not isinstance(body.get("password"), str):
            return error("Username and password are required.")
        if len(body["password"]) > 128:
            return error("Invalid username or password.", 401)
        db = get_db()
        user = db.execute("SELECT * FROM users WHERE username = ?", (body["username"],)).fetchone()
        if user is None or not check_password_hash(user["password_hash"], body["password"]):
            return error("Invalid username or password.", 401)
        token = secrets.token_urlsafe(32)
        with db:
            db.execute("DELETE FROM tokens WHERE expires_at <= ?", (int(time.time()),))
            db.execute("INSERT INTO tokens VALUES (?, ?, ?)",
                       (hashlib.sha256(token.encode()).hexdigest(), user["id"], int(time.time()) + 30 * 86400))
        return {"token": token}

    @app.get("/api/auth/me")
    @authenticated
    def me():
        return {"username": g.user["username"]}

    @app.post("/api/auth/logout")
    @authenticated
    def logout():
        db = get_db()
        with db:
            db.execute("DELETE FROM tokens WHERE token_hash = ?", (g.token_hash,))
        return "", 204

    @app.get("/api/categories")
    def categories():
        return {"items": [row[0] for row in get_db().execute("SELECT DISTINCT category FROM recipes ORDER BY category COLLATE NOCASE")]}

    @app.get("/api/recipes")
    def list_recipes():
        paging = {}
        for key, default, maximum in (("page", 1, 1000000), ("page_size", 6, 100)):
            try:
                value = int(request.args.get(key, default))
                if not 1 <= value <= maximum:
                    raise ValueError
                paging[key] = value
            except (ValueError, TypeError):
                return error(f"{key} must be a whole number between 1 and {maximum}.",
                             errors={key: f"Use a number between 1 and {maximum}."})
        conditions = []
        params = []
        category = request.args.get("category", "").strip()
        query = request.args.get("q", "").strip()
        if category:
            conditions.append("recipes.category = ? COLLATE NOCASE")
            params.append(category)
        if query:
            conditions.append("recipes.title LIKE ? ESCAPE '\\'")
            params.append("%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%")
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        db = get_db()
        total = db.execute("SELECT COUNT(*) FROM recipes" + where, params).fetchone()[0]
        rows = db.execute(
            "SELECT recipes.*, users.username AS author FROM recipes JOIN users ON recipes.author_id = users.id"
            + where + " ORDER BY recipes.created_at DESC, recipes.id DESC LIMIT ? OFFSET ?",
            [*params, paging["page_size"], (paging["page"] - 1) * paging["page_size"]],
        ).fetchall()
        return {"items": [serialize_recipe(row, False) for row in rows], "total": total, **paging}

    @app.post("/api/recipes")
    @authenticated
    def add_recipe():
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        fields, errors = validate_recipe(body)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        with db:
            recipe_id = insert_recipe(db, fields, g.user["id"])
        return serialize_recipe(find_recipe(recipe_id)), 201

    @app.get("/api/recipes/<int:recipe_id>")
    def get_recipe(recipe_id):
        recipe = find_recipe(recipe_id)
        if recipe is None:
            return error("Recipe not found.", 404)
        return serialize_recipe(recipe)

    @app.put("/api/recipes/<int:recipe_id>")
    @authenticated
    def update_recipe(recipe_id):
        recipe = find_recipe(recipe_id)
        if recipe is None:
            return error("Recipe not found.", 404)
        if recipe["author_id"] != g.user["id"]:
            return error("Only the author can edit this recipe.", 403)
        body = json_body()
        if body is None:
            return error("Send a JSON object.")
        fields, errors = validate_recipe(body)
        if errors:
            return error("Please check the highlighted fields.", errors=errors)
        db = get_db()
        with db:
            db.execute("""UPDATE recipes SET title = ?, ingredients = ?, instructions = ?,
                       category = ?, prep_minutes = ?, servings = ? WHERE id = ?""",
                       (fields["title"], json.dumps(fields["ingredients"]), fields["instructions"],
                        fields["category"], fields["prep_minutes"], fields["servings"], recipe_id))
        return serialize_recipe(find_recipe(recipe_id))

    @app.delete("/api/recipes/<int:recipe_id>")
    @authenticated
    def delete_recipe(recipe_id):
        recipe = find_recipe(recipe_id)
        if recipe is None:
            return error("Recipe not found.", 404)
        if recipe["author_id"] != g.user["id"]:
            return error("Only the author can delete this recipe.", 403)
        db = get_db()
        with db:
            db.execute("DELETE FROM recipes WHERE id = ?", (recipe_id,))
        return "", 204

    @app.errorhandler(HTTPException)
    def http_error(exception):
        if request.path == "/api" or request.path.startswith("/api/"):
            return error(exception.description, exception.code)
        return exception

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path="index.html"):
        if path == "api" or path.startswith("api/"):
            return error("API endpoint not found.", 404)
        target = (DIST / path).resolve()
        if target.is_relative_to(DIST) and target.is_file():
            return send_from_directory(DIST, path)
        if Path(path).suffix:
            return error("File not found.", 404)
        return send_from_directory(DIST, "index.html")

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
