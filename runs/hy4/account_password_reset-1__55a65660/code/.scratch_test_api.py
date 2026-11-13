import json
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, "/workspace/backend")
import app as m

tmp = Path(tempfile.mkdtemp())
m.DATA_DIR = tmp
m.DB_PATH = tmp / "app.sqlite3"
m.init_db()

c = m.app.test_client()


def show(label, r):
    try:
        payload = r.get_json()
    except Exception:
        payload = r.data[:200]
    print(f"{label}: {r.status_code} {json.dumps(payload, default=str)[:400]}")
    return r


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


show("health", c.get("/api/health"))
show("register short pw", c.post("/api/auth/register", json={"username": "a", "password": "short"}))
show("register no email", c.post("/api/auth/register", json={"username": "noemail", "password": "password1"}))
show("register bad email", c.post("/api/auth/register", json={"username": "b", "password": "password1", "email": "nope"}))
show("register alice", c.post("/api/auth/register", json={"username": "alice", "password": "password1", "email": "Alice@Example.com"}))
show("register dup username", c.post("/api/auth/register", json={"username": "alice", "password": "password1"}))
show("register dup email case", c.post("/api/auth/register", json={"username": "alice2", "password": "password1", "email": "ALICE@example.COM"}))
show("register bob", c.post("/api/auth/register", json={"username": "bob", "password": "password2", "email": "bob@example.com"}))

show("me unauth", c.get("/api/me"))
show("me bad token", c.get("/api/me", headers=bearer("nope")))
show("login wrong", c.post("/api/auth/login", json={"username": "alice", "password": "wrong"}))
r = show("login alice", c.post("/api/auth/login", json={"username": "alice", "password": "password1"}))
tok = r.get_json()["token"]
show("me authed", c.get("/api/me", headers=bearer(tok)))
show("password wrong current", c.post("/api/me/password", json={"current_password": "nope", "new_password": "newpassword"}, headers=bearer(tok)))
show("password short new", c.post("/api/me/password", json={"current_password": "password1", "new_password": "short"}, headers=bearer(tok)))
show("password change", c.post("/api/me/password", json={"current_password": "password1", "new_password": "newpassword"}, headers=bearer(tok)))
show("login old pw", c.post("/api/auth/login", json={"username": "alice", "password": "password1"}))
show("login new pw", c.post("/api/auth/login", json={"username": "alice", "password": "newpassword"}))
show("patch email dup", c.patch("/api/me", json={"email": "BOB@example.com"}, headers=bearer(tok)))
show("patch email", c.patch("/api/me", json={"email": "newalice@example.com"}, headers=bearer(tok)))
show("patch email clear", c.patch("/api/me", json={"email": None}, headers=bearer(tok)))
show("me after clear", c.get("/api/me", headers=bearer(tok)))

show("reset unknown", c.post("/api/auth/password-reset", json={"username": "ghost"}))
show("reset noemail acct", c.post("/api/auth/password-reset", json={"username": "noemail"}))
show("outbox ghost", c.get("/api/outbox?to=ghost@example.com"))
show("reset by username (no email)", c.post("/api/auth/password-reset", json={"username": "alice"}))
r = show("outbox alice old email", c.get("/api/outbox?to=alice@example.com"))
print("   items:", len(r.get_json()["items"]))

c.patch("/api/me", json={"email": "alice@example.com"}, headers=bearer(tok))
show("reset by email case", c.post("/api/auth/password-reset", json={"email": "ALICE@EXAMPLE.COM"}))
r = show("outbox alice", c.get("/api/outbox?to=Alice@Example.com"))
items = r.get_json()["items"]
print("   items:", len(items), "fields:", sorted(items[0].keys()) if items else None)
assert items, "expected a message"
assert set(items[0].keys()) == {"id", "to", "subject", "body", "sent_at"}, items[0].keys()
body = items[0]["body"]
link = re.search(r"https?://[^\s]+/reset\?token=([^\s]+)", body)
print("   link found:", bool(link))
token = link.group(1) if link else None

show("confirm missing token", c.post("/api/auth/password-reset/confirm", json={"new_password": "resetpw123"}))
show("confirm bad token", c.post("/api/auth/password-reset/confirm", json={"token": "bogus", "new_password": "resetpw123"}))
show("confirm short pw", c.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "short"}))
show("confirm ok", c.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "resetpw123"}))
show("confirm reuse", c.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "anotherpw"}))
show("login after reset old", c.post("/api/auth/login", json={"username": "alice", "password": "newpassword"}))
show("login after reset new", c.post("/api/auth/login", json={"username": "alice", "password": "resetpw123"}))
show("old token invalid after reset", c.get("/api/me", headers=bearer(tok)))

c.post("/api/auth/password-reset", json={"username": "alice"})
c.post("/api/auth/password-reset", json={"username": "alice"})
r = c.get("/api/outbox?to=alice@example.com")
its = r.get_json()["items"]
print("outbox count:", len(its))
print("newest first:", all(its[i]["id"] > its[i + 1]["id"] for i in range(len(its) - 1)))

r = c.post("/api/auth/login", json={"username": "bob", "password": "password2"})
btok = r.get_json()["token"]
show("logout", c.post("/api/auth/logout", headers=bearer(btok)))
show("me after logout", c.get("/api/me", headers=bearer(btok)))

print("ALL DONE")
