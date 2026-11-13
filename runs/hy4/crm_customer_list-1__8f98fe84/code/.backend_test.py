import os
import tempfile

tmpdir = tempfile.mkdtemp(dir="/workspace")
os.environ["DATABASE_PATH"] = os.path.join(tmpdir, "test.db")

import sys
sys.path.insert(0, "/workspace/backend")
import app as backend

c = backend.app.test_client()

def check(cond, msg):
    if not cond:
        raise AssertionError(msg)
    print("ok:", msg)

# health
r = c.get("/api/health")
check(r.status_code == 200 and r.get_json() == {"status": "ok"}, "health")

# auth required
r = c.get("/api/customers")
check(r.status_code == 401, "unauthenticated list -> 401")

# register
r = c.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
check(r.status_code == 201, "register 201")
tok1 = r.get_json()["token"]
check(bool(tok1), "register returns token")

r = c.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
check(r.status_code == 409, "duplicate username -> 409")

r = c.post("/api/auth/register", json={"username": "x", "password": "a"})
check(r.status_code == 400, "short password -> 400")

r = c.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
check(r.status_code == 401, "bad login -> 401")
r = c.post("/api/auth/login", json={"username": "ALICE", "password": "secret1"})
check(r.status_code == 200, "login case-insensitive 200")
tok = r.get_json()["token"]
H = {"Authorization": f"Bearer {tok}"}

# second user (all members can change every customer)
c.post("/api/auth/register", json={"username": "bob", "password": "secret2"})
r = c.post("/api/auth/login", json={"username": "bob", "password": "secret2"})
H2 = {"Authorization": f"Bearer {r.get_json()['token']}"}

# bad token
r = c.get("/api/customers", headers={"Authorization": "Bearer nope"})
check(r.status_code == 401, "invalid token -> 401")

# create customers
r = c.post("/api/customers", headers=H, json={"name": "Zoe", "email": "zoe@acme.com", "company": "Acme"})
check(r.status_code == 201, "create 201")
cust = r.get_json()
check(cust["id"] and cust["created_at"], "customer has id + created_at")
check(cust["interaction_count"] == 0 and cust["last_contacted_at"] is None, "no interactions yet")
cid = cust["id"]

r = c.post("/api/customers", headers=H, json={"name": "Amy", "email": "amy@globex.com", "company": "Globex", "phone": "123", "notes": "hi"})
check(r.status_code == 201, "create 2nd")
cid2 = r.get_json()["id"]
r = c.post("/api/customers", headers=H, json={"name": "Bob", "email": "bob@acme.com", "company": "Acme"})
cid3 = r.get_json()["id"]

# duplicate email
r = c.post("/api/customers", headers=H, json={"name": "Dup", "email": "ZOE@acme.com"})
check(r.status_code == 400, "duplicate email -> 400")
check("email" in r.get_json().get("errors", {}), "duplicate email error has field")
check("already exists" in r.get_json()["message"].lower() or "already exists" in str(r.get_json()["errors"]).lower(), "duplicate message present")

# invalid email
r = c.post("/api/customers", headers=H, json={"name": "Bad", "email": "not-an-email"})
check(r.status_code == 400 and "email" in r.get_json()["errors"], "invalid email -> 400")

# missing name
r = c.post("/api/customers", headers=H, json={"email": "x@y.com"})
check(r.status_code == 400 and "name" in r.get_json()["errors"], "missing name -> 400")

# list sorted by name + paging
r = c.get("/api/customers", headers=H)
data = r.get_json()
check(data["total"] == 3, "total 3")
check([i["name"] for i in data["items"]] == ["Amy", "Bob", "Zoe"], "sorted by name")
check(data["page"] == 1 and data["page_size"] == 20, "default paging")

r = c.get("/api/customers?page=2&page_size=2", headers=H)
data = r.get_json()
check(data["total"] == 3 and len(data["items"]) == 1 and data["items"][0]["name"] == "Zoe", "paging page2")
check(data["page"] == 2 and data["page_size"] == 2, "paging echoed")

# q search
r = c.get("/api/customers?q=zoe", headers=H)
check(r.get_json()["total"] == 1, "q search")
# company filter
r = c.get("/api/customers?company=Acme", headers=H)
check(r.get_json()["total"] == 2, "company filter")
# combined
r = c.get("/api/customers?q=zoe&company=Acme", headers=H)
check(r.get_json()["total"] == 1, "combined filter")

# get one
r = c.get(f"/api/customers/{cid}", headers=H)
check(r.status_code == 200 and r.get_json()["email"] == "zoe@acme.com", "get one")
r = c.get("/api/customers/9999", headers=H)
check(r.status_code == 404, "get missing -> 404")

# PUT replaces; omitted optional cleared
r = c.put(f"/api/customers/{cid}", headers=H, json={"name": "Zoe Z", "email": "zoe2@acme.com", "phone": "555"})
check(r.status_code == 200, "put 200")
obj = r.get_json()
check(obj["company"] == "" and obj["notes"] == "", "put clears omitted optionals")
check(obj["phone"] == "555", "put sets provided optional")
# duplicate email on update excluding self ok
r = c.put(f"/api/customers/{cid}", headers=H, json={"name": "Zoe", "email": "zoe2@acme.com"})
check(r.status_code == 200, "put same email self ok")
r = c.put(f"/api/customers/{cid}", headers=H, json={"name": "Zoe", "email": "amy@globex.com"})
check(r.status_code == 400, "put duplicate email -> 400")

# interactions
r = c.post(f"/api/customers/{cid}/interactions", headers=H, json={"kind": "call", "summary": "Called", "occurred_at": "2024-01-01T10:00:00Z"})
check(r.status_code == 201, "log interaction 201")
obj = r.get_json()
check(obj["logged_by"] == "alice", "logged_by signed-in user")
check(obj["kind"] == "call", "kind")

r = c.post(f"/api/customers/{cid}/interactions", headers=H2, json={"kind": "meeting", "summary": "Met", "occurred_at": "2024-06-01T10:00:00Z"})
check(r.get_json()["logged_by"] == "bob", "another member logs")

r = c.get(f"/api/customers/{cid}/interactions", headers=H)
items = r.get_json()["items"]
check(len(items) == 2, "two interactions")
check(items[0]["occurred_at"] > items[1]["occurred_at"], "newest first")

# invalid kind
r = c.post(f"/api/customers/{cid}/interactions", headers=H, json={"kind": "sms", "summary": "x"})
check(r.status_code == 400 and "kind" in r.get_json()["errors"], "invalid kind -> 400")

# last_contacted_at
r = c.get(f"/api/customers/{cid}", headers=H)
check(r.get_json()["last_contacted_at"] == "2024-06-01T10:00:00+00:00", "last_contacted_at = latest")
check(r.get_json()["interaction_count"] == 2, "interaction_count 2")
r = c.get("/api/customers", headers=H)
zoe = [i for i in r.get_json()["items"] if i["name"] == "Zoe"][0]
check(zoe["last_contacted_at"] is not None, "list has last_contacted_at")

# delete cascades
r = c.delete(f"/api/customers/{cid}", headers=H2)
check(r.status_code == 200, "delete by another member ok")
r = c.get(f"/api/customers/{cid}", headers=H)
check(r.status_code == 404, "deleted gone")
# interactions gone (customer 404 for that endpoint too)
r = c.get(f"/api/customers/{cid}/interactions", headers=H)
check(r.status_code == 404, "interactions of deleted -> 404")

print("\nALL TESTS PASSED")
