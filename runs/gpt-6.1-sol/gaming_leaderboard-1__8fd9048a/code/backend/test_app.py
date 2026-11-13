import hashlib
import os
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch

from backend.app import MAX_SCORE, create_app


class LeaderboardTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.db_path = str(Path(self.directory.name) / "data" / "test.sqlite3")
        self.environment = patch.dict(os.environ, {"ADMIN_PASSWORD": "test-admin-password"})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.app = create_app({"TESTING": True, "DATABASE": self.db_path})
        self.client = self.app.test_client()

    def register(self, username="player", password="password"):
        return self.client.post(
            "/api/auth/register", json={"username": username, "password": password}
        )

    def login(self, username="player", password="password"):
        response = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(response.status_code, 200, response.json)
        return {"Authorization": f"Bearer {response.json['token']}"}

    def player(self, username="player"):
        self.assertEqual(self.register(username).status_code, 201)
        return self.login(username)

    def submit(self, headers, score, **extra):
        response = self.client.post("/api/scores", headers=headers, json={"score": score, **extra})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json

    def admin(self):
        return self.login("admin", "test-admin-password")

    def toggle(self, score_id, headers=None):
        return self.client.post(
            f"/api/admin/scores/{score_id}/toggle", headers=headers or self.admin()
        )

    def sql(self, query, parameters=()):
        with closing(sqlite3.connect(self.db_path)) as db, db:
            return db.execute(query, parameters).fetchall()

    def test_health_and_empty_leaderboard(self):
        self.assertEqual(self.client.get("/api/health").json, {"status": "ok"})
        self.assertEqual(self.client.get("/api/leaderboard").json, {"items": [], "total": 0})

    def test_register_login_and_me(self):
        response = self.register("ArcadeAce", "p")
        self.assertEqual(response.status_code, 201)
        headers = self.login("arcadeace", "p")
        self.assertEqual(
            self.client.get("/api/auth/me", headers=headers).json,
            {"username": "ArcadeAce", "is_admin": False},
        )
        self.assertEqual(
            self.client.get("/api/scores", headers=headers).json, {"items": [], "best_score": None}
        )

    def test_duplicate_and_reserved_usernames(self):
        self.register("Player")
        for name in ("player", "PLAYER", "admin", "ADMIN"):
            with self.subTest(name=name):
                self.assertEqual(self.register(name).status_code, 409)

    def test_invalid_credentials(self):
        for body in (
            None,
            [],
            {},
            {"username": 1, "password": "p"},
            {"username": "a b", "password": "p"},
            {"username": "p", "password": ""},
            {"username": "p", "password": 3},
            {"username": "x" * 33, "password": "p"},
            {"username": "p", "password": "x" * 257},
        ):
            with self.subTest(body=body):
                self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 400)
                self.assertEqual(self.client.post("/api/auth/login", json=body).status_code, 400)

    def test_bad_login_is_unauthorized(self):
        self.register()
        for username, password in (
            ("player", "incorrect"),
            ("unknown", "password"),
            ("admin", "admin"),
        ):
            self.assertEqual(
                self.client.post(
                    "/api/auth/login", json={"username": username, "password": password}
                ).status_code,
                401,
            )

    def test_passwords_and_tokens_are_hashed(self):
        self.player()
        password_hash = self.sql("SELECT password_hash FROM users WHERE username = 'player'")[0][0]
        self.assertNotEqual(password_hash, "password")
        headers = self.login()
        token = headers["Authorization"].split()[1]
        self.assertEqual(
            self.sql(
                "SELECT COUNT(*) FROM sessions WHERE token_hash = ?",
                (hashlib.sha256(token.encode()).hexdigest(),),
            )[0][0],
            1,
        )
        self.assertEqual(
            self.sql("SELECT COUNT(*) FROM sessions WHERE token_hash = ?", (token,))[0][0], 0
        )

    def test_protected_routes_require_authentication(self):
        for headers in (
            {},
            {"Authorization": "Bearer wrong"},
            {"Authorization": "Basic wrong"},
            {"Authorization": "Bearer"},
        ):
            for method, path in (
                ("get", "/api/scores"),
                ("post", "/api/scores"),
                ("get", "/api/admin/scores"),
                ("post", "/api/admin/scores/1/toggle"),
                ("get", "/api/auth/me"),
            ):
                with self.subTest(headers=headers, path=path):
                    self.assertEqual(
                        getattr(self.client, method)(path, headers=headers).status_code, 401
                    )

    def test_players_cannot_moderate(self):
        headers = self.player()
        self.assertEqual(self.client.get("/api/admin/scores", headers=headers).status_code, 403)
        self.assertEqual(self.toggle(1, headers).status_code, 403)

    def test_logout_and_expired_sessions(self):
        headers = self.player()
        self.assertEqual(self.client.post("/api/auth/logout", headers=headers).status_code, 200)
        self.assertEqual(self.client.get("/api/scores", headers=headers).status_code, 401)
        headers = self.login()
        self.sql("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000000Z'")
        self.assertEqual(self.client.get("/api/scores", headers=headers).status_code, 401)

    def test_disabled_admin_and_password_rotation(self):
        old_headers = self.admin()
        with patch.dict(os.environ, {"ADMIN_PASSWORD": ""}):
            disabled = create_app({"TESTING": True, "DATABASE": self.db_path}).test_client()
        self.assertEqual(
            disabled.post(
                "/api/auth/login", json={"username": "admin", "password": "test-admin-password"}
            ).status_code,
            401,
        )
        self.assertEqual(disabled.get("/api/admin/scores", headers=old_headers).status_code, 401)
        with patch.dict(os.environ, {"ADMIN_PASSWORD": "new-password"}):
            rotated = create_app({"TESTING": True, "DATABASE": self.db_path}).test_client()
        self.assertEqual(
            rotated.post(
                "/api/auth/login", json={"username": "admin", "password": "new-password"}
            ).status_code,
            200,
        )
        self.assertEqual(
            rotated.post(
                "/api/auth/login", json={"username": "admin", "password": "test-admin-password"}
            ).status_code,
            401,
        )

    def test_unset_admin_password(self):
        with patch.dict(os.environ):
            os.environ.pop("ADMIN_PASSWORD", None)
            disabled = create_app({"TESTING": True, "DATABASE": self.db_path}).test_client()
        self.assertEqual(
            disabled.post(
                "/api/auth/login", json={"username": "admin", "password": "admin"}
            ).status_code,
            401,
        )

    def test_score_shape_ownership_and_server_timestamp(self):
        headers = self.player()
        score = self.submit(
            headers, 123, player="admin", user_id=1, achieved_at="2000-01-01", is_hidden=True
        )
        self.assertEqual(
            set(score),
            {"id", "score", "achieved_at", "is_hidden", "player", "rank", "personal_best"},
        )
        self.assertEqual(score["player"], "player")
        self.assertEqual(score["rank"], 1)
        self.assertTrue(score["personal_best"])
        self.assertFalse(score["is_hidden"])
        achieved = datetime.fromisoformat(score["achieved_at"].replace("Z", "+00:00"))
        self.assertLess(abs((datetime.now(UTC) - achieved).total_seconds()), 5)

    def test_scores_validate_whole_non_negative_safe_numbers(self):
        headers = self.player()
        for value in (-1, 1.5, 1.0, True, False, "100", None, MAX_SCORE + 1, {}, []):
            with self.subTest(value=value):
                self.assertEqual(
                    self.client.post(
                        "/api/scores", headers=headers, json={"score": value}
                    ).status_code,
                    400,
                )
        self.assertEqual(self.client.post("/api/scores", headers=headers, json={}).status_code, 400)
        self.assertEqual(
            self.client.post(
                "/api/scores", headers=headers, data="not JSON", content_type="application/json"
            ).status_code,
            400,
        )
        self.assertTrue(self.submit(headers, 0)["personal_best"])
        self.assertTrue(self.submit(headers, MAX_SCORE)["personal_best"])

    def test_personal_best_is_strictly_higher(self):
        headers = self.player()
        self.assertTrue(self.submit(headers, 100)["personal_best"])
        self.assertFalse(self.submit(headers, 100)["personal_best"])
        self.assertFalse(self.submit(headers, 50)["personal_best"])
        self.assertTrue(self.submit(headers, 101)["personal_best"])

    def test_one_row_per_player_and_rank_of_player_best(self):
        alice, bob = self.player("alice"), self.player("bob")
        self.submit(alice, 100)
        self.submit(alice, 200)
        self.submit(bob, 300)
        result = self.submit(alice, 1)
        self.assertEqual(result["rank"], 2)
        board = self.client.get("/api/leaderboard").json
        self.assertEqual(board["total"], 2)
        self.assertEqual(
            [(i["rank"], i["player"], i["score"]) for i in board["items"]],
            [(1, "bob", 300), (2, "alice", 200)],
        )
        self.assertEqual(set(board["items"][0]), {"rank", "player", "score", "achieved_at"})

    def test_ties_use_earliest_achievement_then_id(self):
        alice, bob = self.player("alice"), self.player("bob")
        fixed = datetime(2026, 11, 11, 12, tzinfo=UTC)
        with patch("backend.app.utc_now", return_value=fixed):
            first = self.submit(alice, 100)
            self.submit(alice, 100)
            self.submit(bob, 100)
        board = self.client.get("/api/leaderboard").json["items"]
        self.assertEqual([item["player"] for item in board], ["alice", "bob"])
        self.assertEqual(board[0]["achieved_at"], first["achieved_at"])

    def test_search_filters_after_ranking_and_total_before_limit(self):
        for name, value in (("alpha", 300), ("Alpine", 200), ("bravo", 100)):
            self.submit(self.player(name), value)
        filtered = self.client.get("/api/leaderboard?player=AL&limit=1").json
        self.assertEqual(filtered["total"], 2)
        self.assertEqual(len(filtered["items"]), 1)
        self.assertEqual(
            self.client.get("/api/leaderboard?player=bravo").json["items"][0]["rank"], 3
        )
        self.assertEqual(self.client.get("/api/leaderboard?player=%25").json["total"], 0)

    def test_utc_period_boundaries_and_best_within_period(self):
        headers = self.player()
        fixed = datetime(2026, 11, 11, 12, tzinfo=UTC)
        values = [
            (900, "2026-11-08T23:59:59.999999Z"),
            (800, "2026-11-09T00:00:00.000000Z"),
            (700, "2026-11-10T23:59:59.999999Z"),
            (600, "2026-11-11T00:00:00.000000Z"),
        ]
        for value, achieved in values:
            submitted = self.submit(headers, value)
            self.sql("UPDATE scores SET achieved_at = ? WHERE id = ?", (achieved, submitted["id"]))
        with patch("backend.app.utc_now", return_value=fixed):
            for period, expected in (("all", 900), ("week", 800), ("today", 600)):
                with self.subTest(period=period):
                    self.assertEqual(
                        self.client.get(f"/api/leaderboard?period={period}").json["items"][0][
                            "score"
                        ],
                        expected,
                    )

    def test_hidden_scores_excluded_from_all_rankings_and_bests(self):
        alice, bob = self.player("alice"), self.player("bob")
        lower = self.submit(alice, 100)
        best = self.submit(alice, 300)
        self.submit(bob, 200)
        hidden = self.toggle(best["id"])
        self.assertEqual(hidden.status_code, 200)
        self.assertTrue(hidden.json["is_hidden"])
        for period in ("all", "week", "today"):
            board = self.client.get(f"/api/leaderboard?period={period}").json
            self.assertEqual(
                [(i["player"], i["score"]) for i in board["items"]], [("bob", 200), ("alice", 100)]
            )
        personal = self.client.get("/api/scores", headers=alice).json
        self.assertEqual(personal["best_score"], 100)
        self.assertTrue(personal["items"][0]["is_hidden"])
        result = self.submit(alice, 150)
        self.assertTrue(result["personal_best"])
        self.assertEqual(result["rank"], 2)
        self.assertFalse(self.toggle(best["id"]).json["is_hidden"])
        self.assertEqual(self.client.get("/api/scores", headers=alice).json["best_score"], 300)
        self.toggle(best["id"])
        self.toggle(lower["id"])
        self.toggle(result["id"])
        self.assertIsNone(self.client.get("/api/scores", headers=alice).json["best_score"])
        self.assertEqual(self.client.get("/api/leaderboard").json["total"], 1)

    def test_personal_submissions_newest_first_and_private(self):
        alice, bob = self.player("alice"), self.player("bob")
        first = self.submit(alice, 500)
        second = self.submit(alice, 200)
        self.submit(bob, 900)
        data = self.client.get("/api/scores", headers=alice).json
        self.assertEqual([item["id"] for item in data["items"]], [second["id"], first["id"]])
        self.assertEqual(data["best_score"], 500)
        self.assertEqual(
            set(data["items"][0]), {"id", "score", "achieved_at", "is_hidden", "player"}
        )

    def test_admin_pagination_includes_hidden_scores(self):
        headers = self.player()
        scores = [self.submit(headers, value) for value in (100, 200, 300)]
        admin = self.admin()
        self.toggle(scores[1]["id"], admin)
        data = self.client.get("/api/admin/scores?page=2&page_size=2", headers=admin).json
        self.assertEqual((data["total"], data["page"], data["page_size"]), (3, 2, 2))
        self.assertEqual([i["id"] for i in data["items"]], [scores[0]["id"]])
        first_page = self.client.get("/api/admin/scores?page_size=2", headers=admin).json
        self.assertTrue(first_page["items"][1]["is_hidden"])
        self.assertEqual(
            self.client.get("/api/admin/scores?page=99", headers=admin).json["items"], []
        )
        self.assertEqual(self.toggle(99999, admin).status_code, 404)

    def test_query_validation(self):
        for query in (
            "period=invalid",
            "limit=0",
            "limit=-1",
            "limit=1.5",
            "limit=abc",
            "limit=1001",
            "player=" + "x" * 33,
        ):
            self.assertEqual(self.client.get("/api/leaderboard?" + query).status_code, 400)
        admin = self.admin()
        for query in (
            "page=0",
            "page=-1",
            "page=1.5",
            "page=abc",
            "page_size=0",
            "page_size=101",
            "page_size=abc",
        ):
            self.assertEqual(
                self.client.get("/api/admin/scores?" + query, headers=admin).status_code, 400
            )

    def test_data_sessions_and_hidden_state_survive_restart(self):
        headers = self.player()
        score = self.submit(headers, 123)
        admin = self.admin()
        self.toggle(score["id"], admin)
        restarted = create_app({"TESTING": True, "DATABASE": self.db_path}).test_client()
        data = restarted.get("/api/scores", headers=headers).json
        self.assertEqual(data["items"][0]["score"], 123)
        self.assertTrue(data["items"][0]["is_hidden"])
        self.assertEqual(restarted.get("/api/admin/scores", headers=admin).status_code, 200)

    def test_unknown_api_routes_and_errors_are_json(self):
        for path in ("/api/not-found", "/api", "/api/admin/scores/999/toggle"):
            response = self.client.get(path)
            self.assertIn(response.status_code, (404, 405))
            self.assertEqual(response.content_type, "application/json")
            self.assertIn("error", response.json)
        response = self.client.post(
            "/api/scores", headers=self.player(), data="x" * 20000, content_type="application/json"
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.content_type, "application/json")

    def test_concurrent_equal_submissions_have_one_personal_best(self):
        headers = self.player()

        def submit():
            with self.app.test_client() as client:
                return client.post("/api/scores", headers=headers, json={"score": 100})

        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(lambda _: submit(), range(2)))
        self.assertEqual([response.status_code for response in responses], [201, 201])
        self.assertEqual(sum(response.json["personal_best"] for response in responses), 1)
        self.assertEqual([response.json["rank"] for response in responses], [1, 1])
        self.assertEqual(self.client.get("/api/leaderboard").json["total"], 1)


if __name__ == "__main__":
    unittest.main()
