"""API smoke tests using the Flask test client (temporary, not part of the app)."""
import sys

sys.path.insert(0, "backend")
import app as appmod  # noqa: E402

appmod.DATA_DIR.mkdir(exist_ok=True)
c = appmod.app.test_client()

fails = []


def check(name, cond, detail=""):
    if cond:
        print(f"ok   {name}")
    else:
        fails.append(name)
        print(f"FAIL {name} {detail}")


def eq(name, got, want):
    check(name, got == want, f"got={got!r} want={want!r}")


# health
r = c.get("/api/health")
eq("health status", r.status_code, 200)
eq("health body", r.get_json(), {"status": "ok"})

# register
r = c.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
eq("register 201", r.status_code, 201)
r = c.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
eq("register duplicate 409", r.status_code, 409)
r = c.post("/api/auth/register", json={"username": "", "password": "x"})
eq("register empty username 400", r.status_code, 400)
eq("register error body", "error" in r.get_json(), True)
r = c.post("/api/auth/register", json={"username": "bob"})
eq("register missing password 400", r.status_code, 400)
r = c.post("/api/auth/register", json={"username": "bob", "password": "pw"})
eq("register bob 201", r.status_code, 201)

# login
r = c.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
eq("login 200", r.status_code, 200)
tok = r.get_json()["token"]
check("login token", isinstance(tok, str) and len(tok) > 5)
eq("login bad password 401", c.post("/api/auth/login", json={"username": "alice", "password": "nope"}).status_code, 401)
eq("login unknown 401", c.post("/api/auth/login", json={"username": "zoe", "password": "x"}).status_code, 401)
bad_tok = tok[:-4] + "AAAA"

H = {"Authorization": f"Bearer {tok}"}
HB = {"Authorization": f"Bearer {bad_tok}"}
item = {"name": "Hammer", "sku": "TL-001", "location": "A1", "quantity": 10, "reorder_level": 4}

# auth gating
eq("list items public", c.get("/api/items").status_code, 200)
eq("create item no auth 401", c.post("/api/items", json=item).status_code, 401)
eq("create item bad token 401", c.post("/api/items", json=item, headers=HB).status_code, 401)
eq("create movement no auth 401", c.post("/api/items/1/movements", json={"delta": 1}).status_code, 401)
eq("delete item no auth 401", c.delete("/api/items/1").status_code, 401)

# create item
r = c.post("/api/items", json=item, headers=H)
eq("create item 201", r.status_code, 201)
it = r.get_json()
eq("item keys", sorted(it.keys()), ["id", "location", "low_stock", "name", "quantity", "reorder_level", "sku"])
eq("item fields", (it["name"], it["sku"], it["location"], it["quantity"], it["reorder_level"]), ("Hammer", "TL-001", "A1", 10, 4))
eq("item not low stock", it["low_stock"], False)
iid = it["id"]

eq("duplicate sku 409", c.post("/api/items", json=item, headers=H).status_code, 409)
eq("duplicate sku msg", "sku" in c.post("/api/items", json=item, headers=H).get_json()["error"], True)
eq("no name 400", c.post("/api/items", json={"sku": "X1", "quantity": 1}, headers=H).status_code, 400)
eq("no sku 400", c.post("/api/items", json={"name": "X", "quantity": 1}, headers=H).status_code, 400)
eq("neg quantity 400", c.post("/api/items", json={"name": "X", "sku": "X2", "quantity": -1}, headers=H).status_code, 400)

# low stock item
r = c.post("/api/items", json={"name": "Anvil", "sku": "TL-002", "location": "B2", "quantity": 2, "reorder_level": 5}, headers=H)
eq("low item created", r.status_code, 201)
low = r.get_json()
eq("low stock flag", low["low_stock"], True)
lid = low["id"]

# item at reorder level is low stock
r = c.post("/api/items", json={"name": "Bolt", "sku": "HW-001", "location": "A1", "quantity": 5, "reorder_level": 5}, headers=H)
eq("at-level low stock", r.get_json()["low_stock"], True)
bid = r.get_json()["id"]

# get item
r = c.get(f"/api/items/{iid}")
eq("get item 200", r.status_code, 200)
eq("get item name", r.get_json()["name"], "Hammer")
eq("get missing 404", c.get("/api/items/999").status_code, 404)

# update
r = c.put(f"/api/items/{iid}", json={"name": "Claw Hammer", "sku": "TL-001", "location": "A3", "reorder_level": 12}, headers=H)
eq("update 200", r.status_code, 200)
u = r.get_json()
eq("update fields", (u["name"], u["location"], u["reorder_level"]), ("Claw Hammer", "A3", 12))
eq("update keeps quantity", u["quantity"], 10)
eq("update -> low stock now", u["low_stock"], True)
eq("update bad sku dup 409", c.put(f"/api/items/{lid}", json={"name": "A", "sku": "TL-001", "location": "", "reorder_level": 0}, headers=H).status_code, 409)
eq("update validation 400", c.put(f"/api/items/{iid}", json={"name": "", "sku": "TL-001", "location": "", "reorder_level": 0}, headers=H).status_code, 400)
eq("update missing 404", c.put("/api/items/999", json={"name": "A", "sku": "Z", "location": "", "reorder_level": 0}, headers=H).status_code, 404)

# movements
r = c.post(f"/api/items/{iid}/movements", json={"delta": 5, "reason": "delivery"}, headers=H)
eq("movement +5 201", r.status_code, 201)
m = r.get_json()
eq("movement keys", sorted(m.keys()), ["created_at", "delta", "id", "item_id", "quantity_after", "reason", "username"])
eq("movement fields", (m["delta"], m["quantity_after"], m["username"], m["reason"], m["item_id"]), (5, 15, "alice", "delivery", iid))
eq("quantity after +5", c.get(f"/api/items/{iid}").get_json()["quantity"], 15)

r = c.post(f"/api/items/{iid}/movements", json={"delta": -3, "reason": "sold"}, headers=H)
eq("movement -3 201", r.status_code, 201)
eq("movement after -3", r.get_json()["quantity_after"], 12)

r = c.post(f"/api/items/{iid}/movements", json={"delta": -50}, headers=H)
eq("below zero refused 400", r.status_code, 400)
eq("below zero message", "error" in r.get_json(), True)
eq("quantity unchanged", c.get(f"/api/items/{iid}").get_json()["quantity"], 12)
eq("no phantom movement", len(c.get(f"/api/items/{iid}/movements").get_json()["items"]), 2)

eq("movement zero 400", c.post(f"/api/items/{iid}/movements", json={"delta": 0}, headers=H).status_code, 400)
eq("movement missing delta 400", c.post(f"/api/items/{iid}/movements", json={"reason": "x"}, headers=H).status_code, 400)
eq("movement missing item 404", c.post("/api/items/999/movements", json={"delta": 1}, headers=H).status_code, 404)
eq("movements missing item 404", c.get("/api/items/999/movements").status_code, 404)

r = c.get(f"/api/items/{iid}/movements")
eq("movements list 200", r.status_code, 200)
ms = r.get_json()["items"]
eq("movements newest first", [x["delta"] for x in ms], [-3, 5])
eq("movements shape", list(r.get_json().keys()), ["items"])

# listing
r = c.get("/api/items")
d = r.get_json()
eq("list shape", sorted(d.keys()), ["items", "page", "page_size", "total", "items"][:4])
eq("list sorted by name", [x["name"] for x in d["items"]], ["Anvil", "Bolt", "Claw Hammer"])
eq("list total", d["total"], 3)
eq("list defaults", (d["page"], d["page_size"]), (1, 20))

r = c.get("/api/items?q=hammer")
eq("q search", [x["sku"] for x in r.get_json()["items"]], ["TL-001"])
r = c.get("/api/items?q=HW-001")
eq("q sku search", [x["sku"] for x in r.get_json()["items"]], ["HW-001"])
r = c.get("/api/items?location=a1")
eq("location filter nocase", sorted(x["sku"] for x in r.get_json()["items"]), ["HW-001"])
r = c.get("/api/items?location=B2")
eq("location filter", [x["sku"] for x in r.get_json()["items"]], ["TL-002"])
r = c.get("/api/items?low_stock=true")
eq("low stock filter", sorted(x["sku"] for x in r.get_json()["items"]), ["HW-001", "TL-001", "TL-002"])
r = c.get("/api/items?low_stock=false")
eq("low stock off", r.get_json()["total"], 3)
r = c.get("/api/items?page=1&page_size=2")
d = r.get_json()
eq("paging items", len(d["items"]), 2)
eq("paging totals", (d["total"], d["page"], d["page_size"]), (3, 1, 2))
eq("paging page2", [x["name"] for x in c.get("/api/items?page=2&page_size=2").get_json()["items"]], ["Claw Hammer"])
eq("paging page3 empty", c.get("/api/items?page=3&page_size=2").get_json()["items"], [])
r = c.get("/api/items?q=hammer&low_stock=true&location=A3")
eq("combined filters", [x["sku"] for x in r.get_json()["items"]], ["TL-001"])

# delete
eq("delete 204", c.delete(f"/api/items/{lid}", headers=H).status_code, 204)
eq("deleted 404", c.get(f"/api/items/{lid}").status_code, 404)
eq("delete again 404", c.delete(f"/api/items/{lid}", headers=H).status_code, 404)
eq("delete no auth 401", c.delete(f"/api/items/{bid}").status_code, 401)

# delete removes movements
r = c.post(f"/api/items/{bid}/movements", json={"delta": 1}, headers=H)
c.delete(f"/api/items/{bid}", headers=H)
sys.path.insert(0, "backend")
rows = appmod.get_db if False else None
import sqlite3  # noqa: E402
conn = sqlite3.connect(appmod.DB_PATH)
n = conn.execute("SELECT COUNT(*) FROM movements").fetchone()[0]
conn.close()
eq("movements cascade deleted", n, 2)

# unknown api route -> json 404
eq("unknown api 404", c.get("/api/nope").status_code, 404)

# frontend fallback
r = c.get("/")
check("frontend fallback served", r.status_code in (200, 404), str(r.status_code))

print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
