"""End-to-end API checks against backend/app.py (not part of the app)."""

import base64
import os
import sys
import tempfile


def main() -> int:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))
    os.chdir(tempfile.mkdtemp())

    from app import app

    c = app.test_client()
    fails = []

    def check(name, cond, detail=""):
        if cond:
            print(f"  ok: {name}")
        else:
            fails.append(name)
            print(f"  FAIL: {name} {detail}")

    # health
    r = c.get("/api/health")
    check("health", r.status_code == 200 and r.get_json() == {"status": "ok"}, r.get_json())

    # encode
    r = c.post("/api/base64/encode", json={"text": "hello"})
    check("encode basic", r.status_code == 200 and r.get_json() == {"encoded": "aGVsbG8="}, r.get_json())
    r = c.post("/api/base64/encode", json={"text": ""})
    check("encode empty", r.status_code == 200 and r.get_json() == {"encoded": ""}, r.get_json())
    r = c.post("/api/base64/encode", json={"text": "héllo ✓ 世界"})
    check("encode utf8", r.status_code == 200 and base64.b64decode(r.get_json()["encoded"]).decode("utf-8") == "héllo ✓ 世界", r.get_json())
    check("encode standard padded", r.get_json()["encoded"] == "aMOpbGxvIOKckyDkuJbnlYw=", r.get_json())
    r = c.post("/api/base64/encode", json={"wrong": 1})
    check("encode missing field -> 400", r.status_code == 400 and "error" in r.get_json(), (r.status_code, r.get_json()))

    # decode
    r = c.post("/api/base64/decode", json={"encoded": "aGVsbG8="})
    check("decode basic", r.status_code == 200 and r.get_json() == {"text": "hello"}, r.get_json())
    r = c.post("/api/base64/decode", json={"encoded": ""})
    check("decode empty", r.status_code == 200 and r.get_json() == {"text": ""}, r.get_json())
    r = c.post("/api/base64/decode", json={"encoded": "aMOpbGxvIOKckyDkuJbnlYw="})
    check("decode utf8", r.get_json() == {"text": "héllo ✓ 世界"}, r.get_json())
    r = c.post("/api/base64/decode", json={"encoded": "not base64!!"})
    check("decode invalid -> 400", r.status_code == 400 and isinstance(r.get_json().get("error"), str), (r.status_code, r.get_json()))
    r = c.post("/api/base64/decode", json={"encoded": "/w=="})
    check("decode non-utf8 -> 400", r.status_code == 400 and isinstance(r.get_json().get("error"), str), (r.status_code, r.get_json()))
    r = c.post("/api/base64/decode", json={"encoded": "abcde"})
    check("decode bad padding -> 400", r.status_code == 400, (r.status_code, r.get_json()))

    # auth
    r = c.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
    check("register 201", r.status_code == 201, (r.status_code, r.get_json()))
    check("register token", isinstance(r.get_json().get("token"), str) and r.get_json()["token"], r.get_json())
    alice_token = r.get_json()["token"]
    r = c.post("/api/auth/register", json={"username": "alice", "password": "secret1"})
    check("register duplicate -> 409", r.status_code == 409, (r.status_code, r.get_json()))
    r = c.post("/api/auth/register", json={"username": "bob", "password": "hunter2"})
    bob_token = r.get_json()["token"]
    check("register bob 201", r.status_code == 201, r.get_json())

    r = c.post("/api/auth/login", json={"username": "alice", "password": "secret1"})
    check("login 200", r.status_code == 200, (r.status_code, r.get_json()))
    check("login token", isinstance(r.get_json().get("token"), str) and set(r.get_json()) == {"token"}, r.get_json())
    alice_token2 = r.get_json()["token"]
    r = c.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    check("login wrong -> 401", r.status_code == 401, (r.status_code, r.get_json()))
    r = c.post("/api/auth/login", json={"username": "ghost", "password": "x"})
    check("login unknown -> 401", r.status_code == 401, (r.status_code, r.get_json()))

    H = {"Authorization": f"Bearer {alice_token}"}
    H2 = {"Authorization": f"Bearer {alice_token2}"}
    HB = {"Authorization": f"Bearer {bob_token}"}

    # unauthorized access
    r = c.post("/api/conversions", json={"direction": "encode", "input": "x"})
    check("conversions no token -> 401", r.status_code == 401, r.status_code)
    r = c.get("/api/conversions")
    check("list no token -> 401", r.status_code == 401, r.status_code)
    r = c.delete("/api/conversions/1")
    check("delete no token -> 401", r.status_code == 401, r.status_code)
    r = c.get("/api/conversions", headers={"Authorization": "Bearer bogus"})
    check("bad token -> 401", r.status_code == 401, r.status_code)

    # create conversions
    r = c.post("/api/conversions", json={"direction": "encode", "input": "hello"}, headers=H)
    j = r.get_json()
    check("create encode 201", r.status_code == 201, (r.status_code, j))
    check(
        "create encode fields",
        j.get("direction") == "encode"
        and j.get("output") == "aGVsbG8="
        and j.get("input_preview") == "hello"
        and j.get("output_preview") == "aGVsbG8="
        and isinstance(j.get("id"), int)
        and isinstance(j.get("created_at"), str),
        j,
    )
    c1 = j["id"]
    r = c.post("/api/conversions", json={"direction": "decode", "input": "aGVsbG8="}, headers=H)
    j = r.get_json()
    check("create decode 201", r.status_code == 201 and j.get("output") == "hello", (r.status_code, j))
    c.post("/api/conversions", json={"direction": "encode", "input": "world"}, headers=H)
    r = c.post("/api/conversions", json={"direction": "encode", "input": "x" * 300}, headers=H)
    j = r.get_json()
    check("preview truncated", len(j["input_preview"]) <= 80 and j["input_preview"].endswith("...") and j["output"].startswith("eHh4"), j["input_preview"][:20])
    r = c.post("/api/conversions", json={"direction": "sideways", "input": "x"}, headers=H)
    check("bad direction -> 400", r.status_code == 400, r.status_code)
    r = c.post("/api/conversions", json={"direction": "decode", "input": "!!!"}, headers=H)
    check("invalid input -> 400", r.status_code == 400, r.status_code)

    # list
    r = c.get("/api/conversions", headers=H)
    j = r.get_json()
    check("list shape", set(j) == {"items", "total", "page", "page_size"}, j)
    check("list newest first", [i["id"] for i in j["items"]][0] > [i["id"] for i in j["items"]][-1], j["items"])
    check("list total", j["total"] == 4, j)
    check("list item fields", set(j["items"][0]) == {"id", "direction", "input_preview", "output_preview", "created_at"}, j["items"][0])
    check("list no output leak", all("output" not in i for i in j["items"]), j["items"])

    r = c.get("/api/conversions?page=1&page_size=2", headers=H)
    j = r.get_json()
    check("paging size", len(j["items"]) == 2 and j["page"] == 1 and j["page_size"] == 2 and j["total"] == 4, j)
    r = c.get("/api/conversions?page=2&page_size=2", headers=H)
    j = r.get_json()
    check("page 2", len(j["items"]) == 2 and j["page"] == 2, j)
    r = c.get("/api/conversions?page=3&page_size=2", headers=H)
    j = r.get_json()
    check("page 3 last", len(j["items"]) == 0 and j["page"] == 3 and j["total"] == 4, j)
    r = c.get("/api/conversions?page=abc", headers=H)
    check("bad page -> 400", r.status_code == 400, r.status_code)

    # second session (same user) sees same history
    r = c.get("/api/conversions", headers=H2)
    check("second session same user", r.get_json()["total"] == 4, r.get_json())

    # isolation
    r = c.get("/api/conversions", headers=HB)
    check("bob sees own only", r.get_json()["total"] == 0, r.get_json())
    r = c.delete(f"/api/conversions/{c1}", headers=HB)
    check("bob cannot delete alice -> 404", r.status_code == 404, r.status_code)
    r = c.delete(f"/api/conversions/{c1}", headers=H)
    check("alice deletes own", r.status_code in (200, 204), r.status_code)
    r = c.delete(f"/api/conversions/{c1}", headers=H)
    check("delete twice -> 404", r.status_code == 404, r.status_code)
    r = c.get("/api/conversions", headers=H)
    check("total after delete", r.get_json()["total"] == 3, r.get_json())

    # frontend serving
    r = c.get("/")
    check("root serves index", r.status_code == 200 and b"<div id=\"root\">" in r.data, r.status_code)
    assets = os.listdir(
        os.path.join(os.path.dirname(__file__), "frontend", "dist", "assets")
    )
    r = c.get(f"/assets/{assets[0]}")
    check("asset served", r.status_code == 200, r.status_code)
    r = c.get("/some/spa/route")
    check("spa fallback", r.status_code == 200 and b"<div id=\"root\">" in r.data, r.status_code)
    r = c.get("/api/unknown")
    check("unknown api 404 json", r.status_code == 404 and "error" in r.get_json(), (r.status_code, r.get_data()))
    r = c.get("/api/conversions", headers={"Authorization": "Bearer x"})
    check("api route not shadowed", r.status_code == 401, r.status_code)

    print()
    print("FAILURES:", fails if fails else "none")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
