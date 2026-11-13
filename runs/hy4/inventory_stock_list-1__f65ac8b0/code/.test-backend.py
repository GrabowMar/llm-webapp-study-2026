import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, "/workspace/backend")
os.environ["INVENTORY_DATA_DIR"] = "/workspace/.test-data"
import shutil
shutil.rmtree("/workspace/.test-data", ignore_errors=True)

import app as backend

client = backend.app.test_client()

def call(method, path, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(
        "http://localhost" + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method,
    )
    # use flask test client instead
    return None

def req(method, path, data=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    kwargs = {"headers": headers}
    if data is not None:
        kwargs["json"] = data
    return getattr(client, method.lower())(path, **kwargs)

def check(cond, msg):
    if not cond:
        raise AssertionError(msg)

r = req("get", "/api/health")
check(r.status_code == 200 and r.json == {"status": "ok"}, "health")

r = req("get", "/api/items")
check(r.status_code == 200 and r.json["items"] == [] and r.json["total"] == 0, "empty list")

r = req("post", "/api/items", {"name": "A", "sku": "S1", "location": "L", "quantity": 5, "reorder_level": 3})
check(r.status_code == 401, "create requires auth")

r = req("post", "/api/auth/register", {"username": "alice", "password": "pw"})
check(r.status_code == 201, "register " + str(r.json))
r = req("post", "/api/auth/register", {"username": "alice", "password": "pw"})
check(r.status_code == 400 and "username" in r.json["errors"], "duplicate username")
r = req("post", "/api/auth/register", {"username": "bob", "password": "pw"})
check(r.status_code == 201, "register bob")
r = req("post", "/api/auth/register", {"username": "", "password": ""})
check(r.status_code == 400 and set(r.json["errors"]) == {"username", "password"}, "register validation")

r = req("post", "/api/auth/login", {"username": "alice", "password": "bad"})
check(r.status_code == 401, "bad login")
r = req("post", "/api/auth/login", {"username": "alice", "password": "pw"})
check(r.status_code == 200 and r.json["token"], "login")
token = r.json["token"]
r = req("get", "/api/auth/me", token=token)
check(r.status_code == 200 and r.json["username"] == "alice", "me")
r = req("get", "/api/auth/me", token="bogus")
check(r.status_code == 401, "bad token")

r = req("post", "/api/items", {"name": "Widget", "sku": "W-1", "location": "Aisle 1", "quantity": 10, "reorder_level": 5}, token)
check(r.status_code == 201, "create item " + str(r.json))
item = r.json
check(item["quantity"] == 10 and item["low_stock"] is False, "opening quantity")
wid = item["id"]

r = req("post", "/api/items", {"name": "Dup", "sku": "w-1", "location": "X", "quantity": 1, "reorder_level": 0}, token)
check(r.status_code == 400 and r.json["errors"]["sku"], "duplicate sku " + str(r.json))
r = req("post", "/api/items", {"name": "", "sku": "", "location": "", "quantity": -1, "reorder_level": -2}, token)
check(r.status_code == 400 and set(r.json["errors"]) == {"name", "sku", "location", "quantity", "reorder_level"}, "create validation " + str(r.json))

r = req("post", "/api/items", {"name": "Gadget", "sku": "G-1", "location": "Aisle 2", "quantity": 2, "reorder_level": 5}, token)
check(r.status_code == 201, "create gadget")
gid = r.json["id"]
check(r.json["low_stock"] is True, "low stock flag")

r = req("get", "/api/items")
check([i["sku"] for i in r.json["items"]] == ["G-1", "W-1"], "sorted by name (Gadget, Widget)")
check(r.json["total"] == 2 and r.json["page"] == 1 and r.json["page_size"] == 20, "paging meta")
r = req("get", "/api/items?q=widget")
check([i["sku"] for i in r.json["items"]] == ["W-1"], "q filter")
r = req("get", "/api/items?location=Aisle%202")
check([i["sku"] for i in r.json["items"]] == ["G-1"], "location filter")
r = req("get", "/api/items?low_stock=true")
check([i["sku"] for i in r.json["items"]] == ["G-1"], "low_stock filter")
r = req("get", "/api/items?page=1&page_size=1")
check(len(r.json["items"]) == 1 and r.json["page_size"] == 1 and r.json["total"] == 2, "page_size")
r = req("get", "/api/items?page=2&page_size=1")
check([i["sku"] for i in r.json["items"]] == ["W-1"], "page 2")

r = req("get", f"/api/items/{wid}")
check(r.status_code == 200 and r.json["quantity"] == 10, "get item")
r = req("get", "/api/items/999")
check(r.status_code == 404, "missing item")

r = req("put", f"/api/items/{wid}", {"name": "Widget Pro", "sku": "W-1", "location": "Aisle 3", "reorder_level": 7, "quantity": 999}, token)
check(r.status_code == 200 and r.json["quantity"] == 10 and r.json["reorder_level"] == 7 and r.json["name"] == "Widget Pro", "put leaves quantity " + str(r.json))
r = req("put", f"/api/items/{wid}", {"name": "W", "sku": "G-1", "location": "A", "reorder_level": 0}, token)
check(r.status_code == 400 and r.json["errors"]["sku"], "put duplicate sku")
r = req("put", f"/api/items/{wid}", {"name": "W", "sku": "W-1", "location": "Aisle 3", "reorder_level": 7})
check(r.status_code == 401, "put requires auth")

r = req("get", f"/api/items/{wid}/movements")
check(r.status_code == 200 and r.json == {"items": []}, "empty movements " + str(r.json))

r = req("post", f"/api/items/{wid}/movements", {"delta": 5, "reason": "restock"})
check(r.status_code == 401, "movement requires auth")
r = req("post", f"/api/items/{wid}/movements", {"delta": 5, "reason": "restock"}, token)
check(r.status_code == 201, "receive " + str(r.json))
m = r.json
check(set(m) == {"id", "item_id", "delta", "reason", "quantity_after", "created_at", "username"}, "movement shape")
check(m["delta"] == 5 and m["quantity_after"] == 15 and m["username"] == "alice" and m["reason"] == "restock", "movement values")
r = req("post", f"/api/items/{wid}/movements", {"delta": -20}, token)
check(r.status_code == 400, "refuse below zero " + str(r.json))
r = req("get", f"/api/items/{wid}")
check(r.json["quantity"] == 15, "quantity unchanged after refusal")
r = req("get", f"/api/items/{wid}/movements")
check(len(r.json["items"]) == 1, "movement not recorded after refusal")

r = req("post", f"/api/items/{wid}/movements", {"delta": -4}, token)
check(r.status_code == 201 and r.json["quantity_after"] == 11, "take out")
r = req("post", f"/api/items/{wid}/movements", {"delta": 0}, token)
check(r.status_code == 400 and r.json["errors"]["delta"], "zero delta")
r = req("post", f"/api/items/{wid}/movements", {"delta": "abc"}, token)
check(r.status_code == 400, "bad delta")
r = req("get", f"/api/items/{wid}/movements")
check([m["delta"] for m in r.json["items"]] == [-4, 5], "newest first")

r = req("delete", f"/api/items/{gid}")
check(r.status_code == 401, "delete requires auth")
r = req("delete", f"/api/items/{gid}", token=token)
check(r.status_code == 204, "delete")
r = req("get", f"/api/items/{gid}/movements")
check(r.status_code == 404, "movements gone")
r = req("get", "/api/items")
check(r.json["total"] == 1, "item deleted")

r = req("get", "/api/nope")
check(r.status_code == 404 and "error" in r.json, "json 404")

r = req("get", "/")
check(r.status_code == 200, "frontend fallback")
r = req("get", "/some/spa/route")
check(r.status_code == 200, "spa fallback")

print("ALL BACKEND TESTS PASSED")
