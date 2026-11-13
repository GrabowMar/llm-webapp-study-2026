"""API tests for the store finder backend.

Run with::

    python -m unittest discover -s tests -t .
"""

import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

TEMP_DIR = Path(tempfile.mkdtemp(prefix="store-finder-tests-"))
os.environ["STORE_FINDER_DATA_DIR"] = str(TEMP_DIR)

import app as backend  # noqa: E402

backend.app.config["TESTING"] = True


class ApiTestCase(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()
        self.admin_password = os.environ.pop("ADMIN_PASSWORD", None)
        os.environ["ADMIN_PASSWORD"] = "s3cret-admin"
        with backend.app.app_context():
            db = backend.get_db()
            db.execute("DELETE FROM tokens")
            db.execute("DELETE FROM users")
            db.execute("DELETE FROM stores")
            db.commit()
            backend.ensure_admin_user()
            backend.seed_sample_stores()
        self.admin_token = self.login_token("admin", "s3cret-admin")

    def tearDown(self):
        if self.admin_password is None:
            os.environ.pop("ADMIN_PASSWORD", None)
        else:
            os.environ["ADMIN_PASSWORD"] = self.admin_password

    def login_token(self, username, password):
        response = self.login_response(username, password)
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        return response.get_json()["token"]

    def login_response(self, username, password):
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        return response

    def auth(self, token):
        return {"Authorization": f"Bearer {token}"}

    def create_store(self, **overrides):
        payload = {
            "name": "Test Store",
            "address": "Test Street 1",
            "phone": "+49 30 1",
            "latitude": 52.5,
            "longitude": 13.4,
        }
        payload.update(overrides)
        return self.client.post("/api/admin/stores", json=payload, headers=self.auth(self.admin_token))


class HealthTest(ApiTestCase):
    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"status": "ok"})


class StoreListTest(ApiTestCase):
    def test_seeded_with_eight_stores(self):
        payload = self.client.get("/api/stores").get_json()
        self.assertEqual(len(payload["items"]), 8)
        self.assertEqual(set(payload["items"][0]), {
            "id",
            "name",
            "address",
            "phone",
            "latitude",
            "longitude",
            "distance_km",
        })

    def test_sorted_by_name(self):
        items = self.client.get("/api/stores").get_json()["items"]
        names = [item["name"] for item in items]
        self.assertEqual(names, sorted(names))

    def test_search_by_name_and_address(self):
        items = self.client.get("/api/stores?q=berlin").get_json()["items"]
        self.assertTrue(items)
        self.assertTrue(all("Berlin" in item["address"] for item in items))

    def test_search_without_match(self):
        self.assertEqual(self.client.get("/api/stores?q=zzzz").get_json()["items"], [])

    def test_nearby_sorted_by_distance(self):
        items = self.client.get(
            "/api/stores?lat=52.52&lng=13.405&radius=50"
        ).get_json()["items"]
        self.assertTrue(items)
        distances = [item["distance_km"] for item in items]
        self.assertEqual(distances, sorted(distances))
        self.assertTrue(all(distance <= 50 for distance in distances))

    def test_radius_filters(self):
        items = self.client.get(
            "/api/stores?lat=52.52&lng=13.405&radius=2"
        ).get_json()["items"]
        self.assertTrue(all(item["distance_km"] <= 2 for item in items))
        self.assertLess(len(items), 8)

    def test_coordinates_without_radius_are_sorted_by_distance(self):
        items = self.client.get("/api/stores?lat=52.52&lng=13.405").get_json()["items"]
        self.assertEqual(len(items), 8)
        distances = [item["distance_km"] for item in items]
        self.assertEqual(distances, sorted(distances))

    def test_invalid_coordinates(self):
        self.assertEqual(self.client.get("/api/stores?lat=abc&lng=1").status_code, 400)
        self.assertEqual(self.client.get("/api/stores?lat=1").status_code, 400)

    def test_single_store(self):
        items = self.client.get("/api/stores").get_json()["items"]
        store_id = items[0]["id"]
        response = self.client.get(f"/api/stores/{store_id}")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["id"], store_id)

    def test_unknown_store(self):
        self.assertEqual(self.client.get("/api/stores/424242").status_code, 404)
        self.assertEqual(self.client.get("/api/stores/not-a-number").status_code, 404)

    def test_unknown_api_route_returns_json(self):
        response = self.client.get("/api/does-not-exist")
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.get_json())


class AuthTest(ApiTestCase):
    def test_register_and_login(self):
        response = self.client.post(
            "/api/auth/register", json={"username": "kim", "password": "secret"}
        )
        self.assertEqual(response.status_code, 201)
        response = self.login_response("kim", "secret")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()["token"])

    def test_duplicate_username(self):
        self.client.post("/api/auth/register", json={"username": "kim", "password": "secret"})
        response = self.client.post(
            "/api/auth/register", json={"username": "kim", "password": "secret"}
        )
        self.assertEqual(response.status_code, 409)

    def test_register_validation(self):
        response = self.client.post("/api/auth/register", json={"username": "", "password": ""})
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.get_json()["errors"])
        self.assertIn("password", response.get_json()["errors"])

    def test_login_with_wrong_password(self):
        self.client.post("/api/auth/register", json={"username": "kim", "password": "secret"})
        self.assertEqual(self.login_response("kim", "wrong").status_code, 401)

    def test_token_identifies_user(self):
        token = self.client.post(
            "/api/auth/register", json={"username": "kim", "password": "secret"}
        ).get_json()["token"]
        response = self.client.get("/api/auth/me", headers=self.auth(token))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["user"]["username"], "kim")

    def test_invalid_token_is_rejected(self):
        response = self.client.get("/api/auth/me", headers=self.auth("nope"))
        self.assertEqual(response.status_code, 401)

    def test_admin_password_comes_from_environment(self):
        os.environ["ADMIN_PASSWORD"] = "another-secret"
        self.assertEqual(self.login_response("admin", "another-secret").status_code, 200)
        self.assertEqual(self.login_response("admin", "s3cret-admin").status_code, 401)

    def test_admin_login_disabled_without_password(self):
        os.environ.pop("ADMIN_PASSWORD", None)
        response = self.login_response("admin", "anything")
        self.assertEqual(response.status_code, 401)
        self.assertIn("error", response.get_json())


class AdminStoreTest(ApiTestCase):
    def test_requires_admin(self):
        payload = {"name": "X", "address": "Y", "latitude": 1, "longitude": 2}
        self.assertEqual(
            self.client.post("/api/admin/stores", json=payload).status_code, 401
        )
        token = self.client.post(
            "/api/auth/register", json={"username": "plain", "password": "secret"}
        ).get_json()["token"]
        response = self.client.post(
            "/api/admin/stores", json=payload, headers=self.auth(token)
        )
        self.assertEqual(response.status_code, 403)

    def test_create_store(self):
        response = self.create_store()
        self.assertEqual(response.status_code, 201)
        store = response.get_json()
        self.assertEqual(store["name"], "Test Store")
        self.assertEqual(store["distance_km"], None)
        listed = self.client.get("/api/stores").get_json()["items"]
        self.assertTrue(any(item["id"] == store["id"] for item in listed))

    def test_create_store_validation_messages(self):
        response = self.create_store(name="", address="", latitude=999, longitude="abc")
        self.assertEqual(response.status_code, 400)
        errors = response.get_json()["errors"]
        self.assertEqual(set(errors), {"name", "address", "latitude", "longitude"})

    def test_update_replaces_fields_and_clears_phone(self):
        store_id = self.create_store().get_json()["id"]
        response = self.client.put(
            f"/api/admin/stores/{store_id}",
            json={"name": "Renamed", "address": "Other 2", "latitude": 52.6, "longitude": 13.5},
            headers=self.auth(self.admin_token),
        )
        self.assertEqual(response.status_code, 200)
        store = response.get_json()
        self.assertEqual(store["name"], "Renamed")
        self.assertIsNone(store["phone"])

    def test_update_unknown_store(self):
        response = self.client.put(
            "/api/admin/stores/999999",
            json={"name": "a", "address": "b", "latitude": 1, "longitude": 2},
            headers=self.auth(self.admin_token),
        )
        self.assertEqual(response.status_code, 404)

    def test_delete_store(self):
        store_id = self.create_store().get_json()["id"]
        response = self.client.delete(
            f"/api/admin/stores/{store_id}", headers=self.auth(self.admin_token)
        )
        self.assertIn(response.status_code, (200, 204))
        self.assertEqual(self.client.get(f"/api/stores/{store_id}").status_code, 404)

    def test_delete_requires_admin(self):
        store_id = self.create_store().get_json()["id"]
        response = self.client.delete(f"/api/admin/stores/{store_id}")
        self.assertEqual(response.status_code, 401)


def tearDownModule():
    shutil.rmtree(TEMP_DIR, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
