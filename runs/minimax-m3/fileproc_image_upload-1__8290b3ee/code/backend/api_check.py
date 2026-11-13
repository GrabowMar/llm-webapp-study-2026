"""End-to-end API checks against a running gallery server."""

import base64
import json
import os
import struct
import sys
import urllib.error
import urllib.request
import zlib

BASE = os.environ.get("GALLERY_URL", "http://127.0.0.1:8000")
FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print(f"PASS  {name}")
    else:
        print(f"FAIL  {name} {detail}")
        FAILURES.append(name)


def request(method, path, body=None, token=None):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            raw = response.read()
            return response.status, dict(response.headers), raw
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def png_bytes(width=4, height=4, color=(255, 0, 0)):
    def chunk(tag, payload):
        body = tag + payload
        return struct.pack(">I", len(payload)) + body + struct.pack(">I", zlib.crc32(body))

    raw = b"".join(b"\x00" + bytes(color) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def jpeg_bytes():
    return (
        b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"
        + b"\xff\xdb\x00C\x00" + bytes(64)
        + b"\xff\xc0\x00\x0b\x08\x00\x04\x00\x04\x01\x01\x11\x00"
        + b"\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00\xd2\xff\xd9"
    )


def b64(data):
    return base64.b64encode(data).decode()


status, _, raw = request("GET", "/api/health")
check("health returns ok", status == 200 and json.loads(raw) == {"status": "ok"}, raw)

suffix = os.environ.get("RUN_SUFFIX", "1")
alice = f"alice_{suffix}"
bob = f"bob_{suffix}"

status, _, raw = request("POST", "/api/auth/register", {"username": alice, "password": "pw12345"})
check("register returns 201", status == 201, f"{status} {raw}")
check("register body has username", json.loads(raw).get("username") == alice, raw)

status, _, raw = request("POST", "/api/auth/register", {"username": alice, "password": "pw12345"})
check("duplicate register conflicts", status == 409, f"{status} {raw}")

status, _, raw = request("POST", "/api/auth/register", {"username": "", "password": "x"})
check("register rejects blank username", status == 400, f"{status} {raw}")

status, _, raw = request("POST", "/api/auth/register", {"username": f"x_{suffix}", "password": ""})
check("register rejects blank password", status == 400, f"{status} {raw}")

status, _, raw = request("POST", "/api/auth/login", {"username": alice, "password": "wrong"})
check("bad password is 401", status == 401, f"{status} {raw}")

status, _, raw = request("POST", "/api/auth/login", {"username": alice, "password": "pw12345"})
check("login returns 200", status == 200, f"{status} {raw}")
token = json.loads(raw).get("token")
check("login returns token", isinstance(token, str) and len(token) > 0, raw)

status, _, raw = request("POST", "/api/auth/login", {"username": bob, "password": "pw12345"})
bob_token = json.loads(raw).get("token") if status == 200 else None
status, _, raw = request("POST", "/api/auth/register", {"username": bob, "password": "pw12345"})
status, _, raw = request("POST", "/api/auth/login", {"username": bob, "password": "pw12345"})
bob_token = json.loads(raw).get("token")
check("second account can sign in", isinstance(bob_token, str) and bob_token, raw)

status, _, raw = request("POST", "/api/images", {"filename": "a.png", "data": b64(png_bytes())})
check("upload without token is 401", status == 401, f"{status} {raw}")

status, _, raw = request("POST", "/api/images", {"filename": "a.png", "data": b64(png_bytes())}, token="bogus")
check("upload with invalid token is 401", status == 401, f"{status} {raw}")

png = png_bytes()
status, _, raw = request(
    "POST",
    "/api/images",
    {"filename": "photo.png", "data": b64(png), "title": "Red square"},
    token=token,
)
check("png upload returns 201", status == 201, f"{status} {raw}")
image = json.loads(raw)
check("upload response has url", image.get("url") == f"/api/images/{image.get('id')}/file", raw)
check("upload detects png content type", image.get("content_type") == "image/png", raw)
check("upload keeps filename", image.get("filename") == "photo.png", raw)
check("upload keeps title", image.get("title") == "Red square", raw)
check("upload records size", image.get("size_bytes") == len(png), raw)
check("upload records uploader", image.get("uploader") == alice, raw)
check("upload returns uploaded_at", isinstance(image.get("uploaded_at"), str), raw)

png_id = image["id"]

jpeg = jpeg_bytes()
status, _, raw = request(
    "POST", "/api/images", {"filename": "misnamed.jpg", "data": b64(png)}, token=token
)
check("png bytes named .jpg still png", json.loads(raw).get("content_type") == "image/png", raw)
misnamed_id = json.loads(raw)["id"]

status, _, raw = request(
    "POST", "/api/images", {"filename": "photo.jpg", "data": b64(jpeg)}, token=token
)
jpeg_image = json.loads(raw)
check("jpeg upload returns 201", status == 201, f"{status} {raw}")
check("jpeg detects jpeg content type", jpeg_image.get("content_type") == "image/jpeg", raw)
check("optional title may be omitted", jpeg_image.get("title") in (None, ""), raw)
jpeg_id = jpeg_image["id"]

status, _, raw = request(
    "POST", "/api/images", {"filename": "photo.jpg", "data": b64(png)}, token=token
)
dup_id = json.loads(raw).get("id")
check("same filename kept separately", dup_id not in (None, png_id, jpeg_id), raw)

status, _, raw = request(
    "POST", "/api/images", {"filename": "evil.png", "data": b64(b"not an image at all")}, token=token
)
check("non-image upload rejected", status == 400, f"{status} {raw}")
check("rejection explains format", b"PNG" in raw and b"JPEG" in raw, raw)

status, _, raw = request(
    "POST", "/api/images", {"filename": "bad.png", "data": "!!!not base64!!!"}, token=token
)
check("invalid base64 rejected", status == 400, f"{status} {raw}")

status, _, raw = request("GET", "/api/images")
check("list is public", status == 200, f"{status} {raw}")
listing = json.loads(raw)
check("list has items/total/page/page_size", set(listing) == {"items", "total", "page", "page_size"}, raw)
check("list total matches count", listing["total"] >= 4, raw)
check("list defaults page 1", listing["page"] == 1, raw)
check("list items have required fields",
      all(set(item) >= {"id", "filename", "title", "content_type", "size_bytes", "uploaded_at", "url", "uploader"} for item in listing["items"]),
      raw)
ids = [item["id"] for item in listing["items"]]
check("newest first ordering", ids == sorted(ids, reverse=True), ids)

status, _, raw = request("GET", "/api/images?page=1&page_size=2")
page1 = json.loads(raw)
check("page_size respected", len(page1["items"]) == 2, raw)
check("page_size echoed", page1["page_size"] == 2, raw)
status, _, raw = request("GET", "/api/images?page=2&page_size=2")
page2 = json.loads(raw)
check("second page differs", {i["id"] for i in page1["items"]} != {i["id"] for i in page2["items"]}, raw)
check("total consistent across pages", page2["total"] == page1["total"], raw)

status, _, raw = request("GET", f"/api/images/{png_id}")
check("get one image 200", status == 200, f"{status} {raw}")
check("get one image matches", json.loads(raw)["id"] == png_id, raw)

status, _, raw = request("GET", "/api/images/999999")
check("missing image is 404", status == 404, f"{status} {raw}")

status, headers, raw = request("GET", f"/api/images/{png_id}/file")
check("file endpoint 200", status == 200, f"{status}")
check("file bytes unchanged", raw == png, f"{len(raw)} vs {len(png)}")
check("file content type header", headers.get("Content-Type", "").startswith("image/png"), headers)

status, headers, raw = request("GET", f"/api/images/{jpeg_id}/file")
check("jpeg file bytes unchanged", raw == jpeg, f"{len(raw)} vs {len(jpeg)}")
check("jpeg file content type", headers.get("Content-Type", "").startswith("image/jpeg"), headers)

status, _, raw = request("DELETE", f"/api/images/{png_id}")
check("delete without token is 401", status == 401, f"{status} {raw}")

status, _, raw = request("DELETE", f"/api/images/{png_id}", token=bob_token)
check("delete by other user forbidden", status == 403, f"{status} {raw}")

status, _, raw = request("DELETE", f"/api/images/{png_id}", token=token)
check("owner can delete", status in (200, 204), f"{status} {raw}")

status, _, raw = request("GET", f"/api/images/{png_id}")
check("deleted image is 404", status == 404, f"{status} {raw}")

status, _, raw = request("GET", f"/api/images/{png_id}/file")
check("deleted file is 404", status == 404, f"{status} {raw}")

status, _, raw = request("DELETE", f"/api/images/{jpeg_id}", token=token)
check("jpeg deleted", status in (200, 204), f"{status} {raw}")

print()
if FAILURES:
    print(f"{len(FAILURES)} FAILURES: {FAILURES}")
    sys.exit(1)
print("ALL CHECKS PASSED")
