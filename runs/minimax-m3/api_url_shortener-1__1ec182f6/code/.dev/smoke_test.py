"""Smoke test for the URL shortener API (development helper, not shipped)."""

import os
import sys

import requests

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8011")

failures = 0


def check(label, condition, extra=""):
    global failures
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {label} {extra}")
    if not condition:
        failures += 1


def main():
    s = requests.Session()

    r = s.get(f"{BASE}/api/health")
    check("health", r.status_code == 200 and r.json() == {"status": "ok"}, r.text)

    r = s.post(f"{BASE}/api/auth/register", json={"username": "alice", "password": "secret123"})
    check("register alice", r.status_code == 201, r.text)

    r = s.post(f"{BASE}/api/auth/register", json={"username": "alice", "password": "secret123"})
    check("register duplicate", r.status_code == 409, r.text)

    r = s.post(f"{BASE}/api/auth/register", json={"username": "", "password": "x"})
    check("register empty username", r.status_code == 400, r.text)

    r = s.post(f"{BASE}/api/auth/register", json={"username": "bob", "password": "secret123"})
    check("register bob", r.status_code == 201, r.text)

    r = s.post(f"{BASE}/api/auth/login", json={"username": "alice", "password": "secret123"})
    check("login alice", r.status_code == 200 and "token" in r.json(), r.text)
    token_a = r.json().get("token")

    r = s.post(f"{BASE}/api/auth/login", json={"username": "alice", "password": "wrong"})
    check("login wrong password", r.status_code == 401, r.text)

    admin_password = os.environ.get("ADMIN_PASSWORD", "adminpass")
    r = s.post(f"{BASE}/api/auth/login", json={"username": "admin", "password": admin_password})
    expected = 200 if admin_password else 401
    check("admin login", r.status_code == expected, r.text)
    admin_token = r.json().get("token") if r.status_code == 200 else None

    headers_a = {"Authorization": f"Bearer {token_a}"}

    r = s.post(f"{BASE}/api/links", json={"url": "ftp://example.com/file"}, headers=headers_a)
    check("create bad scheme", r.status_code == 400, r.text)
    check("bad scheme message", bool(r.json().get("message")), r.text)

    r = s.post(f"{BASE}/api/links", json={"url": "example.com"}, headers=headers_a)
    check("create missing scheme", r.status_code == 400, r.text)

    r = s.post(f"{BASE}/api/links", json={"url": "https://example.com/one"}, headers=headers_a)
    check("create link", r.status_code == 201, r.text)
    link1 = r.json()
    for key in ("id", "original_url", "short_code", "click_count", "created_at", "short_url", "owner"):
        check(f"link has {key}", key in link1, str(link1))
    check(
        "short_url path",
        link1["short_url"].endswith(f"/r/{link1['short_code']}"),
        link1["short_url"],
    )

    r = s.post(f"{BASE}/api/links", json={"original_url": "https://example.com/two"}, headers=headers_a)
    check("create link alt field", r.status_code == 201, r.text)
    link2 = r.json()

    r = s.post(f"{BASE}/api/links", json={"url": "https://example.com/three"})
    check("create without token", r.status_code == 401, r.text)

    r = s.get(f"{BASE}/api/links")
    check("list links", r.status_code == 200, r.text)
    payload = r.json()
    for key in ("items", "total", "page", "page_size"):
        check(f"list has {key}", key in payload, str(payload))
    check("list total", payload["total"] == 2, str(payload))
    check("list newest first", payload["items"][0]["id"] == link2["id"], str(payload["items"]))

    r = s.get(f"{BASE}/api/links?page=1&page_size=1")
    check("list paging", len(r.json()["items"]) == 1 and r.json()["page_size"] == 1, r.text)

    r = s.get(f"{BASE}/api/links/{link1['id']}")
    check("get link", r.status_code == 200 and r.json()["id"] == link1["id"], r.text)

    r = s.get(f"{BASE}/api/links/999999")
    check("get missing link", r.status_code == 404, r.text)

    r = s.get(f"{BASE}/r/{link1['short_code']}", allow_redirects=False)
    check("redirect status", r.status_code == 302, str(r.status_code))
    check("redirect location", r.headers.get("Location") == "https://example.com/one", str(r.headers))
    r = s.get(f"{BASE}/api/links/{link1['id']}")
    check("click counted", r.json()["click_count"] == 1, r.text)

    r = s.get(f"{BASE}/r/unknowncode")
    check("redirect unknown", r.status_code == 404, r.text)

    r = s.post(f"{BASE}/api/auth/login", json={"username": "bob", "password": "secret123"})
    token_b = r.json()["token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}
    r = s.delete(f"{BASE}/api/links/{link1['id']}", headers=headers_b)
    check("delete other user link", r.status_code in (403, 404), r.text)

    r = s.delete(f"{BASE}/api/links/{link2['id']}")
    check("delete without token", r.status_code == 401, r.text)

    r = s.delete(f"{BASE}/api/links/{link2['id']}", headers=headers_a)
    check("delete own link", r.status_code in (200, 204), r.text)
    r = s.get(f"{BASE}/api/links/{link2['id']}")
    check("deleted link gone", r.status_code == 404, r.text)

    r = s.get(f"{BASE}/api/admin/links", headers=headers_a)
    check("admin list as user", r.status_code == 403, r.text)
    r = s.get(f"{BASE}/api/admin/links")
    check("admin list no token", r.status_code == 401, r.text)

    if admin_token:
        headers_admin = {"Authorization": f"Bearer {admin_token}"}
        r = s.get(f"{BASE}/api/admin/links", headers=headers_admin)
        check("admin list", r.status_code == 200, r.text)
        payload = r.json()
        check("admin list total", payload["total"] == 1, str(payload))
        check("admin list owner", payload["items"][0]["owner"] == "alice", str(payload))

        r = s.post(f"{BASE}/api/admin/links/{link1['id']}/toggle", headers=headers_admin)
        check("admin toggle", r.status_code == 200, r.text)
        r = s.get(f"{BASE}/api/links/{link1['id']}")
        check("disabled link 404", r.status_code == 404, r.text)
        r = s.get(f"{BASE}/r/{link1['short_code']}")
        check("disabled link no redirect", r.status_code == 404, r.text)
        r = s.get(f"{BASE}/api/links")
        check("disabled link hidden", r.json()["total"] == 0, r.text)
        r = s.get(f"{BASE}/api/admin/links", headers=headers_admin)
        check("disabled link visible to admin", r.json()["total"] == 1, r.text)
        r = s.post(f"{BASE}/api/admin/links/{link1['id']}/toggle", headers=headers_admin)
        check("admin re-enable", r.status_code == 200 and r.json()["is_active"] is True, r.text)
        r = s.get(f"{BASE}/api/links/{link1['id']}")
        check("re-enabled link visible", r.status_code == 200, r.text)

    r = s.get(f"{BASE}/")
    check(
        "frontend served",
        r.status_code == 200 and "text/html" in r.headers.get("Content-Type", ""),
        r.headers.get("Content-Type"),
    )

    print()
    if failures:
        print(f"{failures} checks failed")
        sys.exit(1)
    print("all checks passed")


if __name__ == "__main__":
    main()
