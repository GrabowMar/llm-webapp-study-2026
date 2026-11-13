import re
import sqlite3
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path

from backend.app import RESET_MESSAGE, create_app


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "accounts.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def register(self, username="alice", email="alice@example.com", password="password123"):
        return self.client.post("/api/auth/register", json={"username": username, "password": password, "email": email})

    def login(self, username="alice", password="password123"):
        return self.client.post("/api/auth/login", json={"username": username, "password": password})

    def signed_in(self):
        self.register()
        return {"Authorization": f"Bearer {self.login().json['token']}"}

    def request_token(self, **identifier):
        self.client.post("/api/auth/password-reset", json=identifier or {"username": "alice"})
        items = self.client.get("/api/outbox?to=alice@example.com").json["items"]
        return re.search(r"token=([\w-]+)", items[0]["body"]).group(1)

    def confirm(self, token, password="new-password123"):
        return self.client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": password})

    def test_health_and_authentication(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        for headers in ({}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic invalid"}):
            self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 401)
            self.assertEqual(self.client.patch("/api/me", json={"email": "test@example.com"}, headers=headers).status_code, 401)
            self.assertEqual(self.client.post("/api/me/password", json={}, headers=headers).status_code, 401)

    def test_registration_login_and_public_account(self):
        registered = self.register()
        self.assertEqual(registered.status_code, 201)
        self.assertEqual(set(registered.json), {"id", "username", "email"})
        logged_in = self.login()
        self.assertEqual(logged_in.status_code, 200)
        self.assertEqual(set(logged_in.json), {"token"})
        account = self.client.get("/api/me", headers={"Authorization": f"Bearer {logged_in.json['token']}"})
        self.assertEqual(account.json, registered.json)
        self.assertEqual(self.login(password="incorrect").status_code, 401)
        with closing(sqlite3.connect(self.database)) as db:
            stored = db.execute("SELECT password_hash FROM accounts").fetchone()[0]
        self.assertNotEqual(stored, "password123")

    def test_email_uniqueness_and_optional_email(self):
        self.assertEqual(self.register(email="Alice@Example.com").status_code, 201)
        self.assertEqual(self.register(username="bob", email="ALICE@example.COM").status_code, 409)
        self.assertEqual(self.register(username="bob", email=None).status_code, 201)
        self.assertEqual(self.register(username="charlie", email=None).status_code, 201)
        response = self.client.post("/api/auth/register", json={"username": "dave", "password": "password123"})
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.json["email"])

    def test_password_and_payload_validation(self):
        for value in ("short", "", None, 12345, "x" * 1025):
            self.assertEqual(self.register(password=value).status_code, 400)
        self.assertEqual(self.register(email="not-an-email").status_code, 400)
        for value in (None, [], "string", 3):
            response = self.client.post("/api/auth/register", json=value)
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.get("/api/not-found").status_code, 404)

    def test_email_updates_and_conflicts(self):
        headers = self.signed_in()
        self.register(username="bob", email="bob@example.com")
        self.assertEqual(self.client.patch("/api/me", json={"email": "BOB@Example.com"}, headers=headers).status_code, 409)
        updated = self.client.patch("/api/me", json={"email": "new@example.com"}, headers=headers)
        self.assertEqual(updated.json["email"], "new@example.com")
        self.assertEqual(set(updated.json), {"id", "username", "email"})
        self.assertEqual(self.client.patch("/api/me", json={}, headers=headers).status_code, 400)
        removed = self.client.patch("/api/me", json={"email": None}, headers=headers)
        self.assertIsNone(removed.json["email"])

    def test_reset_is_generic_and_does_not_send_for_missing_accounts(self):
        self.register(email=None)
        responses = [self.client.post("/api/auth/password-reset", json=value) for value in (
            {"username": "alice"}, {"username": "missing"}, {"email": "missing@example.com"}
        )]
        for response in responses:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json, {"message": RESET_MESSAGE})
        with closing(sqlite3.connect(self.database)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 0)
        self.assertEqual(self.client.post("/api/auth/password-reset", json={}).status_code, 400)

    def test_reset_outbox_and_single_use(self):
        headers = self.signed_in()
        token = self.request_token(email="ALICE@EXAMPLE.COM")
        messages = self.client.get("/api/outbox?to=Alice@Example.com").json["items"]
        self.assertEqual(len(messages), 1)
        self.assertEqual(set(messages[0]), {"id", "to", "subject", "body", "sent_at"})
        self.assertEqual(messages[0]["to"], "alice@example.com")
        self.assertIn("/reset?token=", messages[0]["body"])
        self.assertEqual(self.confirm(token, "short").status_code, 400)
        self.assertEqual(self.confirm(token).status_code, 200)
        self.assertEqual(self.confirm(token).status_code, 400)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password="new-password123").status_code, 200)
        self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 401)

    def test_new_reset_invalidates_old_reset_and_outbox_order(self):
        self.register()
        first = self.request_token(username="alice")
        second = self.request_token(email="alice@example.com")
        self.assertNotEqual(first, second)
        self.assertEqual(self.confirm(first).status_code, 400)
        self.assertEqual(self.confirm(second).status_code, 200)
        messages = self.client.get("/api/outbox?to=alice@example.com").json["items"]
        self.assertGreater(messages[0]["id"], messages[1]["id"])
        self.assertEqual(self.client.get("/api/outbox?to=other@example.com").json, {"items": []})
        self.assertEqual(self.client.get("/api/outbox").status_code, 400)

    def test_expired_invalid_and_concurrent_reset(self):
        self.register()
        token = self.request_token()
        with closing(sqlite3.connect(self.database)) as db:
            db.execute("UPDATE password_resets SET expires_at = ?", (time.time() - 1,))
            db.commit()
        self.assertEqual(self.confirm(token).status_code, 400)
        self.assertEqual(self.confirm("invalid").status_code, 400)
        token = self.request_token()

        def confirm_once(_):
            with self.app.test_client() as client:
                return client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "password999"}).status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sorted(pool.map(confirm_once, range(2))), [200, 400])

    def test_email_change_invalidates_reset(self):
        headers = self.signed_in()
        token = self.request_token()
        self.client.patch("/api/me", json={"email": "updated@example.com"}, headers=headers)
        self.assertEqual(self.confirm(token).status_code, 400)
        self.client.post("/api/auth/password-reset", json={"email": "alice@example.com"})
        self.assertEqual(len(self.client.get("/api/outbox?to=alice@example.com").json["items"]), 1)
        self.client.post("/api/auth/password-reset", json={"username": "alice"})
        self.assertEqual(len(self.client.get("/api/outbox?to=updated@example.com").json["items"]), 1)

    def test_change_password_checks_current_and_revokes_other_sessions(self):
        headers = self.signed_in()
        other = {"Authorization": f"Bearer {self.login().json['token']}"}
        token = self.request_token()
        response = self.client.post("/api/me/password", headers=headers, json={"current_password": "wrong", "new_password": "new-password123"})
        self.assertEqual(response.status_code, 400)
        response = self.client.post("/api/me/password", headers=headers, json={"current_password": "password123", "new_password": "new-password123"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/me", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/me", headers=other).status_code, 401)
        self.assertEqual(self.confirm(token).status_code, 400)
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login(password="new-password123").status_code, 200)

    def test_persistence_and_logout(self):
        headers = self.signed_in()
        token = self.request_token()
        restarted = create_app({"TESTING": True, "DATABASE": self.database}).test_client()
        self.assertEqual(restarted.get("/api/me", headers=headers).status_code, 200)
        self.assertEqual(len(restarted.get("/api/outbox?to=alice@example.com").json["items"]), 1)
        self.assertEqual(restarted.post("/api/auth/logout", headers=headers).status_code, 200)
        self.assertEqual(restarted.get("/api/me", headers=headers).status_code, 401)
        self.assertEqual(restarted.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "new-password123"}).status_code, 200)


if __name__ == "__main__":
    unittest.main()
