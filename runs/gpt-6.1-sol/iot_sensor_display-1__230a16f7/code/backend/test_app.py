import tempfile
import unittest
import sqlite3
from contextlib import closing
from pathlib import Path

from backend.app import create_app


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = {"TESTING": True, "DATABASE": str(Path(self.directory.name) / "test.sqlite3")}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.alice = self.account("alice")
        self.bob = self.account("bob")

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username):
        result = self.client.post("/api/auth/register", json={"username": username, "password": "test-password"})
        self.assertEqual(result.status_code, 201)
        result = self.client.post("/api/auth/login", json={"username": username, "password": "test-password"})
        self.assertEqual(result.status_code, 200)
        return {"Authorization": "Bearer " + result.json["token"]}

    def sensor(self, name="Temperature"):
        response = self.client.post(
            "/api/sensors", json={"name": name, "unit": "°C", "location": "Greenhouse"}, headers=self.alice
        )
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_health_and_json_errors(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/unknown").status_code, 404)
        self.assertIn("error", self.client.get("/api/unknown").json)
        self.assertEqual(self.client.patch("/api/sensors").status_code, 405)

    def test_authentication(self):
        self.assertEqual(self.client.post("/api/sensors", json={"name": "A"}).status_code, 401)
        self.assertEqual(self.client.post("/api/sensors", headers={"Authorization": "Bearer bad"}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).json, {"username": "alice"})
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "alice", "password": "x"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).status_code, 401)

    def test_new_sensor_and_sorting(self):
        sensor = self.sensor("Zulu")
        self.assertEqual(set(sensor), {"id", "name", "unit", "location", "last_value", "last_updated", "owner"})
        self.assertIsNone(sensor["last_value"])
        self.assertIsNone(sensor["last_updated"])
        self.assertEqual(sensor["owner"], "alice")
        self.sensor("Alpha")
        self.assertEqual([s["name"] for s in self.client.get("/api/sensors").json["items"]], ["Alpha", "Zulu"])
        self.assertEqual(self.client.get(f"/api/sensors/{sensor['id']}").json, sensor)

    def test_ownership_and_cascade(self):
        sensor = self.sensor()
        url = f"/api/sensors/{sensor['id']}"
        self.assertEqual(self.client.post(url + "/readings", json={"value": 5}, headers=self.bob).status_code, 403)
        self.assertEqual(self.client.delete(url, headers=self.bob).status_code, 403)
        self.assertEqual(self.client.post(url + "/readings", json={"value": 5}).status_code, 401)
        self.assertEqual(self.client.post(url + "/readings", json={"value": 5}, headers=self.alice).status_code, 201)
        self.assertEqual(self.client.delete(url, headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.get(url + "/readings").status_code, 404)
        with self.app.app_context():
            with closing(sqlite3.connect(self.config["DATABASE"])) as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM readings").fetchone()[0], 0)

    def test_readings_and_limit(self):
        sensor = self.sensor()
        url = f"/api/sensors/{sensor['id']}"
        self.assertEqual(self.client.get(url + "/readings").json, {"items": [], "total": 0})
        for value in [0, -2.5, 21.7]:
            result = self.client.post(url + "/readings", json={"value": value, "recorded_at": "fake"}, headers=self.alice)
            self.assertEqual(result.status_code, 201)
            self.assertNotEqual(result.json["recorded_at"], "fake")
        data = self.client.get(url + "/readings?limit=2").json
        self.assertEqual(data["total"], 3)
        self.assertEqual([r["value"] for r in data["items"]], [21.7, -2.5])
        latest = self.client.get(url).json
        self.assertEqual(latest["last_value"], 21.7)
        self.assertEqual(latest["last_updated"], data["items"][0]["recorded_at"])
        for limit in ["0", "-1", "x", "1001", "1.5"]:
            self.assertEqual(self.client.get(url + "/readings?limit=" + limit).status_code, 400)

    def test_validation(self):
        for body in [[], None, {"name": ""}, {"name": 3}, {"name": "a", "unit": []}]:
            self.assertEqual(self.client.post("/api/sensors", json=body, headers=self.alice).status_code, 400)
        sensor = self.sensor()
        for value in [None, True, "23", float("inf"), float("nan"), [], {}]:
            response = self.client.post(f"/api/sensors/{sensor['id']}/readings", json={"value": value}, headers=self.alice)
            self.assertEqual(response.status_code, 400)
        response = self.client.post(
            f"/api/sensors/{sensor['id']}/readings", json={"value": 10**100}, headers=self.alice
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["value"], 1e100)
        response = self.client.post(
            f"/api/sensors/{sensor['id']}/readings", json={"value": 10**400}, headers=self.alice
        )
        self.assertEqual(response.status_code, 400)

    def test_persistence_across_restart(self):
        sensor = self.sensor()
        self.client.post(f"/api/sensors/{sensor['id']}/readings", json={"value": 20}, headers=self.alice)
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/sensors/{sensor['id']}").json["last_value"], 20)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.alice).status_code, 200)


if __name__ == "__main__":
    unittest.main()
