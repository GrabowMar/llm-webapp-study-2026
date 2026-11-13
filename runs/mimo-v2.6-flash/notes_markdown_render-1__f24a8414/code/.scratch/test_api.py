import json
import sys

sys.path.insert(0, "backend")
from app import app  # noqa: E402

c = app.test_client()
failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"ok   {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {detail}")


def j(resp):
    return json.loads(resp.data)


r = c.get("/api/health")
check("health", r.status_code == 200 and j(r) == {"status": "ok"}, r.data)

r = c.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
check("register 201", r.status_code == 201 and j(r)["username"] == "alice", r.data)
r = c.post("/api/auth/register", json={"username": "alice", "password": "x"})
check("register dup 409", r.status_code == 409, r.data)
r = c.post("/api/auth/register", json={"username": "", "password": "x"})
check("register empty 400", r.status_code == 400, r.data)
r = c.post("/api/auth/register", data="notjson", content_type="text/plain")
check("register bad json 400", r.status_code == 400, r.data)

r = c.post("/api/auth/login", json={"username": "alice", "password": "nope"})
check("login wrong 401", r.status_code == 401, r.data)
r = c.post("/api/auth/login", json={"username": "alice", "password": "secret1"})
check("login 200 token", r.status_code == 200 and isinstance(j(r).get("token"), str) and j(r)["token"], r.data)
tok = j(r)["token"]
H = {"Authorization": f"Bearer {tok}"}

r = c.get("/api/notes")
check("list unauth 401", r.status_code == 401, r.data)
r = c.get("/api/notes", headers={"Authorization": "Bearer badtoken"})
check("list bad token 401", r.status_code == 401, r.data)
r = c.get("/api/notes", headers=H)
check("list empty", r.status_code == 200 and j(r) == {"items": []}, r.data)

r = c.post("/api/notes", headers=H, json={"title": "First", "body": "# Hello\n\nSome **bold** text."})
check("create 201", r.status_code == 201, r.data)
note = j(r)
check("note shape", set(note) == {"id", "title", "body", "published", "updated_at", "author"}, note)
check("note author", note["author"] == "alice" and note["published"] is False, note)
nid = note["id"]

r = c.post("/api/notes", headers=H, json={"title": "Second", "body": "b", "published": True})
check("create published", r.status_code == 201 and j(r)["published"] is True, r.data)
nid2 = j(r)["id"]

r = c.get("/api/notes", headers=H)
items = j(r)["items"]
check("list shape", all(set(i) == {"id", "title", "published", "updated_at"} for i in items), items)
check("list order", [i["id"] for i in items] == [nid2, nid], items)

r = c.get(f"/api/notes/{nid}", headers=H)
check("get note", r.status_code == 200 and j(r)["body"].startswith("# Hello"), r.data)
r = c.get(f"/api/notes/{nid}/html", headers=H)
check(
    "html fragment",
    r.status_code == 200 and r.headers["Content-Type"].startswith("text/html") and b"<h1>Hello</h1>" in r.data and b"<strong>bold</strong>" in r.data,
    r.data,
)
check("html no full doc", not r.data.strip().lower().startswith(b"<!doctype"), r.data[:40])

r = c.patch(f"/api/notes/{nid}", headers=H, json={"title": "Renamed"})
check("patch title", r.status_code == 200 and j(r)["title"] == "Renamed" and j(r)["body"].startswith("# Hello"), r.data)
r = c.patch(f"/api/notes/{nid}", headers=H, json={"published": True})
check("patch published", r.status_code == 200 and j(r)["published"] is True, r.data)
r = c.patch(f"/api/notes/{nid}", headers=H, json={"published": "yes"})
check("patch bad published 400", r.status_code == 400, r.data)
r = c.patch(f"/api/notes/{nid}", headers=H, json={"body": 5})
check("patch bad body 400", r.status_code == 400, r.data)

r = c.get(f"/api/notes/{nid}/html")
check("html unauth 401", r.status_code == 401, r.data)

r = c.get(f"/api/public/notes/{nid}/html")
check("public html published", r.status_code == 200 and b"<h1>Hello</h1>" in r.data, r.data)
r = c.get(f"/api/public/notes/{nid}")
check("public meta", r.status_code == 200 and j(r)["author"] == "alice" and j(r)["title"] == "Renamed", r.data)
r = c.get(f"/api/public/notes/{nid2}/html")
nid2_unpub = None
r = c.patch(f"/api/notes/{nid2}", headers=H, json={"published": False})
r = c.get(f"/api/public/notes/{nid2}/html")
check("public html unpublished 404", r.status_code == 404, r.data)
r = c.get(f"/api/public/notes/{nid2}")
check("public meta unpublished 404", r.status_code == 404, r.data)

r = c.post("/api/auth/register", json={"username": "bob", "password": "hunter22"})
check("register bob", r.status_code == 201, r.data)
r = c.post("/api/auth/login", json={"username": "bob", "password": "hunter22"})
tokb = j(r)["token"]
HB = {"Authorization": f"Bearer {tokb}"}
r = c.get(f"/api/notes/{nid}", headers=HB)
check("other note 404", r.status_code == 404, r.data)
r = c.patch(f"/api/notes/{nid}", headers=HB, json={"title": "hax"})
check("other patch 404", r.status_code == 404, r.data)
r = c.delete(f"/api/notes/{nid}", headers=HB)
check("other delete 404", r.status_code == 404, r.data)
r = c.get(f"/api/notes/{nid}/html", headers=HB)
check("other html 404", r.status_code == 404, r.data)
r = c.get("/api/notes", headers=HB)
check("other list empty", j(r) == {"items": []}, r.data)

r = c.post("/api/notes", headers=H, json={"title": "x", "body": "<script>alert(1)</script>\n\n[ok](javascript:alert(1))\n\n<img src=x onerror=alert(1)>"})
xid = j(r)["id"]
r = c.get(f"/api/notes/{xid}/html", headers=H)
body = r.data.decode()
check("xss script stripped", "<script" not in body, body)
check("xss onerror stripped", "onerror" not in body, body)
check("xss js href stripped", "javascript:" not in body, body)
check("safe link kept", ">ok</a>" in body, body)

r = c.delete(f"/api/notes/{xid}", headers=H)
check("delete 204", r.status_code == 204, r.status_code)
r = c.get(f"/api/notes/{xid}", headers=H)
check("deleted gone", r.status_code == 404, r.data)
r = c.get("/api/notes", headers=H)
check("list after delete", [i["title"] for i in j(r)["items"]] == ["Second", "Renamed"], r.data)

c.patch(f"/api/notes/{nid}", headers=H, json={"title": "Renamed again"})
r = c.get("/api/notes", headers=H)
check("recently updated first", [i["id"] for i in j(r)["items"]] == [nid, nid2], j(r))

r = c.get("/api/nonexistent")
check("unknown api 404 json", r.status_code == 404 and r.is_json and "error" in j(r), r.data)
r = c.post("/api/notes/1", headers=H)
check("wrong method 405 json", r.status_code == 405 and r.is_json, r.data)
r = c.get("/api/notes/abc", headers=H)
check("bad id 404 json", r.status_code == 404 and r.is_json, r.data)
r = c.get("/api/health", headers=H)
check("health no auth needed", r.status_code == 200, r.data)

r = c.post("/api/auth/login", json={"username": "nosuch", "password": "x"})
check("login unknown 401", r.status_code == 401, r.data)
r = c.post("/api/auth/login", json={"username": "alice"})
check("login missing pw 400", r.status_code == 400, r.data)

print()
if failures:
    print("FAILURES:", failures)
    sys.exit(1)
print("all checks passed")
