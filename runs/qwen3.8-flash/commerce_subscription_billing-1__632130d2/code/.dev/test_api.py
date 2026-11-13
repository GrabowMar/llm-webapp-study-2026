import json, urllib.request, urllib.error

B = "http://localhost:8000"
passed = failed = 0

def req(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(B + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw or b"null")
        except Exception:
            return e.code, None

def check(name, cond):
    global passed, failed
    if cond:
        passed += 1; print("ok  ", name)
    else:
        failed += 1; print("FAIL", name)

FIELDS = {"id","customer_name","plan","monthly_amount","renewal_date","status","failed_payment_count","created_at"}
IFIELDS = {"id","subscription_id","amount_due","due_date","status","paid_at"}

# auth
s, _ = req("POST", "/api/auth/register", {"username":"alice","password":"secret1"})
check("register201", s == 201)
s, _ = req("POST", "/api/auth/register", {"username":"alice","password":"secret1"})
check("register-dup-4xx", s in (400, 409))
s, _ = req("POST", "/api/auth/register", {"username":"","password":"x"})
check("register-bad400", s == 400)
s, _ = req("POST", "/api/auth/login", {"username":"alice","password":"wrong"})
check("login-bad401", s == 401)
s, body = req("POST", "/api/auth/login", {"username":"alice","password":"secret1"})
check("login200-token", s == 200 and isinstance(body.get("token"), str) and len(body["token"]) >= 8)
T = body["token"]

s, _ = req("GET", "/api/subscriptions")
check("list-needs-auth", s == 401)
s, _ = req("GET", "/api/subscriptions", token="garbage")
check("bad-token-401", s == 401)

# create
s, sub1 = req("POST", "/api/subscriptions", {"customer_name":"Acme Corp","plan":"pro","monthly_amount":49.99,"renewal_date":"2026-12-01","status":"active"}, T)
check("create-fields", s == 201 and set(sub1) == FIELDS and sub1["monthly_amount"] == 49.99 and sub1["status"]=="active" and sub1["failed_payment_count"]==0)
s, sub2 = req("POST", "/api/subscriptions", {"customer_name":"Beta LLC","plan":"basic","monthly_amount":19.0,"renewal_date":"2026-11-15","status":"trial"}, T)
check("create2", s == 201)
s, sub3 = req("POST", "/api/subscriptions", {"customer_name":"Gamma Inc","plan":"pro","monthly_amount":100.0,"renewal_date":"2026-10-01","status":"past_due"}, T)
check("create3", s == 201)
s, sub4 = req("POST", "/api/subscriptions", {"customer_name":"Delta Co","plan":"basic","monthly_amount":25.0,"renewal_date":"2026-09-01","status":"cancelled"}, T)
check("create4", s == 201)
s, d = req("POST", "/api/subscriptions", {"customer_name":"Defaults","plan":"starter"}, T)
check("create-defaults", s == 201 and d["status"] in ("trial","active") and d["monthly_amount"] == 0)
s, _ = req("POST", "/api/subscriptions", {"plan":"p"}, T)
check("create-missing-name", s == 400)
s, _ = req("POST", "/api/subscriptions", {"customer_name":"x","plan":"p","status":"bogus"}, T)
check("create-bad-status", s == 400)
s, _ = req("POST", "/api/subscriptions", {"customer_name":"x","plan":"p","monthly_amount":"abc"}, T)
check("create-bad-amount", s == 400)

ids = [sub1["id"], sub2["id"], sub3["id"], sub4["id"], d["id"]]

# listing
s, lst = req("GET", "/api/subscriptions?page_size=2", token=T)
check("list-paged", s == 200 and set(lst) >= {"items","total","page","page_size"}
      and [i["id"] for i in lst["items"]] == ids[:2:-1][::-1] or [i["id"] for i in lst["items"]] == sorted(ids, reverse=True)[:2])
check("list-newest-first", [i["id"] for i in lst["items"]] == sorted(ids, reverse=True)[:2])
check("list-total", lst["total"] == len(ids) and lst["page"] == 1 and lst["page_size"] == 2)
order = sorted(ids, reverse=True)
s, p3 = req("GET", "/api/subscriptions?page=3&page_size=2", token=T)
check("list-page3", [i["id"] for i in p3["items"]] == order[4:6] and p3["page"] == 3)
s, p99 = req("GET", "/api/subscriptions?page=99", token=T)
check("list-empty-page", p99["items"] == [] and p99["total"] == len(ids))
s, f = req("GET", "/api/subscriptions?status=active", token=T)
check("filter-status", all(i["status"]=="active" for i in f["items"]) and f["total"] >= 1)
s, f = req("GET", "/api/subscriptions?q=gamma", token=T)
check("filter-q-caseless", f["total"] == 1 and f["items"][0]["id"] == sub3["id"])
s, f = req("GET", "/api/subscriptions?q=beta%20llc&plan=basic", token=T)
check("filter-combo", f["total"] == 1 and f["items"][0]["id"] == sub2["id"])
s, f = req("GET", "/api/subscriptions?plan=pro", token=T)
check("filter-plan", f["total"] == 2)

# get / patch
s, one = req("GET", f"/api/subscriptions/{sub1['id']}", token=T)
check("get-one", s == 200 and one == sub1)
s, _ = req("GET", "/api/subscriptions/999999", token=T)
check("get-404", s == 404)
s, pat = req("PATCH", f"/api/subscriptions/{sub2['id']}", {"monthly_amount":22.5}, T)
check("patch-partial", s == 200 and pat["monthly_amount"] == 22.5 and pat["customer_name"] == "Beta LLC" and pat["plan"] == "basic" and pat["status"] == "trial")
s, pat = req("PATCH", f"/api/subscriptions/{sub2['id']}", {"status":"active"}, T)
check("patch-status", pat["status"] == "active")
s, _ = req("PATCH", f"/api/subscriptions/{sub2['id']}", {"status":"nope"}, T)
check("patch-bad-status", s == 400)
s, _ = req("PATCH", f"/api/subscriptions/{sub2['id']}", {"monthly_amount":-5}, T)
check("patch-negative", s == 400)
s, _ = req("PATCH", "/api/subscriptions/999999", {"plan":"x"}, T)
check("patch-404", s == 404)
s, _ = req("PATCH", f"/api/subscriptions/{sub2['id']}", {"status":"active"}, token=None)
check("patch-needs-auth", s == 401)

# invoices
s, i1 = req("POST", f"/api/subscriptions/{sub3['id']}/invoices", {}, T)
check("invoice-default", s == 201 and set(i1) == IFIELDS and i1["amount_due"] == 100.0
      and i1["status"] == "open" and i1["due_date"] == "2026-10-01" and i1["paid_at"] is None
      and i1["subscription_id"] == sub3["id"])
s, i2 = req("POST", f"/api/subscriptions/{sub3['id']}/invoices", {"amount_due":35.5,"due_date":"2026-12-20"}, T)
check("invoice-custom", s == 201 and i2["amount_due"] == 35.5 and i2["due_date"] == "2026-12-20")
s, invs = req("GET", f"/api/subscriptions/{sub3['id']}/invoices", token=T)
check("invoices-newest-first", s == 200 and [x["id"] for x in invs["items"]] == sorted([i1["id"], i2["id"]], reverse=True))
s, invs2 = req("GET", f"/api/subscriptions/{sub4['id']}/invoices", token=T)
check("invoices-empty", invs2["items"] == [])
s, _ = req("POST", "/api/subscriptions/999999/invoices", {}, T)
check("invoice-404", s == 404)
s, _ = req("GET", f"/api/subscriptions/{sub3['id']}/invoices", token=None)
check("invoices-needs-auth", s == 401)

# stats  (active: 49.99 + 22.5 + 100(Gamma after collection below) etc computed dynamically)
s, st = req("GET", "/api/public/stats")
check("stats-schema", s == 200 and set(st) == {"mrr","counts"} and set(st["counts"]) == {"trial","active","past_due","cancelled"})
def expected():
    s, all_ = req("GET", "/api/subscriptions?page_size=100", token=T)
    mrr = round(sum(i["monthly_amount"] for i in all_["items"] if i["status"] in ("active","past_due")), 2)
    counts = {}
    for stt in ("trial","active","past_due","cancelled"):
        counts[stt] = sum(1 for i in all_["items"] if i["status"] == stt)
    return mrr, counts
mrr, counts = expected()
check("stats-match", st["mrr"] == mrr and st["counts"] == counts)
check("stats-public-no-auth", s == 200)

# collections
s, res = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"failed"}, T)
check("collection-failed", s in (200, 201) and res["subscription"]["failed_payment_count"] == 1)
s, res = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"failed"}, T)
check("collection-failed2", res["subscription"]["failed_payment_count"] == 2)
s, _ = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"maybe"}, T)
check("collection-bad-outcome", s == 400)
s, res = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"succeeded"}, T)
check("collection-succeeded", s in (200, 201) and res["subscription"]["failed_payment_count"] == 0)
s, invs = req("GET", f"/api/subscriptions/{sub3['id']}/invoices", token=T)
check("collection-marks-paid", all(x["status"] == "paid" and x["paid_at"] for x in invs["items"]))
s, _ = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"succeeded"}, T)
s, _ = req("POST", "/api/subscriptions/999999/collections", {"outcome":"failed"}, T)
check("collection-404", s == 404)
s, _ = req("POST", f"/api/subscriptions/{sub3['id']}/collections", {"outcome":"failed"}, token=None)
check("collection-needs-auth", s == 401)

# money rounding
s, rnd = req("POST", "/api/subscriptions", {"customer_name":"Round Co","plan":"pro","monthly_amount":10.005}, T)
check("money-two-decimals", s == 201 and round(rnd["monthly_amount"], 2) == rnd["monthly_amount"])
s, p = req("PATCH", f"/api/subscriptions/{rnd['id']}", {"monthly_amount": 0.1 + 0.2}, T)
check("money-float", round(p["monthly_amount"], 2) == p["monthly_amount"])

# second user, shared visibility
req("POST", "/api/auth/register", {"username":"bob","password":"pw2"})
s, b = req("POST", "/api/auth/login", {"username":"bob","password":"pw2"})
T2 = b["token"]
s, one = req("GET", f"/api/subscriptions/{sub1['id']}", token=T2)
check("shared-read", s == 200 and one["id"] == sub1["id"])
s, pat = req("PATCH", f"/api/subscriptions/{sub1['id']}", {"plan":"enterprise"}, T2)
check("shared-write", s == 200 and pat["plan"] == "enterprise")
s, lst = req("GET", "/api/subscriptions", token=T2)
check("shared-list-same", lst["total"] == req("GET", "/api/subscriptions", token=T)[1]["total"])

# health
s, h = req("GET", "/api/health")
check("health", s == 200 and h == {"status":"ok"})

print(f"PASSED={passed} FAILED={failed}")
raise SystemExit(1 if failed else 0)
