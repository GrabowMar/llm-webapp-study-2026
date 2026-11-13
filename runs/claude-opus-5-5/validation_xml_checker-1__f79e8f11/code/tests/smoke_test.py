import os
import sys
import tempfile

os.environ["DATA_DIR"] = tempfile.mkdtemp()
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app import app  # noqa: E402

c = app.test_client()


def check(cond, msg):
    print(("ok   " if cond else "FAIL ") + msg)
    if not cond:
        sys.exit(1)


check(c.get("/api/health").json == {"status": "ok"}, "health")
check(c.post("/api/auth/register", json={"username": "al", "password": "pw"}).status_code == 201, "register")
check(c.post("/api/auth/register", json={"username": "al", "password": "pw"}).status_code == 409, "dup register")
check(c.post("/api/auth/register", json={"username": "bo", "password": "pw"}).status_code == 201, "register bo")
check(c.post("/api/auth/register", json={}).status_code == 400, "register bad")
t = c.post("/api/auth/login", json={"username": "al", "password": "pw"}).json["token"]
t2 = c.post("/api/auth/login", json={"username": "bo", "password": "pw"}).json["token"]
check(c.post("/api/auth/login", json={"username": "al", "password": "x"}).status_code == 401, "bad login")
h = {"Authorization": "Bearer " + t}
h2 = {"Authorization": "Bearer " + t2}
r = c.post("/api/validate/xml", json={"xml": "<a>\n<b></a>"}).json
check(r == {"valid": False, "error": "mismatched tag", "line": 2, "column": 6, "root_element": None}, f"validate invalid {r}")
r = c.post("/api/validate/xml", json={"xml": "<root><x/></root>"}).json
check(r == {"valid": True, "error": None, "line": None, "column": None, "root_element": "root"}, "validate valid")
check(c.post("/api/validate/xml", json={}).status_code == 400, "validate missing xml")
check(c.post("/api/validations", json={"xml": "<a/>"}).status_code == 401, "save requires auth")
ids = []
for x in ["<a/>", "<b>", "<c/>" + "x" * 300]:
    r = c.post("/api/validations", json={"xml": x}, headers=h)
    check(r.status_code == 201, f"save {r.json}")
    ids.append(r.json["id"])
check(len(r.json["xml_preview"]) == 200, "preview 200")
r = c.get("/api/validations?page_size=2", headers=h).json
check(r["total"] == 3 and r["page"] == 1 and r["page_size"] == 2 and [i["id"] for i in r["items"]] == ids[::-1][:2], f"list {r}")
r = c.get("/api/validations?valid=false", headers=h).json
check(r["total"] == 2, "filter false")
r = c.get("/api/validations?valid=true", headers=h).json
check(r["total"] == 1 and r["items"][0]["root_element"] == "a", "filter true")
r = c.get("/api/validations?page=2&page_size=2", headers=h).json
check(len(r["items"]) == 1, "page 2")
check(c.delete(f"/api/validations/{ids[0]}", headers=h2).status_code == 404, "other user delete")
check(c.get("/api/validations", headers=h2).json["total"] == 0, "other user list")
check(c.delete(f"/api/validations/{ids[0]}", headers=h).status_code == 204, "delete")
check(c.delete(f"/api/validations/{ids[0]}", headers=h).status_code == 404, "delete again")
check(c.get("/api/validations", headers={"Authorization": "Bearer bad"}).status_code == 401, "bad token")
check(c.get("/api/validations").status_code == 401, "no token")
check(c.get("/api/nope").status_code == 404, "api 404")
check(c.post("/api/validate/xml", data="x").status_code == 400, "non-json")
xxe = '<!DOCTYPE r [<!ENTITY e SYSTEM "file:///etc/passwd">]><r>&e;</r>'
r = c.post("/api/validate/xml", json={"xml": xxe}).json
check(r["valid"] is True and r["root_element"] == "r", "xxe not resolved")
check(c.get("/api/auth/me", headers=h).json["username"] == "al", "me")
check(c.post("/api/auth/logout", headers=h).status_code == 204, "logout")
check(c.get("/api/validations", headers=h).status_code == 401, "token revoked")
print("all passed")
