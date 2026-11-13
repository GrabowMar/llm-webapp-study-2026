"""Manual API smoke test for the base64 converter."""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"


def call(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        return exc.code, (json.loads(raw) if raw else None)


def check(label, actual, expected):
    status = "OK " if actual == expected else "FAIL"
    if status == "FAIL":
        print(f"{status} {label}: got {actual!r}, expected {expected!r}")
        globals()["failures"] = globals().get("failures", 0) + 1
    else:
        print(f"{status} {label}")
    return actual == expected


failures = 0

status, body = call("GET", "/api/health")
check("health", (status, body), (200, {"status": "ok"}))

status, body = call("POST", "/api/base64/encode", {"text": "hello"})
check("encode hello", (status, body), (200, {"encoded": "aGVsbG8="}))

status, body = call("POST", "/api/base64/encode", {"text": ""})
check("encode empty", (status, body), (200, {"encoded": ""}))

status, body = call("POST", "/api/base64/encode", {"text": "héllo wörld ✨"})
check(
    "encode unicode",
    body,
    {"encoded": "aMOpbGxvIHfDtnJsZCDinKg="},
)

status, body = call("POST", "/api/base64/decode", {"encoded": "aGVsbG8="})
check("decode hello", (status, body), (200, {"text": "hello"}))

status, body = call("POST", "/api/base64/decode", {"encoded": ""})
check("decode empty", (status, body), (200, {"text": ""}))

status, body = call("POST", "/api/base64/decode", {"encoded": "not base64!"})
check("decode invalid status", status, 400)
check("decode invalid message", "error" in (body or {}), True)

status, body = call("POST", "/api/base64/decode", {"encoded": "aGVsbG8"})
check("decode invalid padding status", status, 400)

status, body = call("POST", "/api/base64/decode", {"encoded": "////"})
check("decode invalid utf8 status", status, 400)

# accounts
suffix = os.environ.get("SMOKE_SUFFIX") or os.urandom(4).hex()
user = f"alice_{suffix}"
status, body = call("POST", "/api/auth/register", {"username": user, "password": "s3cret"})
check("register", status, 201)
check("register username", body.get("username"), user)

status, body = call("POST", "/api/auth/register", {"username": user, "password": "s3cret"})
check("register duplicate", status, 409)

status, body = call("POST", "/api/auth/login", {"username": user, "password": "s3cret"})
check("login", status, 200)
token = body.get("token")
check("login token", isinstance(token, str) and len(token) > 10, True)

status, body = call("POST", "/api/auth/login", {"username": user, "password": "wrong"})
check("login wrong password", status, 401)

status, body = call("GET", "/api/conversions")
check("history without token", status, 401)

status, body = call("GET", "/api/conversions", token="nope")
check("history with bad token", status, 401)

status, body = call("GET", "/api/conversions", token=token)
check("history empty", (status, body["total"], body["items"], body["page"], body["page_size"]),
      (200, 0, [], 1, 20))

status, body = call("POST", "/api/conversions", {"direction": "encode", "input": "hello"})
check("conversion without token", status, 401)

status, body = call(
    "POST", "/api/conversions", {"direction": "encode", "input": "hello"}, token=token
)
check("save encode", status, 200)
check("save encode output", body.get("output"), "aGVsbG8=")
check("save encode preview", body.get("input_preview"), "hello")
check("save encode keys",
      sorted(body.keys()),
      sorted(["id", "direction", "input_preview", "output_preview", "created_at", "output"]))
first_id = body["id"]

status, body = call(
    "POST", "/api/conversions", {"direction": "decode", "input": "aGVsbG8="}, token=token
)
check("save decode", (status, body.get("output")), (200, "hello"))
second_id = body["id"]

status, body = call("GET", "/api/conversions", token=token)
check("history count", (body["total"], len(body["items"])), (2, 2))
check("history newest first", body["items"][0]["id"], second_id)

status, body = call("GET", "/api/conversions?page=1&page_size=1", token=token)
check("history page size", (body["total"], len(body["items"]), body["page"], body["page_size"]),
      (2, 1, 1, 1))
status, body = call("GET", "/api/conversions?page=2&page_size=1", token=token)
check("history page 2", (len(body["items"]), body["items"][0]["id"]), (1, first_id))

status, body = call("DELETE", f"/api/conversions/{first_id}", token=token)
check("delete own", status, 204)
status, body = call("GET", "/api/conversions", token=token)
check("history after delete", body["total"], 1)

# other user isolation
call("POST", "/api/auth/register", {"username": f"bob_{suffix}", "password": "hunter22"})
status, body = call("POST", "/api/auth/login", {"username": f"bob_{suffix}", "password": "hunter22"})
bob_token = body["token"]
status, body = call("GET", "/api/conversions", token=bob_token)
check("other user history empty", body["total"], 0)
status, body = call("DELETE", f"/api/conversions/{second_id}", token=bob_token)
check("delete other user's conversion", status, 404)
status, body = call("DELETE", f"/api/conversions/99999", token=token)
check("delete missing conversion", status, 404)

print()
print("FAILURES:", failures)
sys.exit(1 if failures else 0)
