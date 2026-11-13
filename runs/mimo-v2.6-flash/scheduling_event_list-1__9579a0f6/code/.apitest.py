"""End-to-end smoke test for the calendar API."""

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None, expect=None):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
            raw = resp.read().decode()
    except urllib.error.HTTPError as err:
        status = err.code
        raw = err.read().decode()
    parsed = None
    if raw:
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = raw
    if expect is not None and status not in (expect if isinstance(expect, (list, tuple)) else [expect]):
        failures.append(f"{method} {path}: expected {expect}, got {status}: {parsed}")
    return status, parsed


def check(label, condition, detail=""):
    if condition:
        print(f"  ok  {label}")
    else:
        failures.append(f"{label} {detail}")
        print(f"FAIL  {label} {detail}")


print("health")
status, body = call("GET", "/api/health", expect=200)
check("health", body == {"status": "ok"}, str(body))

print("auth")
status, body = call("POST", "/api/auth/register", {"username": "alice", "password": "secret1"}, expect=201)
check("register 201", status == 201, str(body))
status, body = call("POST", "/api/auth/register", {"username": "alice", "password": "x"})
check("duplicate register", status == 409, str(status))
status, body = call("POST", "/api/auth/register", {"username": "", "password": "x"})
check("empty username", status == 400, str(status))
status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("bad login 401", status == 401, str(status))
status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "secret1"}, expect=200)
check("login token", isinstance(body, dict) and "token" in body, str(body))
token = body["token"]
status, body2 = call("POST", "/api/auth/register", {"username": "bob", "password": "pw2"}, expect=201)
status, body2 = call("POST", "/api/auth/login", {"username": "bob", "password": "pw2"}, expect=200)
bob_token = body2["token"]

print("auth required")
status, body = call("POST", "/api/events", {"title": "x", "start_time": "2026-01-01T10:00:00Z", "end_time": "2026-01-01T11:00:00Z"})
check("create without token 401", status == 401, str(status))
status, body = call("POST", "/api/events", {"title": "x"}, token="bogus")
check("bogus token 401", status == 401, str(status))
status, body = call("DELETE", "/api/events/1")
check("delete without token 401", status == 401, str(status))

print("create")
status, body = call("POST", "/api/events", {
    "title": "Planning",
    "description": "Quarterly planning",
    "location": "Room 4",
    "start_time": "2026-03-05T09:30:00Z",
    "end_time": "2026-03-05T10:30:00Z",
}, token=token, expect=201)
check("create 201", status == 201, str(body))
event_id = body.get("id")
check("fields", body.get("created_by") == "alice" and body.get("created_at", "").endswith("Z"),
      str(body))
check("start Z", body.get("start_time") == "2026-03-05T09:30:00Z", str(body.get("start_time")))

status, body = call("POST", "/api/events", {
    "title": "Naive",
    "start_time": "2026-03-06T14:00:00",
    "end_time": "2026-03-06T17:00:00+02:00",
}, token=token, expect=201)
check("naive treated as UTC", body["start_time"] == "2026-03-06T14:00:00Z", str(body))
check("offset converted", body["end_time"] == "2026-03-06T15:00:00Z", str(body["end_time"]))
event2_id = body["id"]

status, body = call("POST", "/api/events", {
    "title": "No optional fields",
    "start_time": "2026-03-07T09:00:00Z",
    "end_time": "2026-03-07T10:00:00Z",
}, token=token, expect=201)
check("optionals null", body["description"] is None and body["location"] is None, str(body))
event3_id = body["id"]

print("validation")
status, body = call("POST", "/api/events", {"start_time": "2026-03-05T09:00:00Z", "end_time": "2026-03-05T10:00:00Z"}, token=token)
check("missing title", status == 400 and "title" in str(body), str(body))
status, body = call("POST", "/api/events", {"title": "x", "end_time": "2026-03-05T10:00:00Z"}, token=token)
check("missing start", status == 400 and "start_time" in str(body), str(body))
status, body = call("POST", "/api/events", {"title": "x", "start_time": "2026-03-05T10:00:00Z", "end_time": "2026-03-05T09:00:00Z"}, token=token)
check("end before start", status == 400 and "end_time" in str(body), str(body))
status, body = call("POST", "/api/events", {"title": "x", "start_time": "not-a-date", "end_time": "2026-03-05T10:00:00Z"}, token=token)
check("bad datetime", status == 400 and "start_time" in str(body), str(body))

print("get")
status, body = call("GET", f"/api/events/{event_id}", expect=200)
check("get one", body["title"] == "Planning", str(body))
status, body = call("GET", "/api/events/999999")
check("missing 404", status == 404, str(status))

print("list + ranges")
status, body = call("GET", "/api/events", expect=200)
check("list shape", set(body.keys()) == {"items", "total"} and body["total"] == len(body["items"]), str(body.keys()))
check("sorted", [e["start_time"] for e in body["items"]] == sorted(e["start_time"] for e in body["items"]), str(body))
check("total 3", body["total"] == 3, str(body["total"]))

status, body = call("GET", "/api/events?start_date=2026-03-05&end_date=2026-03-05", expect=200)
check("single day range", body["total"] == 1 and body["items"][0]["id"] == event_id, str(body))

status, body = call("GET", "/api/events?start_date=2026-03-01&end_date=2026-03-31", expect=200)
check("month range", body["total"] == 3, str(body["total"]))

status, body = call("GET", "/api/events?start_date=2026-04-01&end_date=2026-04-30", expect=200)
check("empty range", body == {"items": [], "total": 0}, str(body))

status, body = call("GET", "/api/events?start_date=2026-03-06T00:00:00Z&end_date=2026-03-06T23:59:59Z", expect=200)
check("datetime range", body["total"] == 1 and body["items"][0]["id"] == event2_id, str(body))

status, body = call("GET", "/api/events?start_date=bogus")
check("bad range 400", status == 400, str(status))

# spanning event overlaps into range
status, body = call("POST", "/api/events", {
    "title": "Conference",
    "start_time": "2026-03-31T20:00:00Z",
    "end_time": "2026-04-02T10:00:00Z",
}, token=token, expect=201)
span_id = body["id"]
status, body = call("GET", "/api/events?start_date=2026-04-01&end_date=2026-04-30", expect=200)
check("spanning event in April", body["total"] == 1 and body["items"][0]["id"] == span_id, str(body))

print("update")
status, body = call("PUT", f"/api/events/{event_id}", {
    "title": "Planning v2",
    "start_time": "2026-03-05T09:00:00Z",
    "end_time": "2026-03-05T11:00:00Z",
}, token=bob_token, expect=200)
check("any user can edit", body["title"] == "Planning v2", str(body))
check("created_by kept", body["created_by"] == "alice", str(body))
check("omitted optionals cleared", body["description"] is None and body["location"] is None, str(body))
check("created_at kept", body["created_at"].endswith("Z"), str(body))

status, body = call("PUT", f"/api/events/{event_id}", {
    "title": "Planning v3",
    "description": "Updated notes",
    "location": "Room 9",
    "start_time": "2026-03-05T09:00:00Z",
    "end_time": "2026-03-05T11:00:00Z",
}, token=bob_token, expect=200)
check("set optionals", body["description"] == "Updated notes" and body["location"] == "Room 9", str(body))

status, body = call("PUT", f"/api/events/{event_id}", {"title": "only title"}, token=token)
check("put validation", status == 400, str(status))

print("delete")
status, body = call("DELETE", f"/api/events/{event2_id}", token=token, expect=204)
check("delete 204", status == 204, str(status))
status, body = call("GET", f"/api/events/{event2_id}")
check("gone 404", status == 404, str(status))
status, body = call("DELETE", f"/api/events/{event2_id}", token=token)
check("double delete 404", status == 404, str(status))

print("frontend + misc routing")
req = urllib.request.Request(BASE + "/")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode()
check("index html", resp.status == 200 and '<div id="root">' in html and "Event Calendar" in html, html[:200])
req = urllib.request.Request(BASE + "/some/spa/route")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode()
check("spa fallback", resp.status == 200 and '<div id="root">' in html, html[:200])

status, body = call("GET", "/api/nope")
check("unknown api 404 json", status == 404 and isinstance(body, dict) and "error" in body, str(body))
status, body = call("POST", "/api/nope")
check("unknown api 405 json", status == 405, str(body))
status, body = call("GET", "/api/events/notanumber")
check("non-int event id 404", status == 404, str(status))

print()
if failures:
    print(f"{len(failures)} FAILURES:")
    for f in failures:
        print(" -", f)
    raise SystemExit(1)
print("ALL PASSED")
