"""HTTP end-to-end smoke test against the running gunicorn server (temporary)."""
import json
import re
import sys
import urllib.error
import urllib.request

BASE = "http://localhost:8000"
fails = []


def check(name, cond, detail=""):
    if cond:
        print(f"ok   {name}")
    else:
        fails.append(name)
        print(f"FAIL {name} {detail}")


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return res.status, _payload(raw), dict(res.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, _payload(raw), dict(e.headers)


def _payload(raw):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return raw


# health
s, b, _ = call("GET", "/api/health")
check("health", (s, b) == (200, {"status": "ok"}), f"{s} {b}")

# frontend served
s, b, h = call("GET", "/")
check("index served", s == 200 and isinstance(b, bytes) and b"<div id=\"root\">" in b, str(s))
s, b, h = call("GET", "/items/123")
check("spa fallback", s == 200 and b"<div id=\"root\">" in b, str(s))
s, b, h = call("GET", "/account")
check("spa fallback 2", s == 200 and b"<div id=\"root\">" in b, str(s))

html = call("GET", "/")[1].decode()
assets = re.findall(r'src="(/assets/[^"]+)"|href="(/assets/[^"]+)"', html)
paths = [a or bg for a, bg in assets]
check("assets referenced", len(paths) >= 2, str(paths))
for p in paths:
    s, b, h = call("GET", p)
    ctype = h.get("Content-Type", "")
    check(f"asset {p}", s == 200 and isinstance(b, bytes) and len(b) > 100, f"{s} {ctype}")

# unknown api route answers json 404, not html
s, b, h = call("GET", "/api/definitely-not-here")
check("unknown api json 404", s == 404 and isinstance(b, dict) and "error" in b, f"{s} {b}")

# auth + items over real HTTP
s, b, _ = call("POST", "/api/auth/register", {"username": "e2e_user", "password": "hunter2!"})
check("register 201", s == 201, f"{s} {b}")
s, b, _ = call("POST", "/api/auth/register", {"username": "e2e_user", "password": "hunter2!"})
check("register dup 409", s == 409, f"{s} {b}")
s, b, _ = call("POST", "/api/auth/login", {"username": "e2e_user", "password": "hunter2!"})
check("login 200", s == 200 and "token" in b, f"{s} {b}")
tok = b["token"]

s, b, _ = call("POST", "/api/items", {"name": "Widget", "sku": "E2E-1", "location": "C1", "quantity": 4, "reorder_level": 2})
check("unauth create 401", s == 401, f"{s} {b}")
s, b, _ = call("POST", "/api/items", {"name": "Widget", "sku": "E2E-1", "location": "C1", "quantity": 4, "reorder_level": 2}, token=tok)
check("create item 201", s == 201 and b["low_stock"] is False, f"{s} {b}")
iid = b["id"]

s, b, _ = call("POST", f"/api/items/{iid}/movements", {"delta": -4, "reason": "sold"}, token=tok)
check("take out 201", s == 201 and b["quantity_after"] == 0, f"{s} {b}")
s, b, _ = call("POST", f"/api/items/{iid}/movements", {"delta": -1}, token=tok)
check("below zero 400", s == 400, f"{s} {b}")
s, b, _ = call("GET", f"/api/items/{iid}")
check("low stock flagged", s == 200 and b["low_stock"] is True, f"{s} {b}")
s, b, _ = call("GET", "/api/items?low_stock=true")
check("low stock filter", any(x["id"] == iid for x in b["items"]), str(b))
s, b, _ = call("GET", f"/api/items/{iid}/movements")
check("movements listed", s == 200 and len(b["items"]) == 1 and b["items"][0]["username"] == "e2e_user", str(b))

print()
print("FAILURES:", fails if fails else "none")
sys.exit(1 if fails else 0)
