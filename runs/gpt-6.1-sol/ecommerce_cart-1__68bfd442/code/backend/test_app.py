import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from shop import connect_database, create_app


class ShopTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = {
            "TESTING": True,
            "DATABASE": str(Path(self.directory.name) / "shop.sqlite3"),
            "ADMIN_PASSWORD": "test-admin-secret",
        }
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.admin = self.login("admin", "test-admin-secret")
        self.user = self.register("alice")
        self.other = self.register("bob")
        self.product = self.client.get("/api/products").json["items"][0]

    def tearDown(self):
        self.directory.cleanup()

    def login(self, username, password):
        response = self.client.post("/api/auth/login", json={"username": username, "password": password})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def register(self, username):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "secret"})
        self.assertEqual(response.status_code, 201)
        return self.login(username, "secret")

    def add(self, quantity=1, headers=None, **extra):
        return self.client.post(
            "/api/cart",
            headers=headers or self.user,
            json={"product_id": self.product["id"], "quantity": quantity, **extra},
        )

    def patch_product(self, **fields):
        return self.client.patch(f"/api/admin/products/{self.product['id']}", headers=self.admin, json=fields)

    def test_health_and_seed(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        result = self.client.get("/api/products?page_size=100").json
        self.assertGreaterEqual(result["total"], 8)
        self.assertTrue(all(product["stock"] >= 10 for product in result["items"]))
        names = [product["name"] for product in result["items"]]
        self.assertEqual(names, sorted(names, key=str.lower))
        self.assertEqual(set(self.product), {"id", "name", "description", "price", "stock", "is_active"})

    def test_factory_import_does_not_initialize_database(self):
        backend = str(Path(__file__).resolve().parent)
        subprocess.run(
            [sys.executable, "-c", f"import sys; sys.path.insert(0, {backend!r}); import shop"],
            cwd=self.directory.name,
            check=True,
            capture_output=True,
        )
        self.assertFalse((Path(self.directory.name) / "data").exists())

    def test_paging_and_search(self):
        first = self.client.get("/api/products?page=1&page_size=3").json
        second = self.client.get("/api/products?page=2&page_size=3").json
        self.assertEqual(len(first["items"]), 3)
        self.assertFalse({p["id"] for p in first["items"]} & {p["id"] for p in second["items"]})
        self.assertEqual(self.client.get("/api/products?q=amber").json["total"], 1)
        self.assertEqual(self.client.get("/api/products?q=%25").json["total"], 0)
        for query in ("page=0", "page=-1", "page=abc", "page_size=0", "page_size=101"):
            self.assertEqual(self.client.get("/api/products?" + query).status_code, 400)

    def test_credentials_and_permissions(self):
        self.assertEqual(
            self.client.post("/api/auth/register", json={"username": "Admin", "password": "x"}).status_code, 409
        )
        self.assertEqual(
            self.client.post("/api/auth/register", json={"username": "Alice", "password": "x"}).status_code, 409
        )
        self.assertEqual(
            self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401
        )
        for url in ("/api/cart", "/api/admin/products", "/api/auth/me"):
            self.assertEqual(self.client.get(url).status_code, 401)
            self.assertEqual(self.client.get(url, headers={"Authorization": "Bearer invalid"}).status_code, 401)
        self.assertEqual(self.client.post("/api/admin/products", headers=self.user, json={}).status_code, 403)

    def test_cart_uses_current_price_and_merges_without_changing_stock(self):
        first = self.add(2, unit_price=0.01, price=0.01)
        self.assertEqual(first.status_code, 201)
        second = self.add(1)
        self.assertEqual(first.json["id"], second.json["id"])
        self.assertEqual(second.json["quantity"], 3)
        self.assertEqual(self.client.get(f"/api/products/{self.product['id']}").json["stock"], self.product["stock"])
        self.assertEqual(self.patch_product(price=19.99).status_code, 200)
        cart = self.client.get("/api/cart", headers=self.user).json
        self.assertEqual(cart["items"][0]["unit_price"], 19.99)
        self.assertEqual(cart["items"][0]["line_total"], 59.97)
        self.assertEqual(cart["subtotal"], 59.97)

    def test_cart_ownership(self):
        item = self.add().json
        self.assertEqual(self.client.get("/api/cart", headers=self.other).json, {"items": [], "subtotal": 0})
        self.assertEqual(
            self.client.patch(f"/api/cart/{item['id']}", headers=self.other, json={"quantity": 2}).status_code, 404
        )
        self.assertEqual(self.client.delete(f"/api/cart/{item['id']}", headers=self.other).status_code, 404)
        self.assertEqual(self.client.get("/api/cart", headers=self.user).json["items"][0]["quantity"], 1)

    def test_cart_validation(self):
        for quantity in (0, -1, True, 1.5, "2", None, self.product["stock"] + 1):
            response = self.add(quantity)
            self.assertEqual(response.status_code, 400)
            self.assertIn("message", response.json)
        self.add(self.product["stock"])
        self.assertEqual(self.add().status_code, 400)
        self.patch_product(stock=0)
        self.assertEqual(self.add().status_code, 400)

    def test_inactive_products_are_hidden_and_cart_items_preserved(self):
        item = self.add(2).json
        self.patch_product(is_active=False)
        self.assertEqual(self.client.get(f"/api/products/{self.product['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/products?q=amber").json["total"], 0)
        self.assertEqual(self.client.get("/api/cart", headers=self.user).json, {"items": [], "subtotal": 0})
        self.assertEqual(self.add().status_code, 404)
        admin_items = self.client.get("/api/admin/products?page_size=100", headers=self.admin).json["items"]
        self.assertTrue(any(p["id"] == self.product["id"] and not p["is_active"] for p in admin_items))
        self.patch_product(is_active=True)
        self.assertEqual(self.client.get("/api/cart", headers=self.user).json["items"][0]["id"], item["id"])

    def test_patch_remove_and_oldest_order(self):
        first = self.add().json
        other_product = self.client.get("/api/products").json["items"][1]
        second = self.client.post(
            "/api/cart", headers=self.user, json={"product_id": other_product["id"], "quantity": 1}
        ).json
        response = self.client.patch(f"/api/cart/{first['id']}", headers=self.user, json={"quantity": 4})
        self.assertEqual(response.json["quantity"], 4)
        self.assertEqual(
            [i["id"] for i in self.client.get("/api/cart", headers=self.user).json["items"]],
            [first["id"], second["id"]],
        )
        self.assertEqual(self.client.delete(f"/api/cart/{first['id']}", headers=self.user).status_code, 204)
        self.assertEqual(self.client.delete(f"/api/cart/{first['id']}", headers=self.user).status_code, 404)

    def test_admin_creation_and_validation(self):
        response = self.client.post(
            "/api/admin/products",
            headers=self.admin,
            json={
                "name": "New object",
                "description": "Something nice",
                "price": 12.50,
                "stock": 12,
                "is_active": True,
            },
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.get(f"/api/products/{response.json['id']}").json, response.json)
        for fields in (
            {"price": -1},
            {"price": 1.001},
            {"price": True},
            {"price": "NaN"},
            {"stock": -1},
            {"stock": 2.5},
            {"is_active": "false"},
            {"name": " "},
            {"unknown": 1},
        ):
            self.assertEqual(self.patch_product(**fields).status_code, 400)

    def test_restart_preserves_accounts_tokens_and_cart(self):
        item = self.add(3).json
        self.patch_product(price=17.25)
        restarted = create_app(self.config).test_client()
        cart = restarted.get("/api/cart", headers=self.user).json
        self.assertEqual(cart["items"][0]["id"], item["id"])
        self.assertEqual(cart["subtotal"], 51.75)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.admin).status_code, 200)

    def test_admin_disabled_and_password_rotation(self):
        disabled = create_app({**self.config, "ADMIN_PASSWORD": ""}).test_client()
        self.assertEqual(
            disabled.post("/api/auth/login", json={"username": "admin", "password": "test-admin-secret"}).status_code,
            401,
        )
        self.assertEqual(disabled.get("/api/auth/me", headers=self.admin).status_code, 401)
        changed = create_app({**self.config, "ADMIN_PASSWORD": "new-secret"}).test_client()
        self.assertEqual(
            changed.post("/api/auth/login", json={"username": "admin", "password": "new-secret"}).status_code, 200
        )
        self.assertEqual(changed.get("/api/auth/me", headers=self.admin).status_code, 401)

    def test_logout_revokes_token_and_secrets_are_hashed(self):
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.user).status_code, 200)
        self.assertEqual(self.client.get("/api/cart", headers=self.user).status_code, 401)
        connection = connect_database(self.config["DATABASE"])
        try:
            user = connection.execute("SELECT * FROM users WHERE username = 'alice'").fetchone()
            self.assertNotEqual(user["password_hash"], "secret")
            session = connection.execute("SELECT token_hash FROM sessions LIMIT 1").fetchone()
            self.assertEqual(len(session["token_hash"]), 64)
        finally:
            connection.close()

    def test_unknown_api_and_invalid_json(self):
        self.assertEqual(self.client.get("/api/missing").status_code, 404)
        for body in (None, [], "not-an-object"):
            self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 400)


if __name__ == "__main__":
    unittest.main()
