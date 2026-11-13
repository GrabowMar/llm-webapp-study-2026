import sys

sys.path.insert(0, "backend")
from app import app

c = app.test_client()


def show(label, r):
    try:
        body = r.get_json()
    except Exception:
        body = r.data[:80]
    print(label, r.status_code, body)


show("health", c.get("/api/health"))
show("register", c.post("/api/auth/register", json={"username": "zed", "password": "pw"}))
r = c.post("/api/auth/login", json={"username": "zed", "password": "pw"})
show("login", r)
tok = r.get_json()["token"]
h = {"Authorization": f"Bearer {tok}"}
show(
    "track disp",
    c.post(
        "/api/tracks",
        json={"title": "T", "artist": "A", "url": "https://x/y.mp3", "duration": 95.6},
        headers=h,
    ),
)
show(
    "track clock",
    c.post(
        "/api/tracks",
        json={"title": "T2", "url": "http://x/y.mp3", "duration": "1:02:03"},
        headers=h,
    ),
)
show(
    "track bad proto",
    c.post("/api/tracks", json={"title": "T3", "url": "file:///etc/passwd"}, headers=h),
)
show(
    "track bad host",
    c.post("/api/tracks", json={"title": "T4", "url": "https://"}, headers=h),
)
show(
    "track neg dur",
    c.post(
        "/api/tracks",
        json={"title": "T5", "url": "https://x/y.mp3", "duration": -5},
        headers=h,
    ),
)
show("list", c.get("/api/tracks?page_size=1&page=1"))
show("list cap", c.get("/api/tracks?page_size=9999"))
show("search pct", c.get("/api/tracks?q=%25"))
show("plays", c.post("/api/tracks/1/plays"))
show("delete other none", c.delete("/api/tracks/1"))
show("delete own", c.delete("/api/tracks/1", headers=h))
show("get gone", c.get("/api/tracks/1"))
