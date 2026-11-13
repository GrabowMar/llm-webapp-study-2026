import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent


class ProductionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.server = None
        self.start()

    def start(self):
        self.server = subprocess.Popen(
            [sys.executable, "-m", "gunicorn", "--bind", f"127.0.0.1:{self.port}",
             "--pythonpath", "backend", "app:app"],
            cwd=ROOT,
            env={**os.environ, "RECIPE_DATABASE": str(Path(self.temp.name) / "recipes.sqlite3")},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        for _ in range(100):
            try:
                if self.request("/api/health")[1] == {"status": "ok"}:
                    return
            except (URLError, ConnectionError):
                time.sleep(0.1)
            if self.server.poll() is not None:
                self.fail(self.server.stderr.read().decode())
        self.fail("Gunicorn did not become ready.")

    def stop(self):
        if self.server:
            self.server.terminate()
            try:
                self.server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.server.kill()
                self.server.wait(timeout=5)
            self.server.stderr.close()
            self.server = None

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def request(self, path, method="GET", body=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        request = Request(f"http://127.0.0.1:{self.port}{path}",
                          data=json.dumps(body).encode() if body else None, headers=headers, method=method)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            content = response.read().decode()
            data = json.loads(content) if "application/json" in response.headers.get("Content-Type", "") else content
            return response.status, data

    def test_production_frontend_and_restart_persistence(self):
        status, html = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn("Table & Thyme", html)
        self.assertEqual(self.request("/recipes/1")[0], 200)
        for asset in (ROOT / "frontend" / "dist" / "assets").iterdir():
            self.assertEqual(self.request(f"/assets/{asset.name}")[0], 200)
        self.assertEqual(self.request("/assets/missing.js")[0], 404)
        self.assertEqual(self.request("/api/missing")[0], 404)
        credentials = {"username": "restartcook", "password": "restart-password"}
        self.assertEqual(self.request("/api/auth/register", "POST", credentials)[0], 201)
        token = self.request("/api/auth/login", "POST", credentials)[1]["token"]
        recipe = {"title": "Persistent soup", "category": "Lunch", "ingredients": ["1 onion", "Water"],
                  "instructions": "Chop.\nSimmer.", "prep_minutes": 20, "servings": 2}
        status, created = self.request("/api/recipes", "POST", recipe, token)
        self.assertEqual(status, 201)
        self.stop()
        self.start()
        self.assertEqual(self.request(f"/api/recipes/{created['id']}")[1], created)
        self.assertEqual(self.request("/api/recipes")[1]["total"], 6)
        self.assertEqual(self.request("/api/auth/me", token=token)[1], {"username": "restartcook"})


if __name__ == "__main__":
    unittest.main()
