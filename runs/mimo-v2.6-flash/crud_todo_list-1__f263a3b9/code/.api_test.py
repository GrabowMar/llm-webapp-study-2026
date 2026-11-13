"""End-to-end API smoke tests (run against a server on :8000)."""

import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000"
failures = []


def call(method, path, token=None, body=None, raw=None):
    url = BASE + path
    data = None
    headers = {}
    if raw is not None:
        data = raw.encode()
        headers["Content-Type"] = "application/json"
    elif body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read().decode()
            return resp.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        try:
            parsed = json.loads(payload) if payload else None
        except ValueError:
            parsed = payload
        return exc.code, parsed


def check(label, condition, detail=""):
    if condition:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label} {detail}")
        failures.append(label)


print("auth")
status, body = call("GET", "/api/todos")
check("no token -> 401", status == 401, (status, body))
check("401 body has error", isinstance(body, dict) and "error" in body, body)

status, _ = call("POST", "/api/auth/register", body={"username": "alice", "password": "secret"})
check("register -> 201", status == 201, status)
status, _ = call("POST", "/api/auth/register", body={"username": "alice", "password": "other"})
check("duplicate register -> 409", status == 409, status)
status, body = call("POST", "/api/auth/register", body={"username": "bob", "password": ""})
check("empty password -> 400", status == 400, (status, body))
status, body = call("POST", "/api/auth/register", body={"username": "carol"})
check("missing password -> 400", status == 400 and "error" in body, (status, body))

status, body = call("POST", "/api/auth/login", body={"username": "alice", "password": "wrong"})
check("bad login -> 401", status == 401, (status, body))
status, body = call("POST", "/api/auth/login", body={"username": "alice", "password": "secret"})
check("login -> 200 token", status == 200 and isinstance(body.get("token"), str), (status, body))
token = body["token"]
status, body = call("POST", "/api/auth/login", body={"username": "ALICE", "password": "secret"})
check("case-insensitive login", status == 200, (status, body))
bob_status, bob_body = call("POST", "/api/auth/register", body={"username": "bob", "password": "pw"})
bob_token = None
status2, bob_body2 = call("POST", "/api/auth/login", body={"username": "bob", "password": "pw"})
bob_token = bob_body2["token"]
check("second user", status2 == 200, status2)

print("create")
status, todo = call("POST", "/api/todos", token, {"title": "first", "priority": "high"})
check("create -> 201", status == 201, (status, todo))
first_id = todo["id"]
expected_keys = {
    "id", "title", "description", "priority", "due_date",
    "completed", "completed_at", "created_at",
}
check("shape", set(todo) == expected_keys, todo)
check("given priority kept", todo["priority"] == "high", todo)
check("flag defaults",
      todo["completed"] is False and todo["completed_at"] is None, todo)

status, t2 = call("POST", "/api/todos", token, {
    "title": "second", "description": "details", "priority": "low",
    "due_date": "2020-01-01", "completed": True,
})
check("create completed with due date", status == 201 and t2["completed_at"] is not None, t2)
status, t3 = call("POST", "/api/todos", token, {"title": "third", "due_date": "2099-05-05"})
status, t4 = call("POST", "/api/todos", token, {"title": "fourth"})
status, t5 = call("POST", "/api/todos", token, {"title": "fifth", "priority": "low"})

status, body = call("POST", "/api/todos", token, {"title": ""})
check("empty title -> 400", status == 400 and "error" in body, (status, body))
status, body = call("POST", "/api/todos", token, {})
check("missing title -> 400", status == 400, (status, body))
status, body = call("POST", "/api/todos", token, {"title": "x", "priority": "urgent"})
check("bad priority -> 400", status == 400 and "error" in body, (status, body))
status, body = call("POST", "/api/todos", token, {"title": "x", "due_date": "2026-02-30"})
check("bad due date -> 400", status == 400, (status, body))
status, body = call("POST", "/api/todos", token, {"title": "x", "colour": "red"})
check("unknown field -> 400", status == 400, (status, body))
status, body = call("POST", "/api/todos", token, {"title": "x", "completed": "yes"})
check("bad completed -> 400", status == 400, (status, body))
status, body = call("POST", "/api/todos", token, raw='{"title": ')
check("malformed json -> 400", status == 400, (status, body))
status, body = call("POST", "/api/todos", token, raw="[1, 2]")
check("non-object body -> 400", status == 400, (status, body))

print("list ordering")
status, listing = call("GET", "/api/todos", token)
items = listing["items"]
check("list shape", status == 200 and set(listing) == {"items", "total", "page", "page_size", "remaining"}, listing)
check("total counts all", listing["total"] == 5, listing)
open_titles = [t["title"] for t in items if not t["completed"]]
check("open first, due date asc then newest",
      open_titles == ["third", "fifth", "fourth", "first"], open_titles)
check("completed last", items[-1]["title"] == "second", items)

print("filters + paging")
status, body = call("GET", "/api/todos?completed=false", token)
check("completed=false", body["total"] == 4 and all(not t["completed"] for t in body["items"]), body)
status, body = call("GET", "/api/todos?completed=true", token)
check("completed=true", body["total"] == 1 and body["items"][0]["title"] == "second", body)
status, body = call("GET", "/api/todos?priority=low", token)
check("priority filter", body["total"] == 2, body)
status, body = call("GET", "/api/todos?priority=HIGH", token)
check("priority case-insensitive", body["total"] == 1, body)
status, body = call("GET", "/api/todos?priority=nope", token)
check("bad priority filter -> 400", status == 400, (status, body))
status, body = call("GET", "/api/todos?completed=maybe", token)
check("bad completed filter -> 400", status == 400, (status, body))
status, body = call("GET", "/api/todos?page=0", token)
check("page=0 -> 400", status == 400, (status, body))
status, body = call("GET", "/api/todos?page=abc", token)
check("bad page -> 400", status == 400, (status, body))
status, body = call("GET", "/api/todos?page_size=2", token)
check("page_size=2", len(body["items"]) == 2 and body["remaining"] == 3 and body["total"] == 5, body)
status, body = call("GET", "/api/todos?page=2&page_size=2", token)
check("page 2", body["page"] == 2 and len(body["items"]) == 2 and body["remaining"] == 1, body)
status, body = call("GET", "/api/todos?page=3&page_size=2", token)
check("last page", len(body["items"]) == 1 and body["remaining"] == 0, body)
status, body = call("GET", "/api/todos?page=9&page_size=2", token)
check("empty page", body["items"] == [] and body["remaining"] == 0, body)

print("due date ordering across pages")
call("POST", "/api/todos", token, {"title": "dated-old", "due_date": "2025-06-06"})
call("POST", "/api/todos", token, {"title": "dated-new", "due_date": "2026-01-01"})
call("POST", "/api/todos", token, {"title": "defaults-todo"})
status, body = call("GET", "/api/todos?completed=false&page_size=50", token)
titles = [t["title"] for t in body["items"]]
check("open: due asc, none last, newest first",
      titles == ["dated-old", "dated-new", "third", "defaults-todo", "fifth", "fourth", "first"],
      titles)
check("defaults on create", all(
    t["priority"] == "medium" and t["due_date"] is None and t["description"] is None
    for t in body["items"] if t["title"] in ("defaults-todo", "fourth")), body["items"])

print("read / patch / delete")
status, body = call("GET", f"/api/todos/{first_id}", token)
check("get one", status == 200 and body["title"] == "first", (status, body))
status, body = call("GET", f"/api/todos/{first_id}", bob_token)
check("other user's todo -> 404", status == 404, (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", bob_token, {"title": "stolen"})
check("other user patch -> 404", status == 404, (status, body))
status, body = call("DELETE", f"/api/todos/{first_id}", bob_token)
check("other user delete -> 404", status == 404, (status, body))
status, body = call("GET", "/api/todos/999999", token)
check("missing todo -> 404", status == 404, (status, body))
status, body = call("GET", "/api/todos/abc", token)
check("bad id -> 404 json", status == 404 and isinstance(body, dict), (status, body))

status, body = call("PATCH", f"/api/todos/{first_id}", token, {"priority": "low"})
check("partial patch", status == 200 and body["priority"] == "low" and body["title"] == "first", body)
check("patch keeps fields", body["due_date"] is None and body["completed"] is False, body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"completed": True})
check("complete sets completed_at", body["completed"] is True and body["completed_at"] is not None, body)
first_completed_at = body["completed_at"]
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"completed": True})
check("re-complete keeps completed_at", body["completed_at"] == first_completed_at, body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"completed": False})
check("reopen clears completed_at", body["completed"] is False and body["completed_at"] is None, body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"due_date": "2026-12-31"})
check("set due date", body["due_date"] == "2026-12-31", body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"due_date": None})
check("clear due date", body["due_date"] is None, body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"description": "note"})
check("set description", body["description"] == "note", body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"description": None})
check("clear description", body["description"] is None, body)
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"title": "   "})
check("patch empty title -> 400", status == 400 and "error" in body, (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"priority": "urgent"})
check("patch bad priority -> 400", status == 400, (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"completed": "nope"})
check("patch bad completed -> 400", status == 400, (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"id": 7})
check("patch unknown field -> 400", status == 400, (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", token, {})
check("empty patch unchanged", status == 200 and body["title"] == "first", (status, body))
status, body = call("PATCH", f"/api/todos/{first_id}", token, {"title": "renamed"})
check("patch title", status == 200 and body["title"] == "renamed", body)

status, body = call("DELETE", f"/api/todos/{first_id}", token)
check("delete -> 200", status == 200 and body.get("deleted") is True, (status, body))
status, body = call("GET", f"/api/todos/{first_id}", token)
check("deleted gone", status == 404, (status, body))
status, body = call("DELETE", f"/api/todos/{first_id}", token)
check("double delete -> 404", status == 404, (status, body))

print("misc")
status, body = call("POST", "/api/todos")
check("no auth on create -> 401", status == 401, status)
status, body = call("GET", "/api/nope", token)
check("unknown api route -> json 404", status == 404 and isinstance(body, dict), (status, body))
status, body = call("PUT", "/api/todos", token)
check("wrong method -> 405 json", status == 405 and isinstance(body, dict), (status, body))

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    raise SystemExit(1)
print("all tests passed")
