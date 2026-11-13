import os
import sys
from datetime import datetime

os.environ["DATA_DIR"] = "/workspace/data_test"
sys.path.insert(0, "/workspace/backend")

import app as app_module

client = app_module.app.test_client()

passed = 0
failed = 0


def check(label, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print(f"FAIL: {label} {detail}")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def mins_between(a, b):
    return int((datetime.fromisoformat(b) - datetime.fromisoformat(a)).total_seconds() / 60)


# health
r = client.get("/api/health")
check("health", r.status_code == 200 and r.get_json() == {"status": "ok"}, r.get_json())

# register
r = client.post("/api/auth/register", json={"username": "alice", "password": "hunter2"})
check("register 201", r.status_code == 201, r.get_json())
alice = r.get_json().get("token")
check("register token", bool(alice))
r2 = client.post("/api/auth/register", json={"username": "alice", "password": "x"})
check("duplicate username", r2.status_code == 409, r2.get_json())
r3 = client.post("/api/auth/register", json={"username": "", "password": ""})
check("register validation", r3.status_code == 400 and "errors" in r3.get_json(), r3.get_json())

r = client.post("/api/auth/register", json={"username": "bob", "password": "pw"})
check("register bob", r.status_code == 201, r.get_json())

# login
r = client.post("/api/auth/login", json={"username": "alice", "password": "hunter2"})
check("login 200", r.status_code == 200 and "token" in r.get_json(), r.get_json())
alice_login = r.get_json()["token"]
bob_login = client.post("/api/auth/login", json={"username": "bob", "password": "pw"}).get_json()["token"]
check("login invalid", client.post("/api/auth/login", json={"username": "alice", "password": "bad"}).status_code == 401)
check("me", client.get("/api/auth/me", headers=auth(alice_login)).get_json()["username"] == "alice")
check("me no token 401", client.get("/api/auth/me").status_code == 401)
check("me bad token 401", client.get("/api/auth/me", headers=auth("bogus")).status_code == 401)

# create incident requires auth
r = client.post("/api/incidents", json={"title": "DB down", "severity": "sev1"})
check("create needs auth", r.status_code == 401, r.get_json())

# create validation
r = client.post("/api/incidents", json={"title": "", "severity": "sev9"}, headers=auth(alice))
check("create validation", r.status_code == 400 and set(r.get_json()["errors"]) == {"title", "severity"}, r.get_json())

# create incidents
ids = {}
targets = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
for sev in ["sev1", "sev2", "sev3", "sev4"]:
    r = client.post(
        "/api/incidents",
        json={"title": f"{sev} outage", "severity": sev, "service": "payments", "commander": "alice", "impact_summary": "checkout broken"},
        headers=auth(alice),
    )
    check(f"create {sev} 201", r.status_code == 201, r.get_json())
    d = r.get_json()
    ids[sev] = d["id"]
    check(f"{sev} status investigating", d["status"] == "investigating")
    check(f"{sev} opened_by alice", d["opened_by"] == "alice")
    check(f"{sev} resolved_at null", d["resolved_at"] is None)
    check(f"{sev} due = opened + target", mins_between(d["opened_at"], d["sla_due_at"]) == targets[sev], (d["opened_at"], d["sla_due_at"]))
    check(f"{sev} not breached", d["sla_breached"] is False)

# get one
r = client.get(f"/api/incidents/{ids['sev1']}")
check("get one 200", r.status_code == 200 and r.get_json()["id"] == ids["sev1"], r.get_json())
check("get one 404", client.get("/api/incidents/9999").status_code == 404)

# list newest first
r = client.get("/api/incidents")
d = r.get_json()
check("list shape", set(d) == {"items", "total", "page", "page_size"}, d)
check("list total", d["total"] == 4)
check("list newest first", [x["id"] for x in d["items"]] == sorted(ids.values(), reverse=True), [x["id"] for x in d["items"]])
check("list default page", d["page"] == 1 and isinstance(d["page_size"], int))

# filters
check("severity filter", all(x["severity"] == "sev2" for x in client.get("/api/incidents?severity=sev2").get_json()["items"]))
check("status filter", all(x["status"] == "investigating" for x in client.get("/api/incidents?status=investigating").get_json()["items"]))
check("q filter", client.get("/api/incidents?q=outage").get_json()["total"] == 4)
check("q filter specific", client.get("/api/incidents?q=sev1").get_json()["total"] == 1)
check("q no match", client.get("/api/incidents?q=zzzz").get_json()["total"] == 0)

# paging
d = client.get("/api/incidents?page=1&page_size=2").get_json()
check("paging page", d["page"] == 1 and d["page_size"] == 2 and len(d["items"]) == 2 and d["total"] == 4, d)
d = client.get("/api/incidents?page=2&page_size=2").get_json()
check("paging page2", d["page"] == 2 and len(d["items"]) == 2, d)

# patch partial (only one field)
r = client.patch(f"/api/incidents/{ids['sev1']}", json={"commander": "bob"}, headers=auth(bob_login))
check("patch partial 200", r.status_code == 200, r.get_json())
d = r.get_json()
check("patch only changed commander", d["commander"] == "bob" and d["title"] == "sev1 outage" and d["status"] == "investigating", d)

# patch severity changes SLA target
r = client.patch(f"/api/incidents/{ids['sev1']}", json={"severity": "sev3"}, headers=auth(bob_login))
d = r.get_json()
check("patch severity updates due", d["severity"] == "sev3" and mins_between(d["opened_at"], d["sla_due_at"]) == 1440, d)

# patch status change appends event and names old/new
r = client.patch(f"/api/incidents/{ids['sev1']}", json={"status": "identified"}, headers=auth(bob_login))
check("patch status 200", r.status_code == 200, r.get_json())
d = r.get_json()
check("patch status changed", d["status"] == "identified")
check("status change no resolved_at", d["resolved_at"] is None)
tl = client.get(f"/api/incidents/{ids['sev1']}/timeline").get_json()
check("timeline shape", set(tl) == {"items"}, tl)
check("status_change event", len(tl["items"]) == 1 and tl["items"][0]["type"] == "status_change", tl)
check("status_change names old/new", "identified" in tl["items"][0]["message"] and "investigating" in tl["items"][0]["message"], tl)
check("status_change author", tl["items"][0]["author"] == "bob", tl)

# resolved_at set
r = client.patch(f"/api/incidents/{ids['sev2']}", json={"status": "resolved"}, headers=auth(alice))
d = r.get_json()
check("resolved sets resolved_at", d["status"] == "resolved" and d["resolved_at"] is not None, d)

# reopen increment
r = client.patch(f"/api/incidents/{ids['sev2']}", json={"status": "investigating"}, headers=auth(alice))
d = r.get_json()
check("reopen increments", d["reopen_count"] == 1 and d["resolved_at"] is None, d)

# bad status/severity validation
check("patch bad severity", client.patch(f"/api/incidents/{ids['sev1']}", json={"severity": "sev9"}, headers=auth(alice)).status_code == 400)
check("patch needs auth", client.patch(f"/api/incidents/{ids['sev1']}", json={"commander": "x"}).status_code == 401)

# timeline post
r = client.post(f"/api/incidents/{ids['sev3']}/timeline", json={"message": "Investigating logs", "author": "spoof"}, headers=auth(alice))
check("post timeline 201", r.status_code == 201, r.get_json())
e = r.get_json()
check("post event fields", set(e) == {"id", "type", "message", "created_at", "author"}, e)
check("post event author signed-in", e["author"] == "alice", e)
check("post event default type", e["type"] == "note", e)
check("post event message", e["message"] == "Investigating logs")
check("post timeline needs auth", client.post(f"/api/incidents/{ids['sev3']}/timeline", json={"message": "x"}).status_code == 401)
check("post timeline validation", client.post(f"/api/incidents/{ids['sev3']}/timeline", json={"message": ""}, headers=auth(alice)).status_code == 400)
check("post timeline 404", client.post("/api/incidents/9999/timeline", json={"message": "x"}, headers=auth(alice)).status_code == 404)

# timeline does not change status
check("timeline no status change", client.get(f"/api/incidents/{ids['sev3']}").get_json()["status"] == "investigating")

# timeline oldest first
client.post(f"/api/incidents/{ids['sev3']}/timeline", json={"message": "second", "type": "update"}, headers=auth(bob_login))
tl = client.get(f"/api/incidents/{ids['sev3']}/timeline").get_json()["items"]
check("timeline count", len(tl) == 2, tl)
check("timeline oldest first ids", tl[0]["id"] < tl[1]["id"], tl)

# public stats
r = client.get("/api/public/stats")
check("stats 200", r.status_code == 200, r.get_json())
s = r.get_json()
check("stats keys", set(s) == {"open_total", "open_by_severity", "sla_breached_open", "resolved_last_30_days"}, s)
check("stats open_by_severity keys", set(s["open_by_severity"]) == {"sev1", "sev2", "sev3", "sev4"}, s)
# sev2 reopened = open, sev1 investigating, sev3 investigating, sev4 investigating => all 4 open
check("stats open_total", s["open_total"] == 4, s)

# breached open: simulate an old sev1 incident still open
with app_module.connection() as conn:
    old = (datetime.now(app_module.timezone.utc) - app_module.timedelta(minutes=120)).isoformat()
    cur = conn.execute(
        """INSERT INTO incidents (title, service, severity, status, commander, impact_summary, opened_at, resolved_at, reopen_count, opened_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, ?)""",
        ("old breach", "svc", "sev1", "investigating", "", "", old, "alice"),
    )
    old_id = cur.lastrowid
old_inc = client.get(f"/api/incidents/{old_id}").get_json()
check("old sev1 breached", old_inc["sla_breached"] is True, old_inc)
s = client.get("/api/public/stats").get_json()
check("stats breached open", s["sla_breached_open"] >= 1, s)
check("stats open_total 5", s["open_total"] == 5, s)

# open filter
d = client.get("/api/incidents?open=true").get_json()
check("open=true all not resolved", all(x["status"] != "resolved" for x in d["items"]))
client.patch(f"/api/incidents/{ids['sev4']}", json={"status": "resolved"}, headers=auth(alice))
d = client.get("/api/incidents?open=false").get_json()
check("open=false only resolved", d["total"] == 1 and d["items"][0]["status"] == "resolved", d)
check("open=true excludes resolved", all(x["id"] != ids["sev4"] for x in client.get("/api/incidents?open=true").get_json()["items"]))

# resolved_last_30_days
s = client.get("/api/public/stats").get_json()
check("resolved_last_30_days", s["resolved_last_30_days"] == 1, s)

# resolved after due -> breached; resolved before due -> not breached
with app_module.connection() as conn:
    opened = (datetime.now(app_module.timezone.utc) - app_module.timedelta(minutes=10)).isoformat()
    cur = conn.execute(
        """INSERT INTO incidents (title, service, severity, status, commander, impact_summary, opened_at, resolved_at, reopen_count, opened_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
        ("quick fix", "svc", "sev1", "resolved", "", "", opened, datetime.now(app_module.timezone.utc).isoformat(), "alice"),
    )
    quick_id = cur.lastrowid
check("resolved before due not breached", client.get(f"/api/incidents/{quick_id}").get_json()["sla_breached"] is False)

with app_module.connection() as conn:
    opened = (datetime.now(app_module.timezone.utc) - app_module.timedelta(minutes=200)).isoformat()
    cur = conn.execute(
        """INSERT INTO incidents (title, service, severity, status, commander, impact_summary, opened_at, resolved_at, reopen_count, opened_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)""",
        ("late fix", "svc", "sev1", "resolved", "", "", opened, (datetime.now(app_module.timezone.utc) - app_module.timedelta(minutes=10)).isoformat(), "alice"),
    )
    late_id = cur.lastrowid
check("resolved after due breached", client.get(f"/api/incidents/{late_id}").get_json()["sla_breached"] is True)

# misc edge cases
r = client.get("/api/nope")
check("unknown api 404 json", r.status_code == 404 and r.is_json, (r.status_code, r.get_json()))
r = client.get("/api/incidents/not-an-int")
check("non-int id 404 json", r.status_code == 404 and r.is_json, (r.status_code, r.get_json()))
r = client.get("/api/incidents/9999/timeline")
check("timeline 404", r.status_code == 404, r.get_json())
r = client.patch("/api/incidents/9999", json={"status": "resolved"}, headers=auth(alice))
check("patch 404", r.status_code == 404, r.get_json())
r = client.post("/api/incidents", json={"title": "x", "severity": "sev1"}, headers={"Authorization": "Token abc"})
check("bad scheme 401", r.status_code == 401, r.get_json())
r = client.post("/api/incidents", json={"title": "x", "severity": "sev1"}, headers={"Authorization": "Bearer "})
check("empty bearer 401", r.status_code == 401, r.get_json())
r = client.post("/api/public/stats")
check("405 on stats", r.status_code == 405 and r.is_json, (r.status_code, r.get_json()))
r = client.post("/api/incidents", json={"title": "no sev"})
check("create missing severity needs auth", r.status_code == 401, r.get_json())
r = client.post("/api/incidents", json={"title": "no sev"}, headers=auth(alice))
check("create missing severity 400", r.status_code == 400, r.get_json())
r = client.post("/api/incidents", data="not json", content_type="application/json", headers=auth(alice))
check("create invalid json 400", r.status_code == 400, r.get_json())
r = client.post("/api/auth/register", json={"username": "carol"})
check("register missing password 400", r.status_code == 400, r.get_json())
r = client.get("/api/public/stats")
check("stats public no auth", r.status_code == 200, r.get_json())
r = client.get("/api/incidents")
check("list public no auth", r.status_code == 200, r.get_json())

print(f"\nPASSED: {passed}  FAILED: {failed}")
sys.exit(1 if failed else 0)
