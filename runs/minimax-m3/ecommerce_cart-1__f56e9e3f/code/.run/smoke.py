"""Smoke test for the shop API."""

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
ADMIN_PW = "secret-admin-pw"
import time
SUF = str(int(time.time()))
ALICE = "alice" + SUF
BOB = "bob" + SUF
failures = []


def call(method, path, payload=None, token=None, expect=None):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("Content-Type", "application/json")
    if token:
        request.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status = response.status
            raw = response.read().decode()
    except urllib.error.HTTPError as error:
        status = error.code
        raw = error.read().decode()
    try:
        body = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        body = raw
    ok = expect is None or status == expect
    print(f"{'PASS' if ok else 'FAIL'} {method:6} {path:34} -> {status}")
    if not ok:
        failures.append(f"{method} {path} expected {expect} got {status}: {body}")
    return status, body


print("--- health / products")
call("GET", "/api/health", expect=200)
status, body = call("GET", "/api/products", expect=200)
assert status == 200
names = [item["name"] for item in body["items"]]
print("   products:", len(body["items"]), "total:", body["total"], "page_size:", body["page_size"])
assert names == sorted(names), names
assert body["total"] >= 8
assert all(item["stock"] >= 10 for item in body["items"]), "seed stock"
call("GET", "/api/products?q=oat", expect=200)
call("GET", "/api/products/1", expect=200)
call("GET", "/api/products/99999", expect=404)
call("GET", "/api/nope", expect=404)

print("--- register / login")
status, body = call("POST", "/api/auth/register", {"username": ALICE, "password": "pw-alice"}, expect=201)
alice_token = body["token"]
call("POST", "/api/auth/register", {"username": ALICE, "password": "pw-alice"}, expect=409)
call("POST", "/api/auth/register", {"username": "admin", "password": "x"}, expect=409)
call("POST", "/api/auth/register", {"username": BOB, "password": "pw-bob"}, expect=201)
status, body = call("POST", "/api/auth/login", {"username": ALICE, "password": "pw-alice"}, expect=200)
alice_token = body["token"]
call("POST", "/api/auth/login", {"username": ALICE, "password": "wrong"}, expect=401)
call("GET", "/api/auth/me", token=alice_token, expect=200)
call("GET", "/api/auth/me", expect=401)
call("GET", "/api/auth/me", token="garbage", expect=401)

print("--- cart")
call("GET", "/api/cart", expect=401)
call("GET", "/api/cart", token=alice_token, expect=200)
status, body = call("POST", "/api/cart", {"product_id": 1, "quantity": 2}, token=alice_token, expect=200)
print("   cart:", json.dumps(body))
assert body["items"][0]["quantity"] == 2
status, body = call("POST", "/api/cart", {"product_id": 1, "quantity": 3}, token=alice_token, expect=200)
assert body["items"][0]["quantity"] == 5, body
status, body = call("POST", "/api/cart", {"product_id": 2, "quantity": 1}, token=alice_token, expect=200)
assert len(body["items"]) == 2
print("   subtotal:", body["subtotal"])
expected = round(15.0 * 5 + 12.5 * 1, 2)
assert abs(body["subtotal"] - expected) < 0.001, (body["subtotal"], expected)
call("POST", "/api/cart", {"product_id": 99999}, token=alice_token, expect=404)
call("POST", "/api/cart", {"product_id": 1, "quantity": 0}, token=alice_token, expect=400)
call("POST", "/api/cart", {"product_id": 1, "quantity": -2}, token=alice_token, expect=400)
call("POST", "/api/cart", {"quantity": 1}, token=alice_token, expect=400)

status, body = call("GET", "/api/cart", token=alice_token, expect=200)
item_id = body["items"][0]["id"]
status, body = call("PATCH", f"/api/cart/{item_id}", {"quantity": 4}, token=alice_token, expect=200)
assert body["items"][0]["quantity"] == 4, body
call("PATCH", f"/api/cart/{item_id}", {"quantity": 0}, token=alice_token, expect=400)

print("--- other user's cart")
status, body = call("POST", "/api/auth/login", {"username": BOB, "password": "pw-bob"}, expect=200)
bob_token = body["token"]
call("PATCH", f"/api/cart/{item_id}", {"quantity": 9}, token=bob_token, expect=404)
call("DELETE", f"/api/cart/{item_id}", token=bob_token, expect=404)
status, body = call("GET", "/api/cart", token=bob_token, expect=200)
assert body["items"] == [] and body["subtotal"] == 0, body

print("--- admin")
call("GET", "/api/admin/products", token=alice_token, expect=403)
call("GET", "/api/admin/products", expect=401)
call("POST", "/api/admin/products", {"name": "X"}, token=alice_token, expect=403)
status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "wrong"}, expect=401)
status, body = call("POST", "/api/auth/login", {"username": "admin", "password": ADMIN_PW}, expect=200)
admin_token = body["token"]
status, body = call("GET", "/api/admin/products", token=admin_token, expect=200)
print("   admin sees", len(body["items"]), "products")

status, body = call(
    "POST",
    "/api/admin/products",
    {"name": "Test Widget", "description": "temp", "price": 12.345, "stock": 5, "is_active": True},
    token=admin_token,
    expect=201,
)
new_id = body["id"]
print("   created:", json.dumps(body))
assert abs(body["price"] - 12.345) < 1e-9, body

status, body = call("PATCH", f"/api/admin/products/{new_id}", {"price": 9.99, "stock": 3}, token=admin_token, expect=200)
assert abs(body["price"] - 9.99) < 1e-9 and body["stock"] == 3, body
call("PATCH", f"/api/admin/products/{new_id}", {"stock": -1}, token=admin_token, expect=400)
call("PATCH", f"/api/admin/products/{new_id}", {"price": "abc"}, token=admin_token, expect=400)
call("PATCH", "/api/admin/products/999999", {"price": 1}, token=admin_token, expect=404)

print("--- inactive handling")
status, body = call("POST", "/api/cart", {"product_id": new_id, "quantity": 2}, token=alice_token, expect=200)
assert len(body["items"]) == 3, body
status, body = call("PATCH", f"/api/admin/products/{new_id}", {"is_active": False}, token=admin_token, expect=200)
assert body["is_active"] is False, body
status, body = call("GET", "/api/cart", token=alice_token, expect=200)
assert len(body["items"]) == 2, body
print("   subtotal after deactivation:", body["subtotal"])
status, body = call("GET", "/api/products?q=Test", expect=200)
assert body["items"] == [], body
call("GET", f"/api/products/{new_id}", expect=404)
call("POST", "/api/cart", {"product_id": new_id}, token=alice_token, expect=404)

print("--- delete cart item")
status, body = call("GET", "/api/cart", token=alice_token, expect=200)
item_id = body["items"][0]["id"]
status, body = call("DELETE", f"/api/cart/{item_id}", token=alice_token, expect=200)
assert len(body["items"]) == 1, body
call("DELETE", f"/api/cart/{item_id}", token=alice_token, expect=404)

print("--- cleanup")
call("DELETE", f"/api/admin/products/{new_id}", token=admin_token, expect=200)
call("GET", f"/api/products/{new_id}", expect=404)
call("DELETE", f"/api/admin/products/{new_id}", token=admin_token, expect=404)
call("DELETE", f"/api/admin/products/{new_id}", token=alice_token, expect=403)

print()
if failures:
    print("FAILURES:")
    for failure in failures:
        print(" -", failure)
    raise SystemExit(1)
print("ALL CHECKS PASSED")
