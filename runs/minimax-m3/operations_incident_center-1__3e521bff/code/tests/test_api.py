"""End-to-end API checks for the incident center.

Run against a server that is already listening (default http://localhost:8000):

    python tests/test_api.py
"""

import json
import os
import sys
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("BASE_URL", "http://localhost:8000")


def call(method, path, body=None, token=None):
    url = BASE + path
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw
        return error.code, payload


class ApiTest(unittest.TestCase):
    def setUp(self):
        suffix = str(datetime.now().timestamp()).replace(".", "")[-9:]
        self.username = f"user_{suffix}"
        self.password = "secret123"
        status, payload = call(
            "POST", "/api/auth/register", {"username": self.username, "password": self.password}
        )
        self.assertEqual(status, 201, payload)
        status, payload = call(
            "POST", "/api/auth/login", {"username": self.username, "password": self.password}
        )
        self.assertEqual(status, 200, payload)
        self.token = payload["token"]

    # -- auth ---------------------------------------------------------------

    def test_health(self):
        status, payload = call("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload, {"status": "ok"})

    def test_login_rejects_bad_password(self):
        status, _ = call(
            "POST", "/api/auth/login", {"username": self.username, "password": "nope"}
        )
        self.assertEqual(status, 401)

    def test_duplicate_registration_rejected(self):
        status, _ = call(
            "POST", "/api/auth/register", {"username": self.username, "password": self.password}
        )
        self.assertIn(status, (400, 409))

    def test_write_requires_token(self):
        status, _ = call(
            "POST", "/api/incidents", {"title": "x", "severity": "sev1"}
        )
        self.assertEqual(status, 401)
        status, _ = call("POST", "/api/incidents", {"title": "x", "severity": "sev1"}, "nonsense")
        self.assertEqual(status, 401)

    # -- incidents ----------------------------------------------------------

    def create(self, **overrides):
        payload = {
            "title": "Checkout latency spike",
            "service": "checkout",
            "severity": "sev2",
            "commander": "alice",
            "impact_summary": "20% of checkouts failing",
        }
        payload.update(overrides)
        status, body = call("POST", "/api/incidents", payload, self.token)
        self.assertEqual(status, 201, body)
        return body

    def test_create_defaults_to_investigating(self):
        incident = self.create()
        self.assertEqual(incident["status"], "investigating")
        self.assertEqual(incident["severity"], "sev2")
        self.assertEqual(incident["opened_by"], self.username)
        self.assertEqual(incident["reopen_count"], 0)
        self.assertIsNone(incident["resolved_at"])
        self.assertFalse(incident["sla_breached"])
        for key in (
            "id",
            "title",
            "service",
            "severity",
            "status",
            "commander",
            "impact_summary",
            "opened_at",
            "resolved_at",
            "reopen_count",
            "opened_by",
            "sla_due_at",
            "sla_breached",
        ):
            self.assertIn(key, incident)

    def test_create_validation(self):
        status, body = call("POST", "/api/incidents", {}, self.token)
        self.assertEqual(status, 400)
        self.assertIn("errors", body)
        status, body = call("POST", "/api/incidents", {"title": "x", "severity": "sev9"}, self.token)
        self.assertEqual(status, 400)

    def test_sla_targets(self):
        targets = {"sev1": 60, "sev2": 240, "sev3": 1440, "sev4": 4320}
        for severity, minutes in targets.items():
            incident = self.create(severity=severity)
            opened = datetime.fromisoformat(incident["opened_at"])
            due = datetime.fromisoformat(incident["sla_due_at"])
            self.assertAlmostEqual(
                (due - opened).total_seconds(), minutes * 60, delta=1.5
            )

    def test_patch_only_changes_given_fields(self):
        incident = self.create()
        status, body = call(
            "PATCH", f"/api/incidents/{incident['id']}", {"title": "Renamed"}, self.token
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["title"], "Renamed")
        self.assertEqual(body["severity"], incident["severity"])
        self.assertEqual(body["commander"], incident["commander"])

    def test_status_change_appends_event(self):
        incident = self.create()
        status, body = call(
            "PATCH", f"/api/incidents/{incident['id']}", {"status": "monitoring"}, self.token
        )
        self.assertEqual(status, 200, body)
        self.assertEqual(body["status"], "monitoring")
        status, timeline = call("GET", f"/api/incidents/{incident['id']}/timeline")
        self.assertEqual(status, 200)
        self.assertEqual(len(timeline["items"]), 1)
        event = timeline["items"][0]
        self.assertEqual(event["type"], "status_change")
        self.assertIn("investigating", event["message"])
        self.assertIn("monitoring", event["message"])
        self.assertEqual(event["author"], self.username)

    def test_resolved_sets_resolved_at(self):
        incident = self.create()
        status, body = call(
            "PATCH", f"/api/incidents/{incident['id']}", {"status": "resolved"}, self.token
        )
        self.assertEqual(status, 200)
        self.assertIsNotNone(body["resolved_at"])

    def test_reopen_counts(self):
        incident = self.create()
        call("PATCH", f"/api/incidents/{incident['id']}", {"status": "resolved"}, self.token)
        status, body = call(
            "PATCH", f"/api/incidents/{incident['id']}", {"status": "investigating"}, self.token
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["reopen_count"], 1)
        self.assertIsNone(body["resolved_at"])

    def test_timeline_post_does_not_change_status(self):
        incident = self.create()
        status, event = call(
            "POST",
            f"/api/incidents/{incident['id']}/timeline",
            {"message": "Paged the database team"},
            self.token,
        )
        self.assertEqual(status, 201, event)
        self.assertEqual(event["message"], "Paged the database team")
        self.assertEqual(event["author"], self.username)
        status, body = call("GET", f"/api/incidents/{incident['id']}")
        self.assertEqual(body["status"], "investigating")
        status, timeline = call("GET", f"/api/incidents/{incident['id']}/timeline")
        self.assertEqual(len(timeline["items"]), 1)

    def test_timeline_is_oldest_first(self):
        incident = self.create()
        for index in range(3):
            call(
                "POST",
                f"/api/incidents/{incident['id']}/timeline",
                {"message": f"note {index}"},
                self.token,
            )
        status, timeline = call("GET", f"/api/incidents/{incident['id']}/timeline")
        messages = [item["message"] for item in timeline["items"]]
        self.assertEqual(messages, ["note 0", "note 1", "note 2"])

    def test_timeline_requires_auth(self):
        incident = self.create()
        status, _ = call("POST", f"/api/incidents/{incident['id']}/timeline", {"message": "x"})
        self.assertEqual(status, 401)

    def test_missing_incident(self):
        status, _ = call("GET", "/api/incidents/99999999")
        self.assertEqual(status, 404)

    # -- listing ------------------------------------------------------------

    def test_list_paging_and_order(self):
        first = self.create(title="First")
        second = self.create(title="Second")
        status, body = call("GET", "/api/incidents?page=1&page_size=1")
        self.assertEqual(status, 200)
        self.assertEqual(body["page"], 1)
        self.assertEqual(body["page_size"], 1)
        self.assertEqual(len(body["items"]), 1)
        self.assertGreaterEqual(body["total"], 2)
        newest = body["items"][0]["id"]
        self.assertEqual(newest, second["id"])

    def test_list_filters(self):
        incident = self.create(severity="sev1", title="Filter target")
        call("PATCH", f"/api/incidents/{incident['id']}", {"status": "resolved"}, self.token)
        status, body = call("GET", "/api/incidents?severity=sev1")
        self.assertTrue(all(item["severity"] == "sev1" for item in body["items"]))
        status, body = call("GET", "/api/incidents?status=resolved")
        self.assertTrue(all(item["status"] == "resolved" for item in body["items"]))
        status, body = call("GET", "/api/incidents?open=true")
        self.assertTrue(all(item["status"] != "resolved" for item in body["items"]))
        status, body = call("GET", "/api/incidents?q=Filter+target")
        self.assertTrue(any(item["id"] == incident["id"] for item in body["items"]))

    def test_stats(self):
        status, body = call("GET", "/api/public/stats")
        self.assertEqual(status, 200)
        self.assertIn("open_total", body)
        self.assertIn("open_by_severity", body)
        self.assertIn("sla_breached_open", body)
        self.assertIn("resolved_last_30_days", body)
        for severity in ("sev1", "sev2", "sev3", "sev4"):
            self.assertIn(severity, body["open_by_severity"])

    def test_stats_counts_resolved(self):
        incident = self.create()
        call("PATCH", f"/api/incidents/{incident['id']}", {"status": "resolved"}, self.token)
        status, body = call("GET", "/api/public/stats")
        self.assertGreaterEqual(body["resolved_last_30_days"], 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
