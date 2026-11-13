"""End-to-end contract checks for the reservation API (development only)."""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
failures = []


def call(method, path, body=None, token=None, expect=200, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data=data, timeout=10) as resp:
            status, payload = resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:
        status, payload = exc.code, exc.read().decode()
    if status != expect:
        failures.append(f"{method} {path}: expected {expect}, got {status}: {payload[:300]}")
    if raw:
        return status, payload
    try:
        return status, json.loads(payload) if payload else None
    except json.JSONDecodeError:
        failures.append(f"{method} {path}: non-JSON response: {payload[:200]}")
        return status, None


def check(cond, msg):
    if not cond:
        failures.append(msg)


RES_KEYS = {"id", "name", "email", "date", "time", "party_size", "notes", "created_at"}


def booking(**overrides):
    body = {
        "name": "Alice Smith",
        "email": "alice@example.com",
        "date": "2026-12-01",
        "time": "18:00",
        "party_size": 8,
        "notes": "window seat",
    }
    body.update(overrides)
    return body


def run_basic():
    # health
    _, health = call("GET", "/api/health")
    check(health == {"status": "ok"}, f"health: {health}")

    # registration / login
    call("POST", "/api/auth/register", {"username": "alice", "password": "pw12345"}, expect=201)
    call("POST", "/api/auth/register", {"username": "alice", "password": "pw12345"}, expect=409)
    call("POST", "/api/auth/register", {"username": "admin", "password": "pw12345"}, expect=409)
    call("POST", "/api/auth/register", {"username": "bob", "password": "pw12345"}, expect=201)
    call("POST", "/api/auth/register", {"username": "   ", "password": "x"}, expect=400)
    call("POST", "/api/auth/register", {"username": "carol"}, expect=400)
    call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"}, expect=401)
    call("POST", "/api/auth/login", {"username": "ghost", "password": "x"}, expect=401)
    call("POST", "/api/auth/login", {"username": "admin", "password": "whatever"}, expect=401)

    _, body = call("POST", "/api/auth/login", {"username": "alice", "password": "pw12345"})
    alice = body.get("token") if isinstance(body, dict) else None
    check(isinstance(alice, str) and len(alice) > 20, f"alice token: {body}")
    _, body = call("POST", "/api/auth/login", {"username": "bob", "password": "pw12345"})
    bob = body.get("token")

    # unauthenticated requests are refused
    call("GET", "/api/reservations", expect=401)
    call("POST", "/api/reservations", booking(), expect=401)
    call("GET", "/api/reservations/1", expect=401)
    call("PUT", "/api/reservations/1", booking(), expect=401)
    call("DELETE", "/api/reservations/1", expect=401)
    call("GET", "/api/admin/reservations", expect=401)
    call("GET", "/api/reservations", token="not-a-token", expect=401)

    # booking
    st, res1 = call("POST", "/api/reservations", booking(), token=alice, expect=201)
    check(isinstance(res1, dict) and set(res1) == RES_KEYS, f"create shape: {res1}")
    check(res1.get("notes") == "window seat", f"notes: {res1}")
    check(res1.get("created_at"), f"created_at missing: {res1}")
    check(isinstance(res1.get("id"), int), f"id missing: {res1}")
    rid1 = res1["id"]

    # validation
    call("POST", "/api/reservations", booking(name=""), token=alice, expect=400)
    call("POST", "/api/reservations", booking(email="   "), token=alice, expect=400)
    call("POST", "/api/reservations", booking(date="01/12/2026"), token=alice, expect=400)
    call("POST", "/api/reservations", booking(date="2026-13-40"), token=alice, expect=400)
    call("POST", "/api/reservations", booking(time="8:00"), token=alice, expect=400)
    call("POST", "/api/reservations", booking(time="25:00"), token=alice, expect=400)
    call("POST", "/api/reservations", booking(party_size=0), token=alice, expect=400)
    call("POST", "/api/reservations", booking(party_size=-3), token=alice, expect=400)
    call("POST", "/api/reservations", token=alice, expect=400)

    # a reservation on an earlier day, for ordering checks
    call("POST", "/api/reservations", booking(date="2026-11-30", time="09:30", party_size=2),
         token=alice, expect=201)

    # availability
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    check(avail == {"items": [{"time": "18:00", "booked": 8, "remaining": 12}]},
          f"availability: {avail}")
    _, avail = call("GET", "/api/availability?date=2027-01-01")
    check(avail == {"items": []}, f"empty availability: {avail}")

    # capacity: booking that would exceed is refused and changes nothing
    st, msg = call("POST", "/api/reservations", booking(party_size=13), token=bob, expect=409)
    check("full" in str(msg.get("error", "")).lower(), f"full-slot message: {msg}")
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    check(avail["items"][0]["booked"] == 8, f"refused booking changed slot: {avail}")

    st, res2 = call("POST", "/api/reservations", booking(party_size=12), token=bob, expect=201)
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    check(avail == {"items": [{"time": "18:00", "booked": 20, "remaining": 0}]},
          f"slot not filled: {avail}")
    st, msg = call("POST", "/api/reservations", booking(party_size=1), token=alice, expect=409)
    check("full" in str(msg.get("error", "")).lower(), f"full message: {msg}")
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    check(avail["items"][0]["booked"] == 20, f"refused booking changed slot: {avail}")

    # replacement does not count own guests twice
    st, res3 = call("POST", "/api/reservations", booking(time="19:00", party_size=10, notes=None),
                    token=alice, expect=201)
    call("POST", "/api/reservations", booking(time="19:00", party_size=5), token=bob, expect=201)
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    check([s["time"] for s in avail["items"]] == ["18:00", "19:00"], f"slot order: {avail}")
    check(avail["items"][1] == {"time": "19:00", "booked": 15, "remaining": 5},
          f"19:00 slot: {avail}")

    rid3 = res3["id"]
    st, upd = call("PUT", f"/api/reservations/{rid3}", booking(time="19:00", party_size=15),
                   token=alice)
    check(upd.get("party_size") == 15, f"replace to full slot: {upd}")
    st, msg = call("PUT", f"/api/reservations/{rid3}", booking(time="19:00", party_size=16),
                   token=alice, expect=409)
    check("full" in str(msg.get("error", "")).lower(), f"update full message: {msg}")
    _, after = call("GET", f"/api/reservations/{rid3}", token=alice)
    check(after.get("party_size") == 15, f"refused update changed data: {after}")

    # moving a reservation frees the old slot and fills the new one
    st, moved = call("PUT", f"/api/reservations/{rid1}", booking(time="21:00"), token=alice)
    check(moved.get("time") == "21:00", f"move: {moved}")
    _, avail = call("GET", "/api/availability?date=2026-12-01")
    by_time = {s["time"]: s for s in avail["items"]}
    check(by_time["18:00"]["booked"] == 12, f"old slot after move: {by_time}")
    check(by_time["21:00"]["booked"] == 8, f"new slot after move: {by_time}")

    # notes: omitted -> cleared, provided -> replaced
    no_notes = booking(time="21:00")
    no_notes.pop("notes")
    st, upd = call("PUT", f"/api/reservations/{rid1}", no_notes, token=alice)
    check(upd.get("notes") is None, f"omitted notes not cleared: {upd}")
    st, upd = call("PUT", f"/api/reservations/{rid1}",
                   booking(time="21:00", notes="birthday"), token=alice)
    check(upd.get("notes") == "birthday", f"notes not replaced: {upd}")
    st, upd = call("PUT", f"/api/reservations/{rid1}", booking(time="21:00", notes=None),
                   token=alice)
    check(upd.get("notes") is None, f"null notes not cleared: {upd}")

    # other users' reservations behave as if they do not exist
    call("GET", f"/api/reservations/{res2['id']}", token=alice, expect=404)
    call("PUT", f"/api/reservations/{res2['id']}", booking(party_size=1), token=alice, expect=404)
    call("DELETE", f"/api/reservations/{res2['id']}", token=alice, expect=404)
    call("GET", "/api/reservations/999999", token=alice, expect=404)
    call("PUT", "/api/reservations/999999", booking(), token=alice, expect=404)
    call("DELETE", "/api/reservations/999999", token=alice, expect=404)

    # listing: own only, earliest first, optional date filter
    _, listing = call("GET", "/api/reservations", token=alice)
    keys = [(r["date"], r["time"]) for r in listing["items"]]
    check(keys == sorted(keys), f"not earliest first: {keys}")
    check(listing["total"] == len(listing["items"]) == 3, f"list: {listing}")
    check(all(set(r) == RES_KEYS for r in listing["items"]), f"list shape: {listing}")
    _, filtered = call("GET", "/api/reservations?date=2026-12-01", token=alice)
    check(filtered["total"] == 2 and all(r["date"] == "2026-12-01" for r in filtered["items"]),
          f"date filter: {filtered}")
    _, bob_listing = call("GET", "/api/reservations", token=bob)
    check(bob_listing["total"] == 2, f"bob list: {bob_listing}")

    # cancelling frees the seats
    _, day = call("GET", "/api/availability?date=2026-12-01")
    booked_before = {s["time"]: s["booked"] for s in day["items"]}
    call("DELETE", f"/api/reservations/{rid3}", token=alice)
    call("GET", f"/api/reservations/{rid3}", token=alice, expect=404)
    _, day = call("GET", "/api/availability?date=2026-12-01")
    booked_after = {s["time"]: s["booked"] for s in day["items"]}
    check(booked_after.get("19:00", 0) == booked_before["19:00"] - 15,
          f"seats not freed: {booked_before} -> {booked_after}")
    _, listing = call("GET", "/api/reservations", token=alice)
    check(listing["total"] == 2, f"after delete: {listing}")

    # non-admins are refused on the admin endpoint
    call("GET", "/api/admin/reservations", token=alice, expect=403)
    call("GET", "/api/admin/reservations?date=2026-12-01", token=alice, expect=403)

    # unknown API routes answer JSON, not the frontend
    st, payload = call("GET", "/api/nope", expect=404, raw=True)
    check(payload.lstrip().startswith("{"), f"unknown api route served: {payload[:80]}")
    st, payload = call("POST", "/api/health", expect=405, raw=True)
    check(payload.lstrip().startswith("{"), f"api 405 not JSON: {payload[:80]}")

    return alice, bob


def run_admin(alice, bob):
    st, body = call("POST", "/api/auth/login", {"username": "admin", "password": "adminpw"})
    admin = body.get("token") if isinstance(body, dict) else None
    check(isinstance(admin, str) and len(admin) > 20, f"admin token: {body}")
    call("POST", "/api/auth/login", {"username": "admin", "password": "nope"}, expect=401)

    # seed a few more reservations across users
    for i in range(3):
        call("POST", "/api/reservations",
             booking(date="2026-12-05", time="18:00", party_size=2, name=f"Seed {i}",
                     notes=None),
             token=bob, expect=201)

    _, everything = call("GET", "/api/admin/reservations", token=admin)
    check(set(everything) == {"items", "total", "page", "page_size"}, f"admin shape: {everything.keys()}")
    check(everything["total"] == len(everything["items"]) >= 5, f"admin total: {everything}")
    check(all(set(r) == RES_KEYS for r in everything["items"]), "admin item shape")

    _, filtered = call("GET", "/api/admin/reservations?date=2026-12-05", token=admin)
    check(filtered["total"] == len(filtered["items"]) == 3, f"admin date filter: {filtered}")
    check(all(r["date"] == "2026-12-05" for r in filtered["items"]), "admin filter items")

    page1 = call("GET", "/api/admin/reservations?page=1&page_size=2", token=admin)[1]
    page2 = call("GET", "/api/admin/reservations?page=2&page_size=2", token=admin)[1]
    check(page1["page"] == 1 and page1["page_size"] == 2 and len(page1["items"]) == 2,
          f"page1: {page1}")
    check(page2["page"] == 2 and page2["page_size"] == 2 and len(page2["items"]) == 2,
          f"page2: {page2}")
    check(page1["total"] == page2["total"] == everything["total"], "pagination totals differ")
    ids1 = [r["id"] for r in page1["items"]]
    ids2 = [r["id"] for r in page2["items"]]
    check(not set(ids1) & set(ids2), "pages overlap")
    keys1 = [(r["date"], r["time"]) for r in page1["items"]]
    check(keys1 == sorted(keys1), f"admin order: {keys1}")

    page_all = call("GET", "/api/admin/reservations?page=1&page_size=1000", token=admin)[1]
    check(page_all["items"] == everything["items"], "large page mismatch")

    # other users are still refused
    call("GET", "/api/admin/reservations", token=alice, expect=403)


def main():
    mode = os.environ.get("MODE", "basic")
    if mode == "basic":
        alice, bob = run_basic()
    else:
        alice = call("POST", "/api/auth/login",
                     {"username": "alice", "password": "pw12345"})[1]["token"]
        bob = call("POST", "/api/auth/login",
                   {"username": "bob", "password": "pw12345"})[1]["token"]
        run_admin(alice, bob)
    print(json.dumps({"failures": failures}, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
