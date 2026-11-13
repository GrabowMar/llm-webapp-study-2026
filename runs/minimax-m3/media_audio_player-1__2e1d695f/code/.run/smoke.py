import json
import urllib.error
import urllib.request

BASE = "http://localhost:8000/api"
failures = []


def call(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return err.code, raw


def check(name, condition, extra=""):
    if condition:
        print(f"PASS  {name}")
    else:
        failures.append(name)
        print(f"FAIL  {name} {extra}")


# health
status, body = call("GET", "/health")
check("health", status == 200 and body == {"status": "ok"}, body)

# register
status, body = call("POST", "/auth/register", {"username": "smoke_user", "password": "hunter2"})
check("register 201", status == 201, (status, body))
token = body["token"] if isinstance(body, dict) else None

status, body = call("POST", "/auth/register", {"username": "smoke_user", "password": "hunter2"})
check("duplicate register rejected", status in (400, 409), (status, body))

status, body = call("POST", "/auth/register", {"username": "", "password": "x"})
check("register validation", status == 400 and "username" in body.get("errors", {}), (status, body))

# login
status, body = call("POST", "/auth/login", {"username": "smoke_user", "password": "hunter2"})
check("login 200 + token", status == 200 and isinstance(body.get("token"), str), (status, body))
token = body["token"]

status, body = call("POST", "/auth/login", {"username": "smoke_user", "password": "nope"})
check("bad login 401", status == 401, (status, body))

# create tracks
status, body = call(
    "POST",
    "/tracks",
    {"title": "Sunrise", "artist": "The Dawn", "url": "https://cdn.example.com/1.mp3", "duration": 214},
    token,
)
check("create track 201", status == 201, (status, body))
track = body
check("track fields", all(k in track for k in
      ("id", "title", "artist", "url", "duration", "play_count", "created_at", "added_by")), track)
check("added_by is username", track["added_by"] == "smoke_user", track)
check("play_count starts at 0", track["play_count"] == 0, track)
first_id = track["id"]

status, body = call("POST", "/tracks", {"title": "Second", "artist": "Someone", "url": "http://cdn.example.com/2.mp3"}, token)
check("create second track", status == 201, (status, body))
second_id = body["id"]

status, body = call("POST", "/tracks", {"title": "Bad", "url": "ftp://example.com/3.mp3"}, token)
check("non-http url rejected", status == 400 and "url" in body.get("errors", {}), (status, body))

status, body = call("POST", "/tracks", {"title": "Bad", "url": "file:///etc/passwd"}, token)
check("file url rejected", status == 400, (status, body))

status, body = call("POST", "/tracks", {"title": "No auth", "url": "https://example.com/4.mp3"})
check("create without token 401", status == 401, (status, body))

status, body = call("POST", "/tracks", {"title": "Bad token", "url": "https://example.com/4.mp3"}, "not-a-real-token")
check("create with bad token 401", status == 401, (status, body))

status, body = call("POST", "/tracks", {"url": "https://example.com/5.mp3"}, token)
check("missing title rejected", status == 400 and "title" in body.get("errors", {}), (status, body))

# list
status, body = call("GET", "/tracks")
check("list shape", status == 200 and set(body) == {"items", "total", "page", "page_size"}, (status, body))
check("newest first", body["items"][0]["id"] == second_id, body["items"][0])
check("default page", body["page"] == 1, body)

status, body = call("GET", "/tracks?page=2&page_size=1")
check("paging", body["page"] == 2 and body["page_size"] == 1 and len(body["items"]) == 1, body)
check("total counts all", body["total"] == 2, body)

status, body = call("GET", "/tracks?q=dawn")
check("search by artist", body["total"] == 1 and body["items"][0]["id"] == first_id, body)

status, body = call("GET", "/tracks?q=SUN")
check("search case insensitive", body["total"] == 1, body)

status, body = call("GET", "/tracks?q=nothing-matches")
check("search miss", body["total"] == 0 and body["items"] == [], body)

# get one
status, body = call("GET", f"/tracks/{first_id}")
check("get track", status == 200 and body["id"] == first_id, (status, body))

status, body = call("GET", "/tracks/999999")
check("get missing track 404", status == 404, (status, body))

# plays
status, body = call("POST", f"/tracks/{first_id}/plays")
check("play increments", status == 200 and body["play_count"] == 1, (status, body))
status, body = call("POST", f"/tracks/{first_id}/plays")
check("play increments again", body["play_count"] == 2, body)
status, body = call("POST", "/tracks/999999/plays")
check("play missing track 404", status == 404, (status, body))

# permissions
call("POST", "/auth/register", {"username": "other_user", "password": "hunter2"})
status, body = call("POST", "/auth/login", {"username": "other_user", "password": "hunter2"})
other_token = body["token"]

status, body = call("DELETE", f"/tracks/{first_id}", None, other_token)
check("delete other user's track forbidden", status in (403, 404), (status, body))

status, body = call("DELETE", f"/tracks/{first_id}")
check("delete without token 401", status == 401, (status, body))

status, body = call("DELETE", f"/tracks/{first_id}", None, token)
check("owner can delete", status == 200, (status, body))

status, body = call("GET", f"/tracks/{first_id}")
check("deleted track gone", status == 404, (status, body))

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    raise SystemExit(1)
print("all checks passed")
