"""Manual end-to-end checks against a running server."""

import json
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8000"
FAILED = []


def call(method, path, body=None, token=None, client=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    if client:
        req.add_header("X-Forwarded-For", client)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        return exc.code, (json.loads(raw) if raw else None), dict(exc.headers)


def check(label, condition, extra=""):
    status = "PASS" if condition else "FAIL"
    if not condition:
        FAILED.append(label)
    print(f"[{status}] {label} {extra}")


def unique(prefix):
    return f"{prefix}-{int(time.time() * 1000) % 100000}"


def main():
    client = "10.0.0.1"

    status, body, _ = call("GET", "/api/health", client=client)
    check("health", status == 200 and body == {"status": "ok"}, str(body))

    user = unique("alice")
    status, body, _ = call(
        "POST", "/api/auth/register", {"username": user, "password": "pw"}, client=client
    )
    check("register 201", status == 201, str(body))

    status, body, _ = call(
        "POST", "/api/auth/register", {"username": user, "password": "pw"}, client=client
    )
    check("duplicate register 409", status == 409, str(body))

    status, body, _ = call(
        "POST", "/api/auth/register", {"username": "admin", "password": "pw"}, client=client
    )
    check("reserved admin register 409", status == 409, str(body))

    status, body, headers = call("GET", "/api/me", client=client)
    check("me without token 401", status == 401, str(body))

    status, body, _ = call("GET", "/api/me", token="nope", client=client)
    check("me with bad token 401", status == 401, str(body))

    status, body, _ = call(
        "POST", "/api/auth/login", {"username": user, "password": "pw"}, client=client
    )
    check("login 200", status == 200 and "token" in body, str(body))
    token = body["token"]

    status, body, _ = call("GET", "/api/me", token=token, client=client)
    check(
        "me payload",
        status == 200
        and body["username"] == user
        and isinstance(body["id"], int)
        and isinstance(body["last_login_at"], str),
        str(body),
    )

    status, body, _ = call("GET", "/api/me/login-attempts", token=token, client=client)
    check(
        "attempts after one login",
        status == 200
        and len(body["items"]) == 1
        and body["items"][0]["success"] is True
        and "at" in body["items"][0],
        str(body),
    )

    # --- lockout -------------------------------------------------------- #
    victim = unique("bob")
    call("POST", "/api/auth/register", {"username": victim, "password": "right"}, client=client)

    codes = []
    for _ in range(5):
        status, _, _ = call(
            "POST", "/api/auth/login", {"username": victim, "password": "wrong"}, client=client
        )
        codes.append(status)
    check("5 wrong passwords -> 401", codes == [401] * 5, str(codes))

    status, body, headers = call(
        "POST", "/api/auth/login", {"username": victim, "password": "right"}, client=client
    )
    retry_after = headers.get("Retry-After")
    check(
        "locked even with right password -> 429",
        status == 429 and retry_after is not None and 0 < int(retry_after) <= 900,
        f"{status} {body} retry-after={retry_after}",
    )
    check("429 body mentions retry", isinstance(body, dict) and "retry_after" in body, str(body))

    status, body, _ = call(
        "POST", "/api/auth/login", {"username": victim, "password": "wrong"}, client=client
    )
    check("still locked -> 429", status == 429, str(body))

    # admin sees the lock
    status, body, _ = call(
        "POST", "/api/auth/login", {"username": "admin", "password": "admin-pw"}, client=client
    )
    check("admin login", status == 200, str(body))
    admin_token = body["token"] if status == 200 else ""

    status, body, _ = call("GET", "/api/admin/locks", token=admin_token, client=client)
    locked = [item for item in body.get("items", []) if item["username"] == victim] if status == 200 else []
    check(
        "admin lists the lock",
        status == 200 and len(locked) == 1 and "locked_until" in locked[0],
        str(body),
    )

    status, body, _ = call("GET", "/api/admin/locks", token=token, client=client)
    check("locks forbidden for normal user", status == 403, str(body))

    status, body, _ = call("GET", "/api/admin/locks", client=client)
    check("locks 401 without token", status == 401, str(body))

    status, body, _ = call(
        "POST", f"/api/admin/locks/{victim}/unlock", token=admin_token, client=client
    )
    check("unlock 200", status == 200, str(body))

    status, body, _ = call(
        "POST", "/api/auth/login", {"username": victim, "password": "right"}, client=client
    )
    check("login after unlock", status == 200 and "token" in body, str(body))

    status, body, _ = call("GET", "/api/admin/locks", token=admin_token, client=client)
    check(
        "lock gone from admin list",
        status == 200 and all(item["username"] != victim for item in body["items"]),
        str(body),
    )

    status, body, _ = call(
        "POST", "/api/admin/locks/does-not-exist/unlock", token=admin_token, client=client
    )
    check("unlock unknown user 404", status == 404, str(body))

    # a successful sign-in resets the failure counter
    reset = unique("carol")
    call("POST", "/api/auth/register", {"username": reset, "password": "right"}, client=client)
    for _ in range(4):
        call(
            "POST", "/api/auth/login", {"username": reset, "password": "wrong"}, client=client
        )
    status, _, _ = call(
        "POST", "/api/auth/login", {"username": reset, "password": "right"}, client=client
    )
    check("4 failures then success", status == 200, str(status))
    status, _, _ = call(
        "POST", "/api/auth/login", {"username": reset, "password": "wrong"}, client=client
    )
    check("counter reset after success", status == 401, str(status))

    # --- client rate limit ---------------------------------------------- #
    rl_client = "10.0.0.2"
    codes = []
    headers_seen = []
    for _ in range(22):
        status, _, headers = call(
            "POST",
            "/api/auth/login",
            {"username": unique("ghost"), "password": "wrong"},
            client=rl_client,
        )
        codes.append(status)
        headers_seen.append(headers.get("Retry-After"))
    check(
        "21st attempt in a minute is refused",
        codes[:20] == [401] * 20 and codes[20] == 429 and codes[21] == 429,
        str(codes),
    )
    check(
        "rate limited responses carry Retry-After",
        headers_seen[20] is not None and 0 < int(headers_seen[20]) <= 60,
        str(headers_seen[20]),
    )

    # a different client is unaffected
    status, _, _ = call(
        "POST",
        "/api/auth/login",
        {"username": unique("ghost"), "password": "wrong"},
        client="10.0.0.3",
    )
    check("other client unaffected", status == 401, str(status))

    # successful sign-ins count towards the attempt limit as well
    rl_client2 = "10.0.0.4"
    heavy = unique("heavy")
    call("POST", "/api/auth/register", {"username": heavy, "password": "pw"}, client=rl_client2)
    codes = []
    for _ in range(22):
        status, _, _ = call(
            "POST",
            "/api/auth/login",
            {"username": heavy, "password": "pw"},
            client=rl_client2,
        )
        codes.append(status)
    check(
        "successful sign-ins hit the attempt limit too",
        codes[:20] == [200] * 20 and codes[20] == 429,
        str(codes),
    )

    # the lock lasts 15 minutes
    victim2 = unique("erin")
    call("POST", "/api/auth/register", {"username": victim2, "password": "pw"}, client=client)
    for _ in range(5):
        call(
            "POST", "/api/auth/login", {"username": victim2, "password": "bad"}, client=client
        )
    status, body, headers = call(
        "POST", "/api/auth/login", {"username": victim2, "password": "pw"}, client=client
    )
    retry_after = int(headers.get("Retry-After", "0"))
    check("lock lasts 15 minutes", 890 <= retry_after <= 900, str(retry_after))

    print()
    if FAILED:
        print(f"{len(FAILED)} checks failed: {FAILED}")
        raise SystemExit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
