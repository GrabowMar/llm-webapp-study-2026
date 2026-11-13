import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = build_opener(NoRedirect)


def request(path, method="GET", data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(
        "http://127.0.0.1:8000" + path,
        data=json.dumps(data).encode() if data is not None else None,
        method=method,
        headers=headers,
    )
    try:
        response = opener.open(req, timeout=5)
    except HTTPError as error:
        response = error
    with response:
        body = response.read()
        return response.status, response.headers, body


def api(path, method="GET", data=None, token=None, expected=200):
    status, _, body = request(path, method, data, token)
    assert status == expected, (path, status, body)
    return json.loads(body) if body else None


with socket.socket() as probe:
    probe.bind(("127.0.0.1", 8000))

with tempfile.TemporaryDirectory(dir="/workspace/frontend/.browser") as directory:
    server = None

    def start():
        process = subprocess.Popen(
            [sys.executable, "-m", "gunicorn", "--bind", "0.0.0.0:8000", "--pythonpath", "/workspace/backend", "app:app"],
            cwd=directory,
            env={**os.environ, "ADMIN_PASSWORD": ""},
        )
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Gunicorn exited before becoming healthy")
            try:
                if api("/api/health") == {"status": "ok"}:
                    return process
            except (URLError, ConnectionError):
                pass
            time.sleep(0.1)
        process.terminate()
        process.wait(timeout=10)
        raise RuntimeError("Gunicorn did not become healthy")

    def stop(process):
        process.terminate()
        process.wait(timeout=10)

    try:
        server = start()
        status, headers, body = request("/")
        assert status == 200 and "text/html" in headers["Content-Type"]
        assets = re.findall(r'(?:src|href)="(/assets/[^\"]+)"', body.decode())
        assert len(assets) == 2
        for asset in assets:
            assert request(asset)[0] == 200
        assert request("/r/unknown")[0] == 404
        assert request("/api/unknown")[0] == 404
        credentials = {"username": "production_smoke", "password": "smoke-test-password"}
        api("/api/auth/register", "POST", credentials, expected=201)
        token = api("/api/auth/login", "POST", credentials)["token"]
        original = "https://example.com/production?source=smoke#check"
        link = api("/api/links", "POST", {"original_url": original}, token, expected=201)
        status, headers, _ = request(link["short_url"])
        assert status == 302 and headers["Location"] == original
        assert headers["Cache-Control"] == "no-store"
        stop(server)
        server = None
        server = start()
        assert api("/api/auth/me", token=token)["username"] == credentials["username"]
        restored = api(f'/api/links/{link["id"]}')
        assert restored["original_url"] == original and restored["click_count"] == 1
        api(f'/api/links/{link["id"]}', "DELETE", token=token, expected=204)
        assert request(link["short_url"])[0] == 404
        print("Gunicorn port-8000 startup, frontend/assets, redirects, and restart persistence passed.")
    finally:
        if server is not None:
            stop(server)
