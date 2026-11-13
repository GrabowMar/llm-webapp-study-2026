import json
import os
import sys
import tempfile

os.chdir(tempfile.mkdtemp())
os.environ["ADMIN_PASSWORD"] = "secret123"
sys.path.insert(0, "/workspace/backend")
import app as module

client = module.app.test_client()


def call(method, path, body=None, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    response = getattr(client, method)(path, **kwargs)
    try:
        data = response.get_json()
    except Exception:
        data = response.data[:200].decode(errors="replace")
    return response.status_code, data


def check(label, got, expected):
    ok = got == expected
    print(("PASS" if ok else "FAIL"), label, got if not ok else "")
    if not ok:
        print("   expected:", expected)


print("=== health ===")
check("health", call("get", "/api/health"), (200, {"status": "ok"}))

print("=== registration validation ===")
check("empty register", call("post", "/api/auth/register", {})[0], 400)
check("admin reserved", call("post", "/api/auth/register", {"username": "admin", "password": "x"})[0], 400)
code, reg = call("post", "/api/auth/register", {"username": "Alice", "password": "pw1"})
check("register status", code, 201)
check("register username", reg.get("username"), "Alice")
alice = reg["token"]
check("duplicate username", call("post", "/api/auth/register", {"username": "alice", "password": "p"})[0], 409)

print("=== auth ===")
check("no token create", call("post", "/api/posts", {"title": "x", "content": "y"})[0], 401)
check("bad token create", call("post", "/api/posts", {"title": "x", "content": "y"}, "bogus")[0], 401)
check("bad login", call("post", "/api/auth/login", {"username": "Alice", "password": "wrong"})[0], 401)
check("login case-insensitive", call("post", "/api/auth/login", {"username": "ALICE", "password": "pw1"})[0], 200)
check("admin wrong pw", call("post", "/api/auth/login", {"username": "admin", "password": "nope"})[0], 401)
code, adm = call("post", "/api/auth/login", {"username": "admin", "password": "secret123"})
check("admin login", code, 200)
admin = adm["token"]

code, bob = call("post", "/api/auth/register", {"username": "bob", "password": "pw2"})
bob = bob["token"]

print("=== post create ===")
check("missing title", call("post", "/api/posts", {"content": "y"}, alice)[0], 400)
long_content = "First line\nSecond line with text " + "z" * 300
code, p1 = call("post", "/api/posts", {"title": "Hello", "content": long_content, "tags": ["News", "news", " Tech "], "ignored": 1}, alice)
check("create status", code, 201)
check("fields", set(p1.keys()), {"id", "title", "content", "tags", "created_at", "updated_at", "author", "excerpt"})
check("author", p1["author"], "Alice")
check("tags dedup", p1["tags"], ["News", "Tech"])
check("excerpt len", len(p1["excerpt"]), 200)
check("excerpt no newline", "\n" in p1["excerpt"], False)
check("created == updated", p1["created_at"] == p1["updated_at"], True)
id1 = p1["id"]

code, p2 = call("post", "/api/posts", {"title": "Bob post", "content": "Bob's content", "tags": ["Life"]}, bob)
id2 = p2["id"]
check("bob author", p2["author"], "bob")

print("=== reads ===")
code, listing = call("get", "/api/posts")
check("list status", code, 200)
check("list keys", set(listing.keys()), {"items", "total", "page", "page_size"})
check("total", listing["total"], 2)
check("newest first", listing["items"][0]["id"], id2)
check("default page_size", listing["page_size"], 10)
check("q filter", call("get", "/api/posts?q=Hello")[1]["total"], 1)
check("q no match", call("get", "/api/posts?q=qqqnonexistentqqq")[1]["total"], 0)
check("tag filter", call("get", "/api/posts?tag=TECH")[1]["total"], 1)
check("author filter", call("get", "/api/posts?author=bob")[1]["total"], 1)
check("page_size", call("get", "/api/posts?page_size=1")[1]["items"].__len__(), 1)
check("page 2", call("get", "/api/posts?page_size=1&page=2")[1]["items"][0]["id"], id1)
check("page_size cap", call("get", "/api/posts?page_size=999")[1]["page_size"], 100)
check("get one", call("get", f"/api/posts/{id1}")[1]["id"], id1)
check("get missing", call("get", "/api/posts/99999")[0], 404)

print("=== updates ===")
check("other cannot edit", call("put", f"/api/posts/{id1}", {"title": "T", "content": "C"}, bob)[0], 403)
check("anon cannot edit", call("put", f"/api/posts/{id1}", {"title": "T", "content": "C"})[0], 401)
code, upd = call("put", f"/api/posts/{id1}", {"title": "Updated", "content": "New\nContent"}, alice)
check("update status", code, 200)
check("update title", upd["title"], "Updated")
check("tags cleared on omit", upd["tags"], [])
check("updated_at changed", upd["updated_at"] > p1["updated_at"], True)
check("created_at unchanged", upd["created_at"], p1["created_at"])
check("tag filter after clear", call("get", "/api/posts?tag=news")[1]["total"], 0)

print("=== admin toggle ===")
check("non-admin toggle", call("post", f"/api/admin/posts/{id1}/toggle", {}, alice)[0], 403)
check("anon toggle", call("post", f"/api/admin/posts/{id1}/toggle", {})[0], 401)
code, taken = call("post", f"/api/admin/posts/{id1}/toggle", {}, admin)
check("toggle status", code, 200)
check("taken_down flag", taken.get("taken_down"), True)
check("hidden out of list", call("get", "/api/posts")[1]["total"], 1)
check("hidden 404 anon", call("get", f"/api/posts/{id1}")[0], 404)
check("hidden 404 author", call("get", f"/api/posts/{id1}", token=alice)[0], 404)
check("hidden visible admin", call("get", f"/api/posts/{id1}", token=admin)[0], 200)
check("author cannot edit hidden", call("put", f"/api/posts/{id1}", {"title": "T", "content": "C"}, alice)[0], 404)
code, restored = call("post", f"/api/admin/posts/{id1}/toggle", {}, admin)
check("restored flag", restored.get("taken_down"), False)
check("restored in list", call("get", "/api/posts")[1]["total"], 2)

print("=== delete ===")
check("other cannot delete", call("delete", f"/api/posts/{id1}", token=bob)[0], 403)
check("delete own", call("delete", f"/api/posts/{id1}", token=alice)[0], 200)
check("deleted 404", call("get", f"/api/posts/{id1}")[0], 404)
check("delete missing", call("delete", f"/api/posts/{id1}", token=alice)[0], 404)

print("=== admin disabled ===")
module.ADMIN_PASSWORD = ""
check("admin login disabled", call("post", "/api/auth/login", {"username": "admin", "password": "secret123"})[0], 401)
check("old admin token invalid", call("post", "/api/admin/posts/1/toggle", {}, admin)[0], 401)
os.environ["ADMIN_PASSWORD"] = "secret123"
module.ADMIN_PASSWORD = "secret123"
check("admin works again", call("post", "/api/auth/login", {"username": "admin", "password": "secret123"})[0], 200)

print("=== persistence ===")
del module
import importlib
sys.modules.pop("app", None)
module2 = importlib.import_module("app")
c2 = module2.app.test_client()
check("persisted post", c2.get("/api/posts").get_json()["total"], 1)
print("DONE")
