import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture
def make_app(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    mod = importlib.import_module("app")

    def factory(password="s3cret-admin"):
        return mod.create_app(data_dir=tmp_path / "data", admin_password=password)

    return factory


@pytest.fixture
def client(make_app):
    return make_app().test_client()


def admin_headers(client, password="s3cret-admin"):
    r = client.post("/api/auth/login", json={"username": "admin", "password": password})
    assert r.status_code == 200, r.get_json()
    return {"Authorization": f"Bearer {r.get_json()['token']}"}


def test_health(client):
    assert client.get("/api/health").get_json() == {"status": "ok"}


def test_seed_and_sorting(client):
    items = client.get("/api/stores").get_json()["items"]
    assert len(items) == 8
    names = [s["name"] for s in items]
    assert names == sorted(names, key=str.casefold)
    assert set(items[0]) == {"id", "name", "address", "phone", "latitude", "longitude", "distance_km"}
    assert all(s["distance_km"] is None for s in items)


def test_seed_only_once(make_app, tmp_path):
    a = make_app().test_client()
    h = admin_headers(a)
    sid = a.get("/api/stores").get_json()["items"][0]["id"]
    assert a.delete(f"/api/admin/stores/{sid}", headers=h).status_code == 204
    b = make_app().test_client()
    assert len(b.get("/api/stores").get_json()["items"]) == 7


def test_nearby(client):
    r = client.get("/api/stores?lat=39.80&lng=-89.65&radius=10")
    items = r.get_json()["items"]
    assert len(items) == 3
    d = [s["distance_km"] for s in items]
    assert d == sorted(d) and all(x <= 10 for x in d)
    far = client.get("/api/stores?lat=39.80&lng=-89.65&radius=500").get_json()["items"]
    assert len(far) == 8
    assert client.get("/api/stores?lat=abc&lng=1").status_code == 400
    assert client.get("/api/stores?lat=1").status_code == 400
    assert client.get("/api/stores?lat=1&lng=1&radius=-1").status_code == 400


def test_search(client):
    items = client.get("/api/stores?q=chicago").get_json()["items"]
    assert {s["name"] for s in items} == {"Loop Central", "Lakeview Shop"}
    items = client.get("/api/stores?q=loop&lat=41.88&lng=-87.63&radius=5").get_json()["items"]
    assert [s["name"] for s in items] == ["Loop Central"]
    assert client.get("/api/stores?q=%25").get_json()["items"] == []


def test_get_one(client):
    sid = client.get("/api/stores").get_json()["items"][0]["id"]
    assert client.get(f"/api/stores/{sid}").get_json()["id"] == sid
    assert client.get("/api/stores/99999").status_code == 404


def test_register_login(client):
    r = client.post("/api/auth/register", json={"username": "alice", "password": "password1"})
    assert r.status_code == 201
    assert client.post("/api/auth/register", json={"username": "alice", "password": "password1"}).status_code == 409
    assert client.post("/api/auth/register", json={"username": "admin", "password": "password1"}).status_code == 409
    assert client.post("/api/auth/register", json={"username": "x"}).status_code == 400
    r = client.post("/api/auth/login", json={"username": "alice", "password": "password1"})
    assert r.status_code == 200 and r.get_json()["token"]
    assert client.post("/api/auth/login", json={"username": "alice", "password": "nope"}).status_code == 401
    h = {"Authorization": f"Bearer {r.get_json()['token']}"}
    r = client.post("/api/admin/stores", headers=h, json={"name": "x"})
    assert r.status_code == 403


def test_admin_requires_auth(client):
    assert client.post("/api/admin/stores", json={}).status_code == 401
    assert client.put("/api/admin/stores/1", json={}).status_code == 401
    assert client.delete("/api/admin/stores/1").status_code == 401
    assert client.delete("/api/admin/stores/1", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_admin_disabled_without_password(make_app):
    c = make_app(password="").test_client()
    assert c.post("/api/auth/login", json={"username": "admin", "password": ""}).status_code in (400, 401)
    assert c.post("/api/auth/login", json={"username": "admin", "password": "admin"}).status_code == 401


def test_admin_token_invalid_after_password_change(make_app):
    c = make_app().test_client()
    h = admin_headers(c)
    c2 = make_app(password="other-password").test_client()
    assert c2.delete("/api/admin/stores/1", headers=h).status_code == 401
    c3 = make_app(password="").test_client()
    assert c3.delete("/api/admin/stores/1", headers=h).status_code == 401


def test_crud(client):
    h = admin_headers(client)
    body = {"name": "New Store", "address": "1 Test Rd", "phone": "+1 555 0000", "latitude": 10, "longitude": 20}
    r = client.post("/api/admin/stores", headers=h, json=body)
    assert r.status_code == 201
    s = r.get_json()
    assert s["name"] == "New Store" and s["phone"] == "+1 555 0000" and s["latitude"] == 10
    r = client.put(f"/api/admin/stores/{s['id']}", headers=h,
                   json={"name": "Renamed", "address": "2 Test Rd", "latitude": 11, "longitude": 21})
    assert r.status_code == 200
    u = r.get_json()
    assert u["name"] == "Renamed" and u["phone"] is None
    assert client.get(f"/api/stores/{s['id']}").get_json()["phone"] is None
    assert client.put("/api/admin/stores/99999", headers=h, json=body).status_code == 404
    assert client.delete(f"/api/admin/stores/{s['id']}", headers=h).status_code == 204
    assert client.get(f"/api/stores/{s['id']}").status_code == 404
    assert client.delete(f"/api/admin/stores/{s['id']}", headers=h).status_code == 404


def test_validation(client):
    h = admin_headers(client)
    r = client.post("/api/admin/stores", headers=h, json={"name": "", "latitude": 100, "longitude": "x"})
    assert r.status_code == 400
    errs = r.get_json()["errors"]
    assert set(errs) >= {"name", "address", "latitude", "longitude"}
    r = client.post("/api/admin/stores", headers=h, data="nope", content_type="application/json")
    assert r.status_code == 400
    r = client.post("/api/admin/stores", headers=h,
                    json={"name": "a", "address": "b", "latitude": True, "longitude": 0})
    assert r.status_code == 400
