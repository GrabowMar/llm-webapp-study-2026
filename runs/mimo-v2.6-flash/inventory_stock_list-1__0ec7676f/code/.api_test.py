"""Ad-hoc API test runner (not part of the app)."""

import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None, expect=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            status, payload = resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        status, payload = exc.code, exc.read().decode()
    parsed = None
    if payload:
        try:
            parsed = json.loads(payload)
        except json.JSONDecodeError:
            parsed = payload
    if expect is not None and status not in expect:
        failures.append(f"{method} {path} -> {status} (expected {expect}): {payload[:300]}")
    return status, parsed


def check(label, condition, detail=""):
    if not condition:
        failures.append(f"{label} FAILED {detail}")


# health
s, r = call("GET", "/api/health", expect=[200])
check("health", r == {"status": "ok"}, str(r))

# register / login
s, r = call("POST", "/api/auth/register", {"username": "alice", "password": "secret1"}, expect=[201])
check("register 201", s == 201, str(r))
s, r = call("POST", "/api/auth/register", {"username": "alice", "password": "x"}, expect=[400, 409])
check("register dup", s in (400, 409), str(s))
s, r = call("POST", "/api/auth/register", {"username": "", "password": ""}, expect=[400])
check("register empty", s == 400 and "errors" in r, str(r))
s, r = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"}, expect=[401])
check("login bad", s == 401, str(s))
s, r = call("POST", "/api/auth/login", {"username": "alice", "password": "secret1"}, expect=[200])
check("login ok", s == 200 and isinstance(r.get("token"), str), str(r))
token = r["token"]

# second user for movement attribution
call("POST", "/api/auth/register", {"username": "bob", "password": "secret2"}, expect=[201])
s, r = call("POST", "/api/auth/login", {"username": "bob", "password": "secret2"}, expect=[200])
token2 = r["token"]

# auth required
s, r = call("POST", "/api/items", {"name": "X", "sku": "X1"}, expect=[401])
check("no token 401", s == 401, str(s))
s, r = call("POST", "/api/items", {"name": "X", "sku": "X1"}, token="bogus", expect=[401])
check("bad token 401", s == 401, str(s))
s, r = call("PUT", "/api/items/1", {"name": "X"}, expect=[401])
check("put no token 401", s == 401, str(s))
s, r = call("DELETE", "/api/items/1", expect=[401])
check("delete no token 401", s == 401, str(s))
s, r = call("POST", "/api/items/1/movements", {"delta": 1}, expect=[401])
check("movement no token 401", s == 401, str(s))

# create items
items = [
    {"name": "Apple Juice", "sku": "AJ-1", "location": "Aisle A", "quantity": 10, "reorder_level": 5},
    {"name": "Banana Box", "sku": "BB-1", "location": "Aisle B", "quantity": 3, "reorder_level": 5},
    {"name": "Cherry Can", "sku": "CC-1", "location": "Aisle A", "quantity": 0, "reorder_level": 0},
]
ids = []
for body in items:
    s, r = call("POST", "/api/items", body, token=token, expect=[201])
    check("create " + body["sku"], s == 201 and r.get("quantity") == body["quantity"], str(r))
    if s == 201:
        ids.append(r["id"])

# duplicate sku
s, r = call("POST", "/api/items", {"name": "Dup", "sku": "AJ-1"}, token=token, expect=[400])
check("dup sku", s == 400 and "errors" in r and "sku" in r["errors"], str(r))
# missing name
s, r = call("POST", "/api/items", {"sku": "ZZ-9"}, token=token, expect=[400])
check("missing name", s == 400 and r.get("errors", {}).get("name"), str(r))
# bad quantity
s, r = call("POST", "/api/items", {"name": "Bad", "sku": "ZZ-8", "quantity": -1}, token=token, expect=[400])
check("neg qty", s == 400 and "errors" in r, str(r))

# get item
s, r = call("GET", f"/api/items/{ids[0]}", expect=[200])
check("get item", s == 200 and set(r) == {"id", "name", "sku", "location", "quantity", "reorder_level", "low_stock"}, str(r))
s, r = call("GET", "/api/items/999999", expect=[404])
check("get missing 404", s == 404, str(s))

# low stock flags
s, r = call("GET", "/api/items", expect=[200])
by_sku = {i["sku"]: i for i in r["items"]}
check("low flags", by_sku["AJ-1"]["low_stock"] is False and by_sku["BB-1"]["low_stock"] is True and by_sku["CC-1"]["low_stock"] is True, str(r))
check("sorted", [i["name"] for i in r["items"]] == sorted([i["name"] for i in r["items"]], key=str.lower), str(r))
check("total", r["total"] == 3 and r["page"] == 1 and r["page_size"] == 20, str(r))

# filters
s, r = call("GET", "/api/items?q=juice", expect=[200])
check("q search", r["total"] == 1 and r["items"][0]["sku"] == "AJ-1", str(r))
s, r = call("GET", "/api/items?q=AJ", expect=[200])
check("q sku", r["total"] == 1, str(r))
s, r = call("GET", "/api/items?location=Aisle%20A", expect=[200])
check("location", r["total"] == 2, str(r))
s, r = call("GET", "/api/items?low_stock=true", expect=[200])
check("low_stock filter", r["total"] == 2 and all(i["low_stock"] for i in r["items"]), str(r))
s, r = call("GET", "/api/items?low_stock=1", expect=[200])
check("low_stock=1", r["total"] == 2, str(r))
s, r = call("GET", "/api/items?low_stock=false", expect=[200])
check("low_stock=false", r["total"] == 3, str(r))

# paging
call("POST", "/api/items", {"name": "Date Pack", "sku": "DP-1", "location": "Aisle C", "quantity": 7, "reorder_level": 2}, token=token, expect=[201])
s, r = call("GET", "/api/items?page_size=2", expect=[200])
check("page1", r["page"] == 1 and r["page_size"] == 2 and r["total"] == 4 and len(r["items"]) == 2, str(r))
s, r = call("GET", "/api/items?page=2&page_size=2", expect=[200])
check("page2", r["page"] == 2 and len(r["items"]) == 2, str(r))
s, r = call("GET", "/api/items?page=99&page_size=2", expect=[200])
check("page overflow", r["items"] == [] and r["total"] == 4, str(r))
s, r = call("GET", "/api/items?page=0&page_size=0", expect=[200])
check("page invalid", r["page"] == 1 and r["page_size"] == 20, str(r))

# movements
first = ids[0]
s, r = call("GET", f"/api/items/{first}/movements", expect=[200])
check("empty movements", r == {"items": []}, str(r))
s, r = call("POST", f"/api/items/{first}/movements", {"delta": 5, "reason": "delivery"}, token=token, expect=[201])
check("receive", s == 201 and r["delta"] == 5 and r["quantity_after"] == 15 and r["username"] == "alice" and r["reason"] == "delivery" and r["item_id"] == first, str(r))
s, r = call("POST", f"/api/items/{first}/movements", {"delta": -3, "reason": "order"}, token=token2, expect=[201])
check("take out", s == 201 and r["quantity_after"] == 12 and r["username"] == "bob", str(r))
s, r = call("GET", f"/api/items/{first}", expect=[200])
check("qty applied", r["quantity"] == 12, str(r))
# insufficient
s, r = call("POST", f"/api/items/{first}/movements", {"delta": -100}, token=token, expect=[400])
check("insufficient", s == 400 and "error" in r, str(r))
s, r = call("GET", f"/api/items/{first}", expect=[200])
check("unchanged after refusal", r["quantity"] == 12, str(r))
s, r = call("GET", f"/api/items/{first}/movements", expect=[200])
check("no movement recorded", len(r["items"]) == 2, str(r))
# zero delta
s, r = call("POST", f"/api/items/{first}/movements", {"delta": 0}, token=token, expect=[400])
check("zero delta", s == 400, str(s))
# missing delta
s, r = call("POST", f"/api/items/{first}/movements", {}, token=token, expect=[400])
check("missing delta", s == 400 and "errors" in r, str(r))
# newest first
s, r = call("GET", f"/api/items/{first}/movements", expect=[200])
check("newest first", r["items"][0]["delta"] == -3 and r["items"][1]["delta"] == 5, str(r))
# all movement fields
mv = r["items"][0]
check("movement fields", set(mv) == {"id", "item_id", "delta", "reason", "quantity_after", "created_at", "username"}, str(mv))

# movement on missing item
s, r = call("POST", "/api/items/999999/movements", {"delta": 1}, token=token, expect=[404])
check("movement missing item", s == 404, str(s))

# update
s, r = call("PUT", f"/api/items/{ids[1]}", {"name": "Banana Crate", "sku": "BB-1", "location": "Aisle D", "reorder_level": 8}, token=token, expect=[200])
check("update", s == 200 and r["name"] == "Banana Crate" and r["location"] == "Aisle D" and r["reorder_level"] == 8 and r["quantity"] == 3, str(r))
# update keeps quantity, duplicate sku refused
s, r = call("PUT", f"/api/items/{ids[1]}", {"sku": "AJ-1"}, token=token, expect=[400])
check("update dup sku", s == 400 and "errors" in r, str(r))
s, r = call("PUT", f"/api/items/{ids[1]}", {"name": "BC"}, token=token, expect=[200])
check("partial update", s == 200 and r["name"] == "BC" and r["sku"] == "BB-1", str(r))
s, r = call("PUT", "/api/items/999999", {"name": "x"}, token=token, expect=[404])
check("update missing", s == 404, str(s))
# quantity untouched by update
s, r = call("GET", f"/api/items/{ids[1]}", expect=[200])
check("qty untouched", r["quantity"] == 3, str(r))

# delete
s, r = call("DELETE", f"/api/items/{ids[2]}", token=token, expect=[200, 204])
check("delete", s in (200, 204), str(s))
s, r = call("GET", f"/api/items/{ids[2]}", expect=[404])
check("deleted gone", s == 404, str(s))
s, r = call("GET", f"/api/items/{ids[2]}/movements", expect=[200])
check("movements gone", r == {"items": []}, str(r))
s, r = call("DELETE", f"/api/items/{ids[2]}", token=token, expect=[404])
check("delete missing", s == 404, str(s))

# unknown api route
s, r = call("GET", "/api/nope", expect=[404])
check("unknown api", s == 404 and isinstance(r, dict), str(r))

if failures:
    print(f"{len(failures)} FAILURES:")
    for f in failures:
        print(" -", f)
else:
    print("ALL TESTS PASSED")
