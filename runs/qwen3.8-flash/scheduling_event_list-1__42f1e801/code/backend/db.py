"""SQLite storage for users and events."""

import os
import sqlite3
import threading
from pathlib import Path

_INIT_LOCK = threading.Lock()
_initialized_paths: set[str] = set()


def _resolve_db_path() -> Path:
    env = os.environ.get("EVENTCAL_DB")
    if env:
        return Path(env)
    return Path.cwd() / "data" / "eventcal.db"


def get_connection() -> sqlite3.Connection:
    path = _resolve_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    if str(path) not in _initialized_paths:
        with _INIT_LOCK:
            if str(path) not in _initialized_paths:
                _create_schema(conn)
                _initialized_paths.add(str(path))
    return conn


def _create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
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
        """
    )
    conn.commit()
