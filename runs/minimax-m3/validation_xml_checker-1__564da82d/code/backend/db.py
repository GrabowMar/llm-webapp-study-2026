"""SQLite storage for accounts, bearer tokens and saved checks."""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

from flask import g

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
DB_PATH = Path(os.environ.get("DATABASE_PATH", str(DATA_DIR / "app.db")))

SCHEMA = """
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

CREATE TABLE IF NOT EXISTS validations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    xml_preview TEXT NOT NULL DEFAULT '',
    valid INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    err_line INTEGER,
    err_column INTEGER,
    root_element TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validations_user ON validations(user_id, created_at DESC, id DESC);
"""


def connect() -> sqlite3.Connection:
    """Open a connection to the SQLite database, creating it if needed."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create the schema if it does not exist yet."""
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def get_db() -> sqlite3.Connection:
    """Return the connection bound to the current application context."""
    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc: Optional[BaseException] = None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def serialize_validation(row: sqlite3.Row) -> Dict[str, Any]:
    """Turn a stored row into the public representation of a saved check."""
    return {
        "id": row["id"],
        "xml_preview": row["xml_preview"],
        "valid": bool(row["valid"]),
        "error": row["error"],
        "line": row["err_line"],
        "column": row["err_column"],
        "root_element": row["root_element"],
        "created_at": row["created_at"],
    }


def fetch_validations(
    user_id: int,
    valid_filter: Optional[bool],
    limit: int,
    offset: int,
) -> List[sqlite3.Row]:
    where = "user_id = ?"
    params: List[Any] = [user_id]
    if valid_filter is not None:
        where += " AND valid = ?"
        params.append(1 if valid_filter else 0)
    params.extend([limit, offset])
    return (
        get_db()
        .execute(
            f"SELECT * FROM validations WHERE {where} "
            "ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
            params,
        )
        .fetchall()
    )


def count_validations(user_id: int, valid_filter: Optional[bool]) -> int:
    where = "user_id = ?"
    params: List[Any] = [user_id]
    if valid_filter is not None:
        where += " AND valid = ?"
        params.append(1 if valid_filter else 0)
    row = get_db().execute(f"SELECT COUNT(*) AS total FROM validations WHERE {where}", params).fetchone()
    return int(row["total"])
