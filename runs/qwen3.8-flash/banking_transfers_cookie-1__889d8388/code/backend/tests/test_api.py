import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# fresh temp workspace so tests don't touch ./data
tmp = tempfile.mkdtemp()
import app as appmod

from pathlib import Path

appmod.DB_PATH = Path(tmp) / "bank.db"
appmod.DATA_DIR = Path(tempfile.mkdtemp())
appmod.init_db()

client = appmod.app.test_client()
failures = []


def check(name, cond, extra=""):
    if not cond:
        failures.append(f"FAIL {name}: {extra}")
        print(f"FAIL {name}: {extra}")
    else:
        print(f"ok   {name}")


def jget(r):
    return r.get_json()


# health
r = client.get("/api/health")
check("health", r.status_code == 200 and jget(r) == {"status": "ok"}, r.data)

# register
r = client.post("/api/auth/register", json={"username": "alice", "password": "pw1"})
check("register alice 201", r.status_code == 201, jget(r))
r = client.post("/api/auth/register", json={"username": "bob", "password": "pw2"})
check("register bob 201", r.status_code == 201)
r = client.post("/api/auth/register", json={"username": "alice", "password": "x"})
check("duplicate 409", r.status_code == 409, jget(r))
r = client.post("/api/auth/register", json={"username": "a", "password": "x"})
check("short username 400", r.status_code == 400)
r = client.post("/api/auth/register", json={"password": "x"})
check("missing username 400", r.status_code == 400)

# login
r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
check("bad login 401", r.status_code == 401)
r = client.post("/api/auth/login", json={"username": "alice", "password": "pw1"})
check("login 200 token", r.status_code == 200 and "token" in jget(r))
alice = jget(r)["token"]
r = client.post("/api/auth/login", json={"username": "bob", "password": "pw2"})
bob = jget(r)["token"]

A = {"Authorization": f"Bearer {alice}"}
B = {"Authorization": f"Bearer {bob}"}

# auth required
r = client.get("/api/account")
check("account unauth 401", r.status_code == 401)
r = client.get("/api/account", headers={"Authorization": "Bearer nonsense"})
check("account bad token 401", r.status_code == 401)

# account
r = client.get("/api/account", headers=A)
check("alice balance 1000", jget(r) == {"username": "alice", "balance": 1000.0}, jget(r))

# csrf
r = client.get("/api/auth/csrf", headers=A)
check("csrf 200", r.status_code == 200 and "csrf_token" in jget(r))
csrf_a = jget(r)["csrf_token"]
r = client.get("/api/auth/csrf")
check("csrf unauth 401", r.status_code == 401)

# transfer without csrf
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 10}, headers=A)
check("transfer without csrf 403", r.status_code == 403, jget(r))
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 10},
                headers={**A, "X-CSRF-Token": "bad"})
check("transfer wrong csrf 403", r.status_code == 403)

# transfer validation
CA = {**A, "X-CSRF-Token": csrf_a}
r = client.post("/api/transfers", json={"to_username": "bob", "amount": -5}, headers=CA)
check("negative amount 400", r.status_code == 400)
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 0}, headers=CA)
check("zero amount 400", r.status_code == 400)
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 10.005}, headers=CA)
check("3-decimal amount 400", r.status_code == 400)
r = client.post("/api/transfers", json={"to_username": "ghost", "amount": 10}, headers=CA)
check("unknown recipient 404", r.status_code == 404)
r = client.post("/api/transfers", json={"amount": 10}, headers=CA)
check("missing recipient 400", r.status_code == 400)

# insufficient balance (atomicity: nothing changes)
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 5000}, headers=CA)
check("insufficient 400", r.status_code == 400 and "insufficient" in jget(r)["message"], jget(r))
bal = client.get("/api/account", headers=A).get_json()["balance"]
check("balance unchanged after failure", bal == 1000.0, bal)
hist = client.get("/api/transfers", headers=A).get_json()
check("no failed transfer recorded", hist["total"] == 0, hist)

# successful transfer
r = client.post("/api/transfers", json={"to_username": "bob", "amount": 42.5, "memo": "pizza"}, headers=CA)
check("transfer 201", r.status_code == 201, jget(r))
t = jget(r)
check(
    "transfer shape",
    set(t) == {"id", "to_username", "amount", "memo", "created_at", "from_username", "direction"}
    and t["from_username"] == "alice" and t["to_username"] == "bob"
    and t["amount"] == 42.5 and t["memo"] == "pizza" and t["direction"] == "out",
    t,
)
check("alice 957.5", client.get("/api/account", headers=A).get_json()["balance"] == 957.5)
check("bob 1042.5", client.get("/api/account", headers=B).get_json()["balance"] == 1042.5)

# bob sees it as 'in'
tid = t["id"]
r = client.get(f"/api/transfers/{tid}", headers=B)
check("bob sees transfer in", jget(r)["direction"] == "in" and jget(r)["to_username"] == "bob", jget(r))

# privacy
client.post("/api/auth/register", json={"username": "eve", "password": "pw3"})
eve = client.post("/api/auth/login", json={"username": "eve", "password": "pw3"}).get_json()["token"]
E = {"Authorization": f"Bearer {eve}"}
check("eve list empty", client.get("/api/transfers", headers=E).get_json()["total"] == 0)
r = client.get(f"/api/transfers/{tid}", headers=E)
check("eve cannot see transfer 404", r.status_code == 404)

# pagination
for i in range(25):
    rr = client.post("/api/transfers", json={"to_username": "bob", "amount": 1, "memo": f"m{i}"}, headers=CA)
    if rr.status_code != 201:
        check("bulk transfer ok", False, rr.get_json())
        break
hist = client.get("/api/transfers?page=1&page_size=10", headers=A).get_json()
check("page shape", set(hist) == {"items", "total", "page", "page_size"})
check("total 26", hist["total"] == 26, hist["total"])
check("page_size", hist["page_size"] == 10 and len(hist["items"]) == 10)
ids = [it["id"] for it in hist["items"]]
check("newest first", ids == sorted(ids, reverse=True), ids)
hist2 = client.get("/api/transfers?page=3&page_size=10", headers=A).get_json()
check("page 3 has 6", len(hist2["items"]) == 6)
check("bob total 26", client.get("/api/transfers", headers=B).get_json()["total"] == 26)
check("eve total 0", client.get("/api/transfers", headers=E).get_json()["total"] == 0)
r = client.get("/api/transfers?page=0", headers=A)
check("bad page 400", r.status_code == 400)
r = client.get("/api/transfers?page_size=0", headers=B)
check("bad page_size 400", r.status_code == 400)

# default page params
hist = client.get("/api/transfers", headers=A).get_json()
check("default page 1 size 20", hist["page"] == 1 and hist["page_size"] == 20 and len(hist["items"]) == 20)

# transfer to self
r = client.post("/api/transfers", json={"to_username": "alice", "amount": 10}, headers=CA)
check("self transfer 201", r.status_code == 201)
r2 = client.get(f"/api/transfers/{r.get_json()['id']}", headers=A).get_json()
check("self transfer direction out", r2["direction"] == "out", r2)
check("alice balance after self", client.get("/api/account", headers=A).get_json()["balance"] == 932.5)

# logout
r = client.post("/api/auth/logout", headers=A)
check("logout 200", r.status_code == 200)
check("token dead after logout", client.get("/api/account", headers=A).status_code == 401)
check("bob still signed in", client.get("/api/account", headers=B).status_code == 200)

# frontend serving
r = client.get("/")
check("index served", r.status_code == 200 and b"<div id=\"root\">" in r.data if os.path.exists(appmod.DIST / "index.html") else True)

shutil.rmtree(tmp)
print()
if failures:
    print(f"{len(failures)} FAILURES")
    sys.exit(1)
print("ALL TESTS PASSED")
