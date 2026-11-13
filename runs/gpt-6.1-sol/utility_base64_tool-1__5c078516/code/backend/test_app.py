import base64
import tempfile
import unittest
from pathlib import Path

from app import create_app


class ApiTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.app = create_app(self.directory.name)
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username="alice"):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "test-password"})
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/auth/login", json={"username": username, "password": "test-password"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def save(self, headers, value="Hello, world!", direction="encode"):
        return self.client.post("/api/conversions", headers=headers, json={"direction": direction, "input": value})

    def test_health_and_unknown_api(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        response = self.client.get("/api/missing")
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json)

    def test_utf8_and_empty_roundtrip(self):
        for text in ["", "Hello, world!", "你好 🌍 café\n\t", "\x00"]:
            with self.subTest(text=text):
                encoded = self.client.post("/api/base64/encode", json={"text": text})
                self.assertEqual(encoded.status_code, 200)
                self.assertEqual(encoded.json["encoded"], base64.b64encode(text.encode()).decode())
                decoded = self.client.post("/api/base64/decode", json=encoded.json)
                self.assertEqual(decoded.status_code, 200)
                self.assertEqual(decoded.json, {"text": text})

    def test_invalid_base64(self):
        for encoded in ["not base64!", "a", "Zg", "Zg===", "Zh==", "SGVsbG8=\n", "_-==", "你好", "/w=="]:
            with self.subTest(encoded=encoded):
                response = self.client.post("/api/base64/decode", json={"encoded": encoded})
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)

    def test_invalid_bodies(self):
        for body in [None, [], {}, {"text": 1}, {"text": None}]:
            response = self.client.post("/api/base64/encode", json=body)
            self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/base64/encode", data="{", content_type="application/json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/base64/encode", json={"text": "\ud800"})
        self.assertEqual(response.status_code, 400)

    def test_accounts_and_logout(self):
        headers = self.account()
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).json, {"username": "alice"})
        duplicate = self.client.post("/api/auth/register", json={"username": "ALICE", "password": "another"})
        self.assertEqual(duplicate.status_code, 409)
        incorrect = self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
        self.assertEqual(incorrect.status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout", headers=headers).status_code, 204)
        self.assertEqual(self.client.get("/api/conversions", headers=headers).status_code, 401)

    def test_authentication_required(self):
        for headers in [{}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic invalid"}]:
            self.assertEqual(self.client.get("/api/conversions", headers=headers).status_code, 401)
            self.assertEqual(self.save(headers).status_code, 401)
            self.assertEqual(self.client.delete("/api/conversions/1", headers=headers).status_code, 401)

    def test_private_history_and_delete(self):
        alice = self.account()
        bob = self.account("bob")
        response = self.save(alice)
        self.assertEqual(response.status_code, 201)
        saved = response.json
        self.assertEqual(saved["output"], "SGVsbG8sIHdvcmxkIQ==")
        self.assertEqual(set(saved), {"id", "direction", "input_preview", "output_preview", "created_at", "output"})
        self.assertEqual(self.client.get("/api/conversions", headers=bob).json["total"], 0)
        self.assertEqual(self.client.delete(f"/api/conversions/{saved['id']}", headers=bob).status_code, 404)
        listing = self.client.get("/api/conversions", headers=alice).json
        self.assertEqual(listing["total"], 1)
        self.assertNotIn("output", listing["items"][0])
        self.assertEqual(self.client.delete(f"/api/conversions/{saved['id']}", headers=alice).status_code, 204)
        self.assertEqual(self.client.get("/api/conversions", headers=alice).json["total"], 0)

    def test_pagination_previews_and_persistence(self):
        headers = self.account()
        ids = [self.save(headers, str(index) * 200).json["id"] for index in range(5)]
        listing = self.client.get("/api/conversions?page=2&page_size=2", headers=headers).json
        self.assertEqual(listing["total"], 5)
        self.assertEqual([item["id"] for item in listing["items"]], [ids[2], ids[1]])
        self.assertLessEqual(len(listing["items"][0]["input_preview"]), 160)
        self.assertEqual(listing["page"], 2)
        self.assertEqual(listing["page_size"], 2)
        restarted = create_app(Path(self.directory.name)).test_client()
        self.assertEqual(restarted.get("/api/conversions", headers=headers).json["total"], 5)

    def test_pagination_validation(self):
        headers = self.account()
        for query in ["page=0", "page=-1", "page=abc", "page=1.5", "page_size=0", "page_size=101", "page="]:
            self.assertEqual(self.client.get(f"/api/conversions?{query}", headers=headers).status_code, 400)

    def test_public_conversion_does_not_save(self):
        headers = self.account()
        self.client.post("/api/base64/encode", headers=headers, json={"text": "not saved"})
        self.assertEqual(self.client.get("/api/conversions", headers=headers).json["total"], 0)
        self.assertEqual(self.save(headers, "", "encode").json["output"], "")
        self.assertEqual(self.save(headers, "", "decode").json["output"], "")
        self.assertEqual(self.save(headers, "!", "decode").status_code, 400)
        self.assertEqual(self.save(headers, "test", "other").status_code, 400)
        self.assertEqual(self.client.get("/api/conversions", headers=headers).json["total"], 2)


if __name__ == "__main__":
    unittest.main()
