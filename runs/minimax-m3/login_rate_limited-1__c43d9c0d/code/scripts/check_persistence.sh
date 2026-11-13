#!/usr/bin/env bash
# Verify that data survives a restart and that admin sign-in is disabled
# when ADMIN_PASSWORD is not set.
set -u
cd /workspace
pkill -f "[g]unicorn" >/dev/null 2>&1
sleep 1
rm -rf data

FAILED=0
start() {
  .venv/bin/gunicorn --bind 127.0.0.1:8000 --pythonpath backend app:app > /tmp/gunicorn-persist.log 2>&1 &
  SRV=$!
  sleep 3
}
stop() {
  kill $SRV >/dev/null 2>&1
  wait $SRV 2>/dev/null
}

echo "== first start =="
start
.venv/bin/python - <<'PY'
import json, urllib.request, urllib.error

def call(method, path, payload=None, token=None):
    req = urllib.request.Request(
        f"http://127.0.0.1:8000{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

status, _ = call("POST", "/api/auth/register", {"username": "persisted", "password": "pw"})
assert status == 201, status
status, body = call("POST", "/api/auth/login", {"username": "persisted", "password": "pw"})
assert status == 200, status
with open("/workspace/.tmp-token", "w") as fh:
    fh.write(body["token"])
print("registered and signed in")
PY
stop

echo "== restart with the same data directory =="
start
TOKEN=$(cat /workspace/.tmp-token)
.venv/bin/python - "$TOKEN" <<'PY'
import json, sys, urllib.request, urllib.error

token = sys.argv[1]

def call(method, path, payload=None):
    req = urllib.request.Request(
        f"http://127.0.0.1:8000{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

status, body = call("GET", "/api/me")
assert status == 200 and body["username"] == "persisted", (status, body)
print("session and account survived the restart")
PY
stop
rm -f /workspace/.tmp-token

echo "== restart without ADMIN_PASSWORD =="
unset ADMIN_PASSWORD
start
.venv/bin/python - <<'PY'
import json, urllib.request, urllib.error

def call(method, path, payload=None):
    req = urllib.request.Request(
        f"http://127.0.0.1:8000{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

status, body = call("POST", "/api/auth/login", {"username": "admin", "password": "admin-pw"})
assert status == 401, (status, body)
status, body = call("POST", "/api/auth/login", {"username": "persisted", "password": "pw"})
assert status == 200, (status, body)
print("admin sign-in disabled without ADMIN_PASSWORD")
PY
stop

echo "persistence checks passed"
