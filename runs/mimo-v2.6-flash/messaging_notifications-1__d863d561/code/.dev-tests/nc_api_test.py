"""End-to-end API tests for the notification center (development only)."""

import json
import os
import sys
import urllib.error
import urllib.request
from urllib.parse import urlencode

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
FAILURES = []


def req(method, path, token=None, body=None, query=None):
    url = BASE + path
    if query:
        url += "?" + urlencode(query)
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            parsed = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            parsed = raw
        return e.code, parsed


def check(name, cond, detail=""):
    if cond:
        print(f"  ok  {name}")
    else:
        print(f"FAIL  {name} {detail}")
        FAILURES.append(name)


def main():
    st, body = req("GET", "/api/health")
    check("health", st == 200 and body == {"status": "ok"}, f"{st} {body}")

    # --- auth ---
    st, body = req("POST", "/api/auth/register", body={"username": "alice", "password": "pw123456"})
    check("register 201", st == 201, f"{st} {body}")
    st, body = req("POST", "/api/auth/register", body={"username": "alice", "password": "x"})
    check("register duplicate 409", st == 409, f"{st} {body}")
    st, body = req("POST", "/api/auth/register", body={"username": "", "password": "x"})
    check("register empty username 400", st == 400, f"{st} {body}")
    st, body = req("POST", "/api/auth/register", body={"password": "x"})
    check("register missing password 400", st == 400, f"{st} {body}")

    st, body = req("POST", "/api/auth/login", body={"username": "alice", "password": "wrong"})
    check("login bad password 401", st == 401, f"{st} {body}")
    st, body = req("POST", "/api/auth/login", body={"username": "alice", "password": "pw123456"})
    check("login 200 token", st == 200 and isinstance(body.get("token"), str), f"{st} {body}")
    token = body["token"]

    st, me = req("GET", "/api/auth/me", token=token)
    check("me", st == 200 and me == {"username": "alice", "is_admin": False}, f"{st} {me}")

    st, body = req("GET", "/api/notifications")
    check("list no token 401", st == 401, f"{st} {body}")
    st, body = req("GET", "/api/notifications", token="bogus")
    check("list bad token 401", st == 401, f"{st} {body}")

    # --- create ---
    st, n1 = req("POST", "/api/notifications", token=token, body={"message": "first note", "type": "info"})
    check("create 201", st == 201, f"{st} {n1}")
    check(
        "create fields",
        isinstance(n1.get("id"), int)
        and n1.get("message") == "first note"
        and n1.get("type") == "info"
        and n1.get("read") is False
        and isinstance(n1.get("created_at"), str),
        f"{n1}",
    )
    st, n2 = req("POST", "/api/notifications", token=token, body={"message": "second note", "type": "alert"})
    check("create 2 (alert)", st == 201 and n2["type"] == "alert", f"{st} {n2}")
    st, n3 = req("POST", "/api/notifications", token=token, body={"message": "third"})
    check("create default type", st == 201 and n3["type"] == "info", f"{st} {n3}")
    st, body = req("POST", "/api/notifications", token=token, body={})
    check("create no message 400", st == 400, f"{st} {body}")

    # --- list ---
    st, listing = req("GET", "/api/notifications", token=token)
    check("list 200", st == 200, f"{st}")
    check("list keys", set(listing) == {"items", "total", "page", "page_size", "unread_count"}, f"{listing.keys()}")
    check("list total 3", listing["total"] == 3, f"{listing}")
    check("list unread 3", listing["unread_count"] == 3, f"{listing}")
    check(
        "list newest first",
        [i["message"] for i in listing["items"]] == ["third", "second note", "first note"],
        f"{listing['items']}",
    )
    check("list page echo", listing["page"] == 1, f"{listing}")

    st, body = req("PATCH", f"/api/notifications/{n2['id']}", token=token, body={"read": True})
    check("patch read true", st == 200 and body["read"] is True, f"{st} {body}")

    st, listing = req("GET", "/api/notifications", token=token, query={"read": "true"})
    check("filter read=true", listing["total"] == 1 and listing["items"][0]["id"] == n2["id"], f"{listing}")
    st, listing = req("GET", "/api/notifications", token=token, query={"read": "false"})
    check("filter read=false", listing["total"] == 2 and listing["unread_count"] == 2, f"{listing}")
    st, listing = req("GET", "/api/notifications", token=token, query={"type": "alert"})
    check("filter type", listing["total"] == 1 and listing["items"][0]["id"] == n2["id"], f"{listing}")
    st, listing = req("GET", "/api/notifications", token=token, query={"type": "nope"})
    check("filter type empty", listing["total"] == 0 and listing["items"] == [], f"{listing}")

    for i in range(4, 10):
        req("POST", "/api/notifications", token=token, body={"message": f"bulk {i}", "type": "info"})
    st, listing = req("GET", "/api/notifications", token=token, query={"page": 1, "page_size": 4})
    check("page 1 size 4", len(listing["items"]) == 4 and listing["total"] == 9, f"{listing}")
    st, listing2 = req("GET", "/api/notifications", token=token, query={"page": 3, "page_size": 4})
    check("page 3 size 4", len(listing2["items"]) == 1 and listing2["page"] == 3, f"{listing2}")
    ids_p1 = [i["id"] for i in listing["items"]]
    check("pages don't overlap", listing2["items"][0]["id"] not in ids_p1, f"{listing} {listing2}")
    st, listing = req("GET", "/api/notifications", token=token, query={"page": 99, "page_size": 4})
    check("page beyond range", listing["items"] == [] and listing["total"] == 9, f"{listing}")

    st, body = req("GET", f"/api/notifications/{n1['id']}", token=token)
    check("get single", st == 200 and body["id"] == n1["id"] and body["message"] == "first note", f"{st} {body}")

    # --- isolation ---
    st, _ = req("POST", "/api/auth/register", body={"username": "bob", "password": "pw123456"})
    check("register bob", st == 201, f"{st}")
    st, b = req("POST", "/api/auth/login", body={"username": "bob", "password": "pw123456"})
    bob = b["token"]
    st, body = req("GET", f"/api/notifications/{n1['id']}", token=bob)
    check("other user get 404", st == 404, f"{st} {body}")
    st, body = req("PATCH", f"/api/notifications/{n1['id']}", token=bob, body={"read": True})
    check("other user patch 404", st == 404, f"{st} {body}")
    st, body = req("DELETE", f"/api/notifications/{n1['id']}", token=bob)
    check("other user delete 404", st == 404, f"{st} {body}")
    st, body = req("GET", f"/api/notifications/{n1['id']}", token=token)
    check("other user delete did nothing", st == 200, f"{st}")

    # --- read-all / toggles / delete ---
    st, body = req("POST", "/api/notifications/read-all", token=bob)
    check("read-all empty", st == 200 and body == {"updated": 0}, f"{st} {body}")
    st, body = req("POST", "/api/notifications/read-all", token=token)
    check("read-all", st == 200 and body.get("updated", -1) >= 1, f"{st} {body}")
    st, listing = req("GET", "/api/notifications", token=token)
    check("read-all marked all", listing["unread_count"] == 0, f"{listing}")
    st, body = req("POST", "/api/notifications/read-all", token=token)
    check("read-all idempotent", st == 200 and body == {"updated": 0}, f"{st} {body}")

    st, body = req("PATCH", f"/api/notifications/{n1['id']}", token=token, body={"read": False})
    check("patch read false", st == 200 and body["read"] is False, f"{st} {body}")
    st, body = req("PATCH", f"/api/notifications/{n1['id']}", token=token, body={})
    check("patch missing read 400", st == 400, f"{st} {body}")
    st, body = req("DELETE", f"/api/notifications/{n1['id']}", token=token)
    check("delete 200", st == 200, f"{st} {body}")
    st, body = req("GET", f"/api/notifications/{n1['id']}", token=token)
    check("deleted gone 404", st == 404, f"{st} {body}")
    st, body = req("DELETE", f"/api/notifications/{n1['id']}", token=token)
    check("delete again 404", st == 404, f"{st} {body}")

    # --- admin ---
    st, body = req("POST", "/api/auth/login", body={"username": "admin", "password": "anything"})
    check("admin login disabled 401", st == 401, f"{st} {body}")
    st, body = req("POST", "/api/auth/register", body={"username": "admin", "password": "x"})
    check("register admin 409", st == 409, f"{st} {body}")

    st, body = req("POST", "/api/admin/broadcast", token=token, body={"message": "hi all", "type": "announcement"})
    check("broadcast non-admin 403", st == 403, f"{st} {body}")
    st, body = req("POST", "/api/admin/broadcast", body={"message": "hi all"})
    check("broadcast no token 401", st == 401, f"{st} {body}")

    st, body = req("GET", "/api/nope")
    check("unknown api 404 json", st == 404 and isinstance(body, dict) and "error" in body, f"{st} {body}")

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURES: {FAILURES}")
        sys.exit(1)
    print("ALL TESTS PASSED")


if __name__ == "__main__":
    main()
