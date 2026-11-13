"""Ad-hoc API smoke test for the kanban backend."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

os.environ.setdefault("DATA_DIR", "data_test")

from app import app  # noqa: E402

client = app.test_client()


def check(label, condition, extra=""):
    status = "ok " if condition else "FAIL"
    print(f"[{status}] {label} {extra}")
    if not condition:
        globals()["failures"] = globals().get("failures", 0) + 1


def body(resp):
    try:
        return resp.get_json()
    except Exception:
        return {}


# health
r = client.get("/api/health")
check("health", r.status_code == 200 and body(r) == {"status": "ok"}, body(r))

# auth required
r = client.get("/api/tasks")
check("tasks public", r.status_code == 200 and "items" in body(r))
r = client.post("/api/tasks", json={"title": "x"})
check("create needs auth", r.status_code == 401, r.status_code)
r = client.patch("/api/tasks/1", json={"title": "x"})
check("patch needs auth", r.status_code == 401, r.status_code)
r = client.delete("/api/tasks/1")
check("delete needs auth", r.status_code == 401, r.status_code)
r = client.post("/api/tasks", json={"title": "x"}, headers={"Authorization": "Bearer nope"})
check("bad token", r.status_code == 401, r.status_code)

# register validation
r = client.post("/api/auth/register", json={"username": "", "password": ""})
check("register validation", r.status_code == 400 and "error" in body(r), body(r))
r = client.post("/api/auth/register", json={"username": "alice", "password": "pw"})
check("register ok", r.status_code == 201, r.status_code)
r = client.post("/api/auth/register", json={"username": "alice", "password": "pw"})
check("duplicate register", r.status_code in (400, 409), r.status_code)

r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
check("bad login", r.status_code == 401, r.status_code)
r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
check("login ok", r.status_code == 200 and "token" in body(r), body(r))
token = body(r)["token"]
auth = {"Authorization": f"Bearer {token}"}

# create tasks
r = client.post("/api/tasks", json={"title": "   ", "priority": "high"}, headers=auth)
check("create validation", r.status_code == 400 and "errors" in body(r), body(r))
r = client.post("/api/tasks", json={"title": "Task A", "priority": "high"}, headers=auth)
check("create a", r.status_code == 201, r.status_code)
task_a = body(r)
check("create a shape", set(task_a) == {"id", "title", "description", "status", "priority", "position", "updated_at"}, sorted(task_a))
check("create a defaults", task_a["status"] == "todo" and task_a["position"] == 1 and task_a["priority"] == "high")
r = client.post("/api/tasks", json={"title": "Task B", "priority": "low"}, headers=auth)
task_b = body(r)
check("create b position", task_b["position"] == 2, task_b)
r = client.post("/api/tasks", json={"title": "Task C", "status": "in_progress", "priority": "medium"}, headers=auth)
task_c = body(r)
check("create c", task_c["position"] == 1 and task_c["status"] == "in_progress", task_c)
r = client.post("/api/tasks", json={"title": "Task D", "status": "done"}, headers=auth)
task_d = body(r)

r = client.get("/api/tasks")
data = body(r)
check("list shape", set(data) == {"items", "total", "counts"}, sorted(data))
check("list order", [t["title"] for t in data["items"]] == ["Task A", "Task B", "Task C", "Task D"], [t["title"] for t in data["items"]])
check("counts", data["counts"] == {"todo": 2, "in_progress": 1, "done": 1}, data["counts"])
check("total", data["total"] == 4)

r = client.get("/api/tasks?status=done")
data = body(r)
check("filter status", len(data["items"]) == 1 and data["items"][0]["title"] == "Task D", data)
r = client.get("/api/tasks?priority=low")
data = body(r)
check("filter priority", len(data["items"]) == 1 and data["items"][0]["title"] == "Task B", data)

# get one
r = client.get(f"/api/tasks/{task_a['id']}")
check("get one", r.status_code == 200 and body(r)["title"] == "Task A", r.status_code)
r = client.get("/api/tasks/9999")
check("get missing", r.status_code == 404, r.status_code)

# patch title only
r = client.patch(f"/api/tasks/{task_a['id']}", json={"title": "Task A2"}, headers=auth)
data = body(r)
check("patch title", data["title"] == "Task A2" and data["position"] == 1 and data["status"] == "todo", data)

# patch move within column
r = client.patch(f"/api/tasks/{task_b['id']}", json={"position": 1}, headers=auth)
data = body(r)
check("patch position", data["position"] == 1, data)
r = client.get("/api/tasks")
items = {t["title"]: t for t in body(r)["items"]}
check("reordered", [t["title"] for t in body(r)["items"] if t["status"] == "todo"] == ["Task B", "Task A2"], [t["title"] for t in body(r)["items"]])
check("no gaps", sorted(t["position"] for t in body(r)["items"] if t["status"] == "todo") == [1, 2])

# patch move to other column
r = client.patch(f"/api/tasks/{task_b['id']}", json={"status": "done", "position": 1}, headers=auth)
data = body(r)
check("patch move column", data["status"] == "done" and data["position"] == 1, data)
r = client.get("/api/tasks")
todo = [t for t in body(r)["items"] if t["status"] == "todo"]
done = [t for t in body(r)["items"] if t["status"] == "done"]
check("todo closed gap", [t["position"] for t in todo] == [1], todo)
check("done positions", [(t["title"], t["position"]) for t in done] == [("Task B", 1), ("Task D", 2)], done)

# patch move to other column without position -> end
r = client.patch(f"/api/tasks/{task_a['id']}", json={"status": "in_progress"}, headers=auth)
data = body(r)
check("patch move append", data["status"] == "in_progress" and data["position"] == 2, data)

# patch validation
r = client.patch(f"/api/tasks/{task_a['id']}", json={"title": ""}, headers=auth)
check("patch validation", r.status_code == 400 and "error" in body(r), body(r))
r = client.patch(f"/api/tasks/{task_a['id']}", json={"status": "nope"}, headers=auth)
check("patch bad status", r.status_code == 400, body(r))
r = client.patch("/api/tasks/9999", json={"title": "x"}, headers=auth)
check("patch missing", r.status_code == 404, r.status_code)

# delete closes gap
r = client.delete(f"/api/tasks/{task_d['id']}", headers=auth)
check("delete ok", r.status_code in (200, 204), r.status_code)
r = client.get("/api/tasks")
done = [t for t in body(r)["items"] if t["status"] == "done"]
check("delete closes gap", [(t["title"], t["position"]) for t in done] == [("Task B", 1)], done)

# second user can edit any task
r = client.post("/api/auth/register", json={"username": "bob", "password": "pw2"})
check("register bob", r.status_code == 201, r.status_code)
r = client.post("/api/auth/login", json={"username": "bob", "password": "pw2"})
bob = {"Authorization": f"Bearer {body(r)['token']}"}
r = client.patch(f"/api/tasks/{task_a['id']}", json={"title": "Edited by bob"}, headers=bob)
check("other user can edit", r.status_code == 200 and body(r)["title"] == "Edited by bob", body(r))
r = client.delete(f"/api/tasks/{task_a['id']}", headers=bob)
check("other user can delete", r.status_code in (200, 204), r.status_code)

print("failures:", globals().get("failures", 0))
sys.exit(1 if globals().get("failures") else 0)
