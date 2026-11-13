"""End-to-end API tests for the URL shortener (temporary)."""

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


OPENER = urllib.request.build_opener(NoRedirect)


def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with OPENER.open(r, timeout=5) as resp:
            return resp.status, dict(resp.headers), resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode()


def check(name, cond, detail=""):
    status = "ok" if cond else "FAIL"
    if not cond:
        failures.append(name)
    print(f"[{status}] {name} {detail if not cond else ''}")


def j(body):
    return json.loads(body)


# health
s, _, b = req("GET", "/api/health")
check("health", s == 200 and j(b) == {"status": "ok"}, f"{s} {b}")

# register
s, _, b = req("POST", "/api/auth/register", {"username": "alice", "password": "pw123456"})
check("register 201", s == 201, f"{s} {b}")
s, _, b = req("POST", "/api/auth/register", {"username": "alice", "password": "pw123456"})
check("register duplicate 4xx", s in (400, 409), f"{s} {b}")
s, _, b = req("POST", "/api/auth/register", {"username": "admin", "password": "x"})
check("register admin reserved 4xx", s in (400, 403, 409), f"{s} {b}")

# login
s, _, b = req("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("login bad password 401", s == 401, f"{s} {b}")
s, _, b = req("POST", "/api/auth/login", {"username": "alice", "password": "pw123456"})
check("login 200 + token", s == 200 and "token" in j(b), f"{s} {b}")
token = j(b)["token"]

s, _, b = req("POST", "/api/auth/register", {"username": "bob", "password": "pw123456"})
check("register bob", s == 201, f"{s} {b}")
s, _, b = req("POST", "/api/auth/login", {"username": "bob", "password": "pw123456"})
bob_token = j(b)["token"]

# admin login
s, _, b = req("POST", "/api/auth/login", {"username": "admin", "password": "test-admin-pw"})
check("admin login", s == 200 and "token" in j(b), f"{s} {b}")
admin_token = j(b)["token"]
s, _, b = req("POST", "/api/auth/login", {"username": "admin", "password": "nope"})
check("admin bad password 401", s == 401, f"{s} {b}")

# create link needs auth
s, _, b = req("POST", "/api/links", {"original_url": "https://example.com/x"})
check("create without token 401", s == 401, f"{s} {b}")
s, _, b = req("POST", "/api/links", {"original_url": "https://example.com/x"}, token="bad")
check("create bad token 401", s == 401, f"{s} {b}")

# create links
link_fields = {"id", "original_url", "short_code", "click_count", "created_at", "short_url", "owner"}
s, _, b = req(
    "POST",
    "/api/links",
    {"original_url": "https://example.com/some/very/long/path?with=query"},
    token,
)
check("create 201", s == 201, f"{s} {b}")
link = j(b)
check(
    "create fields",
    set(link.keys()) == link_fields
    and link["short_url"] == f"/r/{link['short_code']}"
    and link["owner"] == "alice"
    and link["click_count"] == 0,
    json.dumps(link),
)
link1 = link

s, _, b = req("POST", "/api/links", {"url": "http://example.org/second"}, token)
check("create accepts url field", s == 201, f"{s} {b}")
link2 = j(b)

# invalid urls
for bad in ["ftp://example.com/x", "javascript:alert(1)", "notaurl", "https://", ""]:
    s, _, b = req("POST", "/api/links", {"original_url": bad}, token)
    check(f"reject {bad!r}", s == 400, f"{s} {b}")

# bob creates a link too
s, _, b = req("POST", "/api/links", {"original_url": "https://bob.example/page"}, bob_token)
check("bob create", s == 201, f"{s} {b}")
link3 = j(b)

# list
s, _, b = req("GET", "/api/links")
data = j(b)
check(
    "list shape",
    s == 200
    and set(data.keys()) == {"items", "total", "page", "page_size"}
    and data["total"] == 3
    and data["page"] == 1
    and data["page_size"] == 10
    and len(data["items"]) == 3,
    f"{s} {b}",
)
check("newest first", data["items"][0]["id"] == link3["id"], json.dumps(data["items"]))
check("list fields", set(data["items"][0].keys()) == link_fields, "")

# pagination
s, _, b = req("GET", "/api/links?page=1&page_size=2")
d1 = j(b)
s, _, b = req("GET", "/api/links?page=2&page_size=2")
d2 = j(b)
check(
    "pagination",
    d1["total"] == 3
    and len(d1["items"]) == 2
    and d1["page"] == 1
    and d2["page"] == 2
    and len(d2["items"]) == 1
    and d1["items"][0]["id"] != d2["items"][0]["id"],
    f"{d1} {d2}",
)

# single link
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("get link", s == 200 and j(b)["id"] == link1["id"], f"{s} {b}")
s, _, b = req("GET", "/api/links/999999")
check("get missing 404", s == 404, f"{s} {b}")

# redirect
s, h, b = req("GET", f"/r/{link1['short_code']}")
check(
    "redirect 302",
    s == 302 and h.get("Location") == "https://example.com/some/very/long/path?with=query",
    f"{s} {h.get('Location')}",
)
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("click counted", j(b)["click_count"] == 1, b)
s, h, b = req("GET", f"/r/{link1['short_code']}")
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("click counted 2", j(b)["click_count"] == 2, b)
s, _, b = req("GET", "/r/doesnotexist")
check("unknown code 404", s == 404, f"{s} {b}")

# delete: non-owner
s, _, b = req("GET", f"/api/links/{link1['id']}", token=bob_token)
check("other can view active link", s == 200, f"{s} {b}")
s, _, b = req("DELETE", f"/api/links/{link1['id']}", token=bob_token)
check("non-owner delete 4xx", s in (403, 404), f"{s} {b}")
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("link survives non-owner delete", s == 200, f"{s} {b}")

# delete without auth
s, _, b = req("DELETE", f"/api/links/{link1['id']}")
check("delete without token 401", s == 401, f"{s} {b}")

# admin list
s, _, b = req("GET", "/api/admin/links")
check("admin list without token 401", s == 401, f"{s} {b}")
s, _, b = req("GET", "/api/admin/links", token=token)
check("admin list non-admin 403", s == 403, f"{s} {b}")
s, _, b = req("GET", "/api/admin/links", token=admin_token)
data = j(b)
check(
    "admin list shape",
    s == 200
    and set(data.keys()) == {"items", "total", "page", "page_size"}
    and data["total"] == 3
    and len(data["items"]) == 3,
    f"{s} {b}",
)
check("admin items have owner", all("owner" in it for it in data["items"]), b)

# toggle
s, _, b = req("POST", f"/api/admin/links/{link1['id']}/toggle", token=token)
check("toggle non-admin 403", s == 403, f"{s} {b}")
s, _, b = req("POST", f"/api/admin/links/{link1['id']}/toggle", token=admin_token)
check("toggle disable 200", s == 200 and j(b)["id"] == link1["id"], f"{s} {b}")
s, _, b = req("GET", "/api/links")
d = j(b)
check(
    "disabled excluded from public list",
    d["total"] == 2 and all(it["id"] != link1["id"] for it in d["items"]),
    b,
)
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("disabled get 404", s == 404, f"{s} {b}")
s, _, b = req("DELETE", f"/api/links/{link1['id']}", token=token)
check("disabled delete 404", s == 404, f"{s} {b}")
s, _, b = req("GET", f"/r/{link1['short_code']}")
check("disabled redirect 404", s == 404, f"{s} {b}")
s, _, b = req("GET", "/api/admin/links", token=admin_token)
d = j(b)
check(
    "disabled visible to admin",
    d["total"] == 3 and any(it["id"] == link1["id"] for it in d["items"]),
    b,
)

# re-enable
s, _, b = req("POST", f"/api/admin/links/{link1['id']}/toggle", token=admin_token)
check("toggle enable 200", s == 200, f"{s} {b}")
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("re-enabled get 200", s == 200, f"{s} {b}")

# admin pagination
s, _, b = req("GET", "/api/admin/links?page=1&page_size=2", token=admin_token)
d = j(b)
check("admin pagination", d["total"] == 3 and len(d["items"]) == 2, b)

# owner delete
s, _, b = req("DELETE", f"/api/links/{link1['id']}", token=token)
check("owner delete 200", s == 200, f"{s} {b}")
s, _, b = req("GET", f"/api/links/{link1['id']}")
check("deleted get 404", s == 404, f"{s} {b}")
s, _, b = req("GET", "/api/links")
check("deleted out of list", j(b)["total"] == 2, b)

# unknown api route -> 404 JSON, not the SPA
s, h, b = req("GET", "/api/nope")
check("unknown api 404", s == 404 and "text/html" not in h.get("Content-Type", ""), f"{s} {h.get('Content-Type')} {b}")

# frontend root (dist not built yet: expect 404 JSON)
s, h, b = req("GET", "/")
print(f"[info] GET / -> {s} {h.get('Content-Type')}")

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    raise SystemExit(1)
print("ALL TESTS PASSED")
