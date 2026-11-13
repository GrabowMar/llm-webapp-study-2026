"""SQLite access: connection handling, schema and sample data."""

from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from werkzeug.security import generate_password_hash

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "recipes.db"

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
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT NOT NULL,
    category TEXT NOT NULL,
    prep_minutes INTEGER,
    servings INTEGER,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recipes_created ON recipes(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_recipes_author ON recipes(author_id);
"""

SEED_USER = {"username": "chef_claire", "password": "cookbook123"}

SEED_RECIPES = [
    {
        "title": "Fluffy Buttermilk Pancakes",
        "category": "Breakfast",
        "prep_minutes": 20,
        "servings": 4,
        "ingredients": [
            "2 cups all-purpose flour",
            "2 tbsp sugar",
            "2 tsp baking powder",
            "1 tsp baking soda",
            "1/2 tsp salt",
            "2 cups buttermilk",
            "2 large eggs",
            "3 tbsp melted butter",
        ],
        "instructions": (
            "Whisk the flour, sugar, baking powder, baking soda and salt in a large bowl.\n"
            "In a second bowl whisk the buttermilk, eggs and melted butter.\n"
            "Fold the wet mixture into the dry mixture until just combined; lumps are fine.\n"
            "Heat a lightly buttered skillet over medium heat.\n"
            "Pour 1/3 cup of batter per pancake and cook until bubbles form, about 2 minutes.\n"
            "Flip and cook for another 1 to 2 minutes until golden.\n"
            "Serve warm with maple syrup and butter."
        ),
    },
    {
        "title": "Garlic Butter Pasta",
        "category": "Main Course",
        "prep_minutes": 25,
        "servings": 2,
        "ingredients": [
            "200 g spaghetti",
            "3 tbsp butter",
            "4 cloves garlic, minced",
            "1/4 tsp red pepper flakes",
            "1/2 cup grated parmesan",
            "2 tbsp chopped parsley",
            "Salt and black pepper to taste",
        ],
        "instructions": (
            "Cook the spaghetti in well-salted boiling water until al dente.\n"
            "Reserve a cup of the cooking water, then drain the pasta.\n"
            "Melt the butter in a wide pan over medium heat and soften the garlic for 1 minute.\n"
            "Add the red pepper flakes, then the pasta and a splash of the reserved water.\n"
            "Toss in the parmesan until the sauce clings to the strands.\n"
            "Season with salt and pepper, finish with parsley and serve immediately."
        ),
    },
    {
        "title": "Classic Tomato Basil Soup",
        "category": "Soup",
        "prep_minutes": 35,
        "servings": 4,
        "ingredients": [
            "2 tbsp olive oil",
            "1 onion, chopped",
            "3 cloves garlic, minced",
            "2 cans (800 g) whole peeled tomatoes",
            "1 cup vegetable stock",
            "1 tsp sugar",
            "1/2 cup fresh basil leaves",
            "Salt and black pepper to taste",
        ],
        "instructions": (
            "Warm the olive oil in a pot and sweat the onion for 5 minutes.\n"
            "Stir in the garlic and cook for 30 seconds.\n"
            "Add the tomatoes with their juices, the stock and the sugar.\n"
            "Simmer gently for 20 minutes, stirring now and then.\n"
            "Blend until smooth with an immersion blender.\n"
            "Tear in the basil, season with salt and pepper, then simmer for 2 more minutes."
        ),
    },
    {
        "title": "Brown Butter Chocolate Chip Cookies",
        "category": "Dessert",
        "prep_minutes": 45,
        "servings": 18,
        "ingredients": [
            "170 g butter",
            "200 g brown sugar",
            "100 g white sugar",
            "2 large eggs",
            "2 tsp vanilla extract",
            "280 g all-purpose flour",
            "1 tsp baking soda",
            "1/2 tsp salt",
            "200 g dark chocolate chips",
        ],
        "instructions": (
            "Brown the butter in a saucepan until it smells nutty, then cool for 10 minutes.\n"
            "Whisk the butter with both sugars until glossy.\n"
            "Beat in the eggs and vanilla.\n"
            "Fold in the flour, baking soda and salt, then the chocolate chips.\n"
            "Chill the dough for 30 minutes.\n"
            "Scoop onto a lined tray and bake at 180 C for 11 to 13 minutes.\n"
            "Let them set on the tray for 5 minutes before moving to a rack."
        ),
    },
]


def utcnow() -> str:
    """Current UTC time as an ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def get_db():
    """Open a short-lived database connection and commit on success."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """Create the schema and, on a fresh database, insert the sample data."""
    with get_db() as conn:
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA journal_mode = WAL")
        user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count:
            return
        cursor = conn.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (
                SEED_USER["username"],
                generate_password_hash(SEED_USER["password"]),
                utcnow(),
            ),
        )
        author_id = cursor.lastrowid
        for recipe in SEED_RECIPES:
            conn.execute(
                """INSERT INTO recipes
                   (title, ingredients, instructions, category, prep_minutes,
                    servings, author_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    recipe["title"],
                    json.dumps(recipe["ingredients"]),
                    recipe["instructions"],
                    recipe["category"],
                    recipe["prep_minutes"],
                    recipe["servings"],
                    author_id,
                    utcnow(),
                ),
            )
