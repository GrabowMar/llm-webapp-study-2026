"""Manual smoke test for the event calendar API."""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend"))

os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="calendar-test-")

from app import app  # noqa: E402

client = app.test_client()


def show(label, response):
    body = response.get_data(as_text=True)
    print(f"--- {label}: {response.status_code} {body[:400]}")
    return response


show("health", client.get("/api/health"))

show("register", client.post("/api/auth/register", json={"username": "alice", "password": "pw"}))
show("register dup", client.post("/api/auth/register", json={"username": "alice", "password": "pw"}))
show("register bad", client.post("/api/auth/register", json={"username": "", "password": ""}))

login = show("login", client.post("/api/auth/login", json={"username": "alice", "password": "pw"}))
token = login.get_json()["token"]
auth = {"Authorization": f"Bearer {token}"}

show("login bad", client.post("/api/auth/login", json={"username": "alice", "password": "nope"}))
show("login missing", client.post("/api/auth/login", json={"username": "alice"}))

show("no auth create", client.post("/api/events", json={"title": "x", "start_time": "2024-05-04T10:00:00Z", "end_time": "2024-05-04T11:00:00Z"}))
show("bad token create", client.post("/api/events", json={"title": "x", "start_time": "2024-05-04T10:00:00Z", "end_time": "2024-05-04T11:00:00Z"}, headers={"Authorization": "Bearer nope"}))

created = show("create", client.post("/api/events", json={
    "title": "Team meeting",
    "description": "Weekly sync",
    "location": "Room 2",
    "start_time": "2024-05-04T10:00:00Z",
    "end_time": "2024-05-04T11:30:00Z",
}, headers=auth))
event_id = created.get_json()["id"]

show("create naive", client.post("/api/events", json={
    "title": "Naive", "start_time": "2024-05-04T13:00:00", "end_time": "2024-05-04T14:00:00",
}, headers=auth))

show("create invalid", client.post("/api/events", json={
    "title": "", "start_time": "not-a-date", "end_time": "2024-05-04T09:00:00Z",
}, headers=auth))

show("list all", client.get("/api/events"))
show("list range", client.get("/api/events?start_date=2024-05-01&end_date=2024-05-31"))
show("list range datetime", client.get("/api/events?start_date=2024-05-04T11:00:00Z&end_date=2024-05-04T12:00:00Z"))
show("list bad range", client.get("/api/events?start_date=nonsense"))
show("get one", client.get(f"/api/events/{event_id}"))
show("get missing", client.get("/api/events/99999"))

show("put", client.put(f"/api/events/{event_id}", json={
    "title": "Renamed", "start_time": "2024-05-04T10:00:00Z", "end_time": "2024-05-04T12:00:00Z",
}, headers=auth))
show("put no auth", client.put(f"/api/events/{event_id}", json={
    "title": "x", "start_time": "2024-05-04T10:00:00Z", "end_time": "2024-05-04T12:00:00Z"}))
show("put invalid", client.put(f"/api/events/{event_id}", json={"title": "x"}, headers=auth))
show("delete", client.delete(f"/api/events/{event_id}", headers=auth))
show("delete again", client.delete(f"/api/events/{event_id}", headers=auth))
show("delete no auth", client.delete("/api/events/1"))

other = client.post("/api/auth/register", json={"username": "bob", "password": "pw2"})
bob = {"Authorization": "Bearer " + other.get_json()["token"]}
show("bob edits alice event", client.put("/api/events/2", json={
    "title": "Bob was here", "start_time": "2024-05-04T13:00:00Z", "end_time": "2024-05-04T14:00:00Z"}, headers=bob))
show("final list", client.get("/api/events"))
