"""Tests for the gallery JSON API."""

import base64
import importlib
import sys
import tempfile
from pathlib import Path

import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = BASE_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

PNG = base64.b64encode(
    b"\x89PNG\r\n\x1a\n"
    + b"\x00\x00\x00\rIHDR"
    + b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00"
    + b"\x1f\x15\xc4\x89"
    + b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
    + b"\x00\x00\x00\x00IEND\xaeB`\x82"
).decode()
JPEG = base64.b64encode(
    b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"\x00" * 32 + b"\xff\xd9"
).decode()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("GALLERY_DATA_DIR", str(tmp_path))
    for name in list(sys.modules):
        if name == "backend.app" or name.startswith("backend.app."):
            del sys.modules[name]
    package = importlib.import_module("backend")
    package.__path__ = [str(BASE_DIR)]
    module = importlib.import_module("backend.app")
    module.app.config.update(TESTING=True)
    return module.app.test_client()


def register(client, username="alice", password="secret"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def login(client, username="alice", password="secret"):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200
    return r.get_json()["token"]


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def upload(client, token, filename="pic.png", data=PNG, **extra):
    payload = {"filename": filename, "data": data, **extra}
    return client.post("/api/images", json=payload, headers=auth(token))


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json() == {"status": "ok"}


def test_register_and_login(client):
    assert register(client).status_code == 201
    assert register(client).status_code == 409
    assert login(client)
    r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
    assert r.status_code == 401
    assert register(client, "bob").status_code == 201


def test_upload_requires_auth(client):
    r = client.post("/api/images", json={"filename": "a.png", "data": PNG})
    assert r.status_code == 401
    register(client)
    assert upload(client, "not-a-token").status_code == 401


def test_upload_and_description(client):
    register(client)
    token = login(client)
    r = upload(client, token, title=" Holiday ")
    assert r.status_code == 201
    item = r.get_json()
    assert item["id"] == 1
    assert item["filename"] == "pic.png"
    assert item["title"] == "Holiday"
    assert item["content_type"] == "image/png"
    assert item["size_bytes"] > 0
    assert item["uploaded_at"].endswith("Z")
    assert item["uploader"] == "alice"
    assert item["url"] == f"/api/images/{item['id']}/file"

    assert client.get(f"/api/images/{item['id']}").get_json() == item


def test_file_bytes_and_content_type(client):
    register(client)
    token = login(client)
    item = upload(client, token).get_json()
    r = client.get(item["url"])
    assert r.status_code == 200
    assert r.content_type == "image/png"
    assert r.data == base64.b64decode(PNG)


def test_format_from_content_not_filename(client):
    register(client)
    token = login(client)
    jpeg = upload(client, token, filename="mislabelled.png", data=JPEG).get_json()
    assert jpeg["content_type"] == "image/jpeg"
    assert client.get(jpeg["url"]).content_type == "image/jpeg"
    bad = upload(client, token, filename="x.png", data=base64.b64encode(b"not an image").decode())
    assert bad.status_code == 400
    assert "error" in bad.get_json()
    invalid = upload(client, token, filename="x.png", data="%%%not base64%%%")
    assert invalid.status_code == 400


def test_same_filename_is_separate_images(client):
    register(client)
    token = login(client)
    first = upload(client, token, filename="same.png").get_json()
    second = upload(client, token, filename="same.png").get_json()
    assert first["id"] != second["id"]
    assert first["url"] != second["url"]
    listing = client.get("/api/images").get_json()
    assert listing["total"] == 2
    assert {i["id"] for i in listing["items"]} == {first["id"], second["id"]}


def test_paging_newest_first(client):
    register(client)
    token = login(client)
    ids = [upload(client, token, filename=f"{i}.png").get_json()["id"] for i in range(5)]
    listing = client.get("/api/images?page=2&page_size=2").get_json()
    assert listing == {
        "items": [client.get(f"/api/images/{i}").get_json() for i in [ids[2], ids[1]]],
        "total": 5,
        "page": 2,
        "page_size": 2,
    }
    first_page = client.get("/api/images").get_json()
    assert [i["id"] for i in first_page["items"]] == list(reversed(ids))
    assert first_page["page"] == 1
    assert first_page["page_size"] == 20
    assert client.get("/api/images?page_size=999").get_json()["page_size"] == 100


def test_delete_permissions(client):
    register(client)
    register(client, "bob")
    token_a = login(client)
    token_b = login(client, "bob")
    item = upload(client, token_a).get_json()

    assert client.delete(f"/api/images/{item['id']}").status_code == 401
    assert client.delete(f"/api/images/{item['id']}", headers=auth("bogus")).status_code == 401
    assert client.delete(f"/api/images/{item['id']}", headers=auth(token_b)).status_code == 403
    assert client.get(item["url"]).status_code == 200

    assert client.delete(f"/api/images/{item['id']}", headers=auth(token_a)).status_code == 200
    assert client.get(f"/api/images/{item['id']}").status_code == 404
    assert client.get(item["url"]).status_code == 404
    assert client.delete(f"/api/images/{item['id']}", headers=auth(token_a)).status_code == 404


def test_missing_image(client):
    assert client.get("/api/images/999").status_code == 404
    assert client.get("/api/images/999/file").status_code == 404
