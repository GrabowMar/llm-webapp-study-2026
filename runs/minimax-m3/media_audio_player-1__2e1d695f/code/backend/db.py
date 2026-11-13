"""SQLite storage for the audio library.

The database lives under ``./data`` (relative to the process working
directory) so that it survives restarts.  Every request gets its own
connection; writes are committed immediately.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR", "data")).expanduser()
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "app.db")))

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL,
    artist           TEXT NOT NULL DEFAULT '',
    url              TEXT NOT NULL,
    duration         TEXT,
    duration_seconds REAL,
    play_count       INTEGER NOT NULL DEFAULT 0,
    created_at       TEXT NOT NULL,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);
"""


def utc_now() -> str:
    """Current time as an ISO-8601 UTC string (sortable as text)."""

    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def connect() -> sqlite3.Connection:
    """Open a new connection with sensible durability settings."""

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=15.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db() -> None:
    """Create the schema if it does not exist yet."""

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()
