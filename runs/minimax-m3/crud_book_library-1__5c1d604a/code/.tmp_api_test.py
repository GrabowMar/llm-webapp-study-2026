import json
import os
import sys

sys.path.insert(0, "/workspace/backend")
os.environ.setdefault("DATA_DIR", "/workspace/.tmpdata")

import app as backend  # noqa: E402

client = backend.app.test_client()
fails = []


def check(name, cond, extra=""):
    if cond:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {extra}")
        fails.append(name)


r = client.get("/api/health")
check("health", r.status_code == 200 and r.get_json() == {"status": "ok"}, r.data)

r = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
check("register 201", r.status_code == 201, r.data)
r = client.post("/api/auth/register", json={"username": "alice", "password": "password123"})
check("register dup", r.status_code in (400, 409), r.data)
r = client.post("/api/auth/register", json={"username": "bob", "password": "password123"})
check("register bob", r.status_code == 201, r.data)
r = client.post("/api/auth/register", json={"username": "", "password": ""})
check("register invalid", r.status_code == 400, r.data)
r = client.post("/api/auth/register", json={"username": "x"})
check("register missing pw", r.status_code == 400, r.data)

r = client.post("/api/auth/login", json={"username": "alice", "password": "password123"})
check("login 200", r.status_code == 200 and "token" in r.get_json(), r.data)
token = r.get_json()["token"]
r = client.post("/api/auth/login", json={"username": "alice", "password": "nope"})
check("login bad", r.status_code == 401, r.data)
r = client.post("/api/auth/login", json={"username": "ghost", "password": "x"})
check("login unknown", r.status_code == 401, r.data)

auth = {"Authorization": f"Bearer {token}"}
r = client.get("/api/auth/me", headers=auth)
check("me", r.status_code == 200 and r.get_json()["username"] == "alice", r.data)
r = client.get("/api/auth/me", headers={"Authorization": "Bearer bogus"})
check("me bad token", r.status_code == 401, r.data)

r = client.get("/api/books")
check("books empty", r.status_code == 200 and r.get_json() == {"items": [], "total": 0, "page": 1, "page_size": 20}, r.data)

r = client.post("/api/books", json={"title": "Dune", "author": "Frank Herbert", "year": 1965, "isbn": "9780441013593"})
check("create book unauth", r.status_code == 401, r.data)

r = client.post("/api/books", json={"title": "Dune", "author": "Frank Herbert", "year": 1965, "isbn": "9780441013593"}, headers=auth)
check("create book", r.status_code == 201, r.data)
book = r.get_json()
check("book fields", set(book.keys()) == {"id", "title", "author", "year", "isbn", "created_at", "review_count", "average_rating"}, book)
check("book avg null", book["average_rating"] is None and book["review_count"] == 0, book)

r = client.post("/api/books", json={"title": "", "author": "X"}, headers=auth)
check("create book invalid", r.status_code == 400 and "errors" in r.get_json(), r.data)

r = client.post("/api/books", json={"title": "Neuromancer", "author": "William Gibson"}, headers=auth)
check("create book 2", r.status_code == 201, r.data)
book2 = r.get_json()
check("book2 year null", book2["year"] is None and book2["isbn"] is None, book2)

r = client.get("/api/books")
listing = r.get_json()
check("list count", listing["total"] == 2 and len(listing["items"]) == 2, listing)
check("list newest first", listing["items"][0]["id"] == book2["id"], listing)
check("list keys", set(listing.keys()) == {"items", "total", "page", "page_size"}, listing)

r = client.get("/api/books?q=neuro")
check("search q", r.get_json()["total"] == 1 and r.get_json()["items"][0]["title"] == "Neuromancer", r.data)
r = client.get("/api/books?q=gibson")
check("search author", r.get_json()["total"] == 1, r.data)
r = client.get("/api/books?q=zzz")
check("search none", r.get_json()["total"] == 0, r.data)
r = client.get("/api/books?page=2&page_size=1")
check("paging", r.get_json()["total"] == 2 and len(r.get_json()["items"]) == 1 and r.get_json()["page"] == 2, r.data)
r = client.get("/api/books?page=99&page_size=10")
check("page out of range", r.status_code == 200 and r.get_json()["items"] == [], r.data)

r = client.get(f"/api/books/{book['id']}")
check("get book", r.status_code == 200 and r.get_json()["title"] == "Dune", r.data)
r = client.get("/api/books/9999")
check("get missing book", r.status_code == 404, r.data)

r = client.put(f"/api/books/{book['id']}", json={"title": "Dune (rev)", "author": "Frank Herbert"}, headers=auth)
check("put book", r.status_code == 200, r.data)
updated = r.get_json()
check("put clears year/isbn", updated["year"] is None and updated["isbn"] is None, updated)
r = client.put(f"/api/books/{book['id']}", json={"title": "Only title"}, headers=auth)
check("put missing author", r.status_code == 400, r.data)
r = client.put("/api/books/9999", json={"title": "x", "author": "y"}, headers=auth)
check("put missing book", r.status_code == 404, r.data)
r = client.put(f"/api/books/{book['id']}", json={"title": "x", "author": "y"})
check("put unauth", r.status_code == 401, r.data)

r = client.post(f"/api/books/{book['id']}/reviews", json={"rating": 5, "comment": "Great"})
check("review unauth", r.status_code == 401, r.data)
r = client.post(f"/api/books/{book['id']}/reviews", json={"rating": 5, "comment": "Great"}, headers=auth)
check("review create", r.status_code == 201, r.data)
review = r.get_json()
check("review fields", set(review.keys()) == {"id", "book_id", "rating", "comment", "created_at", "username"}, review)
check("review username", review["username"] == "alice", review)
r = client.post(f"/api/books/{book['id']}/reviews", json={"rating": 4}, headers=auth)
check("review duplicate", r.status_code in (400, 409), r.data)
r = client.post(f"/api/books/{book['id']}/reviews", json={"rating": 9}, headers=auth)
check("review bad rating", r.status_code == 400, r.data)
r = client.post(f"/api/books/{book['id']}/reviews", json={"comment": "no rating"}, headers=auth)
check("review no rating", r.status_code == 400, r.data)

bob_login = client.post("/api/auth/login", json={"username": "bob", "password": "password123"}).get_json()
bob_auth = {"Authorization": f"Bearer {bob_login['token']}"}
r = client.post(f"/api/books/{book['id']}/reviews", json={"rating": 3, "comment": "ok"}, headers=bob_auth)
check("review by bob", r.status_code == 201, r.data)

r = client.get(f"/api/books/{book['id']}/reviews")
check("list reviews", r.status_code == 200 and set(r.get_json().keys()) == {"items"}, r.data)
check("review count", len(r.get_json()["items"]) == 2, r.data)
check("reviews newest first", r.get_json()["items"][0]["username"] == "bob", r.data)

r = client.get(f"/api/books/{book['id']}")
check("avg rating", r.get_json()["average_rating"] == 4.0, r.data)
check("review count on book", r.get_json()["review_count"] == 2, r.data)

r = client.post(f"/api/books/{book2['id']}/reviews", json={"rating": 2}, headers=bob_auth)
r = client.get(f"/api/books/{book2['id']}")
check("avg rating 2.0", r.get_json()["average_rating"] == 2.0, r.data)

r = client.delete(f"/api/books/{book2['id']}", headers=auth)
check("delete", r.status_code in (200, 204), r.data)
r = client.get(f"/api/books/{book2['id']}")
check("deleted gone", r.status_code == 404, r.data)
r = client.get("/api/books")
check("total after delete", r.get_json()["total"] == 1, r.data)

r = client.delete(f"/api/books/{book['id']}", headers=auth)
check("delete with reviews", r.status_code in (200, 204), r.data)
r = client.get(f"/api/books/{book['id']}/reviews")
check("reviews gone", r.status_code == 404, r.data)

r = client.post("/api/auth/register", json={"username": "carol", "password": "pw"})
check("register short password", r.status_code == 201, r.data)

print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
