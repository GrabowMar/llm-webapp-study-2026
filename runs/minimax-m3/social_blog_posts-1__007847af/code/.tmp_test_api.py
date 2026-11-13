"""Ad-hoc end-to-end checks against a running blog API."""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
FAILURES = []


def call(method, path, body=None, token=None, expect=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            status = response.status
    except urllib.error.HTTPError as error:
        raw = error.read()
        status = error.code
    try:
        payload = json.loads(raw.decode()) if raw else None
    except json.JSONDecodeError:
        payload = raw.decode()
    if expect is not None and status != expect:
        FAILURES.append(f"{method} {path} -> {status} (expected {expect}): {payload}")
    return status, payload


def check(label, condition, extra=""):
    if condition:
        print(f"  ok  {label}")
    else:
        FAILURES.append(f"{label} {extra}")
        print(f"  FAIL {label} {extra}")


def main():
    status, health = call("GET", "/api/health", expect=200)
    check("health", health == {"status": "ok"}, health)

    status, alice = call("POST", "/api/auth/register", {"username": "alice", "password": "pw-alice"}, expect=201)
    check("register alice", alice["username"] == "alice", alice)
    alice_token = alice["token"]

    status, _ = call("POST", "/api/auth/register", {"username": "alice", "password": "pw-alice"}, expect=409)
    status, _ = call("POST", "/api/auth/register", {"username": "bob", "password": "pw-bob"}, expect=201)
    status, bob = call("POST", "/api/auth/login", {"username": "bob", "password": "pw-bob"}, expect=200)
    check("login returns token only", set(bob.keys()) == {"token"}, bob)
    bob_token = bob["token"]
    status, _ = call("POST", "/api/auth/login", {"username": "bob", "password": "wrong"}, expect=401)
    status, _ = call("POST", "/api/auth/login", {"username": "ghost", "password": "x"}, expect=401)

    status, _ = call("POST", "/api/posts", {"title": "no auth", "content": "x"}, expect=401)
    status, _ = call("POST", "/api/posts", {"title": "x", "content": "y"}, token="garbage", expect=401)

    status, post = call(
        "POST",
        "/api/posts",
        {"title": "Hello world", "content": "First line\nSecond line\n\n" + "z" * 300, "tags": ["Python", "Flask", "python"]},
        token=alice_token,
        expect=201,
    )
    check("post fields", set(post.keys()) == {"id", "title", "content", "tags", "created_at", "updated_at", "author", "excerpt"}, post.keys())
    check("post author", post["author"] == "alice", post["author"])
    check("post tags deduped", post["tags"] == ["Python", "Flask"], post["tags"])
    check("excerpt collapses newlines", "\n" not in post["excerpt"] and post["excerpt"].startswith("First line Second line "), repr(post["excerpt"]))
    check("excerpt length", len(post["excerpt"]) <= 200, len(post["excerpt"]))
    post_id = post["id"]

    status, _ = call("POST", "/api/posts", {"content": "no title"}, token=alice_token, expect=400)
    status, _ = call("POST", "/api/posts", {"title": "   ", "content": "no title"}, token=alice_token, expect=400)

    status, bob_post = call(
        "POST", "/api/posts", {"title": "Bob post", "content": "Bob content here", "tags": ["Rust"]}, token=bob_token, expect=201
    )
    bob_post_id = bob_post["id"]

    status, listing = call("GET", "/api/posts", expect=200)
    check("list envelope", set(listing.keys()) == {"items", "total", "page", "page_size"}, listing.keys())
    check("list total", listing["total"] == 2, listing["total"])
    check("list order newest first", listing["items"][0]["id"] == bob_post_id, listing["items"])
    check("list defaults", listing["page"] == 1 and listing["page_size"] == 20, listing)

    status, listing = call("GET", "/api/posts?page_size=1", expect=200)
    check("page_size honoured", len(listing["items"]) == 1 and listing["page_size"] == 1, listing)
    status, listing = call("GET", "/api/posts?page=2&page_size=1", expect=200)
    check("page 2", listing["page"] == 2 and len(listing["items"]) == 1 and listing["total"] == 2, listing)
    status, listing = call("GET", "/api/posts?q=hello", expect=200)
    check("search q", listing["total"] == 1 and listing["items"][0]["id"] == post_id, listing)
    status, listing = call("GET", "/api/posts?tag=flask", expect=200)
    check("tag filter case-insensitive", listing["total"] == 1, listing)
    status, listing = call("GET", "/api/posts?author=bob", expect=200)
    check("author filter", listing["total"] == 1 and listing["items"][0]["author"] == "bob", listing)
    status, listing = call("GET", "/api/posts?q=nothingmatches", expect=200)
    check("empty search", listing["total"] == 0 and listing["items"] == [], listing)

    status, updated = call(
        "PUT", f"/api/posts/{post_id}", {"title": "Updated title", "content": "Updated body"}, token=alice_token, expect=200
    )
    check("update clears tags", updated["tags"] == [], updated)
    check("updated_at changed", updated["updated_at"] != post["updated_at"], updated)
    check("created_at stable", updated["created_at"] == post["created_at"], updated)

    status, _ = call("PUT", f"/api/posts/{post_id}", {"title": "x", "content": "y"}, token=bob_token, expect=403)
    status, _ = call("PUT", f"/api/posts/{post_id}", {"title": "x", "content": "y"}, expect=401)
    status, _ = call("PUT", "/api/posts/999999", {"title": "x", "content": "y"}, token=alice_token, expect=404)

    status, _ = call("DELETE", f"/api/posts/{post_id}", token=bob_token, expect=403)
    status, _ = call("DELETE", f"/api/posts/{post_id}", expect=401)

    status, admin = call("POST", "/api/auth/login", {"username": "admin", "password": "admin-secret"}, expect=200)
    admin_token = admin["token"]
    status, me = call("GET", "/api/auth/me", token=admin_token, expect=200)
    check("admin me", me["username"] == "admin" and me["is_admin"] is True, me)
    status, _ = call("POST", "/api/admin/posts/%d/toggle" % bob_post_id, token=bob_token, expect=403)
    status, _ = call("POST", "/api/admin/posts/%d/toggle" % bob_post_id, expect=401)

    status, toggled = call("POST", f"/api/admin/posts/{bob_post_id}/toggle", token=admin_token, expect=200)
    check("toggle hides", toggled["hidden"] is True, toggled)
    status, _ = call("GET", f"/api/posts/{bob_post_id}", expect=404)
    status, _ = call("GET", f"/api/posts/{bob_post_id}", token=bob_token, expect=404)
    status, _ = call("GET", f"/api/posts/{bob_post_id}", token=admin_token, expect=200)
    status, listing = call("GET", "/api/posts", expect=200)
    check("hidden excluded from list", all(item["id"] != bob_post_id for item in listing["items"]) and listing["total"] == 1, listing)
    status, hidden_list = call("GET", "/api/admin/posts", token=admin_token, expect=200)
    check("admin sees hidden", hidden_list["total"] == 1 and hidden_list["items"][0]["id"] == bob_post_id, hidden_list)

    status, toggled = call("POST", f"/api/admin/posts/{bob_post_id}/toggle", token=admin_token, expect=200)
    check("restore", toggled["hidden"] is False, toggled)
    status, _ = call("GET", f"/api/posts/{bob_post_id}", expect=200)

    status, _ = call("DELETE", f"/api/posts/{bob_post_id}", token=bob_token, expect=204)
    status, _ = call("GET", f"/api/posts/{bob_post_id}", expect=404)
    status, _ = call("DELETE", f"/api/posts/{post_id}", token=alice_token, expect=204)

    status, listing = call("GET", "/api/posts", expect=200)
    check("all gone", listing["total"] == 0, listing)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURES")
        for failure in FAILURES:
            print(" -", failure)
        sys.exit(1)
    print("all checks passed")


main()
