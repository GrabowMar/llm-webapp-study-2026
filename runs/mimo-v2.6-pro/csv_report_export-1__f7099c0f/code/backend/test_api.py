"""Smoke tests for the timesheet API (run with the venv python)."""
import io
import csv
import os
import sys
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="ts-data-")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app  # noqa: E402

c = app.test_client()
failures = []


def check(name, cond, extra=""):
    if cond:
        print(f"ok   {name}")
    else:
        failures.append(name)
        print(f"FAIL {name} {extra}")


# health
r = c.get("/api/health")
check("health", r.status_code == 200 and r.get_json() == {"status": "ok"})

# register / login
r = c.post("/api/auth/register", json={"username": "alice", "password": "secret"})
check("register 201", r.status_code == 201, r.get_data(as_text=True))
r = c.post("/api/auth/register", json={"username": "alice", "password": "x"})
check("register dup 409", r.status_code == 409, r.get_data(as_text=True))
r = c.post("/api/auth/register", json={"username": "", "password": "x"})
check("register empty user 400", r.status_code == 400, r.get_data(as_text=True))
r = c.post("/api/auth/login", json={"username": "alice", "password": "secret"})
check("login 200", r.status_code == 200 and "token" in r.get_json(), r.get_data(as_text=True))
tok = r.get_json()["token"]
r = c.post("/api/auth/login", json={"username": "alice", "password": "bad"})
check("login bad 401", r.status_code == 401, r.get_data(as_text=True))
r = c.post("/api/auth/register", json={"username": "bob", "password": "pw"})
tok_b = r.get_json().get("token")
r = c.post("/api/auth/register", json={"username": "carol", "password": "pw"})
tok_c = r.get_json().get("token")

AUTH = {"Authorization": f"Bearer {tok}"}
AUTH_B = {"Authorization": f"Bearer {tok_b}"}
AUTH_C = {"Authorization": f"Bearer {tok_c}"}

# auth enforcement
check("no token 401", c.get("/api/entries").status_code == 401)
check("bad token 401", c.get("/api/entries", headers={"Authorization": "Bearer zzz"}).status_code == 401)

# create entries
r = c.post("/api/entries", json={"project": "Acme", "description": "Design work", "hours": 2.5, "date": "2024-01-02"}, headers=AUTH)
check("create 201", r.status_code == 201, r.get_data(as_text=True))
e1 = r.get_json()
check("entry shape", set(e1) == {"id", "project", "description", "hours", "date", "created_at"}, str(e1))
r = c.post("/api/entries", json={"project": "Acme", "description": "Meeting", "hours": 1.5, "date": "2024-01-01"}, headers=AUTH)
e2 = r.get_json()
r = c.post("/api/entries", json={"project": "=SUM(A1)", "description": "+1234", "hours": 3, "date": "2024-01-03"}, headers=AUTH)
e3 = r.get_json()
r = c.post("/api/entries", json={"project": "Globex", "description": "007", "hours": 4, "date": "2024-01-03"}, headers=AUTH)
e4 = r.get_json()
r = c.post("/api/entries", json={"project": "Acme", "description": "Review", "hours": 1.25, "date": "2024-01-05"}, headers=AUTH)
e5 = r.get_json()

# validation
r = c.post("/api/entries", json={"description": "x", "hours": 1, "date": "2024-01-01"}, headers=AUTH)
check("missing project 400", r.status_code == 400 and "project" in r.get_json().get("error", ""), r.get_data(as_text=True))
r = c.post("/api/entries", json={"project": "P", "hours": 0, "date": "2024-01-01"}, headers=AUTH)
check("hours 0 400", r.status_code == 400 and "hours" in r.get_json().get("error", ""), r.get_data(as_text=True))
r = c.post("/api/entries", json={"project": "P", "hours": -1, "date": "2024-01-01"}, headers=AUTH)
check("hours neg 400", r.status_code == 400)
r = c.post("/api/entries", json={"project": "P", "hours": "abc", "date": "2024-01-01"}, headers=AUTH)
check("hours text 400", r.status_code == 400)
r = c.post("/api/entries", json={"project": "P", "hours": 1, "date": "01/02/2024"}, headers=AUTH)
check("bad date 400", r.status_code == 400 and "date" in r.get_json().get("error", ""), r.get_data(as_text=True))
r = c.post("/api/entries", json={"project": "P", "hours": 1, "date": "2024-02-31"}, headers=AUTH)
check("impossible date 400", r.status_code == 400, r.get_data(as_text=True))
r = c.post("/api/entries", json={"project": "  ", "hours": 1, "date": "2024-01-01"}, headers=AUTH)
check("blank project 400", r.status_code == 400)
r = c.post("/api/entries", json={"project": "P", "hours": 1, "date": "2024-01-01", "description": 5}, headers=AUTH)
check("description type 400", r.status_code == 400)

# list: ordering + paging
r = c.get("/api/entries", headers=AUTH)
d = r.get_json()
check("list total", d["total"] == 5, str(d))
check("list newest date first", [e["date"] for e in d["items"]] == ["2024-01-05", "2024-01-03", "2024-01-03", "2024-01-02", "2024-01-01"], str([e["date"] for e in d["items"]]))
r = c.get("/api/entries?page=1&page_size=2", headers=AUTH)
d = r.get_json()
check("paging", d["page"] == 1 and d["page_size"] == 2 and d["total"] == 5 and len(d["items"]) == 2, str(d))
r = c.get("/api/entries?page=3&page_size=2", headers=AUTH)
d = r.get_json()
check("paging last", len(d["items"]) == 1, str(d))
r = c.get("/api/entries?page=0", headers=AUTH)
check("page 0 -> 400", r.status_code == 400)
r = c.get("/api/entries?start_date=2024-01-02&end_date=2024-01-03", headers=AUTH)
d = r.get_json()
check("date filters", d["total"] == 3 and {e["date"] for e in d["items"]} == {"2024-01-02", "2024-01-03"}, str(d))
r = c.get("/api/entries?project=Acme", headers=AUTH)
d = r.get_json()
check("project filter", d["total"] == 3 and all(e["project"] == "Acme" for e in d["items"]), str(d))
r = c.get("/api/entries?start_date=bogus", headers=AUTH)
check("bad filter date 400", r.status_code == 400)

# patch
r = c.patch(f"/api/entries/{e1['id']}", json={"hours": 9.5}, headers=AUTH)
check("patch 200", r.status_code == 200, r.get_data(as_text=True))
d = r.get_json()
check("patch partial", d["hours"] == 9.5 and d["project"] == "Acme" and d["date"] == "2024-01-02" and d["id"] == e1["id"], str(d))
r = c.patch(f"/api/entries/{e1['id']}", json={}, headers=AUTH)
check("patch empty 200", r.status_code == 200 and r.get_json()["hours"] == 9.5)
r = c.patch(f"/api/entries/{e1['id']}", json={"hours": -3}, headers=AUTH)
check("patch invalid 400", r.status_code == 400)
r = c.patch("/api/entries/99999", json={"hours": 3}, headers=AUTH)
check("patch missing 404", r.status_code == 404)

# ownership
r = c.get("/api/entries", headers=AUTH_B)
check("other user sees nothing", r.get_json()["total"] == 0, str(r.get_json()))
r = c.patch(f"/api/entries/{e1['id']}", json={"hours": 1}, headers=AUTH_B)
check("patch other 404", r.status_code == 404)
r = c.delete(f"/api/entries/{e1['id']}", headers=AUTH_B)
check("delete other 404", r.status_code == 404)

# delete
r = c.delete(f"/api/entries/{e5['id']}", headers=AUTH)
check("delete 204", r.status_code == 204, str(r.status_code))
r = c.delete(f"/api/entries/{e5['id']}", headers=AUTH)
check("delete again 404", r.status_code == 404)

# csv exports
r = c.get("/api/exports/entries.csv", headers=AUTH)
check("entries csv 200", r.status_code == 200, str(r.status_code))
check("entries csv ctype", r.headers["Content-Type"].startswith("text/csv"), r.headers["Content-Type"])
text = r.data.decode("utf-8")
print("--- entries.csv ---")
print(text)
rows = list(csv.reader(io.StringIO(text)))
check("entries csv header", rows[0] == ["date", "project", "description", "hours"], str(rows[0]))
check("entries csv oldest first", [rw[0] for rw in rows[1:]] == ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-03"], str(rows))
check("entries csv formula escape", rows[3][1] == "'=SUM(A1)" and rows[3][2] == "'+1234", str(rows[3]))
check("entries csv number escape", rows[4][2] == "'007", str(rows[4]))
check("entries csv text round-trip", rows[1][2] == "Meeting" and rows[2][2] == "Design work", str(rows))
check("entries csv hours kept", rows[2][3] == "9.5" and rows[4][3] == "4", str(rows))

r = c.get("/api/exports/entries.csv?start_date=2024-01-02&end_date=2024-01-03&project=Acme", headers=AUTH)
rows = list(csv.reader(io.StringIO(r.data.decode("utf-8"))))
check("entries csv filters", len(rows) == 2 and rows[1][0] == "2024-01-02", str(rows))

r = c.get("/api/exports/summary.csv", headers=AUTH)
text = r.data.decode("utf-8")
print("--- summary.csv ---")
print(text)
rows = list(csv.reader(io.StringIO(text)))
check("summary header", rows[0] == ["project", "hours"], str(rows[0]))
check("summary sorted", [rw[0] for rw in rows[1:]] == sorted(rw[0] for rw in rows[1:]), str(rows))
acme = [rw for rw in rows if rw[0] == "Acme"][0]
check("summary totals", float(acme[1]) == 11 and acme[1] in ("11", "11.0"), str(rows))
r = c.get("/api/exports/summary.csv?start_date=2024-01-03&end_date=2024-01-03", headers=AUTH)
rows = list(csv.reader(io.StringIO(r.data.decode("utf-8"))))
check("summary filters", len(rows) == 3 and float([rw for rw in rows if rw[0] == "Globex"][0][1]) == 4, str(rows))

# user isolation in exports
r = c.get("/api/exports/entries.csv", headers=AUTH_B)
check("export isolation", r.data.decode("utf-8").strip() == "date,project,description,hours", r.data.decode("utf-8"))
r = c.get("/api/exports/summary.csv", headers=AUTH_C)
check("summary isolation", r.data.decode("utf-8").strip() == "project,hours", r.data.decode("utf-8"))

# unknown api path
r = c.get("/api/nope")
check("api 404 json", r.status_code == 404 and r.is_json)

print()
if failures:
    print("FAILURES:", failures)
    sys.exit(1)
print("ALL PASSED")
