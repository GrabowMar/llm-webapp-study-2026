import hashlib
import tempfile
import unittest
from pathlib import Path

from backend.app import create_app, get_db


class DirectoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = str(Path(self.temp.name) / "directory.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()
        self.headers = self.account("alice")

    def tearDown(self):
        self.temp.cleanup()

    def account(self, username):
        response = self.client.post(
            "/api/auth/register", json={"username": username, "password": "password123"}
        )
        self.assertEqual(response.status_code, 201)
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": "password123"}
        )
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def customer(self, **fields):
        response = self.client.post(
            "/api/customers",
            headers=self.headers,
            json={"name": "Alex Morgan", **fields},
        )
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def test_health_and_authorization(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        customer = self.customer()
        paths = [
            "/api/customers",
            f"/api/customers/{customer['id']}",
            f"/api/customers/{customer['id']}/interactions",
            "/api/overview",
            "/api/auth/me",
        ]
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 401)
                self.assertEqual(
                    self.client.get(
                        path, headers={"Authorization": "Bearer invalid"}
                    ).status_code,
                    401,
                )
        for method, path in [
            ("post", "/api/customers"),
            ("put", f"/api/customers/{customer['id']}"),
            ("delete", f"/api/customers/{customer['id']}"),
            ("post", f"/api/customers/{customer['id']}/interactions"),
        ]:
            self.assertEqual(
                getattr(self.client, method)(path, json={}).status_code, 401
            )

    def test_accounts_validation_and_logout(self):
        response = self.client.post(
            "/api/auth/register", json={"username": "ALICE", "password": "password123"}
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("username", response.json["errors"])
        self.assertEqual(
            self.client.post(
                "/api/auth/register", json={"username": "", "password": "short"}
            ).status_code,
            400,
        )
        for password in ("wrongpassword", "password123"):
            response = self.client.post(
                "/api/auth/login", json={"username": "nobody", "password": password}
            )
            self.assertEqual(response.status_code, 401)
        self.assertEqual(
            self.client.post(
                "/api/auth/login",
                json={"username": "alice", "password": "wrongpassword"},
            ).status_code,
            401,
        )
        self.assertEqual(
            self.client.get("/api/auth/me", headers=self.headers).json["username"],
            "alice",
        )
        token = self.headers["Authorization"].split()[1]
        with self.app.app_context():
            user = get_db().execute("SELECT * FROM users").fetchone()
            session = get_db().execute("SELECT * FROM sessions").fetchone()
            self.assertNotEqual(user["password_hash"], "password123")
            self.assertEqual(
                session["token_hash"], hashlib.sha256(token.encode()).hexdigest()
            )
        self.assertEqual(
            self.client.post("/api/auth/logout", headers=self.headers).status_code, 204
        )
        self.assertEqual(
            self.client.get("/api/customers", headers=self.headers).status_code, 401
        )

    def test_customer_fields_validation_and_duplicates(self):
        self.assertEqual(
            self.client.post(
                "/api/customers", headers=self.headers, json={}
            ).status_code,
            400,
        )
        for fields in (
            {"name": " "},
            {"email": "not-email"},
            {"phone": 123},
            {"notes": []},
        ):
            response = self.client.post(
                "/api/customers", headers=self.headers, json={"name": "Alex", **fields}
            )
            self.assertEqual(response.status_code, 400)
        first = self.customer(
            email="alex@example.com", phone="123", company="Acme", notes="Important"
        )
        self.assertEqual(
            set(first),
            {
                "id",
                "name",
                "email",
                "phone",
                "company",
                "notes",
                "created_at",
                "interaction_count",
                "last_contacted_at",
            },
        )
        self.assertEqual(first["interaction_count"], 0)
        self.assertIsNone(first["last_contacted_at"])
        response = self.client.post(
            "/api/customers",
            headers=self.headers,
            json={"name": "Another", "email": "ALEX@example.com"},
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("email", response.json["errors"])
        second = self.customer(name="Second", email="second@example.com")
        response = self.client.put(
            f"/api/customers/{second['id']}",
            headers=self.headers,
            json={"name": "Second", "email": "alex@example.com"},
        )
        self.assertEqual(response.status_code, 409)
        response = self.client.put(
            f"/api/customers/{first['id']}",
            headers=self.headers,
            json={"name": "Renamed"},
        )
        self.assertEqual(response.status_code, 200)
        for key in ("email", "phone", "company", "notes"):
            self.assertIsNone(response.json[key])
        self.assertEqual(response.json["created_at"], first["created_at"])
        self.customer(email="alex@example.com")
        self.customer()

    def test_search_company_sorting_and_pagination(self):
        self.customer(name="Zoe", company="Acme", notes="special 100%")
        self.customer(name="amy", email="amy@other.com", company="Other")
        self.customer(name="Ben", phone="555", company="Acme")
        response = self.client.get("/api/customers?page_size=2", headers=self.headers)
        self.assertEqual(response.json["total"], 3)
        self.assertEqual(
            [row["name"] for row in response.json["items"]], ["amy", "Ben"]
        )
        response = self.client.get(
            "/api/customers?page=2&page_size=2", headers=self.headers
        )
        self.assertEqual(response.json["items"][0]["name"], "Zoe")
        response = self.client.get(
            "/api/customers?q=ben&company=acme", headers=self.headers
        )
        self.assertEqual(response.json["total"], 1)
        for query in ("555", "100%", "amy@", "special"):
            response = self.client.get(
                "/api/customers", query_string={"q": query}, headers=self.headers
            )
            self.assertEqual(response.json["total"], 1)
        for query in (
            "page=0",
            "page=abc",
            "page_size=0",
            "page_size=101",
            "page_size=2.5",
        ):
            self.assertEqual(
                self.client.get(
                    "/api/customers?" + query, headers=self.headers
                ).status_code,
                400,
            )

    def test_shared_interactions_and_cascade_delete(self):
        customer = self.customer()
        path = f"/api/customers/{customer['id']}"
        bob = self.account("bob")
        response = self.client.put(path, headers=bob, json={"name": "Edited by Bob"})
        self.assertEqual(response.status_code, 200)
        for kind, when, headers in [
            ("call", "2026-01-02T12:00:00Z", self.headers),
            ("email", "2026-01-01T15:00:00+02:00", bob),
            ("meeting", "2026-01-02T12:00:00Z", bob),
        ]:
            response = self.client.post(
                path + "/interactions",
                headers=headers,
                json={
                    "kind": kind,
                    "summary": "Follow-up",
                    "occurred_at": when,
                    "logged_by": "forged",
                },
            )
            self.assertEqual(response.status_code, 201)
            self.assertEqual(
                set(response.json),
                {"id", "customer_id", "kind", "summary", "occurred_at", "logged_by"},
            )
            self.assertEqual(
                response.json["logged_by"],
                "alice" if headers == self.headers else "bob",
            )
        log = self.client.get(path + "/interactions", headers=self.headers).json[
            "items"
        ]
        self.assertEqual([row["kind"] for row in log], ["meeting", "call", "email"])
        self.assertEqual(log[2]["occurred_at"], "2026-01-01T13:00:00.000000Z")
        result = self.client.get(path, headers=self.headers).json
        self.assertEqual(result["interaction_count"], 3)
        self.assertEqual(result["last_contacted_at"], "2026-01-02T12:00:00.000000Z")
        listed = self.client.get("/api/customers", headers=self.headers).json["items"][
            0
        ]
        self.assertEqual(listed, result)
        self.assertEqual(self.client.delete(path, headers=bob).status_code, 204)
        self.assertEqual(self.client.get(path, headers=self.headers).status_code, 404)
        self.assertEqual(
            self.client.get(path + "/interactions", headers=self.headers).status_code,
            404,
        )
        with self.app.app_context():
            self.assertEqual(
                get_db().execute("SELECT COUNT(*) FROM interactions").fetchone()[0], 0
            )

    def test_interaction_validation_missing_customers_and_json(self):
        customer = self.customer()
        path = f"/api/customers/{customer['id']}/interactions"
        for fields in (
            {},
            {"kind": "sms", "summary": "Hello"},
            {"kind": "call", "summary": " "},
            {"kind": "email", "summary": "Hello", "occurred_at": "not-a-date"},
            {"kind": "call", "summary": "Hello", "occurred_at": None},
        ):
            self.assertEqual(
                self.client.post(path, headers=self.headers, json=fields).status_code,
                400,
            )
        self.assertEqual(
            self.client.post(
                path,
                headers=self.headers,
                json={"kind": "call", "summary": "Default time"},
            ).status_code,
            201,
        )
        for method, path in [
            ("get", "/api/customers/999"),
            ("put", "/api/customers/999"),
            ("delete", "/api/customers/999"),
            ("get", "/api/customers/999/interactions"),
            ("post", "/api/customers/999/interactions"),
        ]:
            self.assertEqual(
                getattr(self.client, method)(path, headers=self.headers).status_code,
                404,
            )
        for body in ([], "hello", None):
            self.assertEqual(
                self.client.post(
                    "/api/customers", headers=self.headers, json=body
                ).status_code,
                400,
            )
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertTrue(response.is_json)

    def test_persistence_overview_and_expiration(self):
        self.customer(company="Acme")
        self.customer(company="acme")
        new_app = create_app({"TESTING": True, "DATABASE": self.database})
        response = new_app.test_client().get("/api/customers", headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["total"], 2)
        stats = self.client.get("/api/overview", headers=self.headers).json
        self.assertEqual(stats["customers"], 2)
        self.assertEqual(stats["companies"], 1)
        self.assertEqual(len(stats["company_options"]), 1)
        with self.app.app_context():
            db = get_db()
            with db:
                db.execute(
                    "UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000000Z'"
                )
        self.assertEqual(
            self.client.get("/api/customers", headers=self.headers).status_code, 401
        )


if __name__ == "__main__":
    unittest.main()
