import hashlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.app import create_app


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "library.sqlite3")
        self.config = {"TESTING": True, "DATABASE": self.database, "SEED_DATA": False}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.alice = self.account("alice")
        self.bob = self.account("bob")

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "secret123"})
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/auth/login", json={"username": username, "password": "secret123"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def add_book(self, **fields):
        response = self.client.post("/api/books", json={"title": "A good book", "author": "An author", **fields}, headers=self.alice)
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_health_and_json_errors(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/does-not-exist").status_code, 404)
        self.assertEqual(self.client.post("/api/auth/login", data="not JSON").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register", json=[]).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register", data="{", content_type="application/json").status_code, 400)

    def test_authentication_and_logout(self):
        for endpoint, method in (("/api/books", "post"), ("/api/books/1", "put"), ("/api/books/1", "delete"), ("/api/books/1/reviews", "post")):
            self.assertEqual(getattr(self.client, method)(endpoint, json={}).status_code, 401)
            self.assertEqual(getattr(self.client, method)(endpoint, json={}, headers={"Authorization": "Bearer invalid"}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).json, {"username": "alice"})
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "unknown", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ALICE", "password": "secret123"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).status_code, 401)

    def test_book_crud_and_replace_optional_fields(self):
        book = self.add_book(year=2023, isbn="9781234567890")
        expected = {"id", "title", "author", "year", "isbn", "created_at", "review_count", "average_rating"}
        self.assertEqual(set(book), expected)
        self.assertIsNone(book["average_rating"])
        self.assertEqual(book["review_count"], 0)
        self.assertEqual(self.client.get(f"/api/books/{book['id']}").json, book)
        response = self.client.put(f"/api/books/{book['id']}", json={"title": "Updated", "author": "Another author"}, headers=self.bob)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["title"], "Updated")
        self.assertIsNone(response.json["year"])
        self.assertIsNone(response.json["isbn"])
        self.assertEqual(response.json["created_at"], book["created_at"])
        self.assertEqual(self.client.delete(f"/api/books/{book['id']}", headers=self.bob).status_code, 204)
        self.assertEqual(self.client.get(f"/api/books/{book['id']}").status_code, 404)

    def test_book_validation(self):
        response = self.client.post("/api/books", json={"title": " ", "author": 42, "year": True, "isbn": 123}, headers=self.alice)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json["errors"]), {"title", "author", "year", "isbn"})
        for year in (0, 10000, "2020", 2020.5, False):
            response = self.client.post("/api/books", json={"title": "Title", "author": "Author", "year": year}, headers=self.alice)
            self.assertEqual(response.status_code, 400)
        book = self.add_book()
        response = self.client.put(f"/api/books/{book['id']}", json={"title": "New"}, headers=self.alice)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get(f"/api/books/{book['id']}").json["title"], book["title"])

    def test_search_pagination_and_newest_first(self):
        first = self.add_book(title="First book", author="Someone")
        second = self.add_book(title="Second book", author="Another", isbn="unique-isbn")
        third = self.add_book(title="100%_literal", author="Someone")
        response = self.client.get("/api/books?page=1&page_size=2")
        self.assertEqual([book["id"] for book in response.json["items"]], [third["id"], second["id"]])
        self.assertEqual(response.json["total"], 3)
        self.assertEqual(self.client.get("/api/books?page=2&page_size=2").json["items"][0]["id"], first["id"])
        self.assertEqual(self.client.get("/api/books?q=someone").json["total"], 2)
        self.assertEqual(self.client.get("/api/books?q=SECOND").json["total"], 1)
        self.assertEqual(self.client.get("/api/books?q=unique-isbn").json["total"], 1)
        self.assertEqual(self.client.get("/api/books", query_string={"q": "%_"}).json["total"], 1)
        self.assertEqual(self.client.get("/api/books?q='%20OR%201=1--").json["total"], 0)
        self.assertEqual(self.client.get("/api/books?page=100").json["items"], [])
        for query in ("page=0", "page=-1", "page=abc", "page=1.5", "page_size=0", "page_size=101"):
            self.assertEqual(self.client.get(f"/api/books?{query}").status_code, 400)

    def test_reviews_once_per_user_and_averages(self):
        book = self.add_book()
        endpoint = f"/api/books/{book['id']}/reviews"
        self.assertEqual(self.client.get(endpoint).json, {"items": []})
        response = self.client.post(endpoint, json={"rating": 4, "comment": "A thoughtful read."}, headers=self.alice)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(set(response.json), {"id", "book_id", "rating", "comment", "created_at", "username"})
        self.assertEqual(response.json["username"], "alice")
        self.assertEqual(self.client.post(endpoint, json={"rating": 5}, headers=self.alice).status_code, 409)
        self.assertEqual(self.client.post(endpoint, json={"rating": 5}, headers=self.bob).status_code, 201)
        current = self.client.get(f"/api/books/{book['id']}").json
        self.assertEqual(current["review_count"], 2)
        self.assertEqual(current["average_rating"], 4.5)
        self.assertEqual(self.client.get("/api/books").json["items"][0]["average_rating"], 4.5)
        self.assertEqual([review["username"] for review in self.client.get(endpoint).json["items"]], ["bob", "alice"])
        other = self.add_book(title="Another book")
        self.assertEqual(self.client.post(f"/api/books/{other['id']}/reviews", json={"rating": 3}, headers=self.alice).status_code, 201)

    def test_review_validation_and_missing_books(self):
        book = self.add_book()
        endpoint = f"/api/books/{book['id']}/reviews"
        for rating in (0, 6, "5", True, 4.5, None):
            self.assertEqual(self.client.post(endpoint, json={"rating": rating}, headers=self.alice).status_code, 400)
        for comment in (None, 42, "x" * 5001):
            self.assertEqual(self.client.post(endpoint, json={"rating": 5, "comment": comment}, headers=self.alice).status_code, 400)
        self.assertEqual(self.client.get("/api/books/999/reviews").status_code, 404)
        self.assertEqual(self.client.post("/api/books/999/reviews", json={"rating": 5}, headers=self.alice).status_code, 404)
        self.assertEqual(self.client.put("/api/books/999", json={}, headers=self.alice).status_code, 404)
        self.assertEqual(self.client.delete("/api/books/999", headers=self.alice).status_code, 404)

    def test_delete_cascades_reviews(self):
        book = self.add_book()
        self.client.post(f"/api/books/{book['id']}/reviews", json={"rating": 5}, headers=self.alice)
        self.client.delete(f"/api/books/{book['id']}", headers=self.bob)
        with closing(sqlite3.connect(self.database)) as connection:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM reviews").fetchone()[0], 0)
        self.assertEqual(self.client.get("/api/stats").json, {"books": 0, "reviews": 0})

    def test_persistence_and_hashed_secrets(self):
        book = self.add_book()
        token = self.alice["Authorization"].split()[1]
        with closing(sqlite3.connect(self.database)) as connection:
            password_hash = connection.execute("SELECT password_hash FROM users WHERE username = 'alice'").fetchone()[0]
            self.assertNotEqual(password_hash, "secret123")
            self.assertEqual(connection.execute("SELECT token_hash FROM sessions WHERE user_id = 1").fetchone()[0], hashlib.sha256(token.encode()).hexdigest())
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/books/{book['id']}").json, book)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.alice).json, {"username": "alice"})

    def test_seed_is_once_only(self):
        config = {**self.config, "SEED_DATA": True}
        seeded = create_app(config).test_client()
        self.assertEqual(seeded.get("/api/books").json["total"], 12)
        self.assertEqual(seeded.get("/api/stats").json["reviews"], 48)
        self.assertEqual(create_app(config).test_client().get("/api/books").json["total"], 12)
        for book in seeded.get("/api/books?page_size=100").json["items"]:
            seeded.delete(f"/api/books/{book['id']}", headers=self.alice)
        self.assertEqual(create_app(config).test_client().get("/api/books").json["total"], 0)


if __name__ == "__main__":
    unittest.main()
