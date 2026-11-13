import importlib, os, sys, time
import pytest

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ADMIN_PASSWORD", "adminpass")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
    import app as m
    m = importlib.reload(m)
    return m.app.test_client()

def tok(c, u, p="secret123"):
    c.post("/api/auth/register", json={"username": u, "password": p})
    r = c.post("/api/auth/login", json={"username": u, "password": p})
    return {"Authorization": "Bearer " + r.get_json()["token"]}

def test_flow(client):
    c = client
    assert c.post("/api/auth/register", json={"username": "alice", "password": "secret123"}).status_code == 201
    assert c.post("/api/auth/register", json={"username": "alice", "password": "secret123"}).status_code == 409
    assert c.post("/api/auth/register", json={"username": "admin", "password": "secret123"}).status_code == 409
    assert c.post("/api/auth/login", json={"username": "alice", "password": "bad"}).status_code == 401
    a = tok(c, "alice"); b = tok(c, "bob")
    assert c.post("/api/posts", json={"title": "x", "content": "y"}).status_code == 401
    assert c.post("/api/posts", json={"title": "x", "content": "y"}, headers={"Authorization": "Bearer nope"}).status_code == 401
    r = c.post("/api/posts", json={"title": "", "content": ""}, headers=a)
    assert r.status_code == 400 and "title" in r.get_json()["errors"]
    content = "line1\nline2\r\n" + "z" * 300
    r = c.post("/api/posts", json={"title": "Hello", "content": content, "tags": ["py", "web"]}, headers=a)
    assert r.status_code == 201
    p = r.get_json()
    assert set(["id","title","content","tags","created_at","updated_at","author","excerpt"]) <= set(p)
    assert p["excerpt"] == "line1 line2 " + "z"*(200-13) and p["author"] == "alice"
    time.sleep(0.01)
    r2 = c.post("/api/posts", json={"title": "Second", "content": "abc"}, headers=b).get_json()
    lst = c.get("/api/posts").get_json()
    assert lst["total"] == 2 and lst["items"][0]["id"] == r2["id"] and lst["page"] == 1
    assert c.get("/api/posts?tag=py").get_json()["total"] == 1
    assert c.get("/api/posts?author=bob").get_json()["total"] == 1
    assert c.get("/api/posts?q=hello").get_json()["total"] == 1
    assert len(c.get("/api/posts?page_size=1&page=2").get_json()["items"]) == 1
    assert c.put(f"/api/posts/{p['id']}", json={"title": "H", "content": "c"}, headers=b).status_code == 403
    r = c.put(f"/api/posts/{p['id']}", json={"title": "H2", "content": "c"}, headers=a)
    assert r.status_code == 200 and r.get_json()["tags"] == [] and r.get_json()["updated_at"] != p["updated_at"]
    assert c.delete(f"/api/posts/{p['id']}", headers=b).status_code == 403
    adm = tok(c, "admin", "adminpass")
    assert c.post(f"/api/admin/posts/{r2['id']}/toggle", headers=a).status_code == 403
    assert c.post(f"/api/admin/posts/{r2['id']}/toggle", headers=adm).status_code == 200
    assert c.get(f"/api/posts/{r2['id']}").status_code == 404
    assert c.get(f"/api/posts/{r2['id']}", headers=b).status_code == 404
    assert c.get(f"/api/posts/{r2['id']}", headers=adm).status_code == 200
    assert c.get("/api/posts").get_json()["total"] == 1
    assert c.post(f"/api/admin/posts/{r2['id']}/toggle", headers=adm).status_code == 200
    assert c.get(f"/api/posts/{r2['id']}").status_code == 200
    assert c.delete(f"/api/posts/{p['id']}", headers=a).status_code == 204
    assert c.get(f"/api/posts/{p['id']}").status_code == 404
    assert c.get("/api/health").get_json() == {"status": "ok"}
    assert c.get("/api/nope").status_code == 404

def test_no_admin(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
    import app as m
    m = importlib.reload(m)
    c = m.app.test_client()
    assert c.post("/api/auth/login", json={"username": "admin", "password": ""}).status_code in (400, 401)
    assert c.post("/api/auth/login", json={"username": "admin", "password": "adminpass"}).status_code == 401
