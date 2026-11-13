"""Ad-hoc API checks for the reservations app (run with the venv python)."""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8000")
FAILURES = []


def call(method, path, body=None, token=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, (json.loads(raw) if raw else None)
        except json.JSONDecodeError:
            return err.code, raw


def check(label, condition, extra=""):
    if condition:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label} {extra}")
        FAILURES.append(label)


def main():
    stamp = os.environ.get("STAMP", "t1")
    alice = f"alice_{stamp}"
    bob = f"bob_{stamp}"

    status, body = call("GET", "/api/health")
    check("health", status == 200 and body == {"status": "ok"}, body)

    status, body = call("POST", "/api/auth/register", {"username": alice, "password": "pw12345"})
    check("register 201", status == 201, (status, body))
    status, body = call("POST", "/api/auth/register", {"username": alice, "password": "pw12345"})
    check("duplicate register 409", status == 409, (status, body))

    status, body = call("POST", "/api/auth/login", {"username": alice, "password": "pw12345"})
    check("login 200 + token", status == 200 and isinstance(body, dict) and body.get("token"), (status, body))
    token = body["token"]

    status, body = call("POST", "/api/auth/login", {"username": alice, "password": "wrong"})
    check("bad password 401", status == 401, (status, body))

    status, body = call("POST", "/api/reservations", {"date": "2030-01-01", "time": "18:00", "party_size": 4})
    check("book without token 401", status == 401, (status, body))

    status, body = call(
        "POST",
        "/api/reservations",
        {"name": "Alice Smith", "email": "alice@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 4, "notes": "window"},
        token,
    )
    check("create reservation 201", status == 201, (status, body))
    res = body or {}
    check(
        "reservation shape",
        set(res.keys()) == {"id", "name", "email", "date", "time", "party_size", "notes", "created_at"},
        res,
    )
    rid = res.get("id")

    status, body = call("GET", "/api/reservations", token=token)
    check("list reservations", status == 200 and body.get("total") == 1 and len(body["items"]) == 1, body)
    check("list sorted", body["items"][0]["id"] == rid, body)

    status, body = call("GET", f"/api/reservations/{rid}", token=token)
    check("get reservation", status == 200 and body["id"] == rid, (status, body))

    status, body = call("GET", "/api/availability?date=2030-01-01")
    check(
        "availability public",
        status == 200
        and body["items"] == [{"time": "18:00", "booked": 4, "remaining": 16}],
        body,
    )

    # second user cannot see the first user's reservation
    call("POST", "/api/auth/register", {"username": bob, "password": "pw12345"})
    status, body = call("POST", "/api/auth/login", {"username": bob, "password": "pw12345"})
    bob_token = body["token"]

    status, body = call("GET", f"/api/reservations/{rid}", token=bob_token)
    check("other user gets 404", status == 404, (status, body))
    status, body = call("PUT", f"/api/reservations/{rid}", {"date": "2030-01-02", "time": "19:00", "party_size": 2}, bob_token)
    check("other user cannot update", status == 404, (status, body))
    status, body = call("DELETE", f"/api/reservations/{rid}", token=bob_token)
    check("other user cannot delete", status == 404, (status, body))
    status, body = call("GET", "/api/reservations", token=bob_token)
    check("other user list empty", body["total"] == 0, body)

    # capacity
    status, body = call(
        "POST",
        "/api/reservations",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 17},
        bob_token,
    )
    check("capacity refused", status >= 400, (status, body))
    check("capacity message mentions full", "full" in str(body.get("error", "")).lower(), body)
    status, body = call("GET", "/api/availability?date=2030-01-01")
    check("capacity unchanged", body["items"] == [{"time": "18:00", "booked": 4, "remaining": 16}], body)

    # exactly 20 fits
    status, body = call(
        "POST",
        "/api/reservations",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 16},
        bob_token,
    )
    check("fills slot exactly", status == 201, (status, body))
    bob_rid = (body or {}).get("id")
    status, body = call("GET", "/api/availability?date=2030-01-01")
    check("slot now full", body["items"] == [{"time": "18:00", "booked": 20, "remaining": 0}], body)

    status, body = call(
        "POST",
        "/api/reservations",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 1},
        bob_token,
    )
    check("over capacity refused", status >= 400, (status, body))

    # replace: own guests not counted twice
    status, body = call(
        "PUT",
        f"/api/reservations/{bob_rid}",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 16, "notes": "changed"},
        bob_token,
    )
    check("replace keeps slot valid", status == 200, (status, body))
    check("replace updates fields", body.get("notes") == "changed" and body.get("party_size") == 16, body)
    status, body = call("GET", "/api/availability?date=2030-01-01")
    check("replace not double counted", body["items"] == [{"time": "18:00", "booked": 20, "remaining": 0}], body)

    # replace with omitted notes clears notes
    status, body = call(
        "PUT",
        f"/api/reservations/{bob_rid}",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-01", "time": "18:00", "party_size": 16},
        bob_token,
    )
    check("notes cleared on replace", status == 200 and body.get("notes") == "", (status, body))

    # replace into a fuller slot is refused and changes nothing
    status, body = call(
        "PUT",
        f"/api/reservations/{bob_rid}",
        {"name": "Bob", "email": "bob@example.com", "date": "2030-01-03", "time": "18:00", "party_size": 21},
        bob_token,
    )
    check("replace refused when too big", status >= 400, (status, body))
    status, body = call("GET", f"/api/reservations/{bob_rid}", token=bob_token)
    check("refused replace changed nothing", body["date"] == "2030-01-01" and body["party_size"] == 16, body)

    # delete frees seats
    status, body = call("DELETE", f"/api/reservations/{bob_rid}", token=bob_token)
    check("delete ok", status in (200, 204), (status, body))
    status, body = call("GET", "/api/availability?date=2030-01-01")
    check("seats freed", body["items"] == [{"time": "18:00", "booked": 4, "remaining": 16}], body)
    status, body = call("GET", f"/api/reservations/{bob_rid}", token=bob_token)
    check("deleted reservation gone", status == 404, (status, body))

    # admin
    status, body = call("GET", "/api/admin/reservations", token=bob_token)
    check("non-admin 403", status == 403, (status, body))
    status, body = call("GET", "/api/admin/reservations")
    check("anonymous admin 401", status == 401, (status, body))

    admin_pw = os.environ.get("ADMIN_PASSWORD")
    if admin_pw:
        status, body = call("POST", "/api/auth/login", {"username": "admin", "password": admin_pw})
        check("admin login", status == 200 and body.get("token"), (status, body))
        admin_token = (body or {}).get("token")
        status, body = call("GET", "/api/admin/reservations", token=admin_token)
        check("admin list", status == 200 and "items" in body and "total" in body and "page" in body and "page_size" in body, body)
        check("admin sees all", body.get("total", 0) >= 1, body)
        status, body = call("GET", "/api/admin/reservations?date=2030-01-01&page=1&page_size=1", token=admin_token)
        check("admin pagination", len(body.get("items", [])) == 1 and body.get("page") == 1 and body.get("page_size") == 1, body)
        status, body = call("GET", "/api/admin/reservations?date=2030-01-01", token=admin_token)
        check("admin date filter", all(i["date"] == "2030-01-01" for i in body["items"]), body)
    else:
        status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "anything"})
        check("admin disabled", status >= 400 and not (body or {}).get("token"), (status, body))

    # validation
    status, body = call("POST", "/api/reservations", {"time": "18:00", "party_size": 2}, token)
    check("missing date 400", status == 400, (status, body))
    status, body = call("POST", "/api/reservations", {"date": "not-a-date", "time": "18:00", "party_size": 2}, token)
    check("bad date 400", status == 400, (status, body))
    status, body = call("POST", "/api/reservations", {"date": "2030-01-01", "time": "99:99", "party_size": 2}, token)
    check("bad time 400", status == 400, (status, body))

    # date filter on user list
    status, body = call("GET", "/api/reservations?date=2030-01-01", token=token)
    check("user list date filter", body["total"] == 1, body)
    status, body = call("GET", "/api/reservations?date=2030-02-02", token=token)
    check("user list date filter empty", body["total"] == 0, body)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURES: {FAILURES}")
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
