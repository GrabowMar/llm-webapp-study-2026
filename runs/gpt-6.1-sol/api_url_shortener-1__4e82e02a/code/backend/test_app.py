import hashlib
import sqlite3
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from backend.app import create_app


class ShortenerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = {
            "TESTING": True,
            "DATABASE": str(Path(self.directory.name) / "links.sqlite3"),
            "ADMIN_PASSWORD": "moderator-test-password",
        }
        self.app = create_app(self.config)
        self.client = self.app.test_client()
        self.alice = self.account("alice")
        self.bob = self.account("bob")
        self.admin = self.login("admin", self.config["ADMIN_PASSWORD"])

    def account(self, username):
        response = self.client.post(
            "/api/auth/register", json={"username": username, "password": "test-password"}
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.json)
        return self.login(username)

    def login(self, username, password="test-password"):
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["token"])
        return {"Authorization": f"Bearer {response.json['token']}"}

    def link(self, owner=None, url="https://example.com/a/long/path?source=test#section"):
        response = self.client.post(
            "/api/links", json={"original_url": url}, headers=owner or self.alice
        )
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_health(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})

    def test_registration_and_login_validation(self):
        for body in [{}, {"username": "bad name", "password": "pass"}, {"username": "ok", "password": ""}, {"username": 1, "password": "pass"}]:
            with self.subTest(body=body):
                response = self.client.post("/api/auth/register", json=body)
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ALICE", "password": "pass"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ADMIN", "password": "pass"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "unknown", "password": "pass"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/register", json=[]).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register", data="not-json").status_code, 400)

    def test_passwords_and_tokens_are_hashed(self):
        with closing(sqlite3.connect(self.config["DATABASE"])) as db:
            password = db.execute("SELECT password_hash FROM users WHERE username = 'alice'").fetchone()[0]
            self.assertNotEqual(password, "test-password")
            token = self.alice["Authorization"].split()[1]
            stored = db.execute("SELECT token_hash FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()[0]
            self.assertNotEqual(token, stored)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).json["username"], "alice")

    def test_protected_endpoints(self):
        link = self.link()
        for headers in [{}, {"Authorization": "Bearer invented-token"}, {"Authorization": "Basic hello"}, {"Authorization": "Bearer"}]:
            with self.subTest(headers=headers):
                self.assertEqual(self.client.post("/api/links", json={"original_url": "https://example.com"}, headers=headers).status_code, 401)
                self.assertEqual(self.client.delete(f"/api/links/{link['id']}", headers=headers).status_code, 401)
                self.assertEqual(self.client.get("/api/admin/links", headers=headers).status_code, 401)
                self.assertEqual(self.client.get("/api/links/mine", headers=headers).status_code, 401)
        self.assertEqual(self.client.get("/api/admin/links", headers=self.alice).status_code, 403)
        self.assertEqual(self.client.post(f"/api/admin/links/{link['id']}/toggle", headers=self.alice).status_code, 403)

    def test_link_shape_and_unique_codes(self):
        link = self.link()
        self.assertTrue({"id", "original_url", "short_code", "short_url", "click_count", "created_at", "owner"} <= link.keys())
        self.assertEqual(link["short_url"], f"/r/{link['short_code']}")
        self.assertEqual(link["owner"], "alice")
        self.assertEqual(link["click_count"], 0)
        self.assertTrue(link["is_active"])
        self.assertNotEqual(link["short_code"], self.link()["short_code"])
        self.assertEqual(self.client.get(f"/api/links/{link['id']}").json, link)

    def test_url_validation(self):
        for url in [None, "", "just a string", "ftp://example.com", "javascript:alert(1)", "//example.com", "https://", "http://example.com:abc", "https://example.com/a\nb", "https://exa mple.com", "https://example.com/" + "a" * 8192, 42]:
            with self.subTest(url=url):
                response = self.client.post("/api/links", json={"original_url": url}, headers=self.alice)
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.json)
        for url in ["http://example.com", "https://example.com/path?foo=bar#section", "https://[::1]:8080/path"]:
            with self.subTest(url=url):
                self.assertEqual(self.link(url=url)["original_url"], url)

    def test_redirect_counts_clicks_and_is_not_cached(self):
        link = self.link()
        for count in range(1, 4):
            response = self.client.get(link["short_url"])
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.headers["Location"], link["original_url"])
            self.assertEqual(response.headers["Cache-Control"], "no-store")
            self.assertEqual(self.client.get(f"/api/links/{link['id']}").json["click_count"], count)
        self.assertEqual(self.client.head(link["short_url"]).status_code, 302)
        self.assertEqual(self.client.get(f"/api/links/{link['id']}").json["click_count"], 3)
        self.assertEqual(self.client.get("/r/unknown").status_code, 404)

    def test_concurrent_clicks_are_not_lost(self):
        link = self.link()

        def visit(_index):
            with self.app.test_client() as client:
                return client.get(link["short_url"]).status_code

        with ThreadPoolExecutor(max_workers=8) as pool:
            self.assertEqual(list(pool.map(visit, range(24))), [302] * 24)
        self.assertEqual(self.client.get(f"/api/links/{link['id']}").json["click_count"], 24)

    def test_pagination_and_newest_first(self):
        links = [self.link() for _ in range(7)]
        response = self.client.get("/api/links?page=2&page_size=3")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["total"], 7)
        self.assertEqual(response.json["page"], 2)
        self.assertEqual(response.json["page_size"], 3)
        self.assertEqual([item["id"] for item in response.json["items"]], [link["id"] for link in links[::-1][3:6]])
        self.assertEqual(self.client.get("/api/links?page=99").json["items"], [])
        for query in ["page=0", "page=-1", "page=no", "page_size=0", "page_size=101", "page_size=2.5"]:
            with self.subTest(query=query):
                self.assertEqual(self.client.get(f"/api/links?{query}").status_code, 400)
                self.assertEqual(self.client.get(f"/api/admin/links?{query}", headers=self.admin).status_code, 400)

    def test_only_owner_can_delete(self):
        link = self.link()
        self.assertEqual(self.client.delete(f"/api/links/{link['id']}", headers=self.bob).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/links/{link['id']}", headers=self.admin).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/links/{link['id']}", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get(link["short_url"]).status_code, 404)
        self.assertEqual(self.client.get(f"/api/links/{link['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/admin/links", headers=self.admin).json["total"], 0)
        with closing(sqlite3.connect(self.config["DATABASE"])) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM links").fetchone()[0], 0)

    def test_admin_disables_and_reenables_links(self):
        link = self.link()
        self.client.get(link["short_url"])
        toggled = self.client.post(f"/api/admin/links/{link['id']}/toggle", headers=self.admin)
        self.assertEqual(toggled.status_code, 200)
        self.assertFalse(toggled.json["is_active"])
        self.assertEqual(self.client.get("/api/links").json["total"], 0)
        self.assertEqual(self.client.get(f"/api/links/{link['id']}").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/links/{link['id']}", headers=self.alice).status_code, 404)
        self.assertEqual(self.client.get(link["short_url"]).status_code, 404)
        moderated = self.client.get("/api/admin/links", headers=self.admin).json
        self.assertEqual(moderated["total"], 1)
        self.assertEqual(moderated["items"][0]["owner"], "alice")
        self.assertEqual(moderated["items"][0]["click_count"], 1)
        self.assertFalse(moderated["items"][0]["is_active"])
        self.assertTrue(self.client.post(f"/api/admin/links/{link['id']}/toggle", headers=self.admin).json["is_active"])
        self.assertEqual(self.client.get(link["short_url"]).status_code, 302)
        self.assertEqual(self.client.get("/api/links").json["items"][0]["click_count"], 2)
        self.assertEqual(self.client.post("/api/admin/links/99999/toggle", headers=self.admin).status_code, 404)

    def test_admin_paging_includes_disabled(self):
        links = [self.link() for _ in range(4)]
        self.client.post(f"/api/admin/links/{links[1]['id']}/toggle", headers=self.admin)
        response = self.client.get("/api/admin/links?page=2&page_size=2", headers=self.admin).json
        self.assertEqual(response["total"], 4)
        self.assertEqual(response["page"], 2)
        self.assertEqual([item["id"] for item in response["items"]], [links[1]["id"], links[0]["id"]])
        self.assertFalse(response["items"][0]["is_active"])

    def test_restart_preserves_links_counts_and_tokens(self):
        link = self.link()
        self.client.get(link["short_url"])
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/links/{link['id']}").json["click_count"], 1)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.alice).status_code, 200)
        self.assertEqual(restarted.get("/api/admin/links", headers=self.admin).status_code, 200)
        self.assertEqual(restarted.get(link["short_url"]).status_code, 302)

    def test_admin_disabled_without_environment_password(self):
        disabled = create_app({**self.config, "ADMIN_PASSWORD": ""}).test_client()
        self.assertEqual(disabled.post("/api/auth/login", json={"username": "admin", "password": self.config["ADMIN_PASSWORD"]}).status_code, 401)
        self.assertEqual(disabled.get("/api/admin/links", headers=self.admin).status_code, 401)
        self.assertEqual(disabled.get("/api/auth/me", headers=self.alice).status_code, 200)

    def test_admin_password_rotation_invalidates_old_sessions(self):
        rotated = create_app({**self.config, "ADMIN_PASSWORD": "new-moderator-password"}).test_client()
        self.assertEqual(rotated.get("/api/admin/links", headers=self.admin).status_code, 401)
        self.assertEqual(rotated.post("/api/auth/login", json={"username": "admin", "password": self.config["ADMIN_PASSWORD"]}).status_code, 401)
        self.assertEqual(rotated.post("/api/auth/login", json={"username": "admin", "password": "new-moderator-password"}).status_code, 200)

    def test_logout_and_expiration(self):
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.alice).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.alice).status_code, 401)
        with closing(sqlite3.connect(self.config["DATABASE"])) as db, db:
            db.execute("UPDATE sessions SET expires_at = ?", (int(time.time()) - 1,))
        self.assertEqual(self.client.get("/api/auth/me", headers=self.bob).status_code, 401)

    def test_search_my_links_and_stats(self):
        alice = self.link(url="https://example.com/alice")
        self.link(owner=self.bob, url="https://example.com/bob")
        self.client.get(alice["short_url"])
        mine = self.client.get("/api/links/mine", headers=self.alice).json
        self.assertEqual(mine["total"], 1)
        self.assertEqual(mine["items"][0]["id"], alice["id"])
        self.assertEqual(self.client.get("/api/links?q=alice").json["total"], 1)
        self.assertEqual(self.client.get("/api/links?q=nothing").json["total"], 0)
        self.assertEqual(self.client.get("/api/stats").json, {"total_links": 2, "total_clicks": 1, "links_today": 2})

    def test_frontend_fallback_does_not_swallow_api_or_redirects(self):
        dist = Path(self.directory.name) / "dist"
        dist.mkdir()
        (dist / "index.html").write_text("<html>Trim frontend</html>")
        (dist / "asset.js").write_text("window.app = true;")
        with patch("backend.app.DIST", dist):
            with self.client.get("/") as response:
                self.assertIn(b"Trim frontend", response.data)
            with self.client.get("/some/frontend/route") as response:
                self.assertIn(b"Trim frontend", response.data)
            with self.client.get("/asset.js") as response:
                self.assertIn(b"window.app", response.data)
            for path in ["/api/unknown", "/api", "/r", "/r/unknown", "/r/unknown/extra"]:
                self.assertEqual(self.client.get(path).status_code, 404)
            self.assertEqual(self.client.post("/r/unknown").status_code, 405)


if __name__ == "__main__":
    unittest.main()
