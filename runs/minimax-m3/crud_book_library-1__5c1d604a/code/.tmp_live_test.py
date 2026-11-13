import json, urllib.request, urllib.error

BASE = "http://127.0.0.1:8000"

def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, (json.loads(raw) if raw else None)

print(call("GET", "/api/health"))
print(call("POST", "/api/auth/register", {"username": "zoe", "password": "pw"}))
status, body = call("POST", "/api/auth/login", {"username": "zoe", "password": "pw"})
token = body["token"]
print(status, list(body))
print(call("POST", "/api/books", {"title": "Solaris", "author": "Stanisław Lem", "year": 1961, "isbn": "9780156027601"}, token))
print(call("GET", "/api/books"))
print(call("POST", "/api/books/1/reviews", {"rating": 5, "comment": "Wonderful"}, token))
print(call("GET", "/api/books/1/reviews"))
print(call("GET", "/api/books/1"))
print(call("PUT", "/api/books/1", {"title": "Solaris", "author": "Stanisław Lem"}, token))
print(call("DELETE", "/api/books/1", None, token))
print(call("GET", "/api/books"))
print(call("GET", "/api/nonexistent"))
