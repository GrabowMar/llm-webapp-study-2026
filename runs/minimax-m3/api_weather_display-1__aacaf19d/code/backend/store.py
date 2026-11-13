"""SQLite storage for weather reports, city lookups and accounts."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPORT_FIELDS = ("id", "city", "country", "temperature_c", "condition", "humidity", "wind_kph", "observed_at")
LOOKUP_FIELDS = ("id", "city", "found", "looked_up_at")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL COLLATE NOCASE UNIQUE,
    country TEXT,
    temperature_c REAL,
    condition TEXT,
    humidity REAL,
    wind_kph REAL,
    observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lookups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    city TEXT NOT NULL,
    found INTEGER NOT NULL DEFAULT 0,
    looked_up_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_city ON reports(city COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_lookups_looked_up_at ON lookups(looked_up_at DESC, id DESC);
"""

SAMPLE_REPORTS = (
    ("Barcelona", "Spain", 24.5, "Sunny", 55, 11.0),
    ("Berlin", "Germany", 18.2, "Cloudy", 72, 15.5),
    ("Cairo", "Egypt", 33.8, "Clear", 24, 8.0),
    ("Dublin", "Ireland", 12.4, "Light Rain", 84, 26.0),
    ("Kyoto", "Japan", 21.0, "Partly Cloudy", 63, 9.5),
    ("Lima", "Peru", 19.6, "Overcast", 78, 13.0),
)


def now_iso() -> str:
    return _to_iso(datetime.now(timezone.utc))


def _to_iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def next_observed_at(previous: str | None) -> str:
    """Server clock, never going backwards relative to the previous value."""
    now = datetime.now(timezone.utc)
    previous_moment = parse_iso(previous)
    if previous_moment is not None and previous_moment >= now:
        now = previous_moment + timedelta(milliseconds=1)
    return _to_iso(now)


def database_path() -> Path:
    configured = os.environ.get("DATABASE_PATH")
    if configured:
        return Path(configured)
    data_dir = Path(os.environ.get("DATA_DIR", "data"))
    return data_dir / "weather.db"


def connect(path: Path | None = None) -> sqlite3.Connection:
    target = path or database_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target, timeout=15, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=15000")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    seed_sample_reports(conn)


def seed_sample_reports(conn: sqlite3.Connection) -> None:
    row = conn.execute("SELECT value FROM meta WHERE key = 'seeded'").fetchone()
    if row is not None:
        return
    stamp = now_iso()
    for city, country, temperature_c, condition, humidity, wind_kph in SAMPLE_REPORTS:
        conn.execute(
            """INSERT OR IGNORE INTO reports
               (city, country, temperature_c, condition, humidity, wind_kph, observed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (city, country, temperature_c, condition, humidity, wind_kph, stamp),
        )
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', ?)", (stamp,))


def report_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "country": row["country"],
        "temperature_c": row["temperature_c"],
        "condition": row["condition"],
        "humidity": row["humidity"],
        "wind_kph": row["wind_kph"],
        "observed_at": row["observed_at"],
    }


def lookup_to_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "city": row["city"],
        "found": bool(row["found"]),
        "looked_up_at": row["looked_up_at"],
    }


def list_reports(
    conn: sqlite3.Connection,
    city: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[dict], int]:
    where = ""
    params: list = []
    if city:
        where = " WHERE city = ? COLLATE NOCASE"
        params.append(city)
    total = conn.execute(f"SELECT COUNT(*) AS count FROM reports{where}", params).fetchone()["count"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT * FROM reports{where} ORDER BY city COLLATE NOCASE ASC, id ASC LIMIT ? OFFSET ?",
        [*params, page_size, offset],
    ).fetchall()
    return [report_to_dict(row) for row in rows], total


def get_report(conn: sqlite3.Connection, report_id: int) -> dict | None:
    row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    return report_to_dict(row) if row else None


def find_report_by_city(conn: sqlite3.Connection, city: str) -> dict | None:
    row = conn.execute("SELECT * FROM reports WHERE city = ? COLLATE NOCASE", (city,)).fetchone()
    return report_to_dict(row) if row else None


def create_report(conn: sqlite3.Connection, data: dict, observed_at: str | None = None) -> dict:
    cursor = conn.execute(
        """INSERT INTO reports (city, country, temperature_c, condition, humidity, wind_kph, observed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            data["city"],
            data.get("country"),
            data.get("temperature_c"),
            data.get("condition"),
            data.get("humidity"),
            data.get("wind_kph"),
            observed_at or now_iso(),
        ),
    )
    return get_report(conn, cursor.lastrowid)  # type: ignore[return-value]


def replace_report(conn: sqlite3.Connection, report_id: int, data: dict, observed_at: str) -> dict | None:
    conn.execute(
        """UPDATE reports
           SET city = ?, country = ?, temperature_c = ?, condition = ?, humidity = ?, wind_kph = ?, observed_at = ?
           WHERE id = ?""",
        (
            data["city"],
            data.get("country"),
            data.get("temperature_c"),
            data.get("condition"),
            data.get("humidity"),
            data.get("wind_kph"),
            observed_at,
            report_id,
        ),
    )
    return get_report(conn, report_id)


def delete_report(conn: sqlite3.Connection, report_id: int) -> bool:
    cursor = conn.execute("DELETE FROM reports WHERE id = ?", (report_id,))
    return cursor.rowcount > 0


def record_lookup(conn: sqlite3.Connection, city: str, found: bool) -> dict:
    stamp = now_iso()
    cursor = conn.execute(
        "INSERT INTO lookups (city, found, looked_up_at) VALUES (?, ?, ?)",
        (city, 1 if found else 0, stamp),
    )
    row = conn.execute("SELECT * FROM lookups WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return lookup_to_dict(row)


def recent_lookups(conn: sqlite3.Connection, limit: int = 10) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM lookups ORDER BY looked_up_at DESC, id DESC LIMIT ?", (limit,)
    ).fetchall()
    return [lookup_to_dict(row) for row in rows]


def create_user(conn: sqlite3.Connection, username: str, password_hash: str) -> dict:
    stamp = now_iso()
    cursor = conn.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, password_hash, stamp),
    )
    row = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"id": row["id"], "username": row["username"], "created_at": row["created_at"]}


def find_user_by_username(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()


def create_token(conn: sqlite3.Connection, user_id: int, token: str) -> None:
    conn.execute(
        "INSERT INTO tokens (token, user_id, created_at) VALUES (?, ?, ?)",
        (token, user_id, now_iso()),
    )


def find_user_by_token(conn: sqlite3.Connection, token: str) -> dict | None:
    row = conn.execute(
        """SELECT users.id AS id, users.username AS username
           FROM tokens JOIN users ON users.id = tokens.user_id
           WHERE tokens.token = ?""",
        (token,),
    ).fetchone()
    if row is None:
        return None
    return {"id": row["id"], "username": row["username"]}


def delete_token(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
