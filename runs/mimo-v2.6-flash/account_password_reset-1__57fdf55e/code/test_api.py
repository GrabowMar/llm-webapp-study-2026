"""End-to-end API checks (temporary, deleted after the run)."""

import json
import re
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000"
failures = []


def call(method, path, body=None, token=None, query=None):
    url = BASE + path
    if query:
        url += "?" + "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in query.items())
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    try:
        parsed = json.loads(raw) if raw else None
    except json.JSONDecodeError:
        parsed = raw.decode(errors="replace")
    return status, parsed


def check(name, condition, detail=""):
    if condition:
        print(f"PASS {name}")
    else:
        print(f"FAIL {name} {detail}")
        failures.append(name)


# --- health ---------------------------------------------------------------
status, body = call("GET", "/api/health")
check("health", status == 200 and body == {"status": "ok"}, (status, body))

# --- register -------------------------------------------------------------
status, body = call(
    "POST",
    "/api/auth/register",
    {"username": "alice", "password": "password1", "email": "alice@example.com"},
)
check("register 201", status == 201, (status, body))
check("register payload", isinstance(body, dict) and body.get("username") == "alice"
      and body.get("email") == "alice@example.com" and isinstance(body.get("id"), int),
      (status, body))
alice_id = body.get("id") if isinstance(body, dict) else None

status, body = call("POST", "/api/auth/register",
                    {"username": "alice", "password": "password1"})
check("duplicate username 409", status == 409, (status, body))

status, body = call(
    "POST",
    "/api/auth/register",
    {"username": "alice2", "password": "password1", "email": "ALICE@example.com"},
)
check("duplicate email case-insensitive 409", status == 409, (status, body))

status, body = call(
    "POST", "/api/auth/register",
    {"username": "bob", "password": "password1", "email": "bob@example.com"},
)
check("register bob 201", status == 201, (status, body))
bob_id = body.get("id") if isinstance(body, dict) else None

status, body = call(
    "POST", "/api/auth/register", {"username": "carol", "password": "short"}
)
check("short password 400", status == 400, (status, body))

status, body = call("POST", "/api/auth/register", {"username": "", "password": "password1"})
check("empty username 400", status == 400, (status, body))

status, body = call(
    "POST", "/api/auth/register",
    {"username": "dave", "password": "password1", "email": "dave@example.com"},
)
check("register dave 201", status == 201, (status, body))

# no password anywhere in register response
raw = json.dumps(body)
check("register hides password", "password" not in raw.lower(), raw)

# --- login ----------------------------------------------------------------
status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "password1"})
check("login 200", status == 200 and isinstance(body, dict)
      and isinstance(body.get("token"), str) and len(body["token"]) > 20, (status, body))
alice_token = body.get("token") if status == 200 else None

status, body = call("POST", "/api/auth/login", {"username": "alice", "password": "wrongpass"})
check("login wrong password 401", status == 401, (status, body))

status, body = call("POST", "/api/auth/login", {"username": "ghost", "password": "password1"})
check("login unknown 401", status == 401, (status, body))

status, body = call("POST", "/api/auth/login", {"username": "alice"})
check("login missing password 400", status == 400, (status, body))

# --- me -------------------------------------------------------------------
status, body = call("GET", "/api/me", token=alice_token)
check("me 200", status == 200 and body == {"id": alice_id, "username": "alice",
                                            "email": "alice@example.com"}, (status, body))

status, body = call("GET", "/api/me")
check("me no token 401", status == 401, (status, body))

status, body = call("GET", "/api/me", token="not-a-real-token")
check("me bad token 401", status == 401, (status, body))

status, body = call("PATCH", "/api/me", {"email": "Alice@Example.com"}, token=alice_token)
check("patch email 200", status == 200 and body.get("email") == "Alice@Example.com",
      (status, body))

status, body = call("PATCH", "/api/me", {"email": "bob@example.com"}, token=alice_token)
check("patch duplicate email 409", status == 409, (status, body))

status, body = call("PATCH", "/api/me", {"email": "not-an-email"}, token=alice_token)
check("patch bad email 400", status == 400, (status, body))

status, body = call("PATCH", "/api/me", {"email": None}, token=alice_token)
check("patch clear email 200", status == 200 and body.get("email") is None, (status, body))

status, body = call("PATCH", "/api/me", {"email": "alice@example.com"}, token=alice_token)
check("patch restore email 200", status == 200 and body.get("email") == "alice@example.com",
      (status, body))

status, body = call("PATCH", "/api/me", {"email": "x@example.com"})
check("patch no token 401", status == 401, (status, body))

# --- change password ------------------------------------------------------
status, body = call(
    "POST", "/api/me/password",
    {"current_password": "password1", "new_password": "newpassword1"},
    token=alice_token,
)
check("change password 200", status == 200, (status, body))

status, body = call(
    "POST", "/api/me/password",
    {"current_password": "password1", "new_password": "newpassword2"},
    token=alice_token,
)
check("change password wrong current 401", status == 401, (status, body))

status, body = call(
    "POST", "/api/me/password",
    {"current_password": "newpassword1", "new_password": "short"},
    token=alice_token,
)
check("change password short new 400", status == 400, (status, body))

status, body = call(
    "POST", "/api/me/password",
    {"current_password": "newpassword1", "new_password": "newpassword2"},
)
check("change password no token 401", status == 401, (status, body))

status, body = call("POST", "/api/auth/login",
                    {"username": "alice", "password": "newpassword2"})
check("unrelated password rejected", status == 401, (status, body))
status, body = call("POST", "/api/auth/login",
                    {"username": "alice", "password": "newpassword1"})
check("login with changed password", status == 200 and "token" in body, (status, body))
alice_token = body.get("token")

# --- password reset request ----------------------------------------------
status, body = call("POST", "/api/auth/password-reset", {"username": "alice"})
check("reset request 200", status == 200 and body.get("message"),
      (status, body))
check("reset generic message",
      body.get("message") == "If the account exists, a reset link is on its way",
      body)

status, body = call("POST", "/api/auth/password-reset",
                    {"email": "ALICE@example.com"})
check("reset by email 200", status == 200, (status, body))

status, body = call("POST", "/api/auth/password-reset", {"username": "ghost"})
check("reset unknown 200 generic", status == 200
      and body.get("message") == "If the account exists, a reset link is on its way",
      (status, body))

status, body = call("POST", "/api/auth/password-reset", {"username": "carol"})
check("reset account without email 200", status == 200, (status, body))

status, body = call("POST", "/api/auth/password-reset", {})
check("reset missing identifier 400", status == 400, (status, body))

# --- outbox ---------------------------------------------------------------
status, body = call("GET", "/api/outbox", query={"to": "alice@example.com"})
check("outbox items shape", status == 200 and isinstance(body, dict)
      and isinstance(body.get("items"), list) and len(body["items"]) >= 2,
      (status, body))
items = body["items"] if isinstance(body, dict) else []
first = items[0]
check("outbox message fields",
      set(first) == {"id", "to", "subject", "body", "sent_at"}
      and first["to"] == "alice@example.com", first)
check("outbox newest first",
      all(items[i]["id"] > items[i + 1]["id"] for i in range(len(items) - 1)),
      [m["id"] for m in items])

status, body = call("GET", "/api/outbox", query={"to": "ALICE@example.com"})
check("outbox case-insensitive to", status == 200 and len(body.get("items", [])) >= 2,
      (status, body))

status, body = call("GET", "/api/outbox", query={"to": "nobody@example.com"})
check("outbox empty", status == 200 and body == {"items": []}, (status, body))

status, body = call("GET", "/api/outbox")
check("outbox missing to 400", status == 400, (status, body))

# carol (no email) must not have generated mail
status, body = call("GET", "/api/outbox", query={"to": "carol@example.com"})
check("no mail for account without email", status == 200 and body == {"items": []},
      (status, body))

# --- reset link -----------------------------------------------------------
token_match = re.search(r"token=([A-Za-z0-9_-]+)", items[0]["body"])
check("reset link contains token", token_match is not None, items[0]["body"])
reset_token = token_match.group(1) if token_match else ""
check("reset link points at /reset",
      "/reset?token=" in items[0]["body"], items[0]["body"])

status, body = call("POST", "/api/auth/password-reset/confirm",
                    {"token": "bogus", "new_password": "freshpass1"})
check("confirm bogus token 400", status == 400, (status, body))

status, body = call("POST", "/api/auth/password-reset/confirm",
                    {"token": reset_token, "new_password": "short"})
check("confirm short password 400", status == 400, (status, body))

status, body = call("POST", "/api/auth/password-reset/confirm",
                    {"token": reset_token, "new_password": "freshpass1"})
check("confirm 200", status == 200, (status, body))

status, body = call("POST", "/api/auth/password-reset/confirm",
                    {"token": reset_token, "new_password": "freshpass2"})
check("token single use 400", status == 400, (status, body))

status, body = call("POST", "/api/auth/login",
                    {"username": "alice", "password": "newpassword2"})
check("old password rejected after reset", status == 401, (status, body))
status, body = call("POST", "/api/auth/login",
                    {"username": "alice", "password": "freshpass1"})
check("new password accepted after reset", status == 200 and "token" in body,
      (status, body))

# account with no email cannot reset: no message lands anywhere
status, body = call("GET", "/api/outbox", query={"to": "alice@example.com"})
before = len(body["items"])
status, body = call("POST", "/api/auth/password-reset", {"username": "carol"})
status, body = call("GET", "/api/outbox", query={"to": "alice@example.com"})
check("no-email account sends nothing", len(body["items"]) == before,
      (before, len(body["items"])))

# --- misc -----------------------------------------------------------------
status, body = call("GET", "/api/nope")
check("unknown api 404 json", status == 404 and isinstance(body, dict)
      and "error" in body, (status, body))

req = urllib.request.Request(BASE + "/reset?token=abc")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode()
check("reset page serves SPA", resp.status == 200 and '<div id="root">' in html,
      resp.status)

conn = sqlite3.connect("data/app.db")
hashes = conn.execute("SELECT password_hash FROM accounts").fetchall()
check("passwords stored hashed",
      all(h[0].startswith(("pbkdf2:", "scrypt:", "$")) for h in hashes), hashes)
conn.close()

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    sys.exit(1)
print("ALL PASS")
