"""End-to-end API checks for the quiz app."""

import os
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))
os.chdir(ROOT)

FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        FAILURES.append(name)


def section(title):
    print(f"\n== {title} ==")


def main():
    import app as module

    client = module.app.test_client()

    section("health")
    response = client.get("/api/health")
    check("health 200", response.status_code == 200, response.status_code)
    check("health body", response.get_json() == {"status": "ok"}, response.get_json())

    section("questions seeded")
    response = client.get("/api/admin/questions")
    check("admin list requires auth", response.status_code == 401, response.status_code)

    section("register")
    response = client.post("/api/auth/register", json={"username": "alice", "password": "pw123456"})
    check("register 201", response.status_code == 201, (response.status_code, response.get_json()))
    alice_body = response.get_json()
    check("register returns username", alice_body.get("username") == "alice", alice_body)

    response = client.post("/api/auth/register", json={"username": "alice", "password": "pw123456"})
    check("duplicate register 409", response.status_code == 409, response.status_code)

    response = client.post("/api/auth/register", json={"username": "", "password": ""})
    check("empty register 400", response.status_code == 400, response.status_code)
    check("register errors payload", "errors" in response.get_json(), response.get_json())

    section("login")
    response = client.post("/api/auth/login", json={"username": "alice", "password": "pw123456"})
    check("login 200", response.status_code == 200, response.status_code)
    payload = response.get_json()
    check("login has token", isinstance(payload.get("token"), str) and payload["token"], payload)
    alice_token = payload["token"]

    response = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    check("bad password 401", response.status_code == 401, response.status_code)

    response = client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    check("unknown user 401", response.status_code == 401, response.status_code)

    auth = {"Authorization": f"Bearer {alice_token}"}

    section("me")
    response = client.get("/api/auth/me", headers=auth)
    check("me 200", response.status_code == 200, response.status_code)
    check("me username", response.get_json().get("username") == "alice", response.get_json())

    response = client.get("/api/auth/me", headers={"Authorization": "Bearer nope"})
    check("me bad token 401", response.status_code == 401, response.status_code)

    section("quiz")
    response = client.get("/api/quiz?count=5")
    check("quiz 200", response.status_code == 200, response.status_code)
    payload = response.get_json()
    check("quiz items list", isinstance(payload.get("items"), list), payload)
    check("quiz count 5", len(payload["items"]) == 5, len(payload["items"]))
    item = payload["items"][0]
    check(
        "quiz item keys",
        set(item.keys()) == {"id", "text", "option_a", "option_b", "option_c", "option_d"},
        item.keys(),
    )
    check("quiz hides correct_option", "correct_option" not in item, item)

    response = client.get("/api/quiz")
    check("quiz default count", len(response.get_json()["items"]) == 5, response.get_json())
    response = client.get("/api/quiz?count=100")
    check("quiz large count", len(response.get_json()["items"]) >= 20, len(response.get_json()["items"]))
    response = client.get("/api/quiz?count=abc")
    check("quiz bad count 400", response.status_code == 400, response.status_code)

    section("attempts - visitor")
    quiz_items = client.get("/api/quiz?count=3").get_json()["items"]
    answers = [{"question_id": item["id"], "selected": "A"} for item in quiz_items]
    response = client.post("/api/attempts", json={"answers": answers})
    check("visitor attempt 200", response.status_code == 200, (response.status_code, response.get_json()))
    visitor = response.get_json()
    check(
        "attempt keys",
        set(visitor.keys())
        == {"id", "score", "correct", "total_questions", "submitted_at", "answers"},
        visitor.keys(),
    )
    check("attempt total 3", visitor["total_questions"] == 3, visitor)
    check("attempt answers 3", len(visitor["answers"]) == 3, visitor)
    check(
        "answer keys",
        set(visitor["answers"][0].keys())
        >= {"question_id", "selected", "correct_option", "is_correct", "text"},
        visitor["answers"][0].keys(),
    )
    check("answer has correct_option", visitor["answers"][0]["correct_option"] in "ABCD")
    check(
        "is_correct matches",
        all(
            a["is_correct"] == (a["selected"] == a["correct_option"])
            for a in visitor["answers"]
        ),
        visitor["answers"],
    )

    section("attempts - signed in")
    # Answer correctly to check the score maths.
    admin_login = client.post("/api/auth/login", json={"username": "admin", "password": "s3cret"})
    check("admin login 200", admin_login.status_code == 200, (admin_login.status_code, admin_login.get_json()))
    admin_token = admin_login.get_json()["token"]
    admin_auth = {"Authorization": f"Bearer {admin_token}"}

    all_questions = client.get("/api/admin/questions?page=1&page_size=100", headers=admin_auth).get_json()
    check("admin total >= 20", all_questions["total"] >= 20, all_questions["total"])
    check("admin pagination keys", set(all_questions.keys()) == {"items", "total", "page", "page_size"}, all_questions.keys())
    check("admin items have correct_option", "correct_option" in all_questions["items"][0], all_questions["items"][0])

    by_id = {q["id"]: q for q in all_questions["items"]}
    quiz_items = client.get("/api/quiz?count=4").get_json()["items"]
    correct_answers = [
        {"question_id": item["id"], "selected": by_id[item["id"]]["correct_option"]}
        for item in quiz_items
    ]
    response = client.post("/api/attempts", json={"answers": correct_answers}, headers=auth)
    check("signed attempt 200", response.status_code == 200, (response.status_code, response.get_json()))
    perfect = response.get_json()
    check("perfect correct 4", perfect["correct"] == 4, perfect)
    check("perfect score 100", perfect["score"] == 100, perfect)
    check("all is_correct", all(a["is_correct"] for a in perfect["answers"]), perfect["answers"])

    wrong_answers = [
        {"question_id": item["id"], "selected": "Z"} for item in quiz_items
    ]
    response = client.post("/api/attempts", json={"answers": wrong_answers})
    check("invalid option 400", response.status_code == 400, response.status_code)

    response = client.post("/api/attempts", json={"answers": []})
    check("empty answers 400", response.status_code == 400, response.status_code)

    response = client.post("/api/attempts", json={"answers": [{"question_id": 99999, "selected": "A"}]})
    check("unknown question 400", response.status_code == 400, response.status_code)

    section("attempts - listing")
    response = client.get("/api/attempts")
    check("list without token 401", response.status_code == 401, response.status_code)

    response = client.get("/api/attempts", headers=auth)
    check("list 200", response.status_code == 200, response.status_code)
    items = response.get_json()["items"]
    check("list has 1 attempt", len(items) == 1, len(items))
    check("list item is attempt", set(items[0].keys()) == set(perfect.keys()), items[0].keys())
    attempt_id = items[0]["id"]

    response = client.get(f"/api/attempts/{attempt_id}", headers=auth)
    check("get attempt 200", response.status_code == 200, response.status_code)
    check("get attempt matches", response.get_json()["id"] == attempt_id, response.get_json())

    response = client.get(f"/api/attempts/{attempt_id}")
    check("get attempt no token 401", response.status_code == 401, response.status_code)

    # Another user must not see alice's attempt.
    client.post("/api/auth/register", json={"username": "bob", "password": "pw123456"})
    bob_token = client.post("/api/auth/login", json={"username": "bob", "password": "pw123456"}).get_json()["token"]
    bob_auth = {"Authorization": f"Bearer {bob_token}"}
    response = client.get(f"/api/attempts/{attempt_id}", headers=bob_auth)
    check("other user cannot read attempt", response.status_code in (403, 404), response.status_code)
    response = client.get("/api/attempts", headers=bob_auth)
    check("other user sees no attempts", response.get_json()["items"] == [], response.get_json())

    section("admin endpoints")
    response = client.get("/api/admin/questions", headers=auth)
    check("non-admin list 403", response.status_code == 403, response.status_code)
    response = client.post("/api/admin/questions", headers=auth, json={})
    check("non-admin create 403", response.status_code == 403, response.status_code)

    response = client.post(
        "/api/admin/questions",
        headers=admin_auth,
        json={"text": "What is the capital of Japan?", "option_a": "Osaka", "option_b": "Kyoto",
              "option_c": "Tokyo", "option_d": "Nagoya", "correct_option": "C"},
    )
    check("admin create 201", response.status_code == 201, (response.status_code, response.get_json()))
    created = response.get_json()
    check("created has correct_option", created.get("correct_option") == "C", created)

    response = client.post(
        "/api/admin/questions",
        headers=admin_auth,
        json={"text": "", "option_a": "", "option_b": "", "option_c": "", "option_d": "", "correct_option": "Z"},
    )
    check("admin create invalid 400", response.status_code == 400, response.status_code)
    errors = response.get_json().get("errors", {})
    check("validation errors per field", "text" in errors and "correct_option" in errors, errors)

    response = client.get("/api/admin/questions?page=2&page_size=5", headers=admin_auth)
    payload = response.get_json()
    check("page 2 items", len(payload["items"]) == 5, len(payload["items"]))
    check("page reported", payload["page"] == 2 and payload["page_size"] == 5, payload)

    section("admin disabled")
    check("ADMIN_PASSWORD env", module.admin_password() == "s3cret", module.admin_password())

    section("frontend serving")
    response = client.get("/")
    check("index served", response.status_code == 200, response.status_code)

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURES: {FAILURES}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
