import json
import subprocess
import sys
import time

import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8111"

def call(method, path, body=None, token=None, expect=None):
    req = urllib.request.Request(BASE + path, method=method)
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    else:
        data = None
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        res = urllib.request.urlopen(req, data)
        payload = res.read()
        out = json.loads(payload) if payload else None
        code = res.status
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            out = json.loads(payload) if payload else None
        except Exception:
            out = payload.decode()
        code = e.code
    if expect is not None and code != expect:
        print(f"FAIL {method} {path}: expected {expect}, got {code}: {out}")
        sys.exit(1)
    print(f"ok  {method} {path} -> {code}")
    return code, out

fails = []
def check(cond, msg):
    if not cond:
        print("FAIL:", msg)
        fails.append(msg)

code, h = call("GET", "/api/health", expect=200)
check(h == {"status": "ok"}, "health body")

# unauthenticated
call("GET", "/api/customers", expect=401)
call("POST", "/api/customers", {"name": "Nope"}, expect=401)
call("GET", "/api/customers", token="bogus", expect=401)

# register
code, _ = call("POST", "/api/auth/register", {"username": "alice", "password": "pw123"}, expect=201)
code, _ = call("POST", "/api/auth/register", {"username": "bob", "password": "pw456"}, expect=201)
call("POST", "/api/auth/register", {"username": "alice", "password": "x"}, expect=400)
call("POST", "/api/auth/register", {"username": ""}, expect=400)

# login
code, r = call("POST", "/api/auth/login", {"username": "alice", "password": "pw123"}, expect=200)
tok = r["token"]
call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"}, expect=401)
code, r2 = call("POST", "/api/auth/login", {"username": "bob", "password": "pw456"}, expect=200)
tok2 = r2["token"]

# create customers
code, c1 = call("POST", "/api/customers", {"name": "Zoe Smith", "email": "zoe@acme.com", "phone": "123", "company": "Acme", "notes": "vip"}, token=tok, expect=201)
check(set(c1.keys()) == {"id","name","email","phone","company","notes","created_at","interaction_count","last_contacted_at"}, f"customer keys: {set(c1.keys())}")
check(c1["last_contacted_at"] is None and c1["interaction_count"] == 0, "new customer defaults")
code, c2 = call("POST", "/api/customers", {"name": "adam Jones", "email": "adam@beta.io", "company": "Beta"}, token=tok2, expect=201)
code, c3 = call("POST", "/api/customers", {"name": "Mia Wong", "company": "Acme"}, token=tok2, expect=201)
call("POST", "/api/customers", {"name": "Dup", "email": "ZOE@acme.com"}, token=tok, expect=400)
call("POST", "/api/customers", {"name": ""}, token=tok, expect=400)
call("POST", "/api/customers", {"name": "Bad email", "email": "not-an-email"}, token=tok, expect=400)

# list: sorted by name, paging
_, page = call("GET", "/api/customers?page=1&page_size=2", token=tok, expect=200)
check(page["total"] == 3 and page["page"] == 1 and page["page_size"] == 2, f"paging meta {page}")
names = [i["name"] for i in page["items"]]
_, page2 = call("GET", "/api/customers?page=2&page_size=2", token=tok, expect=200)
all_names = names + [i["name"] for i in page2["items"]]
check(all_names == sorted(all_names, key=str.lower), f"sorted by name: {all_names}")

# search q
_, sp = call("GET", "/api/customers?q=zoe", token=tok, expect=200)
check(sp["total"] == 1 and sp["items"][0]["id"] == c1["id"], "search by name")
_, sp = call("GET", "/api/customers?q=acme.com", token=tok, expect=200)
check(sp["total"] == 1, "search by email")
# company filter
_, sp = call("GET", "/api/customers?company=Acme", token=tok, expect=200)
check(sp["total"] == 2, "company filter")
_, sp = call("GET", "/api/customers?company=acme", token=tok, expect=200)
check(sp["total"] == 2, "company filter case-insensitive")
_, sp = call("GET", "/api/customers?q=mia&company=Acme", token=tok, expect=200)
check(sp["total"] == 1, "combined filters")

# get one
_, g = call("GET", f"/api/customers/{c1['id']}", token=tok2, expect=200)
check(g["name"] == "Zoe Smith", "get one")
call("GET", "/api/customers/9999", token=tok, expect=404)

# interactions
_, i1 = call("POST", f"/api/customers/{c1['id']}/interactions", {"kind": "call", "summary": "intro call"}, token=tok2, expect=201)
check(set(i1.keys()) == {"id","customer_id","kind","summary","occurred_at","logged_by"}, f"interaction keys {i1.keys()}")
check(i1["logged_by"] == "bob", f"logged_by bob, got {i1['logged_by']}")
check(i1["customer_id"] == c1["id"], "customer id")
_, i2 = call("POST", f"/api/customers/{c1['id']}/interactions", {"kind": "email", "summary": "sent deck", "occurred_at": "2020-01-01T10:00:00Z"}, token=tok, expect=201)
check(i2["logged_by"] == "alice", f"logged_by alice: {i2['logged_by']}")
call("POST", f"/api/customers/{c1['id']}/interactions", {"kind": "", "summary": "x"}, token=tok, expect=400)
call("POST", f"/api/customers/{c1['id']}/interactions", {"kind": "call"}, token=tok, expect=400)
call("POST", "/api/customers/9999/interactions", {"kind": "call", "summary": "x"}, token=tok, expect=404)
call("GET", f"/api/customers/{c1['id']}/interactions", token=tok, expect=200)

_, lst = call("GET", f"/api/customers/{c1['id']}/interactions", token=tok2, expect=200)
check(set(lst.keys()) == {"items"}, "interactions wrapper")
occ = [x["occurred_at"] for x in lst["items"]]
check(occ == sorted(occ, reverse=True), f"newest first {occ}")
check(len(lst["items"]) == 2, "two interactions")

# last_contacted_at updates
_, g = call("GET", f"/api/customers/{c1['id']}", token=tok, expect=200)
check(g["interaction_count"] == 2, "interaction_count")
check(g["last_contacted_at"] == i1["occurred_at"], f"last contacted latest: {g['last_contacted_at']} vs {i1['occurred_at']}")

# PUT replaces, omitted optional cleared
_, upd = call("PUT", f"/api/customers/{c2['id']}", {"name": "Adam Jones Jr", "company": "Beta LLC"}, token=tok, expect=200)
check(upd["email"] is None and upd["phone"] is None and upd["notes"] is None, f"omitted cleared: {upd}")
check(upd["company"] == "Beta LLC", "put fields")
# PUT duplicate email
call("PUT", f"/api/customers/{c2['id']}", {"name": "Adam", "email": "zoe@acme.com"}, token=tok, expect=400)
# PUT same customer keeps own email
_, upd2 = call("PUT", f"/api/customers/{c1['id']}", {"name": "Zoe Smith", "email": "zoe@acme.com"}, token=tok, expect=200)
call("PUT", "/api/customers/9999", {"name": "x"}, token=tok, expect=404)
call("PUT", f"/api/customers/{c1['id']}", {"name": ""}, token=tok, expect=400)

# delete removes interactions
_, del_page_before = call("GET", f"/api/customers?q=beta", token=tok, expect=200)
call("DELETE", f"/api/customers/{c2['id']}", token=tok2, expect=204)
call("GET", f"/api/customers/{c2['id']}", token=tok, expect=404)
call("DELETE", f"/api/customers/{c2['id']}", token=tok, expect=404)

# delete customer 3, then interactions of c1 untouched; delete c1 and confirm interactions gone via new customer with same id? sqlite reuses max id; just check list
_, i3 = call("POST", f"/api/customers/{c3['id']}/interactions", {"kind": "meeting", "summary": "kickoff"}, token=tok, expect=201)
call("DELETE", f"/api/customers/{c3['id']}", token=tok, expect=204)

# persistence across restart: create marker then restart server
_, marker = call("POST", "/api/customers", {"name": "Persist Me", "email": "persist@x.com"}, token=tok, expect=201)

print("PHASE1 OK", json.dumps({"marker_id": marker["id"]}))
