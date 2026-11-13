"""Exercise the API against a running server (python api_check.py <base-url>)."""

import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None, expect=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            status = resp.status
            payload = json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        status = exc.code
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw[:200]
    if expect is not None and status != expect:
        failures.append(f"{method} {path} -> {status} (expected {expect}) payload={payload}")
    return status, payload


def check(label, condition, detail=""):
    if not condition:
        failures.append(f"{label}: {detail}")
    else:
        print(f"  ok  {label}")


print("health")
status, payload = call("GET", "/api/health", expect=200)
check("health payload", payload == {"status": "ok"}, str(payload))

print("validate")
status, payload = call("POST", "/api/validate/xml", {"xml": "<root><child/></root>"}, expect=200)
check("valid flag", payload["valid"] is True, str(payload))
check("root element", payload["root_element"] == "root", str(payload))
check("error none", payload["error"] is None, str(payload))
check("line none", payload["line"] is None, str(payload))
check("column none", payload["column"] is None, str(payload))

status, payload = call("POST", "/api/validate/xml", {"xml": "<root><child></root>"}, expect=200)
check("invalid flag", payload["valid"] is False, str(payload))
check("invalid error", bool(payload["error"]), str(payload))
check("invalid line", isinstance(payload["line"], int) and payload["line"] >= 1, str(payload))
check("invalid column", isinstance(payload["column"], int) and payload["column"] >= 1, str(payload))
check("invalid root none", payload["root_element"] is None, str(payload))

status, payload = call("POST", "/api/validate/xml", {"xml": ""}, expect=200)
check("empty invalid", payload["valid"] is False and payload["error"], str(payload))

status, payload = call("POST", "/api/validate/xml", {"xml": "not xml"}, expect=200)
check("garbage invalid", payload["valid"] is False and payload["error"], str(payload))

status, payload = call("POST", "/api/validate/xml", {}, expect=400)
check("missing xml 400", payload is not None, str(payload))

print("auth")
status, payload = call("POST", "/api/auth/register", {"username": "alice", "password": "secret"}, expect=201)
alice = payload["token"]
check("register token", isinstance(alice, str) and alice, str(payload))

status, payload = call("POST", "/api/auth/register", {"username": "alice", "password": "secret"}, expect=409)
check("duplicate register 409", True, str(payload))

status, payload = call("POST", "/api/auth/login", {"username": "alice", "password": "secret"}, expect=200)
check("login token", isinstance(payload.get("token"), str) and payload["token"], str(payload))
alice = payload["token"]

status, payload = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"}, expect=401)
check("bad login 401", True, str(payload))

status, payload = call("POST", "/api/auth/register", {"username": "bob", "password": "secret"}, expect=201)
bob = payload["token"]

print("saved checks")
status, payload = call("POST", "/api/validations", {"xml": "<a>1</a>"})
check("no token 401", status == 401, str(status))

status, payload = call("POST", "/api/validations", {"xml": "<a>1</a>"}, token="garbage")
check("bad token 401", status == 401, str(status))

status, payload = call("POST", "/api/validations", {"xml": "<a>1</a>"}, token=alice)
check("save status", status in (200, 201), str(status))
saved = payload
for key in ("id", "xml_preview", "valid", "error", "line", "column", "root_element", "created_at"):
    check(f"saved has {key}", key in payload, str(payload))
check("saved id", isinstance(payload["id"], int), str(payload))
check("saved valid", payload["valid"] is True, str(payload))
check("saved preview", payload["xml_preview"] == "<a>1</a>", str(payload))

long_xml = "<x>" + "y" * 500 + "</x>"
status, payload = call("POST", "/api/validations", {"xml": long_xml}, token=alice)
check("preview truncated", len(payload["xml_preview"]) == 200, str(len(payload["xml_preview"])))

status, payload = call("POST", "/api/validations", {"xml": "<a><b></a>"}, token=alice)
invalid_id = payload["id"]
check("saved invalid", payload["valid"] is False and payload["error"], str(payload))

status, payload = call("GET", "/api/validations", token=alice)
check("list status", status == 200, str(status))
check("list shape", set(payload) == {"items", "total", "page", "page_size"}, str(payload.keys()))
check("list total", payload["total"] >= 3, str(payload["total"]))
check("list page", payload["page"] == 1 and payload["page_size"] == 10, str(payload))
check("newest first", payload["items"][0]["id"] == invalid_id, str([i["id"] for i in payload["items"]]))

status, payload = call("GET", "/api/validations?page=1&page_size=1", token=alice)
check("page size honoured", len(payload["items"]) == 1, str(len(payload["items"])))
check("page size echoed", payload["page_size"] == 1, str(payload))

status, payload = call("GET", "/api/validations?valid=true", token=alice)
check("valid filter", all(i["valid"] for i in payload["items"]), str(payload["items"]))
check("valid filter total", payload["total"] == 2, str(payload["total"]))

status, payload = call("GET", "/api/validations?valid=false", token=alice)
check("invalid filter", all(not i["valid"] for i in payload["items"]), str(payload["items"]))
check("invalid filter total", payload["total"] == 1, str(payload["total"]))

status, payload = call("GET", "/api/validations", token=bob)
check("other user empty", payload["total"] == 0 and payload["items"] == [], str(payload))

status, payload = call("DELETE", f"/api/validations/{invalid_id}", token=bob)
check("delete other user 404", status == 404, str(status))

status, payload = call("DELETE", f"/api/validations/{invalid_id}", token=alice)
check("delete status", status in (200, 204), str(status))

status, payload = call("GET", "/api/validations", token=alice)
check("after delete", all(i["id"] != invalid_id for i in payload["items"]), str(payload["items"]))

status, payload = call("GET", "/api/validations")
check("list without token 401", status == 401, str(status))

status, payload = call("GET", "/api/validations", token="nope")
check("list bad token 401", status == 401, str(status))

print()
if failures:
    print(f"{len(failures)} FAILURES")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("all checks passed")
