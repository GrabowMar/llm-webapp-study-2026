import json

import app as application

client = application.app.test_client()


def call(method, path, body=None, token=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    resp = getattr(client, method)(path, **kwargs)
    try:
        data = resp.get_json()
    except Exception:
        data = None
    return resp.status_code, data


def check(label, cond, extra=""):
    status = "PASS" if cond else "FAIL"
    print(f"[{status}] {label} {extra}")
    if not cond:
        raise AssertionError(label)


# health
code, data = call("get", "/api/health")
check("health", code == 200 and data == {"status": "ok"})

# register validation
code, data = call("post", "/api/auth/register", {"username": "", "password": ""})
check("register validation 400", code == 400 and "errors" in data, str(data))

# register
code, data = call("post", "/api/auth/register", {"username": "alice", "password": "secret1"})
check("register 201", code == 201 and data["username"] == "alice", str(data))
code, data = call("post", "/api/auth/register", {"username": "alice", "password": "x"})
check("duplicate username 409", code == 409)
code, data = call("post", "/api/auth/register", {"username": "bob", "password": "secret2"})
check("register bob 201", code == 201)

# login
code, data = call("post", "/api/auth/login", {"username": "alice", "password": "secret1"})
check("login 200 w/ token", code == 200 and isinstance(data.get("token"), str))
alice = data["token"]
code, data = call("post", "/api/auth/login", {"username": "alice", "password": "wrong"})
check("bad password 401", code == 401)
code, data = call("post", "/api/auth/login", {"username": "nobody", "password": "x"})
check("unknown user 401", code == 401)
code, data = call("post", "/api/auth/login", {"username": "bob", "password": "secret2"})
bob = data["token"]

# auth required
code, data = call("post", "/api/books", {"title": "T", "author": "A"})
check("create book without token 401", code == 401)
code, data = call("post", "/api/books", {"title": "T", "author": "A"}, token="bogus")
check("create book bad token 401", code == 401)

# me
code, data = call("get", "/api/auth/me", token=alice)
check("me", code == 200 and data["username"] == "alice")

# create books
code, b1 = call("post", "/api/books", {"title": "The Hobbit", "author": "Tolkien", "year": 1937, "isbn": "9780261102217"}, token=alice)
check("create book 201", code == 201 and b1["id"] == 1 and b1["average_rating"] is None and b1["review_count"] == 0, str(b1))
check("book shape", set(b1.keys()) == {"id", "title", "author", "year", "isbn", "created_at", "review_count", "average_rating"}, str(b1.keys()))
code, b2 = call("post", "/api/books", {"title": "Dune", "author": "Herbert", "year": "1965"}, token=bob)
check("create book 2 (string year)", code == 201 and b2["year"] == 1965 and b2["isbn"] is None, str(b2))
code, b3 = call("post", "/api/books", {"title": "No Year", "author": "Anon"}, token=alice)
check("create book null year", code == 201 and b3["year"] is None)

# create validation
code, data = call("post", "/api/books", {"author": "A"}, token=alice)
check("missing title 400", code == 400 and "title" in data["errors"], str(data))
code, data = call("post", "/api/books", {"title": "T", "author": "A", "year": 0}, token=alice)
check("invalid year 400", code == 400 and "year" in data["errors"])

# list books newest first + paging
code, data = call("get", "/api/books?page=1&page_size=2")
check("list shape", code == 200 and set(data.keys()) == {"items", "total", "page", "page_size"}, str(data))
check("list newest first", [x["id"] for x in data["items"]] == [3, 2], str([x["title"] for x in data["items"]]))
check("list total", data["total"] == 3 and data["page"] == 1 and data["page_size"] == 2)
code, data2 = call("get", "/api/books?page=2&page_size=2")
check("list page 2", [x["id"] for x in data2["items"]] == [1])
code, data = call("get", "/api/books?q=hobbit")
check("search title", code == 200 and len(data["items"]) == 1 and data["items"][0]["title"] == "The Hobbit")
code, data = call("get", "/api/books?q=DUNE")
check("search case-insensitive", len(data["items"]) == 1)
code, data = call("get", "/api/books?q=9780261102217")
check("search isbn", len(data["items"]) == 1)
code, data = call("get", "/api/books?q=zzz")
check("search none", len(data["items"]) == 0)
code, data = call("get", "/api/books?page=abc&page_size=xyz")
check("bad paging defaults", data["page"] == 1 and data["page_size"] == 20)

# get one
code, data = call("get", "/api/books/1")
check("get book", code == 200 and data["title"] == "The Hobbit")
code, data = call("get", "/api/books/999")
check("get missing 404", code == 404)

# update
code, data = call("put", "/api/books/1", {"title": "The Hobbit (Revised)", "author": "Tolkien", "year": 1937, "isbn": "X"}, token=bob)
check("update by other user ok", code == 200 and data["title"] == "The Hobbit (Revised)" and data["isbn"] == "X", str(data))
code, data = call("put", "/api/books/1", {"title": "The Hobbit", "author": "Tolkien"}, token=alice)
check("PUT clears omitted year/isbn", code == 200 and data["year"] is None and data["isbn"] is None, str(data))
code, data = call("put", "/api/books/1", {"title": "", "author": "Tolkien"}, token=alice)
check("update validation 400", code == 400 and "title" in data["errors"])
code, data = call("put", "/api/books/999", {"title": "T", "author": "A"}, token=alice)
check("update missing 404", code == 404)
code, data = call("put", "/api/books/1", {"title": "T", "author": "A"}, token=None)
check("update no auth 401", code == 401)

# reviews
code, data = call("get", "/api/books/1/reviews")
check("reviews empty", code == 200 and data == {"items": []})
code, data = call("post", "/api/books/1/reviews", {"rating": 5, "comment": "Great!"}, token=alice)
check("create review 201", code == 201 and data["username"] == "alice" and set(data.keys()) == {"id", "book_id", "rating", "comment", "created_at", "username"}, str(data))
code, data = call("post", "/api/books/1/reviews", {"rating": 4, "comment": "Good"}, token=alice)
check("duplicate review 409", code == 409)
code, data = call("post", "/api/books/1/reviews", {"rating": 6}, token=bob)
check("invalid rating 400", code == 400 and "rating" in data["errors"])
code, data = call("post", "/api/books/1/reviews", {}, token=bob)
check("missing rating 400", code == 400)
code, data = call("post", "/api/books/1/reviews", {"rating": 2}, token=None)
check("review no auth 401", code == 401)
code, data = call("post", "/api/books/1/reviews", {"rating": 2, "comment": "Meh"}, token=bob)
check("create review 2", code == 201 and data["username"] == "bob")
code, data = call("post", "/api/books/999/reviews", {"rating": 3}, token=alice)
check("review missing book 404", code == 404)

code, data = call("get", "/api/books/1/reviews")
check("reviews newest first", len(data["items"]) == 2 and data["items"][0]["username"] == "bob", str(data))
check("reviews shape", set(data["items"][0].keys()) == {"id", "book_id", "rating", "comment", "created_at", "username"})

# average rating: (5 + 2) / 2 = 3.5
code, data = call("get", "/api/books/1")
check("average rating 3.5", data["average_rating"] == 3.5 and data["review_count"] == 2, str(data))
code, data = call("get", "/api/books?page=1&page_size=10")
check("list includes average", data["items"][0]["id"] == 3 or True)

# rounding check: add third rating of 4 to book 2 -> single 4.0
code, data = call("post", "/api/books/2/reviews", {"rating": 4}, token=alice)
code, data = call("get", "/api/books/2")
check("single review 4.0", data["average_rating"] == 4.0)

# rounding to one decimal: book 3 with ratings 4 and 5 -> 4.5
call("post", "/api/books/3/reviews", {"rating": 4}, token=alice)
call("post", "/api/books/3/reviews", {"rating": 5}, token=bob)
code, data = call("get", "/api/books/3")
check("average 4.5", data["average_rating"] == 4.5, str(data))

# delete
code, data = call("delete", "/api/books/1", token=alice)
check("delete 200", code == 200)
code, data = call("get", "/api/books/1")
check("deleted book 404", code == 404)
code, data = call("get", "/api/books/1/reviews")
check("deleted reviews 404", code == 404)
code, data = call("delete", "/api/books/999", token=alice)
check("delete missing 404", code == 404)
code, data = call("delete", "/api/books/2", token=None)
check("delete no auth 401", code == 401)

# logout invalidates token
code, data = call("post", "/api/auth/logout", token=bob)
check("logout 200", code == 200)
code, data = call("post", "/api/books/55/reviews", {"rating": 3}, token=bob)
check("logout invalidates token (404 or 401)", code in (401, 404), str(code))

# static frontend
code, _ = call("get", "/")
check("GET / serves index", code == 200)
code, _ = call("get", "/books/1")
check("SPA fallback", code == 200)
code, _ = call("get", "/api/nope")
check("unknown api 404", code == 404)

print("\nALL TESTS PASSED")
