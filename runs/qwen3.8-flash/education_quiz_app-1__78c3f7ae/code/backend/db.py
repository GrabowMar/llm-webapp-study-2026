"""SQLite access and seeding."""

import hashlib
import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
DB_PATH = DATA_DIR / "quiz.db"
SECRET_PATH = DATA_DIR / "secret.key"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK (correct_option IN ('A','B','C','D')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    score REAL NOT NULL,
    correct INTEGER NOT NULL,
    total_questions INTEGER NOT NULL,
    submitted_at TEXT NOT NULL,
    review TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts (user_id, submitted_at DESC);
"""

SEED_QUESTIONS = [
    ("What is the capital of France?", "Berlin", "Madrid", "Paris", "Rome", "C"),
    ("Which planet is known as the Red Planet?", "Venus", "Mars", "Jupiter", "Saturn", "B"),
    ("How many continents are there on Earth?", "5", "6", "7", "8", "C"),
    ("What is the largest ocean on Earth?", "Atlantic", "Indian", "Arctic", "Pacific", "D"),
    ("Who wrote the play 'Romeo and Juliet'?", "Charles Dickens", "William Shakespeare", "Mark Twain", "Jane Austen", "B"),
    ("What is the chemical symbol for gold?", "Go", "Gd", "Au", "Ag", "C"),
    ("Which country is home to the kangaroo?", "New Zealand", "Australia", "South Africa", "Brazil", "B"),
    ("What is the tallest mountain in the world?", "K2", "Kangchenjunga", "Mount Everest", "Lhotse", "C"),
    ("How many sides does a hexagon have?", "5", "6", "7", "8", "B"),
    ("What is the boiling point of water at sea level in Celsius?", "90", "95", "100", "110", "C"),
    ("Which gas do plants primarily absorb for photosynthesis?", "Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen", "C"),
    ("What is the smallest prime number?", "0", "1", "2", "3", "C"),
    ("In which year did the First World War end?", "1916", "1917", "1918", "1920", "C"),
    ("What is the longest river in Africa?", "Amazon", "Nile", "Mississippi", "Ganges", "B"),
    ("How many players are on a basketball team on the court?", "4", "5", "6", "7", "B"),
    ("What is the currency of Japan?", "Won", "Yuan", "Yen", "Ringgit", "C"),
    ("Which organ in the human body pumps blood?", "Liver", "Heart", "Lungs", "Kidney", "B"),
    ("What is the largest desert in the world?", "Sahara", "Gobi", "Antarctic", "Kalahari", "C"),
    ("How many strings does a standard guitar have?", "4", "5", "6", "7", "C"),
    ("Which element has the atomic number 1?", "Helium", "Oxygen", "Carbon", "Hydrogen", "D"),
    ("What is the capital of Canada?", "Toronto", "Ottawa", "Vancouver", "Montreal", "B"),
    ("Who painted the Mona Lisa?", "Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo", "C"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _read_secret() -> str:
    env = os.environ.get("SECRET_KEY", "").strip()
    if env:
        return env
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if SECRET_PATH.exists():
        stored = SECRET_PATH.read_text().strip()
        if stored:
            return stored
    secret = secrets.token_hex(32)
    SECRET_PATH.write_text(secret)
    return secret


_SECRET = None
_SERIALIZER = None


def _serializer() -> URLSafeTimedSerializer:
    global _SECRET, _SERIALIZER
    if _SERIALIZER is None:
        _SECRET = _read_secret()
        _SERIALIZER = URLSafeTimedSerializer(_SECRET, salt="quiz-auth")
    return _SERIALIZER


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _pbkdf2(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120_000)
    return dk.hex()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    return f"pbkdf2_sha256${salt}${_pbkdf2(password, salt)}"


def verify_password(password: str, stored: str) -> bool:
    parts = stored.split("$")
    if len(parts) != 3 or parts[0] != "pbkdf2_sha256":
        return False
    return secrets.compare_digest(parts[2], _pbkdf2(password, parts[1]))


def _sync_admin(conn: sqlite3.Connection) -> None:
    """The admin account exists only while ADMIN_PASSWORD is set and non-empty."""
    admin_password = os.environ.get("ADMIN_PASSWORD", "").strip()
    row = conn.execute("SELECT password_hash FROM users WHERE username = 'admin'").fetchone()
    if admin_password:
        if row is None:
            with conn:
                conn.execute(
                    "INSERT INTO users (id, username, password_hash, role, created_at)"
                    " VALUES (?, 'admin', ?, 'admin', ?)",
                    (secrets.token_hex(16), hash_password(admin_password), now_iso()),
                )
        elif not verify_password(admin_password, row["password_hash"]):
            with conn:
                conn.execute(
                    "UPDATE users SET password_hash = ?, role = 'admin' WHERE username = 'admin'",
                    (hash_password(admin_password),),
                )
    elif row is not None:
        with conn:
            conn.execute("DELETE FROM users WHERE username = 'admin'")


_initialized = False


def init_db() -> None:
    global _initialized
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) AS c FROM questions").fetchone()["c"] == 0:
            ts = now_iso()
            with conn:
                conn.executemany(
                    "INSERT INTO questions (text, option_a, option_b, option_c, option_d,"
                    " correct_option, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
                    [row + (ts,) for row in SEED_QUESTIONS],
                )
        _sync_admin(conn)
        _initialized = True
    finally:
        conn.close()


def ensure_db() -> None:
    if not _initialized:
        init_db()


def issue_token(user_id: str, password_hash: str) -> str:
    return _serializer().dumps({"uid": user_id, "ph": password_hash[:12]})


def lookup_token(conn: sqlite3.Connection, token: str) -> sqlite3.Row | None:
    try:
        data = _serializer().loads(token, max_age=60 * 60 * 24 * 30)
    except (BadSignature, SignatureExpired):
        return None
    if not isinstance(data, dict) or not data.get("uid"):
        return None
    row = conn.execute("SELECT * FROM users WHERE id = ?", (data["uid"],)).fetchone()
    if row is None or row["password_hash"][:12] != data.get("ph"):
        return None
    return row
