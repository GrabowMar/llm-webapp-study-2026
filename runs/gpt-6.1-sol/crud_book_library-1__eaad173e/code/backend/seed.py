import secrets

from werkzeug.security import generate_password_hash

BOOKS = [
    ("The Midnight Library", "Matt Haig", 2020, "9780525559474", [5, 5, 4, 5]),
    ("The Creative Act", "Rick Rubin", 2023, "9780593652886", [5, 4, 5, 4]),
    ("Tomorrow, and Tomorrow, and Tomorrow", "Gabrielle Zevin", 2022, "9780593321201", [5, 5, 5, 4]),
    ("The Psychology of Money", "Morgan Housel", 2020, "9780857197689", [5, 5, 4, 5]),
    ("Normal People", "Sally Rooney", 2018, "9781984822178", [4, 5, 4, 4]),
    ("Atomic Habits", "James Clear", 2018, "9780735211292", [5, 5, 5, 4]),
    ("The Alchemist", "Paulo Coelho", 1988, "9780062315007", [5, 4, 5, 4]),
    ("Braiding Sweetgrass", "Robin Wall Kimmerer", 2013, "9781571313560", [5, 5, 5, 5]),
    ("A Gentleman in Moscow", "Amor Towles", 2016, "9780143110439", [5, 4, 5, 5]),
    ("Piranesi", "Susanna Clarke", 2020, "9781635575637", [5, 5, 4, 5]),
    ("The Little Prince", "Antoine de Saint-Exupéry", 1943, "9780156012195", [5, 5, 5, 4]),
    ("Educated", "Tara Westover", 2018, "9780399590504", [5, 4, 5, 5]),
]


def seed_library(connection):
    connection.execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)")
    connection.execute("BEGIN IMMEDIATE")
    if connection.execute("SELECT 1 FROM metadata WHERE key = 'seeded'").fetchone():
        return
    connection.execute("INSERT INTO metadata (key, value) VALUES ('seeded', '1')")
    if connection.execute("SELECT COUNT(*) FROM books").fetchone()[0]:
        return
    readers = []
    for username in ("emma.reads", "oliver", "jules", "sophie"):
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, generate_password_hash(secrets.token_urlsafe(48))),
        )
        readers.append(cursor.lastrowid)
    comments = [
        "One of those books that stays with you long after the last page. So glad I picked this up.",
        "Thoughtful, beautifully written, and well worth making time for. I'd happily recommend it.",
        "A wonderful reminder of why I love reading. There were so many passages I wanted to underline.",
        "Found this through a friend's recommendation and couldn't put it down. A lovely addition to the shelf.",
    ]
    for index, (title, author, year, isbn, ratings) in enumerate(reversed(BOOKS)):
        cursor = connection.execute(
            "INSERT INTO books (title, author, year, isbn, created_at) VALUES (?, ?, ?, ?, ?)",
            (title, author, year, isbn, f"2026-01-{index + 1:02d}T10:00:00.000Z"),
        )
        for review_index, (reader, rating, comment) in enumerate(zip(readers, ratings, comments)):
            connection.execute(
                "INSERT INTO reviews (book_id, user_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)",
                (cursor.lastrowid, reader, rating, comment, f"2026-02-{review_index + 1:02d}T12:00:00.000Z"),
            )
