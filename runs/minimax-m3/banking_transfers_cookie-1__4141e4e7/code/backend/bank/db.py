"""SQLite storage: connection handling, schema and small helpers."""

from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from flask import current_app, g

DATA_DIR = Path(os.environ.get("BANK_DATA_DIR", "./data"))
DB_PATH = DATA_DIR / "bank.sqlite3"

# Balances and amounts are stored as integer cents to avoid float rounding.
INITIAL_BALANCE_CENTS = 100_000

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 100000,
    created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT    PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_token TEXT    NOT NULL,
    created_at TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS transfers (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id  INTEGER NOT NULL REFERENCES users(id),
    to_user_id    INTEGER NOT NULL REFERENCES users(id),
    amount_cents  INTEGER NOT NULL,
    memo          TEXT,
    created_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_transfers_to   ON transfers(to_user_id, id DESC);
"""


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string (sorts lexicographically)."""
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    """Open a tuned connection to the SQLite database."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, isolation_level=None, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def get_db() -> sqlite3.Connection:
    """Connection bound to the current request/app context."""
    db = getattr(g, "_bank_db", None)
    if db is None:
        db = connect()
        g._bank_db = db
    return db


def close_db(_exc: BaseException | None = None) -> None:
    db = getattr(g, "_bank_db", None)
    if db is not None:
        db.close()
        g._bank_db = None


@contextmanager
def transaction(db: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Run a write transaction; the write lock is taken up front."""
    db.execute("BEGIN IMMEDIATE")
    try:
        yield db
    except BaseException:
        db.execute("ROLLBACK")
        raise
    db.execute("COMMIT")


def init_db() -> None:
    """Create the schema if it does not exist yet."""
    db = connect()
    try:
        db.executescript(SCHEMA)
    finally:
        db.close()


def cents_to_amount(cents: int) -> float:
    """Convert integer cents to a JSON-friendly amount."""
    return round(cents / 100, 2)


def get_app_data_dir() -> Path:
    """Directory holding the persistent data (exposed for diagnostics)."""
    return Path(current_app.config.get("BANK_DATA_DIR", DATA_DIR))
