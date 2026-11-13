import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from backend.app import create_app


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = {
            "TESTING": True,
            "DATABASE": str(Path(self.directory.name) / "inventory.sqlite3"),
            "SEED_DEMO": False,
        }
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.client.post("/api/auth/register", json={"username": "alex", "password": "password"})
        login = self.client.post("/api/auth/login", json={"username": "alex", "password": "password"})
        self.token = login.json["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self):
        self.directory.cleanup()

    def add(self, **values):
        data = {"name": "Safety gloves", "sku": "SFT-01", "location": "Zone A", "quantity": 10, "reorder_level": 5}
        data.update(values)
        return self.client.post("/api/items", json=data, headers=self.headers)

    def move(self, item_id, delta, reason="Supplier delivery"):
        return self.client.post(f"/api/items/{item_id}/movements", json={"delta": delta, "reason": reason}, headers=self.headers)

    def test_health_and_public_reads(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/items").json, {"items": [], "total": 0, "page": 1, "page_size": 10})
        item = self.add().json
        self.assertEqual(self.client.get(f"/api/items/{item['id']}").json, item)
        self.assertEqual(self.client.get(f"/api/items/{item['id']}/movements").json, {"items": []})
        self.assertFalse(item["low_stock"])

    def test_authentication(self):
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "bob", "password": "p"}).status_code, 201)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ALEX", "password": "p"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alex", "password": "incorrect"}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.headers).json, {"username": "alex"})
        item_id = self.add().json["id"]
        for method, path in (("post", "/api/items"), ("put", f"/api/items/{item_id}"), ("delete", f"/api/items/{item_id}"), ("post", f"/api/items/{item_id}/movements")):
            self.assertEqual(getattr(self.client, method)(path, json={}).status_code, 401)
            self.assertEqual(getattr(self.client, method)(path, json={}, headers={"Authorization": "Bearer invalid"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.headers).status_code, 204)
        self.assertEqual(self.client.post("/api/items", json={}, headers=self.headers).status_code, 401)

    def test_item_validation_and_duplicate_sku(self):
        item = self.add().json
        duplicate = self.add(sku=item["sku"].lower())
        self.assertEqual(duplicate.status_code, 409)
        self.assertIn("sku", duplicate.json["errors"])
        for values in ({"quantity": -1}, {"quantity": True}, {"quantity": 2.5}, {"quantity": "2"}, {"reorder_level": -1}, {"name": " "}, {"location": ""}, {"quantity": 2**63}):
            self.assertEqual(self.add(**values).status_code, 400)
        self.assertEqual(self.client.post("/api/items", data="not json", headers=self.headers).status_code, 400)

    def test_search_location_low_stock_and_paging(self):
        self.add(name="Zebra", sku="Z-01", location="Zone B", quantity=0, reorder_level=0)
        self.add(name="apple", sku="A-01", quantity=5, reorder_level=5)
        self.add(name="Banana", sku="B-01", quantity=12)
        self.add(name="100% reliable", sku="P-01", quantity=12)
        page = self.client.get("/api/items?page=2&page_size=2").json
        self.assertEqual(page["total"], 4)
        self.assertEqual([item["name"] for item in page["items"]], ["Banana", "Zebra"])
        self.assertEqual(self.client.get("/api/items?q=A-01").json["total"], 1)
        self.assertEqual(self.client.get("/api/items?q=%25").json["total"], 1)
        self.assertEqual(self.client.get("/api/items?location=Zone%20B").json["total"], 1)
        low = self.client.get("/api/items?low_stock=true").json
        self.assertEqual(low["total"], 2)
        self.assertTrue(all(item["low_stock"] for item in low["items"]))
        self.assertEqual(self.client.get("/api/items?low_stock=false").json["total"], 4)
        for query in ("page=0", "page_size=0", "page_size=101", "page=a", "low_stock=maybe"):
            self.assertEqual(self.client.get(f"/api/items?{query}").status_code, 400)

    def test_movement_history_and_stock_rule(self):
        item_id = self.add().json["id"]
        first = self.move(item_id, 5).json
        self.assertEqual(first["quantity_after"], 15)
        self.assertEqual(first["username"], "alex")
        self.assertEqual(set(first), {"id", "item_id", "delta", "reason", "quantity_after", "created_at", "username"})
        second = self.move(item_id, -10, "Customer order").json
        self.assertEqual(second["quantity_after"], 5)
        self.assertTrue(self.client.get(f"/api/items/{item_id}").json["low_stock"])
        history = self.client.get(f"/api/items/{item_id}/movements").json["items"]
        self.assertEqual([row["id"] for row in history], [second["id"], first["id"]])
        self.assertEqual(self.move(item_id, -6).status_code, 400)
        self.assertEqual(self.client.get(f"/api/items/{item_id}").json["quantity"], 5)
        self.assertEqual(len(self.client.get(f"/api/items/{item_id}/movements").json["items"]), 2)
        self.assertEqual(self.move(item_id, -5).json["quantity_after"], 0)
        for delta in (0, True, "3", 1.1):
            self.assertEqual(self.move(item_id, delta).status_code, 400)
        self.assertEqual(self.move(item_id, 1, " ").status_code, 400)

    def test_replacement_does_not_change_quantity(self):
        item_id = self.add().json["id"]
        self.move(item_id, 7)
        result = self.client.put(f"/api/items/{item_id}", json={"name": "New name", "sku": "NEW-01", "location": "Zone C", "reorder_level": 20, "quantity": 999}, headers=self.headers)
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json["quantity"], 17)
        self.assertEqual(result.json["name"], "New name")
        self.assertTrue(result.json["low_stock"])
        self.add(sku="SECOND")
        result = self.client.put(f"/api/items/{item_id}", json={"name": "New name", "sku": "SECOND", "location": "Zone C", "reorder_level": 20}, headers=self.headers)
        self.assertEqual(result.status_code, 409)
        self.assertEqual(self.client.get(f"/api/items/{item_id}").json["sku"], "NEW-01")

    def test_delete_cascades_and_missing_items(self):
        item_id = self.add().json["id"]
        self.move(item_id, 3)
        self.assertEqual(self.client.get("/api/activity").json["total"], 1)
        self.assertEqual(self.client.delete(f"/api/items/{item_id}", headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get("/api/activity").json["total"], 0)
        self.assertEqual(self.client.get(f"/api/items/{item_id}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/items/{item_id}/movements").status_code, 404)
        self.assertEqual(self.move(item_id, 3).status_code, 404)
        self.assertEqual(self.client.get("/api/not-a-route").status_code, 404)
        self.assertTrue(self.client.get("/api/not-a-route").is_json)

    def test_data_and_token_survive_restart(self):
        item_id = self.add().json["id"]
        self.move(item_id, 3)
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/items/{item_id}").json["quantity"], 13)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.headers).status_code, 200)
        self.assertEqual(len(restarted.get(f"/api/items/{item_id}/movements").json["items"]), 1)

    def test_concurrent_movements_cannot_overdraw(self):
        item_id = self.add(quantity=5).json["id"]

        def take_out(_):
            with self.app.test_client() as client:
                return client.post(f"/api/items/{item_id}/movements", json={"delta": -4, "reason": "Order"}, headers=self.headers).status_code

        with ThreadPoolExecutor(max_workers=2) as executor:
            statuses = list(executor.map(take_out, range(2)))
        self.assertEqual(sorted(statuses), [201, 400])
        self.assertEqual(self.client.get(f"/api/items/{item_id}").json["quantity"], 1)
        self.assertEqual(len(self.client.get(f"/api/items/{item_id}/movements").json["items"]), 1)

    def test_overview(self):
        self.add(quantity=5)
        self.add(sku="SFT-02", location="Zone B", quantity=10)
        overview = self.client.get("/api/overview").json
        self.assertEqual(overview["total_items"], 2)
        self.assertEqual(overview["total_units"], 15)
        self.assertEqual(overview["low_stock"], 1)
        self.assertEqual(len(overview["locations"]), 2)


if __name__ == "__main__":
    unittest.main()
