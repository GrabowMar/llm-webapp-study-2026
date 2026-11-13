import hashlib
import tempfile
import unittest
from pathlib import Path

from backend.app import create_app


class CalendarAPITests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "test.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()
        self.client.post("/api/auth/register", json={"username": "alice", "password": "secret"})
        response = self.client.post("/api/auth/login", json={"username": "alice", "password": "secret"})
        self.token = response.json["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.event = {
            "title": "Team picnic",
            "description": "Bring something to share.",
            "location": "The park",
            "start_time": "2026-11-12T10:00:00",
            "end_time": "2026-11-12T12:00:00",
        }

    def tearDown(self):
        self.directory.cleanup()

    def create_event(self, **overrides):
        return self.client.post("/api/events", json=self.event | overrides, headers=self.headers)

    def test_health_and_empty_list(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/events").json, {"items": [], "total": 0})

    def test_registration_and_login(self):
        response = self.client.post("/api/auth/register", json={"username": "bob", "password": "password"})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "bob", "password": "password"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "bob", "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.headers).json, {"username": "alice"})

    def test_authentication_required(self):
        event_id = self.create_event().json["id"]
        for method, path, body in (
            ("POST", "/api/events", self.event),
            ("PUT", f"/api/events/{event_id}", self.event),
            ("DELETE", f"/api/events/{event_id}", None),
        ):
            for headers in ({}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic abc"}):
                self.assertEqual(self.client.open(path, method=method, json=body, headers=headers).status_code, 401)

    def test_event_round_trip_and_utc(self):
        response = self.create_event(start_time="2026-11-12T12:00:00+02:00", end_time="2026-11-12T14:00:00+02:00")
        self.assertEqual(response.status_code, 201)
        event = response.json
        self.assertEqual(set(event), {"id", "title", "description", "location", "start_time", "end_time", "created_at", "created_by"})
        self.assertEqual(event["start_time"], "2026-11-12T10:00:00Z")
        self.assertEqual(event["end_time"], "2026-11-12T12:00:00Z")
        self.assertTrue(event["created_at"].endswith("Z"))
        self.assertEqual(event["created_by"], "alice")
        self.assertEqual(self.client.get(f"/api/events/{event['id']}").json, event)

    def test_any_user_can_replace_and_delete(self):
        event = self.create_event().json
        self.client.post("/api/auth/register", json={"username": "bob", "password": "password"})
        token = self.client.post("/api/auth/login", json={"username": "bob", "password": "password"}).json["token"]
        headers = {"Authorization": f"Bearer {token}"}
        replacement = {key: self.event[key] for key in ("title", "start_time", "end_time")}
        replacement["title"] = "Updated picnic"
        response = self.client.put(f"/api/events/{event['id']}", json=replacement, headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json["description"])
        self.assertIsNone(response.json["location"])
        self.assertEqual(response.json["created_by"], "alice")
        self.assertEqual(response.json["created_at"], event["created_at"])
        self.assertEqual(self.client.delete(f"/api/events/{event['id']}", headers=headers).status_code, 204)
        self.assertEqual(self.client.get(f"/api/events/{event['id']}").status_code, 404)

    def test_sorting_and_date_ranges(self):
        self.create_event(title="Later", start_time="2026-11-13T10:00:00Z", end_time="2026-11-13T11:00:00Z")
        self.create_event(title="Earlier")
        self.create_event(title="Late evening", start_time="2026-11-12T23:59:59Z", end_time="2026-11-13T01:00:00Z")
        events = self.client.get("/api/events").json
        self.assertEqual([event["title"] for event in events["items"]], ["Earlier", "Late evening", "Later"])
        self.assertEqual(events["total"], 3)
        filtered = self.client.get("/api/events?start_date=2026-11-12&end_date=2026-11-12").json
        self.assertEqual(filtered["total"], 2)
        self.assertEqual(self.client.get("/api/events?start_date=2026-11-13").json["total"], 1)
        self.assertEqual(self.client.get("/api/events?end_date=2026-11-12T10:00:00Z").json["total"], 1)

    def test_field_validation(self):
        for changes, field in (
            ({"title": " "}, "title"),
            ({"title": 3}, "title"),
            ({"start_time": "invalid"}, "start_time"),
            ({"start_time": "2026-11-12"}, "start_time"),
            ({"end_time": "2026-11-12T09:00:00"}, "end_time"),
            ({"end_time": None}, "end_time"),
            ({"location": []}, "location"),
            ({"description": 7}, "description"),
        ):
            response = self.create_event(**changes)
            self.assertEqual(response.status_code, 400)
            self.assertIn(field, response.json["errors"])
        self.assertEqual(self.client.post("/api/events", json=[], headers=self.headers).status_code, 400)
        self.assertEqual(self.client.get("/api/events?start_date=not-a-date").status_code, 400)
        self.assertEqual(self.client.get("/api/events?start_date=2026-11-20&end_date=2026-11-10").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register", json={}).status_code, 400)

    def test_persistence_and_token_storage(self):
        event_id = self.create_event().json["id"]
        second_app = create_app({"TESTING": True, "DATABASE": self.database})
        second_client = second_app.test_client()
        self.assertEqual(second_client.get(f"/api/events/{event_id}").status_code, 200)
        self.assertEqual(second_client.get("/api/auth/me", headers=self.headers).status_code, 200)
        with second_app.app_context():
            from backend.app import get_db

            db = get_db()
            self.assertNotEqual(db.execute("SELECT password_hash FROM users").fetchone()[0], "secret")
            self.assertEqual(db.execute("SELECT token_hash FROM sessions").fetchone()[0], hashlib.sha256(self.token.encode()).hexdigest())

    def test_logout_revokes_token(self):
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.headers).status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me", headers=self.headers).status_code, 401)

    def test_unknown_api_returns_json(self):
        response = self.client.get("/api/unknown")
        self.assertEqual(response.status_code, 404)
        self.assertIn("error", response.json)
        self.assertEqual(self.client.put("/api/health").status_code, 405)


if __name__ == "__main__":
    unittest.main()
