import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ["SHOP_DB"] = os.path.join(tempfile.mkdtemp(), "shop.sqlite3")
os.environ["ADMIN_PASSWORD"] = "s3cret-admin"

from backend import app as a

c = a.app.test_client()
failures = []


def check(label, condition, detail=""):
    status = "OK" if condition else "FAIL"
    print(f"[{status}] {label} {detail if not condition else ''}")
    if not condition:
        failures.append(label)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


check("health", c.get("/api/health").json == {"status": "ok"})

r = c.get("/api/products")
check("products sorted by name", [p["name"] for p in r.json["items"]] == sorted(p["name"] for p in r.json["items"]))
check("products >= 8", r.json["total"] >= 8, str(r.json["total"]))
check("all stock >= 10", all(p["stock"] >= 10 for p in r.json["items"]))
check("paging shape", set(r.json) == {"items", "total", "page", "page_size"})

r = c.get("/api/products?page=2&page_size=3")
check("page 2 size 3", r.json["page"] == 2 and r.json["page_size"] == 3 and len(r.json["items"]) == 3)
r = c.get("/api/products?q=ceramic")
check("search", r.json["total"] == 1 and r.json["items"][0]["name"] == "Ceramic Coffee Mug")
r = c.get("/api/products?q=zzzzz")
check("search no match", r.json["total"] == 0)
check("single product", c.get("/api/products/1").json["name"] == "Alpine Water Bottle")

check("cart unauth 401", c.get("/api/cart").status_code == 401)
check("cart post unauth 401", c.post("/api/cart", json={"product_id": 1, "quantity": 2}).status_code == 401)
check("admin unauth 401", c.post("/api/admin/products", json={"name": "X", "price": 1, "stock": 5}).status_code == 401)

r = c.post("/api/auth/register", json={"username": "alice", "password": "pw"})
check("register 201", r.status_code == 201, str(r.status_code))
check("register returns token", "token" in r.json)
alice = r.json["token"]
r2 = c.post("/api/auth/register", json={"username": "alice", "password": "pw"})
check("duplicate register 409", r2.status_code == 409)
check("register admin reserved 409", c.post("/api/auth/register", json={"username": "admin", "password": "x"}).status_code == 409)
check("register missing password 400", c.post("/api/auth/register", json={"username": "bob"}).status_code == 400)

r = c.post("/api/auth/login", json={"username": "alice", "password": "pw"})
check("login 200 token", r.status_code == 200 and "token" in r.json)
check("login wrong pw 401", c.post("/api/auth/login", json={"username": "alice", "password": "no"}).status_code == 401)
check("login unknown 401", c.post("/api/auth/login", json={"username": "nobody", "password": "x"}).status_code == 401)

r = c.post("/api/auth/register", json={"username": "bob", "password": "pw"})
bob = r.json["token"]

r = c.post("/api/cart", json={"product_id": 1, "quantity": 2}, headers=auth(alice))
check("add to cart", r.status_code == 200 and len(r.json["items"]) == 1)
check("unit price from catalogue", r.json["items"][0]["unit_price"] == 14.99)
check("line total", r.json["items"][0]["line_total"] == 29.98)
check("subtotal", r.json["subtotal"] == 29.98)
r = c.post("/api/cart", json={"product_id": 1, "quantity": 3}, headers=auth(alice))
check("add existing increases qty", r.json["items"][0]["quantity"] == 5)
check("cart item shape", set(r.json["items"][0]) == {"id", "product_id", "quantity", "name", "unit_price", "line_total"})
r = c.get("/api/cart", headers=auth(bob))
check("bob cart empty", r.json == {"items": [], "subtotal": 0})

r = c.post("/api/admin/products", json={"name": "Gizmo", "price": 3, "stock": 7}, headers=auth(alice))
check("non-admin create 403", r.status_code == 403)
r = c.post("/api/admin/products", json={"name": "Gizmo", "price": 3, "stock": 7}, headers=auth(bob))
check("non-admin create 403 bob", r.status_code == 403)

r = c.post("/api/auth/login", json={"username": "admin", "password": "s3cret-admin"})
check("admin login 200", r.status_code == 200, str(r.status_code))
admin = r.json["token"]
r = c.post("/api/admin/products", json={"name": "Gizmo", "description": "d", "price": 3, "stock": 7}, headers=auth(admin))
check("admin create 201", r.status_code == 201, str(r.status_code))
gid = r.json["id"]
check("admin product fields", set(r.json) == {"id", "name", "description", "price", "stock", "is_active"})

r = c.patch(f"/api/admin/products/{gid}", json={"price": 5.5, "stock": 2, "is_active": False}, headers=auth(admin))
check("admin patch", r.status_code == 200 and r.json["price"] == 5.5 and r.json["stock"] == 2 and r.json["is_active"] is False)
check("inactive hidden from catalogue", all(p["id"] != gid for p in c.get("/api/products").json["items"]))
check("inactive single 404", c.get(f"/api/products/{gid}").status_code == 404)

r = c.patch("/api/admin/products/1", json={"price": 20}, headers=auth(admin))
check("admin price change", r.status_code == 200 and r.json["price"] == 20)
r = c.get("/api/cart", headers=auth(alice))
check("cart uses current price", r.json["items"][0]["unit_price"] == 20 and r.json["items"][0]["line_total"] == 100)
check("stock unchanged after cart ops", c.get("/api/products/1").json["stock"] == 40)

r = c.post("/api/cart", json={"product_id": gid, "quantity": 1}, headers=auth(alice))
check("add inactive product rejected", r.status_code == 404)
r = c.post("/api/cart", json={"product_id": 99999, "quantity": 1}, headers=auth(alice))
check("add missing product 404", r.status_code == 404)
r = c.post("/api/cart", json={"product_id": 1, "quantity": 0, "price": 0.01}, headers=auth(alice))
check("bad quantity rejected", r.status_code == 400)

r = c.post("/api/cart", json={"product_id": 2, "quantity": 1}, headers=auth(alice))
check("add second product", len(r.json["items"]) == 2)
check("cart oldest first", r.json["items"][0]["product_id"] == 1 and r.json["items"][1]["product_id"] == 2)
check("cart subtotal both", r.json["subtotal"] == 100 + 24.5)

alice_item = r.json["items"][0]["id"]
check("bob cannot patch alice item", c.patch(f"/api/cart/{alice_item}", json={"quantity": 1}, headers=auth(bob)).status_code == 404)
check("bob cannot delete alice item", c.delete(f"/api/cart/{alice_item}", headers=auth(bob)).status_code == 404)
r = c.patch(f"/api/cart/{alice_item}", json={"quantity": 2}, headers=auth(alice))
check("patch quantity", r.status_code == 200 and r.json["items"][0]["quantity"] == 2 and r.json["subtotal"] == 40 + 24.5)
check("patch qty 0 rejected", c.patch(f"/api/cart/{alice_item}", json={"quantity": 0}, headers=auth(alice)).status_code == 400)

r = c.delete(f"/api/cart/{alice_item}", headers=auth(alice))
check("delete item", r.status_code == 200 and len(r.json["items"]) == 1)
check("delete again 404", c.delete(f"/api/cart/{alice_item}", headers=auth(alice)).status_code == 404)

r = c.patch(f"/api/admin/products/2", json={"is_active": False}, headers=auth(admin))
check("deactivate product with cart item", r.status_code == 200)
r = c.get("/api/cart", headers=auth(alice))
check("inactive cart item excluded", r.json == {"items": [], "subtotal": 0})
r = c.patch(f"/api/admin/products/2", json={"is_active": True}, headers=auth(admin))
r = c.get("/api/cart", headers=auth(alice))
check("reactivated item returns", len(r.json["items"]) == 1)

check("bad bearer 401", c.get("/api/cart", headers=auth("nope")).status_code == 401)
check("no header 401", c.get("/api/cart").status_code == 401)
check("admin patch missing product 404", c.patch("/api/admin/products/99999", json={"price": 1}, headers=auth(admin)).status_code == 404)
check("admin patch bad price 400", c.patch("/api/admin/products/1", json={"price": -1}, headers=auth(admin)).status_code == 400)

print()
if failures:
    print(f"{len(failures)} FAILURES:", failures)
    raise SystemExit(1)
print("ALL PASS")
