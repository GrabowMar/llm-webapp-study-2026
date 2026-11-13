import hashlib
import json
import sqlite3
import tempfile
import time
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from backend.app import check_xml, create_app


class XmlCheckTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.database = str(Path(self.directory.name) / "checks.sqlite3")
        self.app = create_app({"TESTING": True, "DATABASE": self.database})
        self.client = self.app.test_client()

    def tearDown(self):
        self.directory.cleanup()

    def account(self, username="alice", password="test-password"):
        registered = self.client.post(
            "/api/auth/register", json={"username": username, "password": password}
        )
        self.assertEqual(registered.status_code, 201)
        logged_in = self.client.post(
            "/api/auth/login", json={"username": username, "password": password}
        )
        self.assertEqual(logged_in.status_code, 200)
        return {"Authorization": f"Bearer {logged_in.json['token']}"}

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.json, {"status": "ok"})

    def test_valid_xml_and_root(self):
        documents = [
            ("<root/>", "root"),
            ('<?xml version="1.0"?><root><child/></root>', "root"),
            ('<r:root xmlns:r="urn:test"/>', "r:root"),
            ('<root xmlns="urn:test"/>', "root"),
            ("<你好>世界</你好>", "你好"),
            ("<!-- comment --><root><![CDATA[<text>]]></root>", "root"),
            ('<!DOCTYPE root [<!ENTITY name "hello">]><root>&name;</root>', "root"),
            ('<!DOCTYPE root [<!ELEMENT root EMPTY>]><root>not schema valid</root>', "root"),
        ]
        for xml, root in documents:
            with self.subTest(xml=xml):
                response = self.client.post("/api/validate/xml", json={"xml": xml})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(
                    response.json,
                    {"valid": True, "root_element": root, "error": None, "line": None, "column": None},
                )

    def test_first_error_and_one_based_position(self):
        response = self.client.post(
            "/api/validate/xml", json={"xml": "<root>\n  <child>\n</root>\n<also-broken"}
        )
        self.assertFalse(response.json["valid"])
        self.assertEqual(response.json["line"], 3)
        self.assertEqual(response.json["column"], 3)
        self.assertEqual(response.json["error"], "mismatched tag")
        self.assertIsNone(response.json["root_element"])

    def test_invalid_xml_documents(self):
        documents = [
            "", "   ", "<root>", "<a/><b/>", '<root a="1" a="2"/>',
            "<root>&unknown;</root>", "<root>one & two</root>", "<root>\x00</root>",
            "<root><!-- bad -- comment --></root>", "<root>\ud800</root>",
            "<p:root/>", '<root xmlns:p="urn:test" xmlns:q="urn:test" p:x="1" q:x="2"/>',
            '<!DOCTYPE root [<!ENTITY x "<unclosed>">]><root>&x;</root>',
        ]
        for xml in documents:
            with self.subTest(xml=repr(xml)):
                result = check_xml(xml)
                self.assertFalse(result["valid"])
                self.assertTrue(result["error"])
                self.assertGreaterEqual(result["line"], 1)
                self.assertGreaterEqual(result["column"], 1)

    def test_external_resources_are_never_opened(self):
        documents = [
            '<!DOCTYPE root SYSTEM "https://example.invalid/schema.dtd"><root/>',
            '<!DOCTYPE root [<!ENTITY external SYSTEM "file:///etc/passwd">]><root>&external;</root>',
            '<!DOCTYPE root [<!ENTITY % external SYSTEM "https://example.invalid/entity">%external;]><root/>',
            '<root xmlns:xi="http://www.w3.org/2001/XInclude"><xi:include href="file:///etc/passwd"/></root>',
        ]
        with patch("builtins.open", side_effect=AssertionError("File access")), patch(
            "socket.socket", side_effect=AssertionError("Network access")
        ):
            for xml in documents:
                with self.subTest(xml=xml):
                    result = check_xml(xml)
                    self.assertTrue(result["valid"])
                    self.assertNotIn("passwd", json.dumps(result))

    def test_entity_amplification_is_bounded(self):
        declarations = ['<!ENTITY a "1234567890">']
        previous = "a"
        for name in "bcdefgh":
            declarations.append(f'<!ENTITY {name} "{f"&{previous};" * 10}">')
            previous = name
        xml = f'<!DOCTYPE root [{"".join(declarations)}]><root>&h;</root>'
        result = check_xml(xml)
        self.assertFalse(result["valid"])
        self.assertIn("amplification", result["error"])

    def test_bad_request_bodies(self):
        for body in [{}, {"xml": None}, {"xml": 12}, [], "xml"]:
            response = self.client.post("/api/validate/xml", json=body)
            self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.post("/api/validate/xml", data="{bad").status_code, 400)
        self.assertEqual(
            self.client.post("/api/validate/xml", json={"xml": "x" * 1_000_001}).status_code,
            413,
        )

    def test_account_validation_and_duplicate(self):
        for body in [{}, {"username": "", "password": "p"}, {"username": "a", "password": ""}, {"username": 2, "password": "p"}, {"username": "\ud800", "password": "p"}, {"username": "a", "password": "\ud800"}]:
            self.assertEqual(self.client.post("/api/auth/register", json=body).status_code, 400)
        self.account()
        self.assertEqual(
            self.client.post("/api/auth/register", json={"username": "ALICE", "password": "p"}).status_code,
            409,
        )
        self.assertEqual(
            self.client.post("/api/auth/login", json={"username": "alice", "password": "wrong"}).status_code,
            401,
        )
        with closing(sqlite3.connect(self.database)) as database, database:
            stored = database.execute("SELECT password_hash FROM users").fetchone()[0]
            self.assertNotEqual(stored, "test-password")
            self.assertTrue(stored.startswith("scrypt:"))

    def test_authentication_required(self):
        for headers in [{}, {"Authorization": "Bearer invalid"}, {"Authorization": "Basic nope"}, {"Authorization": "Bearer"}]:
            self.assertEqual(self.client.get("/api/validations", headers=headers).status_code, 401)
            self.assertEqual(self.client.post("/api/validations", json={"xml": "<root/>"}, headers=headers).status_code, 401)
            self.assertEqual(self.client.delete("/api/validations/1", headers=headers).status_code, 401)

    def test_preview_result_and_anonymous_not_stored(self):
        headers = self.account()
        xml = "<root>" + "界" * 250 + "</root>"
        response = self.client.post("/api/validations", json={"xml": xml}, headers=headers)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json["xml_preview"], xml[:200])
        self.assertEqual(set(response.json), {"id", "xml_preview", "valid", "error", "line", "column", "root_element", "created_at"})
        self.client.post("/api/validate/xml", json={"xml": "<another/>"}, headers=headers)
        self.client.post("/api/validate/xml", json={"xml": "<anonymous/>"})
        self.assertEqual(self.client.get("/api/validations", headers=headers).json["total"], 1)

    def test_history_filter_pagination_and_ownership(self):
        alice = self.account()
        bob = self.account("bob")
        ids = []
        for xml in ["<one/>", "<broken>", "<three/>"]:
            response = self.client.post("/api/validations", json={"xml": xml}, headers=alice)
            ids.append(response.json["id"])
        self.client.post("/api/validations", json={"xml": "<private/>"}, headers=bob)
        listing = self.client.get("/api/validations?page=1&page_size=2", headers=alice).json
        self.assertEqual(listing["total"], 3)
        self.assertEqual(listing["page"], 1)
        self.assertEqual(listing["page_size"], 2)
        self.assertEqual([item["id"] for item in listing["items"]], list(reversed(ids[1:])))
        second = self.client.get("/api/validations?page=2&page_size=2", headers=alice).json
        self.assertEqual(second["items"][0]["id"], ids[0])
        valid = self.client.get("/api/validations?valid=true", headers=alice).json
        self.assertEqual(valid["total"], 2)
        invalid = self.client.get("/api/validations?valid=false", headers=alice).json
        self.assertEqual(invalid["total"], 1)
        self.assertFalse(invalid["items"][0]["valid"])
        self.assertEqual(self.client.delete(f"/api/validations/{ids[0]}", headers=bob).status_code, 404)
        self.assertEqual(self.client.delete(f"/api/validations/{ids[0]}", headers=alice).status_code, 204)
        self.assertEqual(self.client.delete(f"/api/validations/{ids[0]}", headers=alice).status_code, 404)
        self.assertEqual(self.client.get("/api/validations", headers=bob).json["total"], 1)

    def test_bad_pagination(self):
        headers = self.account()
        for query in ["page=0", "page=-1", "page=no", "page_size=0", "page_size=101", "page_size=1.5", "valid=maybe", "page=999999999999999999999"]:
            self.assertEqual(self.client.get(f"/api/validations?{query}", headers=headers).status_code, 400)

    def test_sessions_and_data_survive_restart_and_logout_revokes(self):
        headers = self.account()
        self.client.post("/api/validations", json={"xml": "<persistent/>"}, headers=headers)
        restarted = create_app({"TESTING": True, "DATABASE": self.database}).test_client()
        self.assertEqual(restarted.get("/api/auth/me", headers=headers).json, {"username": "alice"})
        self.assertEqual(restarted.get("/api/validations", headers=headers).json["total"], 1)
        self.assertEqual(restarted.post("/api/auth/logout", headers=headers).status_code, 204)
        self.assertEqual(self.client.get("/api/validations", headers=headers).status_code, 401)

    def test_expired_session_and_token_hashing(self):
        headers = self.account()
        token = headers["Authorization"].split()[1]
        with closing(sqlite3.connect(self.database)) as database, database:
            stored = database.execute("SELECT token_hash FROM sessions").fetchone()[0]
            self.assertEqual(stored, hashlib.sha256(token.encode()).hexdigest())
            database.execute("UPDATE sessions SET expires_at = ?", (int(time.time()) - 1,))
        self.assertEqual(self.client.get("/api/validations", headers=headers).status_code, 401)

    def test_api_errors_are_json_and_not_spa(self):
        self.assertEqual(self.client.get("/api/missing").status_code, 404)
        self.assertEqual(self.client.get("/api/auth/login").status_code, 405)
        self.assertTrue(self.client.get("/api/missing").is_json)
        self.assertEqual(self.client.get("/api/health").headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
