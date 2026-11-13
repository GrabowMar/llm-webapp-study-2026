import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, data) as resp:
            raw = resp.read()
            payload = json.loads(raw) if raw else None
            return resp.status, payload
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw) if raw else None
        except Exception:
            payload = raw
        return e.code, payload


def check(name, cond, extra=""):
    if cond:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {extra}")
        failures.append(name)


s, b = call("GET", "/api/health")
check("health", s == 200 and b == {"status": "ok"}, (s, b))

s, b = call("POST", "/api/auth/register", {"username": "ab", "password": "short"})
check("register validation", s == 422 and "username" in b["errors"] and "password" in b["errors"], (s, b))

s, b = call("POST", "/api/auth/register", {"username": "alice", "password": "password123"})
check("register alice 201", s == 201, (s, b))
s, b = call("POST", "/api/auth/register", {"username": "bob", "password": "password123"})
check("register bob 201", s == 201, (s, b))
s, b = call("POST", "/api/auth/register", {"username": "alice", "password": "password123"})
check("duplicate username 422", s == 422, (s, b))

s, b = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("bad login 401", s == 401, (s, b))
s, b = call("POST", "/api/auth/login", {"username": "alice", "password": "password123"})
check("login alice 200+token", s == 200 and "token" in b, (s, b))
ta = b["token"]
s, b = call("POST", "/api/auth/login", {"username": "bob", "password": "password123"})
tb = b["token"]

s, b = call("GET", "/api/auth/me", token=ta)
check("me", s == 200 and b["username"] == "alice", (s, b))
s, b = call("GET", "/api/auth/me")
check("me unauthorised 401", s == 401, (s, b))

s, b = call("POST", "/api/notes", {"title": "x", "content": "y"})
check("create needs auth 401", s == 401, (s, b))

s, b = call("POST", "/api/notes", {"title": "", "content": ""}, ta)
check("note validation 422", s == 422 and "title" in b["errors"] and "content" in b["errors"], (s, b))
s, b = call("POST", "/api/notes", {"title": "t", "content": "c", "tags": "oops"}, ta)
check("tags type 422", s == 422 and "tags" in b["errors"], (s, b))
s, b = call("POST", "/api/notes", {"title": "t", "content": "c", "tags": ["!!!bad tag!!"]}, ta)
check("tag format 422", s == 422, (s, b))

s, n1 = call("POST", "/api/notes", {"title": "Groceries", "content": "milk\neggs", "tags": ["Personal", "shopping"]}, ta)
check("create 201+shape", s == 201 and set(n1) == {"id", "title", "content", "tags", "pinned", "created_at", "updated_at", "author"} and n1["tags"] == ["personal", "shopping"] and n1["pinned"] is False and n1["author"] == "alice", (s, n1))
s, n2 = call("POST", "/api/notes", {"title": "Project ideas", "content": "Build something!", "tags": ["Work"], "pinned": True}, tb)
check("create pinned bob", s == 201 and n2["pinned"] is True and n2["author"] == "bob", (s, n2))
s, n3 = call("POST", "/api/notes", {"title": "Shopping list 2", "content": "more milk", "tags": ["shopping"]}, ta)
check("create n3", s == 201, (s, n3))

s, lst = call("GET", "/api/notes")
check("list shape", s == 200 and set(lst) == {"items", "total", "page", "page_size"} and lst["total"] == 3 and len(lst["items"]) == 3, (s, lst))
ids = [i["id"] for i in lst["items"]]
check("ordering pinned first then recent", ids == [n2["id"], n3["id"], n1["id"]], ids)

s, lst = call("GET", "/api/notes?tag=shopping")
check("tag filter", [i["id"] for i in lst["items"]] == [n3["id"], n1["id"]] and lst["total"] == 2, (s, lst))
s, lst = call("GET", "/api/notes?author=bob")
check("author filter", lst["total"] == 1 and lst["items"][0]["id"] == n2["id"], lst)
s, lst = call("GET", "/api/notes?q=mIlk")
check("q filter case-insensitive", lst["total"] == 2, lst)
s, lst = call("GET", "/api/notes?q=ideas")
check("q matches title", lst["total"] == 1, lst)
s, lst = call("GET", "/api/notes?page=2&page_size=2")
check("paging", lst["total"] == 3 and lst["page"] == 2 and lst["page_size"] == 2 and len(lst["items"]) == 1, lst)
s, lst = call("GET", "/api/notes?tag=shopping&q=milk&page_size=1")
check("combined filters", lst["total"] == 2 and len(lst["items"]) == 1, lst)

s, got = call("GET", f"/api/notes/{n1['id']}")
check("get one", s == 200 and got["title"] == "Groceries" and got["tags"] == ["personal", "shopping"], (s, got))
s, got = call("GET", "/api/notes/9999")
check("get 404", s == 404, (s, got))

s, _ = call("PATCH", f"/api/notes/{n1['id']}", {"title": "hack"}, tb)
check("patch other 403", s == 403, s)
s, _ = call("PATCH", f"/api/notes/{n1['id']}", {"title": "hack"})
check("patch anon 401", s == 401, s)
s, _ = call("DELETE", f"/api/notes/{n1['id']}", token=tb)
check("delete other 403", s == 403, s)
s, _ = call("DELETE", f"/api/notes/{n1['id']}")
check("delete anon 401", s == 401, s)

old_updated = n1["updated_at"]
time.sleep(1.2)
s, patched = call("PATCH", f"/api/notes/{n1['id']}", {"pinned": True}, ta)
check("patch partial + updated_at", s == 200 and patched["pinned"] is True and patched["title"] == "Groceries" and patched["updated_at"] != old_updated, (s, patched))
s, patched = call("PATCH", f"/api/notes/{n1['id']}", {"tags": ["todo"]}, ta)
check("patch tags", s == 200 and patched["tags"] == ["todo"] and patched["updated_at"] != old_updated, (s, patched))
s, patched = call("PATCH", f"/api/notes/{n1['id']}", {"title": ""}, ta)
check("patch invalid 422", s == 422, (s, patched))

s, tags = call("GET", "/api/tags")
counts = {t["tag"]: t["count"] for t in tags["items"]}
check("tags counts", s == 200 and counts == {"todo": 1, "work": 1, "shopping": 1} and set(tags["items"][0]) == {"tag", "count"}, (s, tags))
check("tags ordered desc", all(
    tags["items"][i]["count"] >= tags["items"][i + 1]["count"] for i in range(len(tags["items"]) - 1)), tags)

s, _ = call("PATCH", f"/api/notes/{n2['id']}", {"pinned": False}, tb)
s, lst = call("GET", "/api/notes")
ids = [i["id"] for i in lst["items"]]
check("unpin reorders", ids == [n2["id"], n1["id"], n3["id"]], ids)  # both unpinned; by updated_at desc

s, _ = call("DELETE", f"/api/notes/{n3['id']}", ta)
check("delete own 204", s == 204, s)
s, _ = call("GET", f"/api/notes/{n3['id']}")
check("deleted 404", s == 404, s)

s, _ = call("POST", "/api/notes", {"title": "x", "content": "y"}, "garbage-token")
check("bad token 401", s == 401, s)

req = urllib.request.Request(BASE + "/notes/5")
with urllib.request.urlopen(req) as r:
    html = r.read().decode()
    check("spa fallback", r.status == 200 and 'id="root"' in html)
s, b = call("GET", "/api/nope")
check("unknown api 404 json", s == 404, (s, b))

s, _ = call("POST", "/api/auth/logout", token=ta)
s, _ = call("GET", "/api/auth/me", token=ta)
check("logout invalidates token", s == 401, s)

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAILURES: {failures}")
sys.exit(1 if failures else 0)
