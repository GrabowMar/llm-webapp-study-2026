"""SQLite storage layer for the leaderboard app.

The database lives in ``./data`` next to the application root so that the
data survives a restart of the container.
"""

import os
import sqlite3
from pathlib import Path

from flask import g

BACKEND_DIR = Path(__file__).resolve().parent
APP_ROOT = BACKEND_DIR.parent
DATA_DIR = Path(os.environ.get("DATA_DIR") or APP_ROOT / "data")
DB_PATH = DATA_DIR / "leaderboard.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT    NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS scores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score      INTEGER NOT NULL,
    achieved_at TEXT   NOT NULL,
    is_hidden  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id);
CREATE INDEX IF NOT EXISTS idx_scores_achieved ON scores(achieved_at);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
"""


def connect() -> sqlite3.Connection:
    """Open a new connection with the pragmas the app relies on."""

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def get_db() -> sqlite3.Connection:
    """Return the connection bound to the current request."""

    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc: object = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    """Create the schema if it does not exist yet."""

    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()
