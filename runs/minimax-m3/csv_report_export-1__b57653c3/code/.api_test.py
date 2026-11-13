import csv
import io
import json
import os
import sys

os.environ.setdefault("DATA_DIR", "/workspace/.testdata")
sys.path.insert(0, "/workspace/backend")

from app import app  # noqa: E402

failures = []
checks = 0


def check(label, condition, extra=""):
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label} {extra}")
        print(f"FAIL  {label} {extra}")
    else:
        print(f"ok    {label}")


client = app.test_client()

# health
res = client.get("/api/health")
check("health status", res.status_code == 200, res.status_code)
check("health body", res.get_json() == {"status": "ok"}, res.get_json())

# register
res = client.post("/api/auth/register", json={"username": "alice", "password": "secret"})
check("register status", res.status_code == 201, res.status_code)
body = res.get_json()
alice = body["token"]
check("register returns token", isinstance(alice, str) and len(alice) > 10, body)

res = client.post("/api/auth/register", json={"username": "alice", "password": "secret"})
check("duplicate register rejected", res.status_code == 409, res.status_code)

res = client.post("/api/auth/register", json={"username": "", "password": ""})
check("register validation", res.status_code == 400, res.status_code)
check("register validation fields", set(res.get_json()["errors"]) == {"username", "password"}, res.get_json())

# login
res = client.post("/api/auth/login", json={"username": "alice", "password": "secret"})
check("login status", res.status_code == 200, res.status_code)
alice = res.get_json()["token"]
check("login returns token", isinstance(alice, str) and len(alice) > 10, res.get_json())

res = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
check("login wrong password", res.status_code == 401, res.status_code)

res = client.post("/api/auth/login", json={"username": "nobody", "password": "secret"})
check("login unknown user", res.status_code == 401, res.status_code)

# auth required
res = client.get("/api/entries")
check("entries need auth", res.status_code == 401, res.status_code)
res = client.get("/api/entries", headers={"Authorization": "Bearer nope"})
check("entries reject bad token", res.status_code == 401, res.status_code)
res = client.get("/api/entries", headers={"Authorization": alice})
check("entries reject non-bearer", res.status_code == 401, res.status_code)

auth = {"Authorization": f"Bearer {alice}"}

# second user
res = client.post("/api/auth/register", json={"username": "bob", "password": "secret"})
bob = res.get_json()["token"]
bob_auth = {"Authorization": f"Bearer {bob}"}

# create entries
res = client.post(
    "/api/entries",
    headers=auth,
    json={"project": "Website", "description": "Home page", "hours": 2.5, "date": "2024-05-01"},
)
check("create status", res.status_code == 201, res.status_code)
entry = res.get_json()
check(
    "create body fields",
    set(entry) == {"id", "project", "description", "hours", "date", "created_at"},
    sorted(entry),
)
check("create body values", entry["hours"] == 2.5 and entry["date"] == "2024-05-01", entry)
check("created_at present", isinstance(entry["created_at"], str) and entry["created_at"], entry)

res = client.post(
    "/api/entries",
    headers=auth,
    json={"project": "API", "description": "Docs", "hours": "1.5", "date": "2024-05-03"},
)
check("create accepts numeric string hours", res.status_code == 201, res.status_code)
api_entry = res.get_json()

res = client.post(
    "/api/entries",
    headers=auth,
    json={"project": "Website", "description": "Bug fixes", "hours": 3, "date": "2024-05-02"},
)
mid_entry = res.get_json()
check("create third", res.status_code == 201, res.status_code)

# validation
res = client.post("/api/entries", headers=auth, json={"hours": 1, "date": "2024-05-01"})
check("create missing project", res.status_code == 400, res.status_code)
check("missing project message", "project" in res.get_json()["errors"], res.get_json())

res = client.post("/api/entries", headers=auth, json={"project": "X", "hours": -1, "date": "2024-05-01"})
check("create negative hours", res.status_code == 400, res.status_code)
res = client.post("/api/entries", headers=auth, json={"project": "X", "hours": "abc", "date": "2024-05-01"})
check("create non numeric hours", res.status_code == 400, res.status_code)
res = client.post("/api/entries", headers=auth, json={"project": "X", "hours": 1, "date": "not-a-date"})
check("create bad date", res.status_code == 400, res.status_code)
res = client.post("/api/entries", headers=auth, json={"project": "X", "hours": 1, "date": "2024-02-31"})
check("create impossible date", res.status_code == 400, res.status_code)
res = client.post("/api/entries", headers=auth, json={"project": "X", "hours": 1})
check("create missing date", res.status_code == 400, res.status_code)

# listing
res = client.get("/api/entries", headers=auth)
payload = res.get_json()
check("list status", res.status_code == 200, res.status_code)
check("list shape", set(payload) == {"items", "total", "page", "page_size"}, sorted(payload))
check("list total", payload["total"] == 3, payload["total"])
check("list page", payload["page"] == 1, payload["page"])
check("list page_size", isinstance(payload["page_size"], int), payload)
check(
    "list newest first",
    [item["date"] for item in payload["items"]] == ["2024-05-03", "2024-05-02", "2024-05-01"],
    [item["date"] for item in payload["items"]],
)

# paging
res = client.get("/api/entries?page=2&page_size=2", headers=auth)
payload = res.get_json()
check("page 2 size", len(payload["items"]) == 1, payload["items"])
check("page 2 number", payload["page"] == 2, payload)
check("page total unchanged", payload["total"] == 3, payload)

# filters
res = client.get("/api/entries?project=Website", headers=auth)
check("filter project", res.get_json()["total"] == 2, res.get_json())
res = client.get("/api/entries?start_date=2024-05-02", headers=auth)
check("filter start_date", res.get_json()["total"] == 2, res.get_json())
res = client.get("/api/entries?end_date=2024-05-02", headers=auth)
check("filter end_date", res.get_json()["total"] == 2, res.get_json())
res = client.get("/api/entries?start_date=2024-05-02&end_date=2024-05-02", headers=auth)
check("filter date range", res.get_json()["total"] == 1, res.get_json())
res = client.get("/api/entries?project=Missing", headers=auth)
check("filter no match", res.get_json()["total"] == 0, res.get_json())

# isolation
res = client.get("/api/entries", headers=bob_auth)
check("other user sees nothing", res.get_json()["total"] == 0, res.get_json())
res = client.patch(f"/api/entries/{entry['id']}", headers=bob_auth, json={"hours": 9})
check("other user cannot patch", res.status_code == 404, res.status_code)
res = client.delete(f"/api/entries/{entry['id']}", headers=bob_auth)
check("other user cannot delete", res.status_code == 404, res.status_code)
res = client.get("/api/entries", headers=auth)
check("entry survived other user delete", res.get_json()["total"] == 3, res.get_json())

# patch
res = client.patch(f"/api/entries/{mid_entry['id']}", headers=auth, json={"hours": 4})
check("patch status", res.status_code == 200, res.status_code)
patched = res.get_json()
check("patch hours", patched["hours"] == 4, patched)
check("patch keeps project", patched["project"] == "Website", patched)
check("patch keeps description", patched["description"] == "Bug fixes", patched)
check("patch keeps date", patched["date"] == "2024-05-02", patched)
check("patch keeps id", patched["id"] == mid_entry["id"], patched)

res = client.patch(f"/api/entries/{mid_entry['id']}", headers=auth, json={"project": "Renamed"})
check("patch project", res.get_json()["project"] == "Renamed", res.get_json())
res = client.get("/api/entries", headers=auth)
hours_now = [i["hours"] for i in res.get_json()["items"] if i["id"] == mid_entry["id"]][0]
check("patch only touches given fields", hours_now == 4, hours_now)

res = client.patch(f"/api/entries/{mid_entry['id']}", headers=auth, json={"hours": -3})
check("patch validation", res.status_code == 400, res.status_code)
res = client.patch(f"/api/entries/{mid_entry['id']}", headers=auth, json={"date": "nope"})
check("patch date validation", res.status_code == 400, res.status_code)
res = client.patch("/api/entries/999999", headers=auth, json={"hours": 1})
check("patch missing entry", res.status_code == 404, res.status_code)

# delete
res = client.delete(f"/api/entries/{mid_entry['id']}", headers=auth)
check("delete status", res.status_code in (200, 204), res.status_code)
res = client.get("/api/entries", headers=auth)
check("entry removed", res.get_json()["total"] == 2, res.get_json())
res = client.delete(f"/api/entries/{mid_entry['id']}", headers=auth)
check("delete twice", res.status_code == 404, res.status_code)

# csv exports
res = client.get("/api/exports/entries.csv", headers=auth)
check("csv status", res.status_code == 200, res.status_code)
check("csv content type", res.headers["Content-Type"].startswith("text/csv"), res.headers.get("Content-Type"))
check("csv charset utf-8", "utf-8" in res.headers["Content-Type"].lower(), res.headers.get("Content-Type"))
text = res.get_data(as_text=True)
rows = list(csv.reader(io.StringIO(text)))
check("csv header", rows[0] == ["date", "project", "description", "hours"], rows[0])
check("csv oldest first", [r[0] for r in rows[1:]] == ["2024-05-01", "2024-05-03"], rows)
check("csv hours format", rows[1][3] == "2.5", rows[1])

res = client.get("/api/exports/entries.csv?project=Website", headers=auth)
rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
check("csv project filter", len(rows) == 2, rows)

res = client.get("/api/exports/entries.csv?start_date=2024-05-03", headers=auth)
rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
check("csv date filter", len(rows) == 2, rows)

res = client.get("/api/exports/summary.csv", headers=auth)
check("summary csv status", res.status_code == 200, res.status_code)
rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
check("summary header", rows[0] == ["project", "hours"], rows[0])
check("summary sorted", [r[0] for r in rows[1:]] == sorted(r[0] for r in rows[1:]), rows)
check("summary values", dict((r[0], r[1]) for r in rows[1:]) == {"API": "1.5", "Website": "2.5"}, rows)

res = client.get("/api/exports/summary.csv?start_date=2024-05-03", headers=auth)
rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
check("summary filtered", rows[1:] == [["API", "1.5"]], rows)

# csv safety
client.post(
    "/api/entries",
    headers=auth,
    json={
        "project": "=cmd|'/c calc'!A1",
        "description": 'He said "hi", then\nleft, +1 -2 @x',
        "hours": 1,
        "date": "2024-05-04",
    },
)
res = client.get("/api/exports/entries.csv", headers=auth)
rows = list(csv.reader(io.StringIO(res.get_data(as_text=True))))
row = [r for r in rows[1:] if r[0] == "2024-05-04"][0]
check("csv formula neutralised", not row[1].startswith("="), row[1])
check("csv formula apostrophe", row[1].startswith("'="), row[1])
check("csv text preserved", row[2] == 'He said "hi", then\nleft, +1 -2 @x', repr(row[2]))

# frontend serving
res = client.get("/")
check("frontend served", res.status_code == 200, res.status_code)
check("frontend html", b"<div id=\"root\">" in res.data, res.data[:80])

res = client.get("/api/does-not-exist")
check("unknown api json 404", res.status_code == 404 and res.is_json, res.status_code)

print()
print(f"{checks - len(failures)}/{checks} checks passed")
if failures:
    print("FAILURES:")
    for failure in failures:
        print(" -", failure)
    sys.exit(1)
