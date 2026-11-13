import json
import sys

sys.path.insert(0, "backend")
import app as backend

client = backend.app.test_client()
failures = []


def check(label, condition, extra=""):
    if condition:
        print(f"ok   {label}")
    else:
        print(f"FAIL {label} {extra}")
        failures.append(label)


health = client.get("/api/health")
check("health 200", health.status_code == 200)
check("health body", health.get_json() == {"status": "ok"}, health.get_json())

reg = client.post("/api/auth/register", json={"username": "alice", "password": "s3cret"})
check("register 201", reg.status_code == 201, reg.get_json())
check("register body username", (reg.get_json() or {}).get("username") == "alice", reg.get_json())

dup = client.post("/api/auth/register", json={"username": "alice", "password": "s3cret"})
check("duplicate register rejected", dup.status_code in (400, 409), dup.status_code)

bad = client.post("/api/auth/register", json={"username": "", "password": ""})
check("register validation 400", bad.status_code == 400, bad.status_code)
check("register validation fields", "username" in (bad.get_json() or {}).get("errors", {}), bad.get_json())

login = client.post("/api/auth/login", json={"username": "alice", "password": "s3cret"})
check("login 200", login.status_code == 200, login.status_code)
token = (login.get_json() or {}).get("token")
check("login token present", bool(token), login.get_json())

wrong = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
check("bad login 401", wrong.status_code == 401, wrong.status_code)

missing = client.post("/api/auth/login", json={})
check("empty login 400", missing.status_code == 400, missing.status_code)

anon = client.post("/api/recipes", json={"title": "Nope"})
check("create without token 401", anon.status_code == 401, anon.status_code)

bad_token = client.post("/api/recipes", json={"title": "Nope"}, headers={"Authorization": "Bearer garbage"})
check("create with bad token 401", bad_token.status_code == 401, bad_token.status_code)

headers = {"Authorization": f"Bearer {token}"}

created = client.post(
    "/api/recipes",
    json={
        "title": "Tomato Soup",
        "ingredients": ["2 tomatoes", "1 onion", "salt"],
        "instructions": "Chop.\nSimmer.\nBlend.",
        "category": "Soup",
        "prep_minutes": 20,
        "servings": 4,
    },
    headers=headers,
)
check("create 201", created.status_code == 201, created.get_json())
recipe = created.get_json() or {}
check("create author", recipe.get("author") == "alice", recipe)
check("create ingredients order", recipe.get("ingredients") == ["2 tomatoes", "1 onion", "salt"], recipe)
check(
    "create fields",
    set(recipe.keys()) == {
        "id",
        "title",
        "ingredients",
        "instructions",
        "category",
        "prep_minutes",
        "servings",
        "created_at",
        "author",
    },
    sorted(recipe.keys()),
)
recipe_id = recipe.get("id")

invalid = client.post("/api/recipes", json={"title": "", "servings": 0}, headers=headers)
check("create validation 400", invalid.status_code == 400, invalid.status_code)
check("validation messages", bool((invalid.get_json() or {}).get("errors")), invalid.get_json())

fetched = client.get(f"/api/recipes/{recipe_id}")
check("get 200", fetched.status_code == 200, fetched.status_code)
check("get instructions", (fetched.get_json() or {}).get("instructions") == "Chop.\nSimmer.\nBlend.")

missing_recipe = client.get("/api/recipes/999999")
check("get missing 404", missing_recipe.status_code == 404, missing_recipe.status_code)
check("missing recipe json", "error" in (missing_recipe.get_json() or {}), missing_recipe.get_json())

listed = client.get("/api/recipes").get_json() or {}
check("list keys", set(listed.keys()) == {"items", "total", "page", "page_size"}, sorted(listed.keys()))
check("list total", listed.get("total") == 5, listed.get("total"))
check("list newest first", (listed.get("items") or [{}])[0].get("title") == "Tomato Soup", listed.get("items"))
check(
    "list item fields",
    set((listed.get("items") or [{}])[0].keys()) == {"id", "title", "category", "prep_minutes", "author"},
    sorted((listed.get("items") or [{}])[0].keys()),
)

paged = client.get("/api/recipes?page=1&page_size=2").get_json() or {}
check("page size honoured", len(paged.get("items") or []) == 2, paged)
check("page value", paged.get("page") == 1 and paged.get("page_size") == 2, paged)
check("paged total", paged.get("total") == 5, paged)

page2 = client.get("/api/recipes?page=2&page_size=2").get_json() or {}
check("page 2 differs", page2["items"][0]["id"] != paged["items"][0]["id"], page2)

filtered = client.get("/api/recipes?category=Dinner").get_json() or {}
check("category filter", filtered.get("total") == 2, filtered)

search = client.get("/api/recipes?q=curry").get_json() or {}
check("search filter", search.get("total") == 1, search)

search_miss = client.get("/api/recipes?q=zzzz").get_json() or {}
check("search empty", search_miss.get("total") == 0 and search_miss.get("items") == [], search_miss)

updated = client.put(
    f"/api/recipes/{recipe_id}",
    json={
        "title": "Roasted Tomato Soup",
        "ingredients": ["2 tomatoes", "1 onion"],
        "instructions": "Roast.\nBlend.",
        "category": "Soup",
        "prep_minutes": 25,
        "servings": 6,
    },
    headers=headers,
)
check("put 200", updated.status_code == 200, updated.get_json())
check("put replaced", (updated.get_json() or {}).get("title") == "Roasted Tomato Soup", updated.get_json())
check("put ingredients", (updated.get_json() or {}).get("ingredients") == ["2 tomatoes", "1 onion"], updated.get_json())

put_anon = client.put(f"/api/recipes/{recipe_id}", json={"title": "Hijack"})
check("put without token 401", put_anon.status_code == 401, put_anon.status_code)

bob_reg = client.post("/api/auth/register", json={"username": "bob", "password": "hunter2"})
bob_login = client.post("/api/auth/login", json={"username": "bob", "password": "hunter2"})
bob_headers = {"Authorization": f"Bearer {bob_login.get_json()['token']}"}
put_bob = client.put(f"/api/recipes/{recipe_id}", json={"title": "Hijack"}, headers=bob_headers)
check("put by other user 403", put_bob.status_code == 403, put_bob.status_code)
del_bob = client.delete(f"/api/recipes/{recipe_id}", headers=bob_headers)
check("delete by other user 403", del_bob.status_code == 403, del_bob.status_code)

deleted = client.delete(f"/api/recipes/{recipe_id}", headers=headers)
check("delete 2xx", deleted.status_code in (200, 204), deleted.status_code)
check("deleted gone", client.get(f"/api/recipes/{recipe_id}").status_code == 404)

del_missing = client.delete("/api/recipes/999999", headers=headers)
check("delete missing 404", del_missing.status_code == 404, del_missing.status_code)

unknown_api = client.get("/api/does-not-exist")
check("unknown api 404 json", unknown_api.status_code == 404, unknown_api.status_code)
check(
    "unknown api body",
    unknown_api.get_json() is not None,
    unknown_api.data[:60],
)

categories = client.get("/api/categories").get_json() or []
check("categories list", len(categories) >= 2, categories)

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    sys.exit(1)
print("all checks passed")
