"""Smoke test for the link previews API.

Run the app first, then::

    python tests/smoke_test.py
"""

import json
import os
import sys
import time
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

APP = os.environ.get("APP_URL", "http://127.0.0.1:8000")

PAGE = """<!DOCTYPE html>
<html>
  <head>
    <title>Fixture &amp; Title</title>
    <meta name="description" content="A <b>plain</b> description">
    <meta property="og:title" content="OG Title">
    <meta property="og:description" content="OG description">
    <meta property="og:image" content="/img/preview.png">
  </head>
  <body><h1>Hi</h1></body>
</html>
"""

failures = 0


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/page"):
            body = PAGE.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/redirect"):
            self.send_response(302)
            self.send_header("Location", "/page")
            self.end_headers()
        elif self.path.startswith("/notfound"):
            body = b"<html><head><title>Missing</title></head><body>nope</body></html>"
            self.send_response(404)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def request(method, path, body=None, token=None):
    url = APP + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return exc.code, raw.decode(errors="replace")


def check(label, condition, detail=""):
    global failures
    if not condition:
        failures += 1
    print(f"[{'PASS' if condition else 'FAIL'}] {label} {detail}")


def main():
    suffix = str(int(time.time() * 1000))
    alice = "alice" + suffix
    bob_name = "bob" + suffix
    server = HTTPServer(("127.0.0.1", 0), Handler)
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}"
    print(f"fixture server on {base}")

    status, body = request("GET", "/api/health")
    check("health", status == 200 and body == {"status": "ok"}, f"{status} {body}")

    status, body = request("GET", "/api/previews")
    check("unauthenticated list is 401", status == 401, f"{status} {body}")

    status, body = request("POST", "/api/auth/register", {"username": alice, "password": "pw123456"})
    check("register 201", status == 201, f"{status} {body}")

    status, body = request("POST", "/api/auth/register", {"username": alice, "password": "pw123456"})
    check("duplicate register 409", status == 409, f"{status} {body}")

    status, body = request("POST", "/api/auth/login", {"username": alice, "password": "wrong"})
    check("bad password 401", status == 401, f"{status} {body}")

    status, body = request("POST", "/api/auth/login", {"username": alice, "password": "pw123456"})
    check("login 200 + token", status == 200 and isinstance(body.get("token"), str), f"{status} {body}")
    token = body["token"]

    status, body = request("POST", "/api/previews", {"url": f"{base}/page"}, token=token)
    check("create preview 201", status == 201, f"{status} {body}")
    preview = body
    for key in ("id", "url", "final_url", "status_code", "title", "description", "image_url", "fetched_at"):
        check(f"preview has {key}", key in preview, f"-> {preview.get(key)!r}")
    check("title from og:title", preview["title"] == "OG Title", repr(preview["title"]))
    check(
        "description from og:description",
        preview["description"] == "OG description",
        repr(preview["description"]),
    )
    check("image resolved", preview["image_url"] == f"{base}/img/preview.png", repr(preview["image_url"]))
    check("status code", preview["status_code"] == 200, repr(preview["status_code"]))
    check("final url", preview["final_url"] == f"{base}/page", repr(preview["final_url"]))
    check("url kept", preview["url"] == f"{base}/page", repr(preview["url"]))

    status, body = request("POST", "/api/previews", {"url": f"{base}/redirect"}, token=token)
    check("redirect followed", status == 201 and body["final_url"].endswith("/page"), f"{status} {body}")

    status, body = request("POST", "/api/previews", {"url": f"{base}/notfound"}, token=token)
    check("404 page stored", status == 201 and body["status_code"] == 404, f"{status} {body}")

    status, body = request("POST", "/api/previews", {"url": "not a url"}, token=token)
    check("invalid url 400", status == 400, f"{status} {body}")

    status, body = request("POST", "/api/previews", {}, token=token)
    check("missing url 400", status == 400, f"{status} {body}")

    status, body = request("GET", "/api/previews", token=token)
    check(
        "list shape",
        status == 200 and set(body) == {"items", "total", "page", "page_size"},
        f"{status} {body}",
    )
    check("total 3", body["total"] == 3, body["total"])
    check("newest first", body["items"][0]["id"] == preview["id"] + 2, [i["id"] for i in body["items"]])
    check("page defaults", body["page"] == 1 and body["page_size"] == 10, body)

    status, body = request("GET", "/api/previews?page=2&page_size=2", token=token)
    check("paging", status == 200 and len(body["items"]) == 1 and body["total"] == 3, f"{status} {body}")

    status, body = request("GET", f"/api/previews/{preview['id']}", token=token)
    check("get one", status == 200 and body["id"] == preview["id"], f"{status} {body}")

    status, body = request("POST", f"/api/previews/{preview['id']}/refresh", token=token)
    check("refresh 200", status == 200 and body["id"] == preview["id"], f"{status} {body}")
    check("refresh updates fetched_at", body["fetched_at"] >= preview["fetched_at"], body["fetched_at"])

    request("POST", "/api/auth/register", {"username": bob_name, "password": "pw123456"})
    status, body = request("POST", "/api/auth/login", {"username": bob_name, "password": "pw123456"})
    bob_token = body["token"]
    status, body = request("GET", "/api/previews", token=bob_token)
    check("bob sees nothing", status == 200 and body["total"] == 0, f"{status} {body}")
    status, body = request("GET", f"/api/previews/{preview['id']}", token=bob_token)
    check("bob cannot read alice preview", status == 404, f"{status} {body}")
    status, body = request("POST", f"/api/previews/{preview['id']}/refresh", token=bob_token)
    check("bob cannot refresh alice preview", status == 404, f"{status} {body}")
    status, body = request("DELETE", f"/api/previews/{preview['id']}", token=bob_token)
    check("bob cannot delete alice preview", status == 404, f"{status} {body}")

    status, body = request("DELETE", f"/api/previews/{preview['id']}", token=token)
    check("delete 204", status == 204, f"{status} {body}")
    status, body = request("GET", f"/api/previews/{preview['id']}", token=token)
    check("deleted preview gone", status == 404, f"{status} {body}")

    status, body = request("GET", "/api/previews", token="bogus-token")
    check("bad token 401", status == 401, f"{status} {body}")

    print(f"\n{failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
