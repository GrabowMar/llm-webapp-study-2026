import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"
fails = []


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def check(name, cond, extra=""):
    if cond:
        print(f"PASS  {name}")
    else:
        print(f"FAIL  {name}  {extra}")
        fails.append(name)


s, b = call("GET", "/api/health")
check("health", s == 200 and json.loads(b) == {"status": "ok"}, b)

s, b = call("POST", "/api/auth/register", {"username": "alice", "password": "pw1"})
check("register 201", s == 201, f"{s} {b}")
tok_a = json.loads(b)["token"]
check("register returns token", bool(tok_a))

s, b = call("POST", "/api/auth/register", {"username": "alice", "password": "pw1"})
check("duplicate register 409", s == 409, f"{s} {b}")

s, b = call("POST", "/api/auth/register", {"username": "", "password": "x"})
check("register blank username 4xx", s in (400, 422), f"{s} {b}")

s, b = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("bad login 401", s == 401, f"{s} {b}")

s, b = call("POST", "/api/auth/login", {"username": "alice", "password": "pw1"})
check("login 200 + token", s == 200 and "token" in json.loads(b), f"{s} {b}")
tok_a = json.loads(b)["token"]

s, b = call("GET", "/api/notes")
check("notes without token 401", s == 401, f"{s} {b}")

s, b = call("GET", "/api/notes", token="bogus")
check("notes bad token 401", s == 401, f"{s} {b}")

# --- second user
s, b = call("POST", "/api/auth/register", {"username": "bob", "password": "pw2"})
tok_b = json.loads(b)["token"]

s, b = call("POST", "/api/notes", {"title": "First", "body": "# Hello *world*"}, tok_a)
check("create note 201", s == 201, f"{s} {b}")
n1 = json.loads(b)
check(
    "note shape",
    set(n1) >= {"id", "title", "body", "published", "updated_at", "author"}
    and n1["published"] is False
    and n1["author"] == "alice",
    b,
)

s, b = call("POST", "/api/notes", {"title": "Second", "body": "b2"}, tok_a)
n2 = json.loads(b)
s, b = call("POST", "/api/notes", {"title": "Bobs", "body": "priv"}, tok_b)
nb = json.loads(b)
bob_id = nb["id"]

s, b = call("GET", "/api/notes", token=tok_a)
items = json.loads(b)["items"]
check("list keys only", s == 200 and all(set(i) == {"id", "title", "published", "updated_at"} for i in items), b)
check(
    "list ordered newest first",
    [i["id"] for i in items] == [n2["id"], n1["id"]],
    b,
)
check("list excludes other user", all(i["id"] != bob_id for i in items), b)

# touch n1 to make it newest
s, b = call("PATCH", f"/api/notes/{n1['id']}", {"title": "First!"}, tok_a)
check("patch title", s == 200 and json.loads(b)["title"] == "First!", b)
s, b = call("GET", "/api/notes", token=tok_a)
check("order follows update", json.loads(b)["items"][0]["id"] == n1["id"], b)

# cross-user isolation
s, b = call("GET", f"/api/notes/{n1['id']}", token=tok_b)
check("other user's note 404 GET", s == 404, f"{s} {b}")
s, b = call("PATCH", f"/api/notes/{n1['id']}", {"title": "hax"}, tok_b)
check("other user's note 404 PATCH", s == 404, f"{s} {b}")
s, b = call("DELETE", f"/api/notes/{n1['id']}", token=tok_b)
check("other user's note 404 DELETE", s == 404, f"{s} {b}")
s, b = call("GET", f"/api/notes/{n1['id']}/html", token=tok_b)
check("other user's html 404", s == 404, f"{s} {b}")
s, b = call("GET", f"/api/public/notes/{n1['id']}/html")
check("private html public 404", s == 404, f"{s} {b}")

# own note content + html
nid = n1["id"]
s, b = call("GET", f"/api/notes/{nid}", token=tok_a)
check("get note with body", s == 200 and json.loads(b)["body"] == "# Hello *world*", b)
s, b = call("GET", f"/api/notes/{nid}/html", token=tok_a)
check(
    "rendered html",
    s == 200 and "<h1>Hello <em>world</em></h1>" in b.replace("\n", ""),
    f"{s} {b}",
)
import urllib.request as _u

req = _u.Request(BASE + f"/api/notes/{nid}/html")
req.add_header("Authorization", f"Bearer {tok_a}")
with _u.urlopen(req) as r:
    ct = r.headers.get("Content-Type", "")
check("note html content-type", "text/html" in ct, ct)

s, b = call("DELETE", f"/api/notes/{n2['id']}", token=tok_a)
check("delete 204", s == 204, f"{s} {b}")
s, b = call("GET", f"/api/notes/{n2['id']}", token=tok_a)
check("deleted note gone", s == 404, f"{s} {b}")

s, b = call("GET", f"/api/notes/{n1['id']}", token=tok_a)
check("remaining note intact", s == 200, f"{s} {b}")
nid = n1["id"]

# publishing
s, b = call("PATCH", f"/api/notes/{nid}", {"published": True}, tok_a)
pub = json.loads(b)
check("patch published", s == 200 and pub["published"] is True, b)
s, b = call("GET", f"/api/public/notes/{nid}/html")
check("public html anon 200 markdown", s == 200 and "<h1>Hello <em>world</em></h1>" in b.replace("\n", ""), f"{s} {b}")
s, b = call("GET", f"/api/public/notes/{nid}/html")
import urllib.request as _u

s, b = call("GET", f"/api/public/notes/{nid}/html")
req = _u.Request(BASE + f"/api/public/notes/{nid}/html")
with _u.urlopen(req) as r:
    ct = r.headers.get("Content-Type", "")
check("public html content-type", "text/html" in ct, ct)

s, b = call("GET", f"/api/public/notes/{bob_id}/html")
check("unpublished public 404", s == 404, f"{s} {b}")

# unpublish hides again
s, b = call("PATCH", f"/api/notes/{nid}", {"published": False}, tok_a)
s, b = call("GET", f"/api/public/notes/{nid}/html")
check("unpublished after publish -> 404", s == 404, f"{s} {b}")

# persistence across restart checked later
print()
print("FAILURES:", fails if fails else "none")
