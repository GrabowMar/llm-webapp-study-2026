import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"


def call(method, path, body=None, token=None, raw_body=None):
    req = urllib.request.Request(BASE + path, method=method)
    data = raw_body
    if body is not None:
        data = json.dumps(body).encode()
    if data is not None:
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


s, p = call("POST", "/api/auth/register", {"username": "dave", "password": "password1", "email": "dave@example.com"})
assert s == 201, (s, p)
s, p = call("POST", "/api/auth/login", {"username": "dave", "password": "password1"})
tok = json.loads(p)["token"]

s, p = call("PATCH", "/api/me", {"email": None}, token=tok)
assert s == 200 and json.loads(p)["email"] is None, (s, p)
s, p = call("POST", "/api/auth/password-reset", {"username": "dave"})
assert s == 200
s, p = call("GET", "/api/outbox?to=dave@example.com")
assert json.loads(p)["items"] == [], p

for method, path, tk in [
    ("POST", "/api/auth/register", None),
    ("POST", "/api/auth/login", None),
    ("POST", "/api/me/password", tok),
    ("POST", "/api/auth/password-reset/confirm", None),
    ("PATCH", "/api/me", tok),
]:
    s, p = call(method, path, raw_body=b"not json at all", token=tk)
    assert s == 400, (method, path, s, p)

s, p = call("POST", "/api/auth/login", {})
assert s == 400, (s, p)

s, p = call("POST", "/api/auth/register", {"username": "eve", "password": "password1", "email": ""})
assert s == 201 and json.loads(p)["email"] is None, (s, p)

s, p = call("GET", "/api/nope")
assert s == 404 and "error" in json.loads(p), (s, p)

print("edge cases ok")
