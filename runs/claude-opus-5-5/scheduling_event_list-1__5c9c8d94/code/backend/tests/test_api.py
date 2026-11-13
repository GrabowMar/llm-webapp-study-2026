import os
import sys
import tempfile
import unittest
from pathlib import Path

os.environ["DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import app as app_module  # noqa: E402


class ApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app_module.app.test_client()
        cls.client.post("/api/auth/register", json={"username": "alice", "password": "pw"})
        res = cls.client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
        cls.auth = {"Authorization": f"Bearer {res.get_json()['token']}"}

    def create(self, **fields):
        body = {"title": "T", "start_time": "2030-01-01T10:00:00", "end_time": "2030-01-01T11:00:00"}
        body.update(fields)
        return self.client.post("/api/events", json=body, headers=self.auth)

    def test_health(self):
        self.assertEqual(self.client.get("/api/health").get_json(), {"status": "ok"})

    def test_register_and_login(self):
        res = self.client.post("/api/auth/register", json={"username": "bob", "password": "secret"})
        self.assertEqual(res.status_code, 201)
        res = self.client.post("/api/auth/register", json={"username": "bob", "password": "secret"})
        self.assertEqual(res.status_code, 409)
        res = self.client.post("/api/auth/register", json={"username": ""})
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/auth/login", json={"username": "bob", "password": "nope"})
        self.assertEqual(res.status_code, 401)
        res = self.client.post("/api/auth/login", json={"username": "bob", "password": "secret"})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["token"])

    def test_auth_required(self):
        body = {"title": "x", "start_time": "2030-01-01T10:00:00", "end_time": "2030-01-01T11:00:00"}
        self.assertEqual(self.client.post("/api/events", json=body).status_code, 401)
        bad = {"Authorization": "Bearer nope"}
        self.assertEqual(self.client.post("/api/events", json=body, headers=bad).status_code, 401)
        ev = self.create().get_json()
        self.assertEqual(self.client.put(f"/api/events/{ev['id']}", json=body).status_code, 401)
        self.assertEqual(self.client.delete(f"/api/events/{ev['id']}").status_code, 401)

    def test_crud(self):
        res = self.create(title="Meet", description="d", location="L",
                          start_time="2030-02-01T10:00:00+02:00", end_time="2030-02-01T09:30:00.25Z")
        self.assertEqual(res.status_code, 201, res.get_json())
        ev = res.get_json()
        self.assertEqual(set(ev) >= {"id", "title", "description", "location", "start_time",
                                     "end_time", "created_at", "created_by"}, True)
        self.assertEqual(ev["start_time"], "2030-02-01T08:00:00Z")
        self.assertEqual(ev["end_time"], "2030-02-01T09:30:00.25Z")
        self.assertTrue(ev["created_at"].endswith("Z"))
        self.assertEqual(ev["created_by"], "alice")

        got = self.client.get(f"/api/events/{ev['id']}").get_json()
        self.assertEqual(got, ev)

        res = self.client.put(f"/api/events/{ev['id']}", headers=self.auth,
                              json={"title": "New", "start_time": "2030-02-01T10:00:00",
                                    "end_time": "2030-02-01T12:00:00"})
        self.assertEqual(res.status_code, 200)
        upd = res.get_json()
        self.assertEqual(upd["title"], "New")
        self.assertIsNone(upd["description"])
        self.assertIsNone(upd["location"])
        self.assertEqual(upd["created_by"], "alice")
        self.assertEqual(upd["created_at"], ev["created_at"])

        self.client.post("/api/auth/register", json={"username": "carol", "password": "pw"})
        tok = self.client.post("/api/auth/login", json={"username": "carol", "password": "pw"}).get_json()["token"]
        res = self.client.put(f"/api/events/{ev['id']}", headers={"Authorization": f"Bearer {tok}"},
                              json={"title": "Carol", "start_time": "2030-02-01T10:00:00",
                                    "end_time": "2030-02-01T12:00:00"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["created_by"], "alice")

        self.assertEqual(self.client.delete(f"/api/events/{ev['id']}", headers=self.auth).status_code, 204)
        self.assertEqual(self.client.get(f"/api/events/{ev['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/events/{ev['id']}", headers=self.auth).status_code, 404)

    def test_validation(self):
        res = self.create(title="", start_time="bad")
        self.assertEqual(res.status_code, 400)
        body = res.get_json()
        self.assertIn("title", body["errors"])
        self.assertIn("start_time", body["errors"])
        res = self.create(start_time="2030-01-01T12:00:00Z", end_time="2030-01-01T11:00:00Z")
        self.assertEqual(res.status_code, 400)
        self.assertIn("end_time", res.get_json()["errors"])
        res = self.create(title=5)
        self.assertEqual(res.status_code, 400)
        res = self.client.post("/api/events", data="nope", headers=self.auth)
        self.assertEqual(res.status_code, 400)

    def test_list_range(self):
        a = self.create(title="R1", start_time="2031-05-10T10:00:00Z", end_time="2031-05-10T11:00:00Z").get_json()
        b = self.create(title="R0", start_time="2031-05-09T23:00:00Z", end_time="2031-05-10T01:00:00Z").get_json()
        c = self.create(title="R2", start_time="2031-05-11T00:00:00Z", end_time="2031-05-11T01:00:00Z").get_json()
        res = self.client.get("/api/events?start_date=2031-05-10&end_date=2031-05-10")
        data = res.get_json()
        ids = [e["id"] for e in data["items"]]
        self.assertEqual(ids, [b["id"], a["id"]])
        self.assertEqual(data["total"], 2)
        res = self.client.get("/api/events?start_date=2031-05-10T00:00:00Z&end_date=2031-05-12T00:00:00Z")
        ids = [e["id"] for e in res.get_json()["items"]]
        self.assertEqual(ids, [b["id"], a["id"], c["id"]])
        all_items = self.client.get("/api/events").get_json()
        starts = [e["start_time"] for e in all_items["items"]]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(all_items["total"], len(all_items["items"]))
        self.assertEqual(self.client.get("/api/events?start_date=bad").status_code, 400)


if __name__ == "__main__":
    unittest.main()
