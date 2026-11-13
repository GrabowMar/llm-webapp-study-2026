import os
import shutil
import sys
import tempfile

workdir = tempfile.mkdtemp()
os.chdir(workdir)
sys.path.insert(0, "/workspace/backend")
os.environ["ADMIN_PASSWORD"] = "s3cret"

import app as appmod  # noqa

client = appmod.app.test_client()

IP = ["127.0.0.1"]

def post_login(username, password):
    """Login using a fresh client IP per scenario group (IP[0])."""
    return client.post(
        "/api/auth/login",
        json={"username": username, "password": password},
        headers={"X-Forwarded-For": IP[0]},
    )

def check(name, cond):
    if not cond:
        raise AssertionError(f"FAIL: {name}")
    print(f"ok  {name}")

# health
r = client.get("/api/health")
check("health", r.status_code == 200 and r.get_json() == {"status": "ok"})

# register
r = client.post("/api/auth/register", json={"username": "alice", "password": "pw-alice"})
check("register 201", r.status_code == 201)
body = r.get_json()
check("register body", body.get("username") == "alice" and "id" in body)
r = client.post("/api/auth/register", json={"username": "alice", "password": "x"})
check("dup register 409", r.status_code == 409)
r = client.post("/api/auth/register", json={"username": "", "password": "x"})
check("bad register 400", r.status_code == 400)

# me without token
r = client.get("/api/me")
check("me 401", r.status_code == 401)
r = client.get("/api/me/login-attempts")
check("attempts 401", r.status_code == 401)

# login wrong password
IP[0] = "1.1.1.1"
for i in range(4):
    r = post_login("alice", "wrong")
    check(f"fail {i+1} -> 401", r.status_code == 401)

# 5th failure locks
r = post_login("alice", "wrong")
check("fail 5 -> 401 (lock begins)", r.status_code == 401)

# now locked even with right password
r = post_login("alice", "pw-alice")
check("locked -> 429", r.status_code == 429)
ra = r.headers.get("Retry-After")
check("Retry-After present", ra is not None and 1 <= int(ra) <= 900)
check("locked json", r.get_json().get("error") == "account_locked")

# attempts list requires auth; login as another user first
IP[0] = "2.2.2.2"
client.post("/api/auth/register", json={"username": "bob", "password": "pw-bob"})
r = post_login("bob", "pw-bob")
check("bob login 200", r.status_code == 200 and "token" in r.get_json())
bob_token = r.get_json()["token"]
hdr = {"Authorization": f"Bearer {bob_token}"}
r = client.get("/api/me", headers=hdr)
check("me ok", r.status_code == 200 and r.get_json()["username"] == "bob" and r.get_json()["last_login_at"])
r = client.get("/api/me/login-attempts", headers=hdr)
check("bob attempts has own login", r.status_code == 200 and len(r.get_json()["items"]) == 1)

# success resets count: bob fails once, then succeeds
post_login("bob", "nope")
r = post_login("bob", "pw-bob")
check("bob re-login ok", r.status_code == 200)
# after reset, need 5 fresh fails before lock
for i in range(4):
    post_login("bob", "nope")
r = post_login("bob", "pw-bob")
check("bob not locked after reset+4 fails", r.status_code == 200)
r = client.get("/api/me/login-attempts", headers=hdr)
items = r.get_json()["items"]
check("attempts list", len(items) == 8 and all("at" in it and isinstance(it["success"], bool) for it in items))
check("newest first", items[0]["success"] is True and items[1]["success"] is False)
check("cap 20", len(items) <= 20)

# admin
IP[0] = "3.3.3.3"
r = post_login("admin", "s3cret")
check("admin login", r.status_code == 200)
admin_hdr = {"Authorization": f"Bearer {r.get_json()['token']}"}
r = client.get("/api/admin/locks")
check("locks 401 anon", r.status_code == 401)
r = client.get("/api/admin/locks", headers=hdr)
check("locks 403 bob", r.status_code == 403)
r = client.get("/api/admin/locks", headers=admin_hdr)
locks = r.get_json()["items"]
check("alice in locks", any(l["username"] == "alice" and l["locked_until"] for l in locks))
r = client.post("/api/admin/locks/alice/unlock", headers=admin_hdr)
check("unlock 200", r.status_code == 200)
r = client.get("/api/admin/locks", headers=admin_hdr)
check("alice gone from locks", all(l["username"] != "alice" for l in r.get_json()["items"]))
r = post_login("alice", "pw-alice")
check("alice can sign in after unlock", r.status_code == 200)

# failed count reset by admin unlock
IP[0] = "4.4.4.4"
client.post("/api/auth/register", json={"username": "carol", "password": "pw-carol"})
for i in range(4):
    post_login("carol", "x")
client.post("/api/admin/locks/carol/unlock", headers=admin_hdr)
r = post_login("carol", "x")
check("carol not locked after unlock+1 fail", r.status_code == 401)
r = post_login("carol", "pw-carol")
check("carol login fine", r.status_code == 200)

# unknown username lock unlock 404
r = client.post("/api/admin/locks/no-such-user/unlock", headers=admin_hdr)
check("unlock unknown 404", r.status_code == 404)

# client rate limit: 20 attempts per minute then 429 (correct creds avoid the lock path)
limited = None
for i in range(30):
    r = client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "pw-bob"},
        environ_base={"REMOTE_ADDR": "9.9.9.9"},
    )
    if r.status_code == 429:
        limited = i + 1
        ra = r.headers.get("Retry-After")
        check("rate 429 Retry-After", ra is not None and 1 <= int(ra) <= 60)
        check("rate error json", r.get_json().get("error") == "too_many_requests")
        break
check("limited after 20", limited == 21)
r = client.post(
    "/api/auth/login",
    json={"username": "bob", "password": "pw-bob"},
    environ_base={"REMOTE_ADDR": "8.8.8.8"},
)
check("other ip ok", r.status_code == 200)

# time-based: patch now() to simulate lock expiry and client window slide
client.post("/api/auth/register", json={"username": "erin", "password": "pw-erin"})
IP[0] = "5.5.5.5"
for i in range(5):
    post_login("erin", "bad")
r = post_login("erin", "pw-erin")
check("erin locked", r.status_code == 429)
real_now = appmod.now
try:
    appmod.now = lambda: real_now() + 16 * 60
    r = client.post(
        "/api/auth/login",
        json={"username": "bob", "password": "pw-bob"},
        environ_base={"REMOTE_ADDR": "9.9.9.9"},
    )
    check("client window slides", r.status_code == 200)
    r = post_login("erin", "pw-erin")
    check("lock expires after 15 min", r.status_code == 200)
finally:
    appmod.now = real_now

# persistence across app restart (same DB file)
import sqlite3
conn = sqlite3.connect(os.path.join(workdir, "data", "app.db"))
n = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
conn.close()
check("data under ./data persists", n >= 4)

# frontend serving
os.makedirs("/workspace/frontend/dist", exist_ok=True)
r = client.get("/")
check("index served", r.status_code == 200 and b'<div id="root">' in r.data)
r = client.get("/some/spa/route")
check("spa fallback", r.status_code == 200)
r = client.get("/api/nope")
check("unknown api 404", r.status_code == 404)

print("ALL PASS")
shutil.rmtree(workdir, ignore_errors=True)
