import importlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    import app as app_module

    app_module = importlib.reload(app_module)
    return app_module.app.test_client()


def auth(client, name="alice", pw="secret"):
    assert client.post("/api/auth/register", json={"username": name, "password": pw}).status_code == 201
    r = client.post("/api/auth/login", json={"username": name, "password": pw})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.get_json()['token']}"}


def test_health(client):
    assert client.get("/api/health").get_json() == {"status": "ok"}


def test_auth(client):
    h = auth(client)
    assert client.post("/api/auth/register", json={"username": "alice", "password": "x"}).status_code == 409
    assert client.post("/api/auth/login", json={"username": "alice", "password": "bad"}).status_code == 401
    assert client.post("/api/auth/register", json={"username": "", "password": "x"}).status_code == 400
    assert client.get("/api/notes").status_code == 401
    assert client.get("/api/notes", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/notes", headers=h).status_code == 200


def test_notes_crud_and_isolation(client):
    a = auth(client)
    b = auth(client, "bob")
    r = client.post("/api/notes", json={"title": "First", "body": "# Hello\n\n*x*"}, headers=a)
    assert r.status_code == 201
    n = r.get_json()
    assert set(n) == {"id", "title", "body", "published", "updated_at", "author"}
    assert n["author"] == "alice" and n["published"] is False
    r2 = client.post("/api/notes", json={"title": "Second", "body": "b"}, headers=a).get_json()
    items = client.get("/api/notes", headers=a).get_json()["items"]
    assert [i["id"] for i in items] == [r2["id"], n["id"]]
    assert set(items[0]) == {"id", "title", "published", "updated_at"}
    client.patch(f"/api/notes/{n['id']}", json={"body": "changed"}, headers=a)
    items = client.get("/api/notes", headers=a).get_json()["items"]
    assert items[0]["id"] == n["id"]

    html = client.get(f"/api/notes/{n['id']}/html", headers=a)
    assert html.status_code == 200 and html.mimetype == "text/html"
    assert "<p>changed</p>" in html.get_data(as_text=True)

    for method in ("get", "patch", "delete"):
        assert getattr(client, method)(f"/api/notes/{n['id']}", json={}, headers=b).status_code == 404
    assert client.get(f"/api/notes/{n['id']}/html", headers=b).status_code == 404
    assert client.get("/api/notes", headers=b).get_json() == {"items": []}

    assert client.get(f"/api/public/notes/{n['id']}/html").status_code == 404
    r = client.patch(f"/api/notes/{n['id']}", json={"published": True, "body": "# T"}, headers=a)
    assert r.get_json()["published"] is True
    pub = client.get(f"/api/public/notes/{n['id']}/html")
    assert pub.status_code == 200 and "<h1>T</h1>" in pub.get_data(as_text=True)
    client.patch(f"/api/notes/{n['id']}", json={"published": False}, headers=a)
    assert client.get(f"/api/public/notes/{n['id']}/html").status_code == 404

    assert client.patch(f"/api/notes/{n['id']}", json={"published": "yes"}, headers=a).status_code == 400
    assert client.delete(f"/api/notes/{n['id']}", headers=a).status_code == 204
    assert client.get(f"/api/notes/{n['id']}", headers=a).status_code == 404


def test_sanitized(client):
    a = auth(client)
    n = client.post("/api/notes", json={"title": "x", "body": "<script>alert(1)</script>\n\n[x](javascript:alert(1))"}, headers=a).get_json()
    out = client.get(f"/api/notes/{n['id']}/html", headers=a).get_data(as_text=True)
    assert "<script>" not in out and "href=\"javascript" not in out
