import json
import re
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
TOKEN = None
results = []


def call(method, path, body=None, token=None, expect=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data) as resp:
            status, payload = resp.status, resp.read().decode()
    except urllib.error.HTTPError as e:
        status, payload = e.code, e.read().decode()
    ok = expect is None or status == expect
    results.append((ok, method, path, status, payload if raw else payload[:120]))
    if not ok:
        print(f"FAIL {method} {path} -> {status} (expected {expect}) {payload[:200]}")
    return status, payload


def j(payload):
    return json.loads(payload)

# register
s, p = call("POST", "/api/auth/register", {"username": "alice", "password": "password1", "email": "alice@example.com"}, expect=201)
assert j(p)["username"] == "alice" and j(p)["email"] == "alice@example.com"
assert "password" not in p and "password_hash" not in p
call("POST", "/api/auth/register", {"username": "alice", "password": "password1"}, expect=400)
call("POST", "/api/auth/register", {"username": "alicia", "password": "password1", "email": "ALICE@example.COM"}, expect=400)
call("POST", "/api/auth/register", {"username": "sh", "password": "short"}, expect=400)
call("POST", "/api/auth/register", {"username": "bob", "password": "password2"}, expect=201)
s, p = call("POST", "/api/auth/register", {"username": "carol", "password": "password3", "email": "carol@example.com"}, expect=201)

# login
s, p = call("POST", "/api/auth/login", {"username": "alice", "password": "password1"}, expect=200)
TOKEN = j(p)["token"]
assert isinstance(TOKEN, str) and len(TOKEN) > 10
call("POST", "/api/auth/login", {"username": "alice", "password": "wrongpass"}, expect=401)
call("POST", "/api/auth/login", {"username": "nobody", "password": "password1"}, expect=401)

# me
call("GET", "/api/me", expect=401)
call("GET", "/api/me", token="bogus", expect=401)
s, p = call("GET", "/api/me", token=TOKEN, expect=200)
assert j(p) == {"id": j(p)["id"], "username": "alice", "email": "alice@example.com"}
call("GET", "/api/me", token=TOKEN, expect=200, raw=True)
assert "password" not in p

# patch me
s, p = call("PATCH", "/api/me", {"email": "alice@new.example.com"}, token=TOKEN, expect=200)
assert j(p)["email"] == "alice@new.example.com"
call("PATCH", "/api/me", {"email": "carol@example.com"}, token=TOKEN, expect=400)
call("PATCH", "/api/me", {"email": "Carol@Example.com"}, token=TOKEN, expect=400)
s, p = call("PATCH", "/api/me", {"email": "alice2@new.example.com"}, token=TOKEN, expect=200)
call("PATCH", "/api/me", {"email": "not-an-email"}, token=TOKEN, expect=400)
call("PATCH", "/api/me", {"email": "alice2@new.example.com"}, expect=401)

# change password
call("POST", "/api/me/password", {"current_password": "bad", "new_password": "password9"}, token=TOKEN, expect=400)
call("POST", "/api/me/password", {"current_password": "password1", "new_password": "short"}, token=TOKEN, expect=400)
s, p = call("POST", "/api/me/password", {"current_password": "password1", "new_password": "password9"}, token=TOKEN, expect=200)
call("POST", "/api/auth/login", {"username": "alice", "password": "password1"}, expect=401)
s, p = call("POST", "/api/auth/login", {"username": "alice", "password": "password9"}, expect=200)
TOKEN = j(p)["token"]

# password reset
msg = "If the account exists, a reset link is on its way"
s, p = call("POST", "/api/auth/password-reset", {"email": "alice2@new.example.com"}, expect=200)
assert j(p)["message"] == msg
s, p = call("POST", "/api/auth/password-reset", {"username": "carol"}, expect=200)
assert j(p)["message"] == msg
# unknown -> same answer, no message
s, p = call("POST", "/api/auth/password-reset", {"email": "ghost@example.com"}, expect=200)
assert j(p)["message"] == msg
# bob has no email -> no message even for username lookup
call("POST", "/api/auth/password-reset", {"username": "bob"}, expect=200)
# case-insensitive email lookup
call("POST", "/api/auth/password-reset", {"email": "ALICE2@NEW.EXAMPLE.COM"}, expect=200)

# outbox
s, p = call("GET", "/api/outbox?to=alice2@new.example.com", expect=200)
items = j(p)["items"]
assert set(j(p).keys()) == {"items"}
assert len(items) == 2, items
for it in items:
    assert set(it.keys()) == {"id", "to", "subject", "body", "sent_at"}, it.keys()
    assert it["to"] == "alice2@new.example.com"
items_sorted = items
assert items_sorted[0]["sent_at"] >= items_sorted[1]["sent_at"]
s, p = call("GET", "/api/outbox?to=CAROL@example.com", expect=200)
assert len(j(p)["items"]) == 1
s, p = call("GET", "/api/outbox?to=bob@example.com", expect=200)
assert j(p)["items"] == []

token_re = re.compile(r"/reset\?token=([A-Za-z0-9_\-]+)")
m = token_re.search(items[0]["body"])
assert m, items[0]["body"]
reset_token = m.group(1)

# confirm reset
call("POST", "/api/auth/password-reset/confirm", {"token": "nope", "new_password": "password8"}, expect=400)
call("POST", "/api/auth/password-reset/confirm", {"token": reset_token, "new_password": "short"}, expect=400)
s, p = call("POST", "/api/auth/password-reset/confirm", {"token": reset_token, "new_password": "password8"}, expect=200)
# single use
call("POST", "/api/auth/password-reset/confirm", {"token": reset_token, "new_password": "password7"}, expect=400)
call("POST", "/api/auth/login", {"username": "alice", "password": "password9"}, expect=401)
s, p = call("POST", "/api/auth/login", {"username": "alice", "password": "password8"}, expect=200)

# health
s, p = call("GET", "/api/health", expect=200)
assert j(p) == {"status": "ok"}

# frontend fallback
req = urllib.request.Request(BASE + "/reset?token=x")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode()
assert "<div id=\"root\">" in html
req = urllib.request.Request(BASE + "/does-not-exist")
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode()
assert "<div id=\"root\">" in html

print(f"{len(results)} calls, all statuses as expected")
