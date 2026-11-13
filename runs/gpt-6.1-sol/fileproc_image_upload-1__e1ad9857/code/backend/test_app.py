import base64
import sqlite3
import tempfile
import unittest
from contextlib import closing
from io import BytesIO

from PIL import Image

from backend.app import create_app


class GalleryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.app = create_app({"TESTING": True, "DATA_DIR": self.directory.name})
        self.client = self.app.test_client()
        self.owner = self.account("alice")
        self.other = self.account("bob")

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username):
        credentials = {"username": username, "password": "a-secure-password"}
        self.assertEqual(self.client.post("/api/auth/register", json=credentials).status_code, 201)
        response = self.client.post("/api/auth/login", json=credentials)
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def image_bytes(self, format="PNG"):
        buffer = BytesIO()
        Image.new("RGB", (12, 8), "coral").save(buffer, format=format)
        return buffer.getvalue()

    def upload(self, headers=None, format="PNG", **overrides):
        data = {"filename": "same.jpg", "data": base64.b64encode(self.image_bytes(format)).decode()}
        data.update(overrides)
        return self.client.post("/api/images", json=data, headers=self.owner if headers is None else headers)

    def test_health_and_empty_gallery(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/images").json, {"items": [], "total": 0, "page": 1, "page_size": 12})

    def test_authentication_and_logout(self):
        self.assertEqual(self.client.post("/api/images", json={}).status_code, 401)
        self.assertEqual(self.client.delete("/api/images/1").status_code, 401)
        self.assertEqual(self.client.post("/api/images", json={}, headers={"Authorization": "Bearer wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "Alice", "password": "pass"}).status_code, 409)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.owner).json, {"username": "alice"})
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.owner).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.owner).status_code, 401)

    def test_content_detection_metadata_and_unchanged_files(self):
        for format, content_type, filename in [("PNG", "image/png", "picture.jpg"), ("JPEG", "image/jpeg", "picture.png")]:
            with self.subTest(format=format):
                response = self.upload(format=format, filename=filename, title="A quiet moment")
                self.assertEqual(response.status_code, 201)
                image = response.json
                self.assertEqual(set(image), {"id", "filename", "title", "content_type", "size_bytes", "uploaded_at", "url", "uploader"})
                self.assertEqual(image["content_type"], content_type)
                self.assertEqual(image["uploader"], "alice")
                self.assertEqual(image["filename"], filename)
                self.assertEqual(image["title"], "A quiet moment")
                self.assertEqual(image["size_bytes"], len(self.image_bytes(format)))
                file = self.client.get(image["url"])
                self.assertEqual(file.data, self.image_bytes(format))
                self.assertEqual(file.content_type, content_type)
                self.assertEqual(self.client.get(f"/api/images/{image['id']}").json, image)

    def test_duplicates_pagination_and_search(self):
        ids = [self.upload(title=f"Picture {n}").json["id"] for n in range(3)]
        first = self.client.get("/api/images?page=1&page_size=2").json
        self.assertEqual(first["total"], 3)
        self.assertEqual([item["id"] for item in first["items"]], ids[::-1][:2])
        second = self.client.get("/api/images?page=2&page_size=2").json
        self.assertEqual([item["id"] for item in second["items"]], ids[:1])
        self.assertEqual(self.client.get("/api/images?q=Picture%201").json["total"], 1)
        self.assertEqual(self.client.get("/api/images?uploader=bob").json["total"], 0)
        for query in ["page=0", "page=abc", "page_size=0", "page_size=101", "page=-1"]:
            self.assertEqual(self.client.get("/api/images?" + query).status_code, 400)

    def test_owner_only_delete_and_file_removed(self):
        image = self.upload().json
        self.assertEqual(self.client.delete(f"/api/images/{image['id']}", headers=self.other).status_code, 403)
        self.assertEqual(self.client.get(image["url"]).status_code, 200)
        self.assertEqual(self.client.delete(f"/api/images/{image['id']}", headers=self.owner).status_code, 200)
        self.assertEqual(self.client.get(image["url"]).status_code, 404)
        self.assertEqual(self.client.get(f"/api/images/{image['id']}").status_code, 404)
        self.assertEqual(self.client.get("/api/images").json["total"], 0)
        with closing(sqlite3.connect(self.app.config["DATABASE"])) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM image_files").fetchone()[0], 0)

    def test_reject_invalid_inputs(self):
        for body in [None, [], {}, {"username": [], "password": "test"}, {"username": "a", "password": ""}]:
            self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 400)
        for overrides in [{"data": "!!!"}, {"data": "a"}, {"data": base64.b64encode(b"not an image").decode()}, {"data": ""}, {"title": 42}, {"filename": ""}, {"filename": "a\x00.jpg"}]:
            self.assertEqual(self.upload(**overrides).status_code, 400)
        self.assertEqual(self.upload(format="GIF").status_code, 400)
        raw = self.image_bytes()[:30]
        self.assertEqual(self.upload(data=base64.b64encode(raw).decode()).status_code, 400)
        self.assertEqual(self.client.get("/api/not-real").status_code, 404)
        self.assertEqual(self.client.get("/api/not-real").content_type, "application/json")

    def test_oversize_rejected(self):
        self.assertEqual(self.upload(data="A" * (21 * 1024 * 1024)).status_code, 413)

    def test_persistence_across_restart(self):
        image = self.upload().json
        restarted = create_app({"TESTING": True, "DATA_DIR": self.directory.name}).test_client()
        self.assertEqual(restarted.get(image["url"]).data, self.image_bytes())
        self.assertEqual(restarted.get("/api/images").json["total"], 1)
        self.assertEqual(restarted.get("/api/auth/me", headers=self.owner).status_code, 200)


if __name__ == "__main__":
    unittest.main()
