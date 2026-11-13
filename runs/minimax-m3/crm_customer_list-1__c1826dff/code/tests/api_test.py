"""End-to-end API checks for the customer directory.

Run the app (gunicorn or flask) and then: python tests/api_test.py
"""

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8000")
FAILURES = []
CHECKS = [0]


def call(method, path, body=None, token=None, raw=False):
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
            payload = resp.read().decode()
            return resp.status, (json.loads(payload) if payload and not raw else payload)
    except urllib.error.HTTPError as exc:
        payload = exc.read().decode()
        try:
            parsed = json.loads(payload)
        except Exception:
            parsed = payload
        return exc.code, parsed


def check(label, condition, detail=""):
    CHECKS[0] += 1
    if condition:
        print(f"  ok   {label}")
    else:
        print(f"  FAIL {label} :: {detail}")
        FAILURES.append(label)


def main():
    status, body = call("GET", "/api/health")
    check("health returns ok", status == 200 and body == {"status": "ok"}, f"{status} {body}")

    status, body = call("GET", "/api/customers")
    check("customers list needs auth", status == 401, f"{status} {body}")

    status, body = call("GET", "/api/customers", token="garbage-token")
    check("customers list rejects bad token", status == 401, f"{status} {body}")

    status, body = call("POST", "/api/auth/register", {"username": "alice", "password": "secret123"})
    check("register alice", status == 201, f"{status} {body}")

    status, body = call("POST", "/api/auth/register", {"username": "alice", "password": "secret123"})
    check("duplicate username rejected", status in (400, 409), f"{status} {body}")

    status, body = call("POST", "/api/auth/register", {"username": "bob", "password": "hunter22"})
    check("register bob", status == 201, f"{status} {body}")

    status, body = call("POST", "/api/auth/register", {"username": "", "password": ""})
    check("register validates fields", status == 400, f"{status} {body}")

    status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
    check("login with bad password is 401", status == 401, f"{status} {body}")

    status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "secret123"})
    check("login succeeds", status == 200 and isinstance(body, dict) and "token" in body, f"{status} {body}")
    token = body["token"]

    status, body = call("POST", "/api/auth/login", {"username": "bob", "password": "hunter22"})
    check("bob login succeeds", status == 200, f"{status} {body}")
    bob_token = body["token"]

    status, body = call("POST", "/api/customers", {"name": "Acme Contact", "email": "a@acme.com",
                                                    "phone": "555-0100", "company": "Acme"}, token=token)
    check("create customer", status == 201, f"{status} {body}")
    first_id = body.get("id") if isinstance(body, dict) else None
    check("customer payload shape", isinstance(body, dict) and set(body) == {
        "id", "name", "email", "phone", "company", "notes", "created_at",
        "interaction_count", "last_contacted_at"}, f"{body}")
    check("new customer has no interactions",
          body.get("interaction_count") == 0 and body.get("last_contacted_at") is None, f"{body}")

    status, body = call("POST", "/api/customers", {"name": "Bob Contact", "email": "b@acme.com",
                                                    "phone": "555-0199", "company": "Acme"}, token=bob_token)
    check("member can add customers", status == 201, f"{status} {body}")
    second_id = body.get("id")

    status, body = call("POST", "/api/customers", {"name": "Dup", "email": "a@acme.com"}, token=token)
    check("duplicate email rejected", status in (400, 409), f"{status} {body}")
    check("duplicate email message", isinstance(body, dict) and "email" in json.dumps(body).lower(), f"{body}")

    status, body = call("POST", "/api/customers", {"email": "x@y.com"}, token=token)
    check("name is required", status == 400, f"{status} {body}")

    status, body = call("GET", f"/api/customers/{first_id}", token=token)
    check("get customer by id", status == 200 and body.get("id") == first_id, f"{status} {body}")

    status, body = call("GET", "/api/customers/999999", token=token)
    check("missing customer is 404", status == 404, f"{status} {body}")

    status, body = call("GET", "/api/customers", token=token)
    check("list shape", status == 200 and set(body) == {"items", "total", "page", "page_size"}, f"{status} {body}")
    check("list total", body.get("total") == 2, f"{body}")
    check("list sorted by name",
          [i["name"] for i in body["items"]] == sorted(i["name"] for i in body["items"]), f"{body}")
    check("default page size", body.get("page_size") == 20 and body.get("page") == 1, f"{body}")

    status, body = call("GET", "/api/customers?q=Bob", token=token)
    check("search filters", body.get("total") == 1 and body["items"][0]["name"] == "Bob Contact", f"{body}")

    status, body = call("GET", "/api/customers?company=Acme", token=token)
    check("company filter", body.get("total") == 2, f"{body}")

    status, body = call("GET", "/api/customers?company=Nope", token=token)
    check("company filter excludes", body.get("total") == 0, f"{body}")

    status, body = call("GET", "/api/customers?page=2&page_size=1", token=token)
    check("paging works",
          body.get("page") == 2 and body.get("page_size") == 1 and len(body["items"]) == 1, f"{body}")

    status, body = call("PUT", f"/api/customers/{second_id}",
                        {"name": "Bob Contact", "email": "b@acme.com"}, token=token)
    check("put updates and clears omitted fields",
          status == 200 and body.get("company") is None and body.get("phone") is None, f"{status} {body}")

    status, body = call("PUT", f"/api/customers/{second_id}",
                        {"name": "Bob Contact", "email": "a@acme.com"}, token=token)
    check("put rejects duplicate email", status in (400, 409), f"{status} {body}")

    status, body = call("POST", f"/api/customers/{first_id}/interactions",
                        {"kind": "call", "summary": "Talked about pricing"}, token=bob_token)
    check("log interaction", status == 201, f"{status} {body}")
    check("interaction shape", isinstance(body, dict) and set(body) >= {
        "id", "customer_id", "kind", "summary", "occurred_at", "logged_by"}, f"{body}")
    check("logged_by is the user", body.get("logged_by") == "bob", f"{body}")

    status, body = call("POST", f"/api/customers/{first_id}/interactions",
                        {"kind": "email", "summary": "Sent proposal"}, token=token)
    check("log second interaction", status == 201, f"{status} {body}")

    status, body = call("GET", f"/api/customers/{first_id}/interactions", token=token)
    check("interactions list", status == 200 and "items" in body and len(body["items"]) == 2, f"{status} {body}")
    stamps = [i["occurred_at"] for i in body["items"]]
    check("interactions newest first", stamps == sorted(stamps, reverse=True), f"{stamps}")

    status, body = call("GET", f"/api/customers/{first_id}", token=token)
    check("interaction count updated", body.get("interaction_count") == 2, f"{body}")
    check("last contacted set", body.get("last_contacted_at") == stamps[0], f"{body} vs {stamps[0]}")

    status, body = call("POST", f"/api/customers/{first_id}/interactions", {"kind": "call"}, token=token)
    check("interaction without summary is accepted", status == 201, f"{status} {body}")

    status, body = call("POST", f"/api/customers/{first_id}/interactions", {"summary": "no kind"}, token=token)
    check("interaction without kind rejected", status == 400, f"{status} {body}")

    status, body = call("GET", "/api/customers")
    check("still 401 without token", status == 401, f"{status} {body}")

    status, body = call("DELETE", f"/api/customers/{second_id}", token=token)
    check("delete customer", status in (200, 204), f"{status} {body}")

    status, body = call("GET", f"/api/customers/{second_id}/interactions", token=token)
    check("deleted customer interactions 404", status == 404, f"{status} {body}")

    status, body = call("GET", "/api/customers", token=token)
    check("list after delete", body.get("total") == 1, f"{body}")

    status, body = call("GET", "/api/nope", token=token)
    check("unknown api route is json 404", status == 404, f"{status} {body}")

    print(f"\n{CHECKS[0] - len(FAILURES)}/{CHECKS[0]} checks passed")
    if FAILURES:
        print("failed:", FAILURES)
        sys.exit(1)


if __name__ == "__main__":
    main()
