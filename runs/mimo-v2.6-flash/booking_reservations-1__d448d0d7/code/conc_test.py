import json, threading, urllib.request, urllib.error
BASE = "http://127.0.0.1:8000"
def post(path, body, token):
    req = urllib.request.Request(BASE + path, method="POST")
    req.add_header("Content-Type", "application/json")
    if token: req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, data=json.dumps(body).encode(), timeout=15) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
def login(u, p):
    req = urllib.request.Request(BASE + "/api/auth/login", method="POST")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, data=json.dumps({"username": u, "password": p}).encode()) as r:
        return json.load(r)["token"]
import urllib.request as u2
reg = u2.Request(BASE + "/api/auth/register", method="POST")
reg.add_header("Content-Type", "application/json")
try:
    u2.urlopen(reg, data=json.dumps({"username": "load", "password": "pw12345"}).encode())
except urllib.error.HTTPError:
    pass
tok = login("load", "pw12345")
results = []
lock = threading.Lock()
def book():
    st = post("/api/reservations", {"name": "L", "email": "l@x.y", "date": "2026-12-20",
                                    "time": "17:00", "party_size": 1}, tok)
    with lock: results.append(st)
threads = [threading.Thread(target=book) for _ in range(35)]
[t.start() for t in threads]
[t.join() for t in threads]
ok = results.count(201); conflict = results.count(409)
avail = json.load(u2.urlopen(BASE + "/api/availability?date=2026-12-20"))
print({"201": ok, "409": conflict, "other": sorted(set(results) - {201, 409}), "avail": avail})
assert ok == 20 and conflict == 15, "capacity race!"
assert avail["items"][0]["booked"] == 20
print("concurrency OK")
