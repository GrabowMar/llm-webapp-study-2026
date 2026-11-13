"""API tests for the todo service.

Run with: ``python -m unittest discover -s backend/tests``
"""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

_TMP_DIR = tempfile.mkdtemp(prefix="todo-tests-")
os.environ["DATA_DIR"] = _TMP_DIR

import app as backend  # noqa: E402


def register(client, username="alice", password="secret123"):
    response = client.post(
        "/api/auth/register", json={"username": username, "password": password}
    )
    return response


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        self.token = register(self.client).get_json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def create_todo(self, **fields):
        payload = {"title": "a todo"}
        payload.update(fields)
        response = self.client.post("/api/todos", json=payload, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def other_client(self, username="bob"):
        client = backend.app.test_client()
        token = register(client, username=username).get_json()["token"]
        return client, {"Authorization": f"Bearer {token}"}


class HealthTests(ApiTestCase):
    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})


class AuthTests(ApiTestCase):
    def test_register_returns_201(self):
        response = register(self.client, "carol")
        self.assertEqual(response.status_code, 201)
        self.assertIn("token", response.get_json())

    def test_register_duplicate_username(self):
        response = register(self.client, "alice")
        self.assertEqual(response.status_code, 409)
        self.assertIn("error", response.get_json())

    def test_register_requires_credentials(self):
        response = self.client.post("/api/auth/register", json={"username": "dave"})
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_login_returns_token(self):
        response = self.client.post(
            "/api/auth/login", json={"username": "alice", "password": "secret123"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["token"])

    def test_login_with_wrong_password(self):
        response = self.client.post(
            "/api/auth/login", json={"username": "alice", "password": "nope"}
        )
        self.assertEqual(response.status_code, 401)

    def test_login_with_unknown_user(self):
        response = self.client.post(
            "/api/auth/login", json={"username": "ghost", "password": "secret123"}
        )
        self.assertEqual(response.status_code, 401)

    def test_protected_routes_require_a_token(self):
        self.assertEqual(self.client.get("/api/todos").status_code, 401)
        self.assertEqual(self.client.post("/api/todos", json={"title": "x"}).status_code, 401)

    def test_invalid_token_is_rejected(self):
        response = self.client.get("/api/todos", headers={"Authorization": "Bearer nope"})
        self.assertEqual(response.status_code, 401)


class TodoCrudTests(ApiTestCase):
    def test_create_returns_all_fields(self):
        todo = self.create_todo(
            title="Write the docs",
            description="readme",
            priority="high",
            due_date="2030-01-02",
        )
        self.assertEqual(
            sorted(todo.keys()),
            sorted(
                [
                    "id",
                    "title",
                    "description",
                    "priority",
                    "due_date",
                    "completed",
                    "completed_at",
                    "created_at",
                ]
            ),
        )
        self.assertEqual(todo["title"], "Write the docs")
        self.assertEqual(todo["priority"], "high")
        self.assertEqual(todo["due_date"], "2030-01-02")
        self.assertFalse(todo["completed"])
        self.assertIsNone(todo["completed_at"])

    def test_create_defaults(self):
        todo = self.create_todo()
        self.assertEqual(todo["priority"], "medium")
        self.assertIsNone(todo["description"])
        self.assertIsNone(todo["due_date"])

    def test_create_validates_title(self):
        response = self.client.post("/api/todos", json={"title": "  "}, headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_create_validates_due_date(self):
        response = self.client.post(
            "/api/todos", json={"title": "x", "due_date": "not-a-date"}, headers=self.headers
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_create_validates_priority(self):
        response = self.client.post(
            "/api/todos", json={"title": "x", "priority": "!!!"}, headers=self.headers
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_get_todo(self):
        todo = self.create_todo()
        response = self.client.get(f"/api/todos/{todo['id']}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["title"], todo["title"])

    def test_get_missing_todo(self):
        response = self.client.get("/api/todos/9999", headers=self.headers)
        self.assertEqual(response.status_code, 404)

    def test_patch_changes_only_given_fields(self):
        todo = self.create_todo(title="old", description="keep", priority="low")
        response = self.client.patch(
            f"/api/todos/{todo['id']}", json={"title": "new"}, headers=self.headers
        )
        self.assertEqual(response.status_code, 200)
        updated = response.get_json()
        self.assertEqual(updated["title"], "new")
        self.assertEqual(updated["description"], "keep")
        self.assertEqual(updated["priority"], "low")

    def test_patch_validates(self):
        todo = self.create_todo()
        response = self.client.patch(
            f"/api/todos/{todo['id']}", json={"title": ""}, headers=self.headers
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_completed_at_is_set_and_cleared(self):
        todo = self.create_todo()
        completed = self.client.patch(
            f"/api/todos/{todo['id']}", json={"completed": True}, headers=self.headers
        ).get_json()
        self.assertTrue(completed["completed"])
        self.assertIsNotNone(completed["completed_at"])

        reopened = self.client.patch(
            f"/api/todos/{todo['id']}", json={"completed": False}, headers=self.headers
        ).get_json()
        self.assertFalse(reopened["completed"])
        self.assertIsNone(reopened["completed_at"])

    def test_delete(self):
        todo = self.create_todo()
        response = self.client.delete(f"/api/todos/{todo['id']}", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.client.get(f"/api/todos/{todo['id']}", headers=self.headers).status_code, 404
        )


class TodoIsolationTests(ApiTestCase):
    def test_other_users_todos_are_invisible(self):
        todo = self.create_todo()
        client, headers = self.other_client()
        self.assertEqual(client.get("/api/todos", headers=headers).get_json()["total"], 0)
        self.assertEqual(client.get(f"/api/todos/{todo['id']}", headers=headers).status_code, 404)
        self.assertEqual(
            client.patch(
                f"/api/todos/{todo['id']}", json={"title": "hijack"}, headers=headers
            ).status_code,
            404,
        )
        self.assertEqual(
            client.delete(f"/api/todos/{todo['id']}", headers=headers).status_code, 404
        )

    def test_todo_survives_for_its_owner(self):
        todo = self.create_todo()
        client, headers = self.other_client()
        client.delete(f"/api/todos/{todo['id']}", headers=headers)
        self.assertEqual(
            self.client.get(f"/api/todos/{todo['id']}", headers=self.headers).status_code, 200
        )


class TodoListTests(ApiTestCase):
    def test_pagination_payload(self):
        for index in range(5):
            self.create_todo(title=f"todo {index}")
        response = self.client.get("/api/todos?page=1&page_size=2", headers=self.headers)
        body = response.get_json()
        self.assertEqual(sorted(body.keys()), ["items", "page", "page_size", "remaining", "total"])
        self.assertEqual(len(body["items"]), 2)
        self.assertEqual(body["total"], 5)
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 2)
        self.assertEqual(body["remaining"], 3)

        body = self.client.get("/api/todos?page=3&page_size=2", headers=self.headers).get_json()
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["remaining"], 0)

    def test_filters(self):
        self.create_todo(title="open one", priority="high")
        done = self.create_todo(title="done one", priority="low")
        self.client.patch(f"/api/todos/{done['id']}", json={"completed": True}, headers=self.headers)

        self.assertEqual(
            self.client.get("/api/todos?completed=false", headers=self.headers).get_json()["total"],
            1,
        )
        self.assertEqual(
            self.client.get("/api/todos?completed=true", headers=self.headers).get_json()["total"],
            1,
        )
        self.assertEqual(
            self.client.get("/api/todos?priority=high", headers=self.headers).get_json()["total"],
            1,
        )
        self.assertEqual(
            self.client.get("/api/todos?priority=low", headers=self.headers).get_json()["total"],
            1,
        )

    def test_ordering(self):
        without_date = self.create_todo(title="no date")
        with_date = self.create_todo(title="later", due_date="2030-12-31")
        sooner = self.create_todo(title="sooner", due_date="2030-01-01")
        completed = self.create_todo(title="completed")
        self.client.patch(
            f"/api/todos/{completed['id']}", json={"completed": True}, headers=self.headers
        )

        items = self.client.get("/api/todos", headers=self.headers).get_json()["items"]
        self.assertEqual(
            [item["id"] for item in items],
            [sooner["id"], with_date["id"], without_date["id"], completed["id"]],
        )

    def test_invalid_pagination_arguments(self):
        response = self.client.get("/api/todos?page=abc", headers=self.headers)
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())


class StaticFrontendTests(unittest.TestCase):
    def test_unknown_api_route_returns_json(self):
        client = backend.app.test_client()
        response = client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.get_json())


def tearDownModule():
    shutil.rmtree(_TMP_DIR, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
