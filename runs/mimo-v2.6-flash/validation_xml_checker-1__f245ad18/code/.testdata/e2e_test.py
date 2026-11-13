import json
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None, raw=False):
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            payload = resp.read()
            status = resp.status
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        status = exc.code
    if raw:
        return status, payload
    parsed = None
    if payload:
        try:
            parsed = json.loads(payload)
        except ValueError:
            parsed = payload.decode()
    return status, parsed


def check(label, condition, detail=""):
    if condition:
        print(f"  ok  {label}")
    else:
        print(f"FAIL  {label} {detail}")
        failures.append(label)


print("== health / frontend ==")
status, body = call("GET", "/api/health")
check("health", status == 200 and body == {"status": "ok"}, (status, body))
status, payload = call("GET", "/", raw=True)
check("frontend index", status == 200 and b'<div id="root">' in payload, status)
status, payload = call("GET", "/some/deep/route", raw=True)
check("spa fallback", status == 200 and b'<div id="root">' in payload, status)
status, body = call("GET", "/api/definitely-missing")
check("api 404 json", status == 404 and isinstance(body, dict), (status, body))
status, _ = call("POST", "/api/validate/xml", body={"xml": "<a/>"}, raw=True)
check("validate without auth allowed", status == 200, status)

print("== validation semantics ==")
status, body = call("POST", "/api/validate/xml", body={"xml": "<root><child/></root>"})
check(
    "valid document",
    status == 200
    and body["valid"] is True
    and body["error"] is None
    and body["line"] is None
    and body["column"] is None
    and body["root_element"] == "root",
    (status, body),
)
status, body = call("POST", "/api/validate/xml", body={"xml": "<a>\n  <b>\n</a>"})
check(
    "invalid document position",
    status == 200
    and body["valid"] is False
    and body["error"]
    and body["line"] == 3
    and isinstance(body["column"], int)
    and body["column"] >= 1
    and body["root_element"] == "a",
    (status, body),
)
status, body = call("POST", "/api/validate/xml", body={"xml": "<a>"})
check("unclosed root element", status == 200 and body["valid"] is False and body["root_element"] == "a", (status, body))
status, body = call("POST", "/api/validate/xml", body={"xml": "nonsense"})
check("garbage", status == 200 and body["valid"] is False and body["error"] and body["root_element"] is None, (status, body))
status, body = call("POST", "/api/validate/xml", body={"xml": '<?xml version="1.0"?>\n<a>\n</a>'})
check("declaration ok", status == 200 and body["valid"] is True and body["root_element"] == "a", (status, body))
status, body = call("POST", "/api/validate/xml", body={})
check("missing xml field", status == 400, (status, body))
status, body = call("POST", "/api/validate/xml", body={"xml": 5})
check("non-string xml", status == 400, (status, body))
status, body = call("POST", "/api/validate/xml")
check("non-json body", status == 400, (status, body))

print("== accounts ==")
status, body = call("POST", "/api/auth/register", body={"username": "carol", "password": "pw123456"})
check("register 201", status == 201, (status, body))
status, body = call("POST", "/api/auth/register", body={"username": "carol", "password": "pw123456"})
check("duplicate register rejected", status in (400, 409), (status, body))
status, body = call("POST", "/api/auth/register", body={"username": ""})
check("register missing password", status == 400, (status, body))
status, body = call("POST", "/api/auth/login", body={"username": "carol", "password": "nope"})
check("bad login 401", status == 401, (status, body))
status, body = call("POST", "/api/auth/login", body={"username": "carol", "password": "pw123456"})
check("login 200 token", status == 200 and isinstance(body.get("token"), str) and len(body["token"]) > 20, (status, body))
token = body["token"]
status, body = call("POST", "/api/auth/login", body={"username": "ghost", "password": "x"})
check("unknown user 401", status == 401, (status, body))

print("== auth gating ==")
status, body = call("GET", "/api/validations")
check("list without token 401", status == 401, (status, body))
status, body = call("POST", "/api/validations", body={"xml": "<a/>"})
check("save without token 401", status == 401, (status, body))
status, body = call("DELETE", "/api/validations/1")
check("delete without token 401", status == 401, (status, body))
status, body = call("GET", "/api/validations", token="not-a-real-token")
check("bogus token 401", status == 401, (status, body))
status, body = call("GET", "/api/validations", token="Basic abc")
check("wrong scheme 401", status == 401, (status, body))

print("== saved checks ==")
valid_xml = "<catalog><book id='1'/></catalog>"
invalid_xml = "<catalog>\n<book id='1'>\n</catalog>"
status, body = call("POST", "/api/validations", body={"xml": valid_xml}, token=token)
check("save valid 201", status == 201 and body["valid"] is True and body["root_element"] == "catalog", (status, body))
id_valid = body["id"]
check("preview length", body["xml_preview"] == valid_xml[:200], body["xml_preview"])
check("created_at present", isinstance(body["created_at"], str) and body["created_at"], body)
status, body = call("POST", "/api/validations", body={"xml": invalid_xml}, token=token)
check("save invalid", status == 201 and body["valid"] is False and body["line"] == 3, (status, body))
id_invalid = body["id"]
long_xml = "x" * 500
status, body = call("POST", "/api/validations", body={"xml": long_xml}, token=token)
check("preview capped at 200", status == 201 and len(body["xml_preview"]) == 200, (status, body))
id_long = body["id"]

status, body = call("GET", "/api/validations", token=token)
items = body["items"]
check("list shape", status == 200 and set(body) == {"items", "total", "page", "page_size"}, (status, body.keys()))
check("total 3", body["total"] == 3, body["total"])
check("newest first", [i["id"] for i in items] == sorted([i["id"] for i in items], reverse=True), [i["id"] for i in items])
check(
    "item keys",
    all(
        set(i)
        == {"id", "xml_preview", "valid", "error", "line", "column", "root_element", "created_at"}
        for i in items
    ),
    items[0].keys() if items else None,
)
check("page defaults", body["page"] == 1 and body["page_size"] == 10, body)

status, body = call("GET", "/api/validations?valid=true", token=token)
check("filter valid", body["total"] == 1 and all(i["valid"] for i in body["items"]), body)
status, body = call("GET", "/api/validations?valid=false", token=token)
check("filter invalid", body["total"] == 2 and not any(i["valid"] for i in body["items"]), body)
status, body = call("GET", "/api/validations?page=2&page_size=2", token=token)
check("paging", body["page"] == 2 and body["page_size"] == 2 and len(body["items"]) == 1 and body["total"] == 3, body)
status, body = call("GET", "/api/validations?page=99&page_size=2", token=token)
check("page beyond end empty", body["items"] == [] and body["total"] == 3, body)
status, body = call("GET", "/api/validations?valid=maybe", token=token)
check("bad filter 400", status == 400, (status, body))
status, body = call("GET", "/api/validations?page=x", token=token)
check("bad page 400", status == 400, (status, body))

print("== isolation ==")
call("POST", "/api/auth/register", body={"username": "dave", "password": "pw123456"})
status, body = call("POST", "/api/auth/login", body={"username": "dave", "password": "pw123456"})
token_dave = body["token"]
status, body = call("GET", "/api/validations", token=token_dave)
check("other user sees nothing", status == 200 and body["total"] == 0 and body["items"] == [], body)
status, _ = call("DELETE", f"/api/validations/{id_valid}", token=token_dave, raw=True)
check("other user delete 404", status == 404, status)
status, body = call("GET", "/api/validations", token=token)
check("owner still has it", body["total"] == 3, body["total"])
status, _ = call("DELETE", f"/api/validations/{id_long}", token=token, raw=True)
check("owner delete 204", status == 204, status)
status, body = call("GET", "/api/validations", token=token)
check("deleted gone", body["total"] == 2, body["total"])
status, _ = call("DELETE", f"/api/validations/{id_long}", token=token, raw=True)
check("double delete 404", status == 404, status)
status, _ = call("DELETE", "/api/validations/999999", token=token, raw=True)
check("missing id 404", status == 404, status)

print("== no external resolution ==")
evil = '<!DOCTYPE a SYSTEM "http://127.0.0.1:1/nope"><a/>'
status, body = call("POST", "/api/validate/xml", body={"xml": evil})
check("external dtd not fetched", status == 200 and body["valid"] is True, (status, body))
evil2 = '<!DOCTYPE a [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>'
status, body = call("POST", "/api/validate/xml", body={"xml": evil2})
check("external entity rejected", status == 200 and body["valid"] is False, (status, body))

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    raise SystemExit(1)
print("ALL PASSED")
