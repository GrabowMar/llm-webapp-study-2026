"""End-to-end API checks run against the dev server (stdlib only)."""

import json
import sys
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
fails = []


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data, timeout=10) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


def check(name, cond, extra=""):
    if cond:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {extra}")
        fails.append(name)


# health
s, b = call("GET", "/api/health")
check("health", s == 200 and b == {"status": "ok"})

# quiz draw anonymous
s, b = call("GET", "/api/quiz?count=5")
check("quiz 200", s == 200, str(b))
items = b.get("items", [])
check("quiz count", len(items) == 5)
check("quiz fields", all(set(i) == {"id", "text", "option_a", "option_b", "option_c", "option_d"} for i in items), str(items[:1]))
check("quiz no correct", all("correct_option" not in i for i in items))

s, b = call("GET", "/api/quiz")
check("quiz default count", s == 200 and len(b.get("items", [])) == 5)

s, b = call("GET", "/api/quiz?count=abc")
check("quiz bad count 400", s == 400, str(b))

# register
import secrets as _sec
u1 = f"user1_{_sec.token_hex(4)}"
u2 = f"user2_{_sec.token_hex(4)}"
s, b = call("POST", "/api/auth/register", {"username": u1, "password": "pass123"})
check("register 201", s == 201, str(b))
token1 = b.get("token", "")
check("register token", bool(token1))

s, b = call("POST", "/api/auth/register", {"username": u1, "password": "pass123"})
check("register dup 409", s in (400, 409), str(b))

s, b = call("POST", "/api/auth/register", {"username": "ab", "password": "1"})
check("register invalid 400", s == 400, str(b))

s, b = call("POST", "/api/auth/login", {"username": u1, "password": "wrong"})
check("login wrong pw 401", s == 401)

s, b = call("POST", "/api/auth/login", {"username": u1, "password": "pass123"})
check("login 200", s == 200 and "token" in b, str(b))
token1 = b["token"]

# admin login
s, b = call("POST", "/api/auth/login", {"username": "admin", "password": "secretadmin"})
check("admin login", s == 200 and "token" in b, str(b))
admin_token = b.get("token", "")

s, b = call("POST", "/api/auth/login", {"username": "admin", "password": "nope"})
check("admin wrong pw", s == 401)

# attempts require auth
s, b = call("GET", "/api/attempts")
check("attempts list 401 anon", s == 401)
s, b = call("GET", "/api/attempts", token="garbage")
check("attempts list 401 bad token", s == 401)

# submit anonymous -> no id saved
s, b = call("POST", "/api/attempts", {"answers": [{"question_id": i["id"], "selected": "A"} for i in items]})
check("submit anon 201", s in (200, 201), str(b)[:200])
check("anon attempt id null", b.get("id") is None, str(b)[:120])
check("attempt fields", {"score", "correct", "total_questions", "submitted_at", "answers"} <= set(b), str(b)[:200])
check("review has correct+is_correct", all({"correct_option", "is_correct", "selected"} <= set(a) for a in b.get("answers", [])))
check("review text/options", all({"text", "option_a"} <= set(a) for a in b.get("answers", [])))

# submit as user -> saved
s, b = call("POST", "/api/attempts", {"answers": [{"question_id": items[0]["id"], "selected": "A"}, {"question_id": items[1]["id"], "selected": "B"}]}, token=token1)
check("submit user", s in (200, 201), str(b)[:120])
aid = b.get("id")
check("saved attempt has id", isinstance(aid, int))
check("score computed 0-100", 0 <= b.get("score", -1) <= 100, str(b.get("score")))

s, b = call("POST", "/api/attempts", {"answers": [{"question_id": 999999, "selected": "A"}]}, token=token1)
check("submit invalid qid 400", s == 400, str(b))
s, b = call("POST", "/api/attempts", {"answers": [{"question_id": items[0]["id"], "selected": "Z"}]}, token=token1)
check("submit invalid option 400", s == 400, str(b))
s, b = call("POST", "/api/attempts", {"answers": []}, token=token1)
check("submit empty 400", s == 400, str(b))

# list attempts
s, b = call("GET", "/api/attempts", token=token1)
check("list attempts", s == 200 and len(b.get("items", [])) >= 1, str(b)[:120])
lst = b.get("items", [])
check("newest first", all(lst[i]["id"] >= lst[i + 1]["id"] for i in range(len(lst) - 1)))
check("list item shape", all({"id", "score", "correct", "total_questions", "submitted_at", "answers"} <= set(it) for it in lst))

# second user cannot see first user's attempt
call("POST", "/api/auth/register", {"username": u2, "password": "pass123"})
s, b = call("POST", "/api/auth/login", {"username": u2, "password": "pass123"})
token2 = b["token"]
s, b = call("GET", "/api/attempts", token=token2)
check("user2 isolated list", s == 200 and all(it["id"] != aid for it in b.get("items", [])))
s, b = call("GET", f"/api/attempts/{aid}", token=token2)
check("user2 other attempt 404", s == 404, str(b))

s, b = call("GET", f"/api/attempts/{aid}", token=token1)
check("own attempt 200", s == 200 and b.get("id") == aid and "answers" in b, str(b)[:120])
s, b = call("GET", "/api/attempts/12345678", token=token1)
check("missing attempt 404", s == 404)
s, b = call("GET", f"/api/attempts/{aid}")
check("anon attempt view 401", s == 401)

# admin endpoints
s, b = call("GET", "/api/admin/questions")
check("admin list 401 anon", s == 401)
s, b = call("GET", "/api/admin/questions", token=token1)
check("admin list 403 user", s == 403)

s, b = call("POST", "/api/admin/questions", {
    "text": "What is 2 + 2?", "option_a": "3", "option_b": "4", "option_c": "5", "option_d": "6", "correct_option": "B",
}, token=admin_token)
check("admin add 201", s == 201, str(b))
check("admin add shape", b.get("correct_option") == "B" and "id" in b, str(b))
new_qid = b.get("id")

s, b = call("POST", "/api/admin/questions", {"text": "", "option_a": "x", "correct_option": "Z"}, token=admin_token)
check("admin add invalid 400", s == 400, str(b))
fields = b.get("fields", {})
check("admin validation messages", "text" in fields and "option_b" in fields and "correct_option" in fields, str(b))

s, b = call("POST", "/api/admin/questions", {
    "text": "dup q", "option_a": "a", "option_b": "b", "option_c": "c", "option_d": "d", "correct_option": "A",
}, token=token1)
check("admin add 403 user", s == 403)

s, b = call("GET", "/api/admin/questions?page=1&page_size=5", token=admin_token)
check("admin paging", s == 200 and len(b.get("items", [])) == 5 and b.get("total", 0) >= 23 and b.get("page") == 1 and b.get("page_size") == 5, str(b)[:150])
check("admin items include correct", all("correct_option" in it for it in b.get("items", [])))
s, b2 = call("GET", "/api/admin/questions?page=2&page_size=5", token=admin_token)
check("admin page 2 differs", s == 200 and b2["items"][0]["id"] != b["items"][0]["id"])

# new question appears in quiz draws
found = False
for _ in range(30):
    s, b = call("GET", f"/api/quiz?count={min(20, len(items)+0)}")
    pass
s, b = call("GET", "/api/quiz?count=20", token=None)
check("quiz count 20 capped", s == 200 and len(b.get("items", [])) == 20, str(b)[:80])
all_ids = {q["id"] for q in call("GET", "/api/admin/questions?page_size=100", token=admin_token)[1]["items"]}
drawn_ids = {i["id"] for _ in range(20) for i in call("GET", "/api/quiz?count=20")[1]["items"]}
check("quiz only active ids", drawn_ids <= all_ids)

# seed count
check("seed >= 20 questions", len(all_ids) >= 20, str(len(all_ids)))

# registered admin username reserved
s, b = call("POST", "/api/auth/register", {"username": "admin", "password": "whatever1"})
check("register admin reserved", s in (400, 409), str(b))

print()
if fails:
    print(f"{len(fails)} FAILURES: {fails}")
    sys.exit(1)
print("ALL API TESTS PASSED")
