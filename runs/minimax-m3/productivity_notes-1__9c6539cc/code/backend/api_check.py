import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8010/api")


def call(method, path, body=None, token=None, expect=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        status = e.code
    try:
        payload = json.loads(raw) if raw else None
    except Exception:
        payload = raw
    if expect is not None and status != expect:
        print(f"FAIL {method} {path} -> {status} (expected {expect}): {payload}")
        return None, status
    print(f"ok   {method} {path} -> {status}")
    return payload, status


reg = call("POST", "/auth/register", {"username": "alice", "password": "pw"}, expect=201)
alice = reg[0]["token"]
reg2 = call("POST", "/auth/register", {"username": "bob", "password": "pw"}, expect=201)
bob = reg2[0]["token"]
call("POST", "/auth/register", {"username": "alice", "password": "pw"}, expect=409)
call("POST", "/auth/register", {"username": "", "password": "pw"}, expect=400)
call("POST", "/auth/register", {"username": "x", "password": ""}, expect=400)
call("POST", "/auth/login", {"username": "alice", "password": "pw"}, expect=200)
call("POST", "/auth/login", {"username": "alice", "password": "nope"}, expect=401)

n1 = call("POST", "/notes", {"title": "First", "content": "hello\nworld", "tags": ["work", "idea"], "pinned": True}, token=alice, expect=201)[0]
n2 = call("POST", "/notes", {"title": "Second", "content": "second note", "tags": ["work"]}, token=bob, expect=201)[0]
call("POST", "/notes", {"title": "No auth"}, expect=401)
call("POST", "/notes", {"content": "no title"}, token=alice, expect=400)

listing = call("GET", "/notes", expect=200)[0]
assert listing["items"][0]["id"] == n1["id"], listing
assert listing["total"] == 2, listing
assert listing["page"] == 1 and listing["page_size"] == 20
print("   list:", json.dumps(listing["items"][0], indent=2))

call("GET", "/notes?tag=work", expect=200)
call("GET", "/notes?author=alice", expect=200)
call("GET", "/notes?q=second", expect=200)
paged = call("GET", "/notes?page=1&page_size=1", expect=200)[0]
assert paged["total"] == 2 and len(paged["items"]) == 1 and paged["page_size"] == 1, paged

one = call("GET", f"/notes/{n1['id']}", expect=200)[0]
assert one["tags"] == ["idea", "work"], one
assert one["pinned"] is True
assert one["author"] == "alice"

call("PATCH", f"/notes/{n1['id']}", {"title": "Hacked"}, token=bob, expect=403)
call("PATCH", f"/notes/{n1['id']}", {"title": "Hacked"}, expect=401)
patched = call("PATCH", f"/notes/{n1['id']}", {"title": "First edited"}, token=alice, expect=200)[0]
assert patched["title"] == "First edited"
assert patched["content"] == "hello\nworld"
assert patched["updated_at"] != one["updated_at"], (one["updated_at"], patched["updated_at"])
patched2 = call("PATCH", f"/notes/{n1['id']}", {"pinned": False, "tags": ["solo"]}, token=alice, expect=200)[0]
assert patched2["tags"] == ["solo"] and patched2["pinned"] is False
call("PATCH", f"/notes/{n1['id']}", {"tags": ["solo", "keep"]}, token=alice, expect=200)

call("DELETE", f"/notes/{n2['id']}", token=alice, expect=403)
call("DELETE", f"/notes/{n2['id']}", expect=401)
call("DELETE", f"/notes/{n2['id']}", token=bob, expect=200)
call("GET", f"/notes/{n2['id']}", expect=404)

tags = call("GET", "/tags", expect=200)[0]
print("   tags:", tags)
assert {t["tag"] for t in tags["items"]} == {"solo", "keep"}, tags
assert all(t["count"] == 1 for t in tags["items"]), tags

call("GET", "/health", expect=200)
print("ALL GOOD")
