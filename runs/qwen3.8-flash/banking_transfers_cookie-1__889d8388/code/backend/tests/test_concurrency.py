import os
import shutil
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

tmp = tempfile.mkdtemp()
import app as appmod

appmod.DB_PATH = Path(tmp) / "bank.db"
appmod.DATA_DIR = Path(tmp) / "data"
appmod.init_db()
client = appmod.app.test_client()

client.post("/api/auth/register", json={"username": "alice", "password": "pw"})
client.post("/api/auth/register", json={"username": "bob", "password": "pw"})
alice = client.post("/api/auth/login", json={"username": "alice", "password": "pw"}).get_json()["token"]
bob = client.post("/api/auth/login", json={"username": "bob", "password": "pw"}).get_json()["token"]
csrf = client.get("/api/auth/csrf", headers={"Authorization": f"Bearer {alice}"}).get_json()["csrf_token"]

errors = []


def hammer(n):
    c = appmod.app.test_client()
    for _ in range(n):
        r = c.post(
            "/api/transfers",
            json={"to_username": "bob", "amount": 10},
            headers={"Authorization": f"Bearer {alice}", "X-CSRF-Token": csrf},
        )
        if r.status_code not in (201, 400):
            errors.append(r.status_code)


threads = [threading.Thread(target=hammer, args=(10,)) for _ in range(8)]
for t in threads:
    t.start()
for t in threads:
        t.join()

a = client.get("/api/account", headers={"Authorization": f"Bearer {alice}"}).get_json()["balance"]
b = client.get("/api/account", headers={"Authorization": f"Bearer {bob}"}).get_json()["balance"]
total = client.get("/api/transfers?page_size=100", headers={"Authorization": f"Bearer {alice}"}).get_json()["total"]

print("errors:", errors)
print("alice:", a, "bob:", b, "transfers:", total)
assert a + b == 2000.0, "money not conserved"
assert a == 1000.0 - 10 * total and b == 1000.0 + 10 * total, "balances inconsistent"
assert not errors, "unexpected status codes"

# persistence across "restart": new module-level connection to same file
import sqlite3

conn = sqlite3.connect(appmod.DB_PATH)
n = conn.execute("SELECT COUNT(*) FROM transfers").fetchone()[0]
assert n == total
bal = conn.execute("SELECT balance_cents FROM users WHERE username='alice'").fetchone()[0]
assert bal == int(a * 100)
print("persisted ok, transfers in db:", n)
shutil.rmtree(tmp)
print("CONCURRENCY TEST PASSED")
