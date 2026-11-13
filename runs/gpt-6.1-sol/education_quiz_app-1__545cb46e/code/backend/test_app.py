import sqlite3
import tempfile
import unittest
from contextlib import closing, contextmanager
from pathlib import Path

from backend.app import create_app


class QuizApiTests(unittest.TestCase):
    @contextmanager
    def connection(self):
        with closing(sqlite3.connect(self.database)) as connection, connection:
            yield connection

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.database = str(Path(self.temp.name) / "quiz.sqlite3")
        self.config = {"TESTING": True, "DATABASE": self.database, "ADMIN_PASSWORD": "test-admin-password"}
        self.app = create_app(self.config)
        self.client = self.app.test_client()

    def account(self, username="alice"):
        response = self.client.post("/api/auth/register", json={"username": username, "password": "strong-password"})
        self.assertEqual(response.status_code, 201)
        response = self.client.post("/api/auth/login", json={"username": username, "password": "strong-password"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def admin(self):
        response = self.client.post("/api/auth/login", json={"username": "admin", "password": "test-admin-password"})
        self.assertEqual(response.status_code, 200)
        return {"Authorization": "Bearer " + response.json["token"]}

    def answers(self):
        return [{"question_id": 1, "selected": "B"}, {"question_id": 2, "selected": "A"}]

    def test_health_and_unknown_api(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/not-found").status_code, 404)
        self.assertIsInstance(self.client.get("/api/not-found").json["error"], str)

    def test_seed_draw_and_no_answer_leak(self):
        questions = self.client.get("/api/quiz?count=50").json["items"]
        self.assertGreaterEqual(len(questions), 20)
        self.assertEqual(len(questions), len({question["id"] for question in questions}))
        self.assertEqual(len(self.client.get("/api/quiz").json["items"]), 5)
        for question in questions:
            self.assertEqual(set(question), {"id", "text", "option_a", "option_b", "option_c", "option_d"})

    def test_count_validation(self):
        for value in ["0", "-1", "51", "abc", "2.5", "", "9" * 100]:
            with self.subTest(count=value):
                self.assertEqual(self.client.get("/api/quiz", query_string={"count": value}).status_code, 400)

    def test_registration_login_and_password_hashing(self):
        headers = self.account()
        self.assertEqual(self.client.get("/api/auth/me", headers=headers).json, {"username": "alice", "is_admin": False})
        with self.connection() as db:
            password_hash = db.execute("SELECT password_hash FROM users WHERE username = 'alice'").fetchone()[0]
            token_hash = db.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertNotEqual(password_hash, "strong-password")
        self.assertNotIn(token_hash, headers["Authorization"])
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "ALICE", "password": "strong-password"}).status_code, 409)
        self.assertEqual(self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code, 401)

    def test_invalid_registration_and_reserved_admin(self):
        for value in [None, [], {}, {"username": "a", "password": "short"}, {"username": ["name"], "password": "strong-password"}]:
            self.assertEqual(self.client.post("/api/auth/register", json=value).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/register", json={"username": "Admin", "password": "strong-password"}).status_code, 409)

    def test_anonymous_score_and_review(self):
        response = self.client.post("/api/attempts", json={"answers": self.answers()})
        self.assertEqual(response.status_code, 200)
        attempt = response.json
        self.assertIsNone(attempt["id"])
        self.assertEqual((attempt["score"], attempt["correct"], attempt["total_questions"]), (50, 1, 2))
        self.assertTrue(attempt["answers"][0]["is_correct"])
        self.assertFalse(attempt["answers"][1]["is_correct"])
        self.assertEqual(attempt["answers"][1]["correct_option"], "D")
        self.assertIn("text", attempt["answers"][0])
        with self.connection() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM attempts").fetchone()[0], 0)

    def test_attempt_validation(self):
        invalid = [None, [], {}, {"answers": []}, {"answers": "bad"}, {"answers": [None]},
                   {"answers": [{"question_id": True, "selected": "A"}]},
                   {"answers": [{"question_id": 10**100, "selected": "A"}]},
                   {"answers": [{"question_id": 1, "selected": "E"}]},
                   {"answers": [{"question_id": 1, "selected": ["A"]}]},
                   {"answers": [{"question_id": 9999, "selected": "A"}]},
                   {"answers": [self.answers()[0], self.answers()[0]]},
                   {"answers": [self.answers()[0]] * 51}]
        for value in invalid:
            with self.subTest(value=value):
                self.assertEqual(self.client.post("/api/attempts", json=value).status_code, 400)

    def test_history_ownership_and_order(self):
        alice = self.account()
        first = self.client.post("/api/attempts", json={"answers": self.answers()}, headers=alice).json
        second = self.client.post("/api/attempts", json={"answers": self.answers()}, headers=alice).json
        self.assertIsInstance(first["id"], int)
        items = self.client.get("/api/attempts", headers=alice).json["items"]
        self.assertEqual([item["id"] for item in items], [second["id"], first["id"]])
        self.assertEqual(self.client.get(f"/api/attempts/{first['id']}", headers=alice).json, first)
        bob = self.account("bobby")
        self.assertEqual(self.client.get("/api/attempts", headers=bob).json, {"items": []})
        self.assertEqual(self.client.get(f"/api/attempts/{first['id']}", headers=bob).status_code, 404)
        self.assertEqual(self.client.get("/api/attempts/999999", headers=alice).status_code, 404)

    def test_authentication_and_authorization(self):
        for path in ["/api/attempts", "/api/attempts/1", "/api/admin/questions", "/api/auth/me"]:
            self.assertEqual(self.client.get(path).status_code, 401)
            self.assertEqual(self.client.get(path, headers={"Authorization": "Bearer invalid"}).status_code, 401)
        alice = self.account()
        self.assertEqual(self.client.get("/api/admin/questions", headers=alice).status_code, 403)
        self.assertEqual(self.client.post("/api/admin/questions", headers=alice, json={}).status_code, 403)
        self.assertEqual(self.client.post("/api/attempts", headers={"Authorization": "Basic invalid"}, json={"answers": self.answers()}).status_code, 401)

    def test_admin_create_validate_and_paginate(self):
        admin = self.admin()
        response = self.client.post("/api/admin/questions", headers=admin, json={})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json["errors"]), {"text", "option_a", "option_b", "option_c", "option_d", "correct_option"})
        question = {"text": "  What is 2 + 2?  ", "option_a": "1", "option_b": "2", "option_c": "3", "option_d": "4", "correct_option": "D"}
        response = self.client.post("/api/admin/questions", json=question, headers=admin)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["text"], "What is 2 + 2?")
        self.assertEqual(response.json["correct_option"], "D")
        first = self.client.get("/api/admin/questions?page=1&page_size=7", headers=admin).json
        second = self.client.get("/api/admin/questions?page=2&page_size=7", headers=admin).json
        self.assertEqual(first["total"], 31)
        self.assertEqual((first["page"], first["page_size"], len(first["items"])), (1, 7, 7))
        self.assertTrue({item["id"] for item in first["items"]}.isdisjoint(item["id"] for item in second["items"]))
        for query in ["page=0", "page_size=101", "page_size=0", "page=abc"]:
            self.assertEqual(self.client.get("/api/admin/questions?" + query, headers=admin).status_code, 400)

    def test_inactive_questions_excluded(self):
        admin = self.admin()
        question = {"text": "Inactive?", "option_a": "A", "option_b": "B", "option_c": "C", "option_d": "D", "correct_option": "A", "active": False}
        created = self.client.post("/api/admin/questions", json=question, headers=admin).json
        drawn = self.client.get("/api/quiz?count=50").json["items"]
        self.assertNotIn(created["id"], [item["id"] for item in drawn])
        self.assertEqual(self.client.post("/api/attempts", json={"answers": [{"question_id": created["id"], "selected": "A"}]}).status_code, 400)
        listed = self.client.get("/api/admin/questions", headers=admin).json["items"]
        self.assertIn(created["id"], [item["id"] for item in listed])

    def test_restart_persistence_and_review_snapshot(self):
        alice = self.account()
        attempt = self.client.post("/api/attempts", json={"answers": self.answers()}, headers=alice).json
        with self.connection() as db:
            db.execute("UPDATE questions SET text = 'Changed later', correct_option = 'A' WHERE id = 1")
        restarted = create_app(self.config).test_client()
        self.assertEqual(restarted.get(f"/api/attempts/{attempt['id']}", headers=alice).json, attempt)
        self.assertEqual(len(restarted.get("/api/quiz?count=50").json["items"]), 30)

    def test_disabled_admin_and_password_rotation(self):
        admin = self.admin()
        disabled = create_app({**self.config, "ADMIN_PASSWORD": ""}).test_client()
        self.assertEqual(disabled.post("/api/auth/login", json={"username": "admin", "password": "test-admin-password"}).status_code, 401)
        self.assertEqual(disabled.get("/api/admin/questions", headers=admin).status_code, 401)
        rotated = create_app({**self.config, "ADMIN_PASSWORD": "new-admin-password"}).test_client()
        self.assertEqual(rotated.post("/api/auth/login", json={"username": "admin", "password": "test-admin-password"}).status_code, 401)
        self.assertEqual(rotated.post("/api/auth/login", json={"username": "admin", "password": "new-admin-password"}).status_code, 200)

    def test_logout_and_expiration(self):
        alice = self.account()
        self.assertEqual(self.client.post("/api/auth/logout", headers=alice).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me", headers=alice).status_code, 401)
        alice = self.client.post("/api/auth/login", json={"username": "alice", "password": "strong-password"}).json
        with self.connection() as db:
            db.execute("UPDATE sessions SET expires_at = '2000-01-01'")
        self.assertEqual(self.client.get("/api/attempts", headers={"Authorization": "Bearer " + alice["token"]}).status_code, 401)

    def test_malformed_json_and_request_limits(self):
        self.assertEqual(self.client.post("/api/attempts", data="{broken", content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/attempts", data="x" * 300000, content_type="application/json").status_code, 413)


if __name__ == "__main__":
    unittest.main()
