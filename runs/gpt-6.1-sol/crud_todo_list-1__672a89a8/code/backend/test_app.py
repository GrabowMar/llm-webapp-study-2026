import hashlib
import sqlite3
import tempfile
import unittest
from pathlib import Path

from backend.app import create_app


class TodoApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "todos.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.path})
        self.client = self.app.test_client()
        self.headers = self.account("alice")

    def tearDown(self):
        self.temp.cleanup()

    def account(self, username):
        credentials = {"username": username, "password": "password123"}
        self.assertEqual(
            self.client.post("/api/auth/register", json=credentials).status_code, 201
        )
        response = self.client.post("/api/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def add(self, **fields):
        response = self.client.post(
            "/api/todos", headers=self.headers, json={"title": "A task", **fields}
        )
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_health_and_authentication(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        for method, url in (
            ("GET", "/api/todos"),
            ("POST", "/api/todos"),
            ("GET", "/api/todos/1"),
            ("PATCH", "/api/todos/1"),
            ("DELETE", "/api/todos/1"),
        ):
            self.assertEqual(self.client.open(url, method=method).status_code, 401)
            self.assertEqual(
                self.client.open(
                    url, method=method, headers={"Authorization": "Bearer invalid"}
                ).status_code,
                401,
            )
        self.assertEqual(
            self.client.get("/api/auth/me", headers=self.headers).json["username"],
            "alice",
        )
        duplicate = self.client.post(
            "/api/auth/register", json={"username": "ALICE", "password": "password123"}
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertIn("username", duplicate.json["errors"])
        self.assertEqual(
            self.client.post(
                "/api/auth/login", json={"username": "alice", "password": "wrongpassword"}
            ).status_code,
            401,
        )

    def test_crud_and_completion_transitions(self):
        todo = self.add(title="  Plan the week  ", description="Notes", priority="high")
        self.assertEqual(todo["title"], "Plan the week")
        self.assertEqual(
            set(todo),
            {"id", "title", "description", "priority", "due_date", "completed",
             "completed_at", "created_at"},
        )
        self.assertFalse(todo["completed"])
        self.assertIsNone(todo["completed_at"])
        url = f"/api/todos/{todo['id']}"
        completed = self.client.patch(url, headers=self.headers, json={"completed": True}).json
        self.assertTrue(completed["completed"])
        self.assertIsNotNone(completed["completed_at"])
        again = self.client.patch(url, headers=self.headers, json={"completed": True}).json
        self.assertEqual(again["completed_at"], completed["completed_at"])
        updated = self.client.patch(url, headers=self.headers, json={"title": "New title"}).json
        self.assertEqual(updated["description"], "Notes")
        self.assertEqual(updated["completed_at"], completed["completed_at"])
        reopened = self.client.patch(
            url, headers=self.headers, json={"completed": False, "description": None}
        ).json
        self.assertIsNone(reopened["completed_at"])
        self.assertIsNone(reopened["description"])
        self.assertEqual(self.client.get(url, headers=self.headers).json, reopened)
        self.assertEqual(self.client.patch(url, headers=self.headers, json={}).json, reopened)
        self.assertEqual(self.client.delete(url, headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get(url, headers=self.headers).status_code, 404)
        self.assertEqual(self.client.delete(url, headers=self.headers).status_code, 404)

    def test_private_lists(self):
        todo = self.add()
        bob = self.account("bob")
        self.assertEqual(self.client.get("/api/todos", headers=bob).json["total"], 0)
        for method in ("GET", "PATCH", "DELETE"):
            response = self.client.open(
                f"/api/todos/{todo['id']}", method=method, headers=bob, json={"title": "Stolen"}
            )
            self.assertEqual(response.status_code, 404)
        self.assertEqual(self.client.get("/api/todos", headers=self.headers).json["total"], 1)

    def test_sorting_filters_and_pagination(self):
        undated_old = self.add(title="Old undated")
        completed = self.add(title="Done", due_date="2020-01-01", completed=True)
        later = self.add(title="Later", due_date="2030-06-01", priority="high")
        earlier_old = self.add(title="Earlier old", due_date="2030-05-01")
        earlier_new = self.add(title="Earlier new", due_date="2030-05-01", priority="high")
        undated_new = self.add(title="New undated")
        result = self.client.get("/api/todos", headers=self.headers).json
        self.assertEqual(
            [item["id"] for item in result["items"]],
            [earlier_new["id"], earlier_old["id"], later["id"],
             undated_new["id"], undated_old["id"], completed["id"]],
        )
        page = self.client.get("/api/todos?page=2&page_size=2", headers=self.headers).json
        self.assertEqual(page["total"], 6)
        self.assertEqual(page["page"], 2)
        self.assertEqual(page["page_size"], 2)
        self.assertEqual(page["remaining"], 2)
        self.assertEqual(len(page["items"]), 2)
        empty = self.client.get("/api/todos?page=20&page_size=2", headers=self.headers).json
        self.assertEqual(empty["items"], [])
        self.assertEqual(empty["remaining"], 0)
        filtered = self.client.get(
            "/api/todos?completed=false&priority=high", headers=self.headers
        ).json
        self.assertEqual(filtered["total"], 2)
        self.assertTrue(all(item["priority"] == "high" for item in filtered["items"]))
        self.assertEqual(
            self.client.get("/api/todos?completed=true", headers=self.headers).json["total"], 1
        )

    def test_validation(self):
        for fields, field in (
            ({"title": " "}, "title"),
            ({"title": 123}, "title"),
            ({"title": "x" * 201}, "title"),
            ({"description": []}, "description"),
            ({"priority": "urgent"}, "priority"),
            ({"priority": []}, "priority"),
            ({"due_date": "2026-02-30"}, "due_date"),
            ({"due_date": "20260101"}, "due_date"),
            ({"due_date": 123}, "due_date"),
            ({"completed": "false"}, "completed"),
            ({"user_id": 2}, "user_id"),
        ):
            response = self.client.post(
                "/api/todos", headers=self.headers, json={"title": "Valid", **fields}
            )
            self.assertEqual(response.status_code, 400, fields)
            self.assertIn(field, response.json["errors"])
        for query in ("page=0", "page=-1", "page=abc", "page_size=101", "page_size=0",
                      "completed=maybe", "priority=urgent", "page=9999999999999999999999"):
            self.assertEqual(
                self.client.get(f"/api/todos?{query}", headers=self.headers).status_code, 400
            )
        for body in ([], None, "not an object"):
            self.assertEqual(
                self.client.post("/api/todos", headers=self.headers, json=body).status_code, 400
            )
        self.assertEqual(
            self.client.post(
                "/api/todos", headers=self.headers, data="{", content_type="application/json"
            ).status_code, 400
        )
        invalid_account = self.client.post(
            "/api/auth/register", json={"username": "x", "password": "short"}
        )
        self.assertEqual(invalid_account.status_code, 400)
        self.assertEqual(set(invalid_account.json["errors"]), {"username", "password"})

    def test_persistence_and_secure_storage(self):
        todo = self.add(completed=True)
        restarted = create_app({"TESTING": True, "DATABASE": self.path}).test_client()
        self.assertEqual(restarted.get("/api/todos", headers=self.headers).json["items"], [todo])
        with sqlite3.connect(self.path) as db:
            password_hash = db.execute("SELECT password_hash FROM users").fetchone()[0]
            token_hash = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertNotEqual(password_hash, "password123")
        token = self.headers["Authorization"].split()[1]
        self.assertEqual(token_hash, hashlib.sha256(token.encode()).hexdigest())
        self.assertNotEqual(token_hash, token)
        self.assertEqual(
            restarted.post("/api/auth/logout", headers=self.headers).status_code, 204
        )
        self.assertEqual(restarted.get("/api/todos", headers=self.headers).status_code, 401)

    def test_api_errors_and_security_headers(self):
        response = self.client.get("/api/not-real")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response.is_json)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.client.put("/api/todos", headers=self.headers).status_code, 405)


if __name__ == "__main__":
    unittest.main()
