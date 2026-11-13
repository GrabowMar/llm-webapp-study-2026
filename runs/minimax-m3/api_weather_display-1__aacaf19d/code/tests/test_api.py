"""End-to-end checks for the weather API.

Run with:  python -m unittest discover -s tests
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

_TMP_DIR = tempfile.mkdtemp(prefix="weather-tests-")
os.environ["DATABASE_PATH"] = str(Path(_TMP_DIR) / "weather.db")

import app as weather_app  # noqa: E402
import store  # noqa: E402


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        weather_app.app.config["TESTING"] = True
        self.client = weather_app.app.test_client()
        self.conn = store.connect()
        self.conn.execute("DELETE FROM reports")
        self.conn.execute("DELETE FROM lookups")
        self.conn.execute("DELETE FROM tokens")
        self.conn.execute("DELETE FROM users")
        self.conn.execute("DELETE FROM meta WHERE key = 'seeded'")
        store.seed_sample_reports(self.conn)

    def tearDown(self):
        self.conn.close()

    def register(self, username="alice", password="secret123"):
        response = self.client.post(
            "/api/auth/register", json={"username": username, "password": password}
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        return response.get_json()

    def login(self, username="alice", password="secret123"):
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        return response.get_json()["token"]

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}


class HealthAndSeedTests(ApiTestCase):
    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})

    def test_sample_reports_seeded(self):
        response = self.client.get("/api/weather")
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertGreaterEqual(body["total"], 5)
        cities = [item["city"] for item in body["items"]]
        self.assertEqual(cities, sorted(cities, key=str.lower))
        for item in body["items"]:
            self.assertEqual(
                sorted(item.keys()),
                sorted(
                    [
                        "id",
                        "city",
                        "country",
                        "temperature_c",
                        "condition",
                        "humidity",
                        "wind_kph",
                        "observed_at",
                    ]
                ),
            )

    def test_pagination(self):
        response = self.client.get("/api/weather?page=1&page_size=2")
        body = response.get_json()
        self.assertEqual(len(body["items"]), 2)
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 2)
        self.assertGreaterEqual(body["total"], 5)


class AuthTests(ApiTestCase):
    def test_register_and_login(self):
        created = self.register()
        self.assertEqual(created["username"], "alice")
        token = self.login()
        self.assertTrue(token)

    def test_duplicate_username(self):
        self.register()
        response = self.client.post(
            "/api/auth/register", json={"username": "ALICE", "password": "secret123"}
        )
        self.assertEqual(response.status_code, 409)
        self.assertIn("error", response.get_json())

    def test_login_wrong_password(self):
        self.register()
        response = self.client.post(
            "/api/auth/login", json={"username": "alice", "password": "nope"}
        )
        self.assertEqual(response.status_code, 401)

    def test_protected_route_requires_token(self):
        response = self.client.post("/api/weather", json={"city": "Paris"})
        self.assertEqual(response.status_code, 401)
        response = self.client.get("/api/weather", headers=self.auth("nonsense"))
        self.assertEqual(response.status_code, 401)

    def test_me_endpoint(self):
        self.register()
        token = self.login()
        response = self.client.get("/api/auth/me", headers=self.auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["username"], "alice")


class WeatherWriteTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.register()
        self.token = self.login()
        self.headers = self.auth(self.token)

    def test_create_report(self):
        response = self.client.post(
            "/api/weather",
            headers=self.headers,
            json={
                "city": "Paris",
                "country": "France",
                "temperature_c": 21.5,
                "condition": "Sunny",
                "humidity": 60,
                "wind_kph": 9.5,
            },
        )
        self.assertEqual(response.status_code, 201, response.get_json())
        body = response.get_json()
        self.assertEqual(body["city"], "Paris")
        self.assertEqual(body["temperature_c"], 21.5)
        self.assertTrue(body["observed_at"])

    def test_city_unique_ignoring_case(self):
        payload = {"city": "Paris", "temperature_c": 20}
        self.assertEqual(
            self.client.post("/api/weather", headers=self.headers, json=payload).status_code, 201
        )
        response = self.client.post(
            "/api/weather", headers=self.headers, json={"city": "pArIs", "temperature_c": 20}
        )
        self.assertEqual(response.status_code, 409)

    def test_validation_messages(self):
        response = self.client.post("/api/weather", headers=self.headers, json={})
        self.assertEqual(response.status_code, 400)
        body = response.get_json()
        self.assertIn("city", body["errors"])
        self.assertTrue(body["errors"]["city"])

        response = self.client.post(
            "/api/weather",
            headers=self.headers,
            json={"city": "Oslo", "temperature_c": "warm", "humidity": 900},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("temperature_c", response.get_json()["errors"])
        self.assertIn("humidity", response.get_json()["errors"])

    def test_replace_report_clears_omitted_fields(self):
        created = self.client.post(
            "/api/weather",
            headers=self.headers,
            json={
                "city": "Paris",
                "country": "France",
                "temperature_c": 21.5,
                "condition": "Sunny",
                "humidity": 60,
                "wind_kph": 9.5,
            },
        ).get_json()

        response = self.client.put(
            f"/api/weather/{created['id']}",
            headers=self.headers,
            json={"city": "Paris", "temperature_c": 25},
        )
        self.assertEqual(response.status_code, 200, response.get_json())
        body = response.get_json()
        self.assertEqual(body["temperature_c"], 25.0)
        self.assertIsNone(body["country"])
        self.assertIsNone(body["condition"])
        self.assertIsNone(body["humidity"])
        self.assertIsNone(body["wind_kph"])
        self.assertNotEqual(body["observed_at"], created["observed_at"])

    def test_replace_missing_report(self):
        response = self.client.put("/api/weather/9999", headers=self.headers, json={"city": "X"})
        self.assertEqual(response.status_code, 404)

    def test_get_and_delete_report(self):
        created = self.client.post(
            "/api/weather", headers=self.headers, json={"city": "Paris", "temperature_c": 20}
        ).get_json()

        response = self.client.get(f"/api/weather/{created['id']}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["city"], "Paris")

        response = self.client.delete(f"/api/weather/{created['id']}", headers=self.headers)
        self.assertIn(response.status_code, (200, 204))
        self.assertEqual(self.client.get(f"/api/weather/{created['id']}").status_code, 404)

    def test_delete_requires_auth(self):
        created = self.client.post(
            "/api/weather", headers=self.headers, json={"city": "Paris", "temperature_c": 20}
        ).get_json()
        response = self.client.delete(f"/api/weather/{created['id']}")
        self.assertEqual(response.status_code, 401)


class LookupTests(ApiTestCase):
    def test_lookup_is_recorded(self):
        self.client.get("/api/weather?city=Berlin")
        response = self.client.get("/api/weather/recent?limit=5")
        self.assertEqual(response.status_code, 200)
        items = response.get_json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["city"], "Berlin")
        self.assertTrue(items[0]["found"])
        self.assertIn("looked_up_at", items[0])

    def test_lookup_not_found(self):
        self.client.get("/api/weather?city=Atlantis")
        items = self.client.get("/api/weather/recent").get_json()["items"]
        self.assertEqual(len(items), 1)
        self.assertFalse(items[0]["found"])

    def test_lookup_filters_list(self):
        response = self.client.get("/api/weather?city=berlin")
        body = response.get_json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["city"], "Berlin")

    def test_recent_is_newest_first(self):
        for city in ("Berlin", "Cairo", "Dublin"):
            self.client.get(f"/api/weather?city={city}")
        items = self.client.get("/api/weather/recent?limit=5").get_json()["items"]
        self.assertEqual([item["city"] for item in items], ["Dublin", "Cairo", "Berlin"])

    def test_list_without_city_records_nothing(self):
        self.client.get("/api/weather")
        items = self.client.get("/api/weather/recent").get_json()["items"]
        self.assertEqual(items, [])


if __name__ == "__main__":
    unittest.main()
