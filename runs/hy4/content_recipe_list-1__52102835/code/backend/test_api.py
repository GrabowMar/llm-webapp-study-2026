import importlib
import json
import os
import sys
import tempfile

workdir = tempfile.mkdtemp(prefix="recipe-test-")
os.environ["DATA_DIR"] = workdir
sys.path.insert(0, "/workspace/backend")
app_module = importlib.import_module("app")
client = app_module.app.test_client()


def check(response, status, label):
    assert response.status_code == status, (
        f"{label}: expected {status}, got {response.status_code}: {response.get_data(as_text=True)}"
    )
    return response.get_json()


check(client.get("/api/health"), 200, "health")

listing = check(client.get("/api/recipes"), 200, "list")
assert listing["total"] == 5, listing
assert listing["page"] == 1 and listing["page_size"] == 12
assert len(listing["items"]) == 5
assert set(listing["items"][0]) == {"id", "title", "category", "prep_minutes", "author"}, listing
assert "ingredients" not in listing["items"][0]
assert listing["items"][0]["id"] > listing["items"][1]["id"]
categories = {item["category"] for item in listing["items"]}
assert len(categories) >= 2, categories

full = check(client.get(f"/api/recipes/{listing['items'][0]['id']}"), 200, "get")
assert set(full) == {
    "id", "title", "ingredients", "instructions", "category",
    "prep_minutes", "servings", "created_at", "author",
}, full
assert isinstance(full["ingredients"], list) and len(full["ingredients"]) > 1
assert "\n" in full["instructions"]
assert full["ingredients"][0] != full["ingredients"][1]

filtered = check(client.get("/api/recipes?category=Breakfast"), 200, "category filter")
assert filtered["total"] == 2, filtered
assert all(i["category"] == "Breakfast" for i in filtered["items"])
searched = check(client.get("/api/recipes?q=PANCAKES"), 200, "search")
assert searched["total"] == 1, searched
assert "Pancakes" in searched["items"][0]["title"]
assert check(client.get("/api/recipes?q=zzzznotfound"), 200, "search empty")["total"] == 0
paged = check(client.get("/api/recipes?page=2&page_size=2"), 200, "paging")
assert paged["total"] == 5 and paged["page"] == 2 and paged["page_size"] == 2
assert len(paged["items"]) == 2
assert paged["items"][0]["id"] == listing["items"][2]["id"]
assert check(client.get("/api/recipes?page_size=9999"), 200, "page_size honored")["page_size"] == 9999
assert check(client.get("/api/recipes?q=p%"), 200, "like escaping")["total"] == 0

check(client.post("/api/recipes", json={"title": "x"}), 401, "create unauth")
check(client.put(f"/api/recipes/{full['id']}", json={}), 401, "edit unauth")
check(client.delete(f"/api/recipes/{full['id']}"), 401, "delete unauth")
check(client.post("/api/recipes", json={"title": "x"}, headers={"Authorization": "Bearer bogus"}), 401, "bad token")

check(client.post("/api/auth/login", json={"username": "chef", "password": "wrong"}), 401, "bad login")
check(client.post("/api/auth/login", json={"username": "nobody", "password": "whatever"}), 401, "no user")
check(client.post("/api/auth/register", json={"username": "ab", "password": "short"}), 400, "short creds")
check(client.post("/api/auth/register", json={"username": "alice", "password": "secret1"}), 201, "register")
dup = check(client.post("/api/auth/register", json={"username": "ALICE", "password": "secret1"}), 409, "dup")
assert "username" in dup["errors"]
login = check(client.post("/api/auth/login", json={"username": "alice", "password": "secret1"}), 200, "login")
token = login["token"]
assert isinstance(token, str) and len(token) >= 20
auth = {"Authorization": f"Bearer {token}"}
me = check(client.get("/api/auth/me", headers=auth), 200, "me")
assert me["username"] == "alice"
check(client.get("/api/auth/me"), 401, "me unauth")

invalid = check(client.post("/api/recipes", json={"title": "", "ingredients": [""], "prep_minutes": -1}, headers=auth), 400, "validation")
assert "title" in invalid["errors"] and "ingredients" in invalid["errors"] and "instructions" in invalid["errors"]

payload = {
    "title": "Test Stew",
    "ingredients": ["First", "Second", "Third"],
    "instructions": "Line one\nLine two\n\nLine four",
    "category": "Dinner",
    "prep_minutes": 45,
    "servings": 6,
}
created = check(client.post("/api/recipes", json=payload, headers=auth), 201, "create")
assert created["author"] == "alice"
assert created["ingredients"] == ["First", "Second", "Third"], created
assert created["instructions"] == payload["instructions"]
assert created["prep_minutes"] == 45 and created["servings"] == 6
rid = created["id"]
assert isinstance(rid, int)
assert check(client.get("/api/recipes"), 200, "list after create")["total"] == 6
assert check(client.get("/api/recipes"), 200, "newest first")["items"][0]["id"] == rid

bob = check(client.post("/api/auth/register", json={"username": "bob", "password": "secret2"}), 201, "register bob")
bob_token = check(client.post("/api/auth/login", json={"username": "bob", "password": "secret2"}), 200, "login bob")["token"]
bob_auth = {"Authorization": f"Bearer {bob_token}"}
check(client.put(f"/api/recipes/{rid}", json=payload, headers=bob_auth), 403, "edit other's")
check(client.delete(f"/api/recipes/{rid}", headers=bob_auth), 403, "delete other's")

replacement = {**payload, "title": "Updated Stew", "ingredients": ["Only one"], "prep_minutes": 10, "servings": 2}
updated = check(client.put(f"/api/recipes/{rid}", json=replacement, headers=auth), 200, "edit own")
assert updated["title"] == "Updated Stew" and updated["ingredients"] == ["Only one"]
assert updated["prep_minutes"] == 10 and updated["servings"] == 2
assert updated["id"] == rid and updated["created_at"] == created["created_at"]
check(client.put("/api/recipes/99999", json=payload, headers=auth), 404, "edit missing")
check(client.get("/api/recipes/99999"), 404, "get missing")

deleted = check(client.delete(f"/api/recipes/{rid}", headers=auth), 200, "delete own")
assert deleted["id"] == rid
check(client.get(f"/api/recipes/{rid}"), 404, "get deleted")
check(client.delete(f"/api/recipes/{rid}", headers=auth), 404, "delete twice")
assert check(client.get("/api/recipes"), 200, "final count")["total"] == 5

cat_list = check(client.get("/api/categories"), 200, "categories")
assert "Breakfast" in cat_list and "Dinner" in cat_list
assert check(client.get("/api/unknown"), 404, "unknown api")["error"]

print("ALL BACKEND TESTS PASSED")
