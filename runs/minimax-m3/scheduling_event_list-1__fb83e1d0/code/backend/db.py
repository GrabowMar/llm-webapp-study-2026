"""SQLite storage helpers for accounts and events."""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
from pathlib import Path

DATA_DIR = Path(os.environ.get("DATA_DIR") or "./data").resolve()
DB_PATH = DATA_DIR / "events.db"
SECRET_PATH = DATA_DIR / "secret.key"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time);
"""


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def connect() -> sqlite3.Connection:
    """Open a connection to the SQLite database."""
    ensure_data_dir()
    conn = sqlite3.connect(DB_PATH, timeout=30.0, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn


def init_db() -> None:
    """Create the tables if they do not exist yet."""
    conn = connect()
    try:
        conn.executescript(SCHEMA)
    finally:
        conn.close()


def get_secret() -> bytes:
    """Return the persistent signing secret used for bearer tokens."""
    ensure_data_dir()
    try:
        fd = os.open(SECRET_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        pass
    else:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(secrets.token_hex(32))
            handle.flush()
            os.fsync(handle.fileno())

    # Another worker may have created the file a moment ago and might still be
    # writing it, so wait until the content is available.
    for _ in range(200):
        value = SECRET_PATH.read_text(encoding="utf-8").strip()
        if value:
            return value.encode("utf-8")
        time.sleep(0.05)
    raise RuntimeError("The token signing secret could not be read.")
