import hashlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from backend.app import DIST, PREVIEW_FIELDS, create_app
from backend.preview import PreviewError


def fixture_preview(url="https://example.com/", title="A good find"):
    return {
        "url": url,
        "final_url": "https://example.com/article",
        "status_code": 200,
        "title": title,
        "description": "A useful description.",
        "image_url": "https://example.com/image.png",
        "fetched_at": "2026-11-10T12:00:00+00:00",
    }


class AppTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = {"TESTING": True, "DATABASE": str(Path(self.directory.name) / "app.sqlite3")}
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.headers = self.account("alice")

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "secret"})
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/auth/login", json={"username": username, "password": "secret"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def add(self, url="https://example.com/", title="A good find"):
        with patch("backend.app.fetch_preview", return_value=fixture_preview(url, title)):
            response = self.client.post("/api/previews", json={"url": url}, headers=self.headers)
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_health_and_unknown_api(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        response = self.client.get("/api/not-a-route")
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json)
        self.assertEqual(self.client.post("/api/health").status_code, 405)

    def test_registration_validation_and_duplicates(self):
        response = self.client.post("/api/auth/register", json={"username": "alice", "password": "other"})
        self.assertEqual(response.status_code, 409)
        for body in (None, [], {}, {"username": 1, "password": "secret"},
                     {"username": "   ", "password": "secret"},
                     {"username": "user", "password": ""},
                     {"username": "user\nname", "password": "secret"}):
            with self.subTest(body=body):
                response = self.client.post("/api/auth/register", json=body)
                self.assertEqual(response.status_code, 400)

    def test_login_rejects_wrong_password(self):
        for username, password in (("alice", "wrong"), ("unknown", "secret")):
            response = self.client.post("/api/auth/login", json={"username": username, "password": password})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.headers).json, {"username": "alice"})

    def test_credentials_and_tokens_are_hashed(self):
        with closing(sqlite3.connect(self.config["DATABASE"])) as database:
            password_hash = database.execute("SELECT password_hash FROM users").fetchone()[0]
            token_hash = database.execute("SELECT token_hash FROM tokens").fetchone()[0]
        token = self.headers["Authorization"].split()[1]
        self.assertNotEqual(password_hash, "secret")
        self.assertEqual(token_hash, hashlib.sha256(token.encode()).hexdigest())

    def test_all_preview_routes_require_authentication(self):
        for method, path in (("GET", "/api/previews"), ("POST", "/api/previews"),
                             ("GET", "/api/previews/1"), ("POST", "/api/previews/1/refresh"),
                             ("DELETE", "/api/previews/1")):
            for authorization in (None, "Bearer invalid", "Basic invalid", "Bearer"):
                with self.subTest(method=method, path=path, authorization=authorization):
                    response = self.client.open(path, method=method, headers={"Authorization": authorization} if authorization else {})
                    self.assertEqual(response.status_code, 401)

    def test_create_get_and_delete(self):
        preview = self.add()
        self.assertEqual(set(preview), set(PREVIEW_FIELDS))
        self.assertEqual(self.client.get(f"/api/previews/{preview['id']}", headers=self.headers).json, preview)
        response = self.client.delete(f"/api/previews/{preview['id']}", headers=self.headers)
        self.assertEqual(response.status_code, 204)
        self.assertEqual(self.client.get(f"/api/previews/{preview['id']}", headers=self.headers).status_code, 404)

    def test_users_cannot_read_refresh_or_delete_each_others_links(self):
        preview = self.add()
        bob = self.account("bob")
        self.assertEqual(self.client.get("/api/previews", headers=bob).json["total"], 0)
        with patch("backend.app.fetch_preview") as fetch:
            for method, suffix in (("GET", ""), ("POST", "/refresh"), ("DELETE", "")):
                response = self.client.open(f"/api/previews/{preview['id']}{suffix}", method=method, headers=bob)
                self.assertEqual(response.status_code, 404)
            fetch.assert_not_called()
        self.assertEqual(self.client.get(f"/api/previews/{preview['id']}", headers=self.headers).status_code, 200)

    def test_pagination_is_newest_first(self):
        previews = [self.add(title=f"Link {index}") for index in range(5)]
        response = self.client.get("/api/previews?page=2&page_size=2", headers=self.headers)
        self.assertEqual(response.json, {"items": [previews[2], previews[1]], "total": 5, "page": 2, "page_size": 2})
        self.assertEqual(self.client.get("/api/previews?page=10&page_size=2", headers=self.headers).json["items"], [])

    def test_invalid_pagination(self):
        for query in ("page=0", "page=-1", "page=no", "page=1.2", "page_size=0", "page_size=101", "page_size=no"):
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/previews?{query}", headers=self.headers).status_code, 400)

    def test_refresh_updates_without_reordering(self):
        first = self.add()
        second = self.add()
        updated = fixture_preview(title="Fresh title")
        updated["fetched_at"] = "2026-11-11T12:00:00+00:00"
        with patch("backend.app.fetch_preview", return_value=updated) as fetch:
            response = self.client.post(f"/api/previews/{first['id']}/refresh", headers=self.headers)
            fetch.assert_called_once_with(first["url"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["id"], first["id"])
        self.assertEqual(response.json["title"], "Fresh title")
        items = self.client.get("/api/previews", headers=self.headers).json["items"]
        self.assertEqual([item["id"] for item in items], [second["id"], first["id"]])

    def test_failed_fetch_does_not_save_or_destroy_preview(self):
        original = self.add()
        with patch("backend.app.fetch_preview", side_effect=PreviewError("Unreachable", 502)):
            self.assertEqual(self.client.post("/api/previews", json={"url": "https://example.com"}, headers=self.headers).status_code, 502)
            self.assertEqual(self.client.post(f"/api/previews/{original['id']}/refresh", headers=self.headers).status_code, 502)
        self.assertEqual(self.client.get(f"/api/previews/{original['id']}", headers=self.headers).json, original)
        self.assertEqual(self.client.get("/api/previews", headers=self.headers).json["total"], 1)

    def test_invalid_url_and_json_are_json_errors(self):
        for body in ({}, {"url": "file:///etc/passwd"}, {"url": "javascript:alert(1)"}, {"url": 42}, []):
            response = self.client.post("/api/previews", json=body, headers=self.headers)
            self.assertEqual(response.status_code, 400)
            self.assertIn("error", response.json)

    def test_accounts_tokens_and_previews_survive_restart(self):
        preview = self.add()
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/previews/{preview['id']}", headers=self.headers).json, preview)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.headers).json, {"username": "alice"})

    def test_logout_revokes_token(self):
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get("/api/previews", headers=self.headers).status_code, 401)

    def test_expired_token_is_rejected(self):
        with closing(sqlite3.connect(self.config["DATABASE"])) as database, database:
            database.execute("UPDATE tokens SET expires_at = '2000-01-01T00:00:00+00:00'")
        self.assertEqual(self.client.get("/api/previews", headers=self.headers).status_code, 401)

    def test_request_size_is_bounded(self):
        response = self.client.post("/api/previews", json={"url": "x" * 20000}, headers=self.headers)
        self.assertEqual(response.status_code, 413)
        self.assertIn("error", response.json)

    @unittest.skipUnless((DIST / "index.html").is_file(), "Build the frontend to test static serving.")
    def test_production_frontend_and_assets_are_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Marginal", response.data)
        response.close()
        response = self.client.get("/illustration.svg")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/svg+xml")
        response.close()
        response = self.client.get("/a/frontend/route")
        self.assertEqual(response.status_code, 200)
        response.close()


if __name__ == "__main__":
    unittest.main()
