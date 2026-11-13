import importlib.util
import json
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("app_under_test", "/workspace/backend/app.py")
app_module = importlib.util.module_from_spec(spec)
with tempfile.TemporaryDirectory() as tmp:
    sys.modules["app_under_test"] = app_module
    spec.loader.exec_module(app_module)
    app_module.DB_PATH = Path(tmp) / "test.db"
    app_module.DATA_DIR = Path(tmp)
    app_module.init_db()
    app = app_module.app
    app.config.update(TESTING=True)
    client = app.test_client()

    def req(method, path, body=None, token=None):
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return client.open(
            path, method=method, json=body, headers=headers
        )

    def check(name, condition, extra=""):
        print(("PASS " if condition else "FAIL ") + name + ("" if condition else f" :: {extra}"))
        if not condition:
            raise AssertionError(name)

    r = req("GET", "/api/health")
    check("health", r.status_code == 200 and r.json == {"status": "ok"}, r.data)

    cases = [
        ("<root/>", True, "root", None),
        ('<?xml version="1.0"?><a xmlns="urn:x"><b/></a>', True, "{urn:x}a", None),
        ("<root><a></root>", False, None, "mismatched tag"),
        ("<a>\n  <b></a>\n</a>", False, None, "mismatched tag"),
        ("<root/><other/>", False, None, "junk after document element"),
        ("", False, None, "no element found"),
        ("not xml", False, None, "syntax error"),
        ('<!DOCTYPE r SYSTEM "http://example.com/x.dtd"><r/>', True, "r", None),
        ('<!DOCTYPE r [<!ENTITY e "hi">]><r>&e;</r>', True, "r", None),
    ]
    for xml, valid, root, err in cases:
        r = req("POST", "/api/validate/xml", {"xml": xml})
        j = r.json
        check(
            f"validate {xml[:30]!r}",
            r.status_code == 200
            and j["valid"] is valid
            and j["root_element"] == root
            and (err is None or err in (j["error"] or ""))
            and (valid or (isinstance(j["line"], int) and isinstance(j["column"], int)))
            and (not valid or j["error"] is None),
            j,
        )

    r = req("POST", "/api/validate/xml", {"xml": "<a>\n <b></a>"})
    check("error position", r.json["line"] == 2 and r.json["column"] == 6, r.json)

    r = req("POST", "/api/validate/xml", {"xml": 123})
    check("bad xml type", r.status_code == 400, r.status_code)
    r = req("POST", "/api/validate/xml", {})
    check("missing xml", r.status_code == 400, r.status_code)

    check("validations require auth", req("GET", "/api/validations").status_code == 401)
    check("create requires auth", req("POST", "/api/validations", {"xml": "<a/>"}).status_code == 401)
    check("delete requires auth", req("DELETE", "/api/validations/1").status_code == 401)
    check("bad token", req("GET", "/api/validations", token="garbage").status_code == 401)
    check("wrong scheme", client.get("/api/validations", headers={"Authorization": "Basic xyz"}).status_code == 401)

    r = req("POST", "/api/auth/register", {"username": "alice", "password": "secret"})
    check("register", r.status_code == 201, (r.status_code, r.data))
    r = req("POST", "/api/auth/register", {"username": "alice", "password": "secret"})
    check("duplicate username", r.status_code == 409, (r.status_code, r.data))
    r = req("POST", "/api/auth/register", {"username": "bob", "password": "pw"})
    check("register bob", r.status_code == 201, r.status_code)
    check("register missing password", req("POST", "/api/auth/register", {"username": "x"}).status_code == 400)

    r = req("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
    check("login wrong password", r.status_code == 401, r.status_code)
    r = req("POST", "/api/auth/login", {"username": "alice", "password": "secret"})
    check("login", r.status_code == 200 and isinstance(r.json.get("token"), str), r.data)
    alice = r.json["token"]
    r = req("POST", "/api/auth/login", {"username": "bob", "password": "pw"})
    bob = r.json["token"]

    check("me", req("GET", "/api/auth/me", token=alice).json["username"] == "alice")

    long_xml = "<?xml version='1.0'?>" + "<root>" + "x" * 300 + "</root>"
    r = req("POST", "/api/validations", {"xml": long_xml}, token=alice)
    check("create saved", r.status_code == 201 and len(r.json["xml_preview"]) == 200, (r.status_code, r.data))
    first_id = r.json["id"]
    body_keys = {"id", "xml_preview", "valid", "error", "line", "column", "root_element", "created_at"}
    check("saved shape", set(r.json.keys()) == body_keys, r.json.keys())

    samples = ["<one/>", "<bad>", "<two/>", "<oops><x></oops>", "<three/>"]
    for s in samples:
        rr = req("POST", "/api/validations", {"xml": s}, token=alice)
        check(f"save {s}", rr.status_code == 201 and rr.json["xml_preview"] == s, rr.data)

    r = req("GET", "/api/validations", token=alice)
    j = r.json
    check(
        "list shape and newest first",
        r.status_code == 200
        and set(j.keys()) == {"items", "total", "page", "page_size"}
        and j["total"] == 6
        and j["page"] == 1
        and j["page_size"] == 10
        and j["items"][0]["xml_preview"] == "<three/>",
        j,
    )

    r = req("GET", "/api/validations?valid=true", token=alice)
    check("filter valid", r.json["total"] == 4 and all(i["valid"] for i in r.json["items"]), r.json)
    r = req("GET", "/api/validations?valid=false", token=alice)
    check("filter invalid", r.json["total"] == 2 and all(not i["valid"] for i in r.json["items"]), r.json)
    check("filter invalid value", req("GET", "/api/validations?valid=maybe", token=alice).status_code == 400)
    check("page 0", req("GET", "/api/validations?page=0", token=alice).status_code == 400)
    check("page_size 0", req("GET", "/api/validations?page_size=0", token=alice).status_code == 400)

    r = req("GET", "/api/validations?page=1&page_size=2", token=alice)
    check("paging page 1", len(r.json["items"]) == 2 and r.json["total"] == 6, r.json)
    r2 = req("GET", "/api/validations?page=2&page_size=2", token=alice)
    check("paging page 2", len(r2.json["items"]) == 2 and r2.json["page"] == 2, r2.json)
    check("paging distinct", r.json["items"][0]["id"] != r2.json["items"][0]["id"])
    r3 = req("GET", "/api/validations?page=3&page_size=2", token=alice)
    check("paging page 3", len(r3.json["items"]) == 2, r3.json)
    r4 = req("GET", "/api/validations?page=4&page_size=2", token=alice)
    check("paging page 4 empty", r4.json["items"] == [], r4.json)

    check("bob has empty history", req("GET", "/api/validations", token=bob).json["total"] == 0)

    bb = req("POST", "/api/validations", {"xml": "<bob/>"}, token=bob)
    bob_id = bb.json["id"]
    check("alice cannot delete bob's", req("DELETE", f"/api/validations/{bob_id}", token=alice).status_code == 404)
    check("bob still has it", req("GET", "/api/validations", token=bob).json["total"] == 1)
    check("bob deletes own", req("DELETE", f"/api/validations/{bob_id}", token=bob).status_code == 200)
    check("delete twice 404", req("DELETE", f"/api/validations/{bob_id}", token=bob).status_code == 404)
    check("alice deletes own", req("DELETE", f"/api/validations/{first_id}", token=alice).status_code == 200)
    check("total after delete", req("GET", "/api/validations", token=alice).json["total"] == 5)

    check("missing delete 404", req("DELETE", "/api/validations/999999", token=alice).status_code == 404)
    check("unknown api 404", req("GET", "/api/nope").status_code == 404)

    r = req("POST", "/api/auth/logout", token=alice)
    check("logout", r.status_code == 200, r.status_code)
    check("token invalid after logout", req("GET", "/api/validations", token=alice).status_code == 401)

    r = client.get("/")
    check("frontend index served", r.status_code == 200 and b"XML" in r.data, r.status_code)
    r = client.get("/some/spa/route")
    check("spa fallback", r.status_code == 200 and b"<div id=\"root\">" in r.data, r.status_code)

print("ALL TESTS PASSED")
