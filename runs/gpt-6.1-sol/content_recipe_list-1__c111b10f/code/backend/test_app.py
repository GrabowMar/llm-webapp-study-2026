import tempfile
import unittest
from pathlib import Path

from backend.app import create_app, get_db


class RecipeApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = str(Path(self.temp.name) / "recipes.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def account(self, username="testcook"):
        credentials = {"username": username, "password": "secure-password"}
        self.assertEqual(self.client.post("/api/auth/register", json=credentials).status_code, 201)
        response = self.client.post("/api/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def recipe(self, **changes):
        return {"title": "A lovely lunch", "category": "Lunch", "prep_minutes": 20,
                "servings": 2, "ingredients": ["First ingredient", "Second ingredient"],
                "instructions": "\nFirst step.\n\nSecond step.\n", **changes}

    def test_health_and_samples(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        result = self.client.get("/api/recipes").json
        self.assertTrue(3 <= result["total"] <= 5)
        self.assertGreaterEqual(len({item["category"] for item in result["items"]}), 2)
        self.assertEqual(set(result), {"items", "total", "page", "page_size"})
        self.assertEqual(set(result["items"][0]), {"id", "title", "category", "prep_minutes", "author"})
        full = self.client.get(f"/api/recipes/{result['items'][0]['id']}").json
        self.assertEqual(set(full), {"id", "title", "ingredients", "instructions", "category", "prep_minutes", "servings", "created_at", "author"})

    def test_authentication_and_logout(self):
        headers = self.account()
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).json["username"], "testcook")
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "testcook", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout", headers=headers).status_code, 204)
        self.assertEqual(self.client.post("/api/recipes", headers=headers, json=self.recipe()).status_code, 401)
        self.assertEqual(self.client.post("/api/recipes", json=self.recipe()).status_code, 401)
        self.assertEqual(self.client.post("/api/recipes", headers={"Authorization": "Bearer invalid"}, json=self.recipe()).status_code, 401)

    def test_duplicate_and_account_validation(self):
        self.account()
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "TESTCOOK", "password": "secure-password"}).status_code, 409)
        invalid = self.client.post("/api/auth/register", json={"username": "!", "password": "short"})
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(set(invalid.json["errors"]), {"username", "password"})

    def test_crud_and_ownership(self):
        headers = self.account()
        other = self.account("anothercook")
        created = self.client.post("/api/recipes", headers=headers, json=self.recipe())
        self.assertEqual(created.status_code, 201)
        recipe = created.json
        path = f"/api/recipes/{recipe['id']}"
        self.assertEqual(recipe["ingredients"], self.recipe()["ingredients"])
        self.assertEqual(recipe["instructions"], self.recipe()["instructions"])
        self.assertEqual(recipe["author"], "testcook")
        self.assertEqual(self.client.put(path, headers=other, json=self.recipe()).status_code, 403)
        self.assertEqual(self.client.delete(path, headers=other).status_code, 403)
        self.assertEqual(self.client.put(path, json=self.recipe()).status_code, 401)
        updated = self.client.put(path, headers=headers, json=self.recipe(title="Updated", ingredients=["Second", "First"]))
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json["ingredients"], ["Second", "First"])
        self.assertEqual(updated.json["created_at"], recipe["created_at"])
        self.assertEqual(self.client.delete(path, headers=headers).status_code, 204)
        self.assertEqual(self.client.get(path).status_code, 404)

    def test_filters_paging_and_newest_first(self):
        headers = self.account()
        first = self.client.post("/api/recipes", headers=headers, json=self.recipe(title="Unique 100% pasta")).json
        second = self.client.post("/api/recipes", headers=headers, json=self.recipe(title="Unique soup", category="Dinner")).json
        result = self.client.get("/api/recipes?q=unique&page_size=1").json
        self.assertEqual(result["total"], 2)
        self.assertEqual(result["items"][0]["id"], second["id"])
        self.assertEqual(self.client.get("/api/recipes?q=unique&page_size=1&page=2").json["items"][0]["id"], first["id"])
        self.assertEqual(self.client.get("/api/recipes?q=unique&category=lunch").json["total"], 1)
        self.assertEqual(self.client.get("/api/recipes?q=%25").json["total"], 1)
        self.assertEqual(self.client.get("/api/recipes?page=99").json["items"], [])
        for query in ("page=0", "page=hello", "page_size=101", "page_size=-1"):
            self.assertEqual(self.client.get("/api/recipes?" + query).status_code, 400)

    def test_recipe_validation_and_json_errors(self):
        headers = self.account()
        for changes in ({"ingredients": []}, {"ingredients": ["ok", ""]}, {"title": " "}, {"category": 2}, {"prep_minutes": True}, {"servings": 0}, {"instructions": ""}):
            response = self.client.post("/api/recipes", headers=headers, json=self.recipe(**changes))
            self.assertEqual(response.status_code, 400)
            self.assertIn(next(iter(changes)), response.json["errors"])
        response = self.client.post("/api/recipes", headers=headers, data="{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/missing").status_code, 404)
        self.assertTrue(self.client.get("/api/missing").is_json)
        self.assertEqual(self.client.patch("/api/recipes/1").status_code, 405)

    def test_persistence_and_no_reseeding(self):
        headers = self.account()
        created = self.client.post("/api/recipes", headers=headers, json=self.recipe()).json
        with self.app.app_context():
            db = get_db()
            with db:
                db.execute("DELETE FROM recipes WHERE id != ?", (created["id"],))
        restarted = create_app({"TESTING": True, "DATABASE": self.database}).test_client()
        self.assertEqual(restarted.get("/api/recipes").json["total"], 1)
        self.assertEqual(restarted.get(f"/api/recipes/{created['id']}").json["title"], created["title"])
        self.assertEqual(restarted.get("/api/auth/me", headers=headers).status_code, 200)


if __name__ == "__main__":
    unittest.main()
