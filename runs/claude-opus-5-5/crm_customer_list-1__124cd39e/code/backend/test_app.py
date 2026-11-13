import importlib
import os
import sys
import tempfile
import unittest
from pathlib import Path


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        os.environ["DATA_DIR"] = cls.tmp.name
        sys.path.insert(0, str(Path(__file__).parent))
        import app as app_module

        cls.mod = importlib.reload(app_module)
        cls.client = cls.mod.app.test_client()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def signin(self, username):
        r = self.client.post("/api/auth/register", json={"username": username, "password": "secret123"})
        self.assertEqual(r.status_code, 201, r.json)
        r = self.client.post("/api/auth/login", json={"username": username, "password": "secret123"})
        self.assertEqual(r.status_code, 200)
        return {"Authorization": f"Bearer {r.json['token']}"}

    def test_flow(self):
        c = self.client
        self.assertEqual(c.get("/api/health").json, {"status": "ok"})
        self.assertEqual(c.get("/api/customers").status_code, 401)
        self.assertEqual(c.get("/api/customers", headers={"Authorization": "Bearer nope"}).status_code, 401)
        self.assertEqual(c.post("/api/customers", json={"name": "x"}).status_code, 401)
        self.assertEqual(c.get("/api/customers/1/interactions").status_code, 401)

        a = self.signin("alice")
        b = self.signin("bob")
        r = c.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
        self.assertEqual(r.status_code, 409)
        r = c.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
        self.assertEqual(r.status_code, 401)
        self.assertEqual(c.post("/api/auth/register", json={}).status_code, 400)

        r = c.post("/api/customers", headers=a, json={"email": "bad"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("name", r.json["errors"])
        self.assertIn("email", r.json["errors"])

        r = c.post("/api/customers", headers=a, json={"name": "Zed", "email": "z@x.com", "company": "Acme", "phone": "+1 555"})
        self.assertEqual(r.status_code, 201)
        zed = r.json
        self.assertEqual(set(zed), {"id", "name", "email", "phone", "company", "notes", "created_at", "interaction_count", "last_contacted_at"})
        self.assertIsNone(zed["last_contacted_at"])
        self.assertEqual(zed["interaction_count"], 0)

        r = c.post("/api/customers", headers=b, json={"name": "Dup", "email": "Z@x.com"})
        self.assertEqual(r.status_code, 409)
        self.assertIn("email", r.json["errors"])

        for name in ["anna", "Bert", "Carl"]:
            r = c.post("/api/customers", headers=b, json={"name": name, "company": "Other" if name != "Bert" else "Acme"})
            self.assertEqual(r.status_code, 201)

        r = c.get("/api/customers", headers=a)
        self.assertEqual([i["name"] for i in r.json["items"]], ["anna", "Bert", "Carl", "Zed"])
        self.assertEqual(r.json["total"], 4)
        r = c.get("/api/customers?page=2&page_size=3", headers=a)
        self.assertEqual([i["name"] for i in r.json["items"]], ["Zed"])
        self.assertEqual((r.json["page"], r.json["page_size"], r.json["total"]), (2, 3, 4))
        r = c.get("/api/customers?company=acme", headers=a)
        self.assertEqual([i["name"] for i in r.json["items"]], ["Bert", "Zed"])
        r = c.get("/api/customers?q=z@x", headers=a)
        self.assertEqual([i["name"] for i in r.json["items"]], ["Zed"])
        self.assertEqual(c.get("/api/customers?page=0", headers=a).status_code, 400)

        cid = zed["id"]
        r = c.put(f"/api/customers/{cid}", headers=b, json={"name": "Zed 2"})
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.json["email"])
        self.assertIsNone(r.json["company"])
        self.assertEqual(c.put(f"/api/customers/{cid}", headers=b, json={}).status_code, 400)
        self.assertEqual(c.put("/api/customers/9999", headers=b, json={"name": "x"}).status_code, 404)

        r = c.post(f"/api/customers/{cid}/interactions", headers=a, json={"kind": "call", "summary": "Hi", "occurred_at": "2024-01-01T10:00:00Z"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json["logged_by"], "alice")
        r = c.post(f"/api/customers/{cid}/interactions", headers=b, json={"kind": "meeting", "summary": "Later"})
        self.assertEqual(r.status_code, 201)
        latest = r.json
        r = c.post(f"/api/customers/{cid}/interactions", headers=b, json={"kind": "fax", "summary": ""})
        self.assertEqual(r.status_code, 400)
        r = c.get(f"/api/customers/{cid}/interactions", headers=a)
        self.assertEqual([i["summary"] for i in r.json["items"]], ["Later", "Hi"])
        r = c.get(f"/api/customers/{cid}", headers=a)
        self.assertEqual(r.json["interaction_count"], 2)
        self.assertEqual(r.json["last_contacted_at"], latest["occurred_at"])

        self.assertEqual(c.delete(f"/api/customers/{cid}", headers=a).status_code, 204)
        self.assertEqual(c.get(f"/api/customers/{cid}", headers=a).status_code, 404)
        self.assertEqual(c.get(f"/api/customers/{cid}/interactions", headers=a).status_code, 404)
        self.assertEqual(c.get("/api/nope", headers=a).status_code, 404)


if __name__ == "__main__":
    unittest.main()
