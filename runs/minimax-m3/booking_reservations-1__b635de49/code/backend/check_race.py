"""Concurrency check: parallel bookings must never oversell a slot."""

import json
import os
import threading
import urllib.request
import urllib.error

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8013")
DATE = "2031-05-05"
TIME = "12:00"


def call(method, path, body=None, token=None):
    headers = {}
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read().decode()
        try:
            return err.code, (json.loads(raw) if raw else None)
        except json.JSONDecodeError:
            return err.code, raw


def main():
    users = []
    for i in range(10):
        username = f"race_{i}"
        call("POST", "/api/auth/register", {"username": username, "password": "pw"})
        status, body = call("POST", "/api/auth/login", {"username": username, "password": "pw"})
        users.append(body["token"])

    results = []
    lock = threading.Lock()

    def book(token):
        status, body = call(
            "POST",
            "/api/reservations",
            {"name": "racer", "email": "r@example.com", "date": DATE, "time": TIME, "party_size": 3},
            token,
        )
        with lock:
            results.append(status)

    threads = [threading.Thread(target=book, args=(t,)) for t in users]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    created = results.count(201)
    status, body = call("GET", f"/api/availability?date={DATE}")
    booked = body["items"][0]["booked"] if body["items"] else 0
    print(f"created={created} refused={len(results) - created} booked={booked}")
    assert booked <= 20, "oversold!"
    assert created * 3 == booked, "booked does not match created reservations"
    print("no overselling")


if __name__ == "__main__":
    main()
