import tempfile
import unittest
from pathlib import Path

from app import create_app


class NotesApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "notes.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()
        self.alice = self.account("alice")
        self.bob = self.account("bob")

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "secure-password"})
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/auth/login", json={"username": username, "password": "secure-password"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def note(self, **fields):
        data = {"title": "A thought", "content": "First line\n<script>alert('plain text')</script>", "tags": ["Ideas"]}
        data.update(fields)
        response = self.client.post("/api/notes", json=data, headers=self.alice)
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_health_and_unknown_api(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        response = self.client.get("/api/missing")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response.is_json)

    def test_accounts_and_tokens(self):
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).json, {"username": "alice"})
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "incorrect"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ALICE", "password": "secure-password"}).status_code, 409)
        response = self.client.post("/api/auth/register", json={"username": "!", "password": "short"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json["errors"]), {"username", "password"})
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).status_code, 401)

    def test_public_reads_and_author_only_writes(self):
        note = self.note()
        url = f"/api/notes/{note['id']}"
        self.assertEqual(self.client.get(url).json, note)
        self.assertEqual(note["author"], "alice")
        self.assertEqual(self.client.get("/api/notes").json["total"], 1)
        for method in (self.client.patch, self.client.delete):
            self.assertEqual(method(url).status_code, 401)
            self.assertEqual(method(url, headers={"Authorization": "Bearer fake"}).status_code, 401)
            self.assertEqual(method(url, headers=self.bob).status_code, 403)
        self.assertEqual(self.client.post("/api/notes", json={}).status_code, 401)
        self.assertEqual(self.client.delete(url, headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get("/api/tags").json, {"items": []})

    def test_partial_update_and_tag_counts(self):
        note = self.note(tags=[" Ideas ", "ideas", "work"])
        self.assertEqual(note["tags"], ["ideas", "work"])
        self.note(title="Another note", tags=["ideas"])
        self.assertEqual(self.client.get("/api/tags").json["items"], [{"tag": "ideas", "count": 2}, {"tag": "work", "count": 1}])
        url = f"/api/notes/{note['id']}"
        changed = self.client.patch(url, json={"pinned": True}, headers=self.alice).json
        self.assertTrue(changed["pinned"])
        self.assertEqual(changed["title"], note["title"])
        self.assertEqual(changed["content"], note["content"])
        self.assertEqual(changed["tags"], note["tags"])
        self.assertEqual(changed["created_at"], note["created_at"])
        self.assertGreater(changed["updated_at"], note["updated_at"])
        changed = self.client.patch(url, json={"tags": []}, headers=self.alice).json
        self.assertEqual(changed["tags"], [])
        self.assertEqual(self.client.get("/api/tags").json["items"], [{"tag": "ideas", "count": 1}])
        unchanged = self.client.patch(url, json={}, headers=self.alice).json
        self.assertGreater(unchanged["updated_at"], changed["updated_at"])

    def test_sorting_filtering_and_pagination(self):
        first = self.note(title="Pinned old", pinned=True, tags=["work"])
        self.note(title="Second", content="searchable phrase", tags=["work", "ideas"])
        third = self.note(title="Third", tags=["ideas"])
        response = self.client.get("/api/notes?page_size=2").json
        self.assertEqual(response["total"], 3)
        self.assertEqual([item["id"] for item in response["items"]], [first["id"], third["id"]])
        self.assertEqual(response["page"], 1)
        self.assertEqual(response["page_size"], 2)
        self.assertEqual(len(self.client.get("/api/notes?page_size=2&page=2").json["items"]), 1)
        self.assertEqual(self.client.get("/api/notes?tag=work&author=alice&q=phrase").json["total"], 1)
        self.assertEqual(self.client.get("/api/notes?author=bob").json["total"], 0)
        self.assertEqual(self.client.get("/api/notes?q=%25").json["total"], 0)
        self.assertEqual(self.client.get("/api/notes?page=9").json["items"], [])
        for query in ("page=0", "page=-1", "page=abc", "page_size=101", "page_size=0", "page=9999999999999999999"):
            self.assertEqual(self.client.get("/api/notes?" + query).status_code, 400)

    def test_validation_is_atomic(self):
        note = self.note()
        url = f"/api/notes/{note['id']}"
        for body in ({"title": " "}, {"title": "x" * 201}, {"content": None}, {"tags": "ideas"}, {"tags": [""]}, {"tags": [1]}, {"pinned": 1}, {"author": "bob"}):
            response = self.client.patch(url, json=body, headers=self.alice)
            self.assertEqual(response.status_code, 400)
            self.assertIn("errors", response.json)
            self.assertEqual(self.client.get(url).json, note)
        self.assertEqual(self.client.post("/api/notes", json=[], headers=self.alice).status_code, 400)
        self.assertEqual(self.client.post("/api/notes", data="not-json", headers=self.alice).status_code, 400)
        self.assertEqual(self.client.patch("/api/notes/9999", json={}, headers=self.alice).status_code, 404)

    def test_persistence(self):
        note = self.note()
        restarted = create_app({"TESTING": True, "DATABASE": self.database}).test_client()
        self.assertEqual(restarted.get(f"/api/notes/{note['id']}").json, note)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.alice).status_code, 200)


if __name__ == "__main__":
    unittest.main()
