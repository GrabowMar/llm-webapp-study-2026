"""API tests for the bank application.

Run with:  python -m pytest backend/tests
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402

TMP_DIR = tempfile.mkdtemp(prefix="bank-tests-")
os.environ["BANK_DATA_DIR"] = TMP_DIR

from bank import db  # noqa: E402

db.DATA_DIR = Path(TMP_DIR)
db.DB_PATH = Path(TMP_DIR) / "bank.sqlite3"

import app as app_module  # noqa: E402


@pytest.fixture()
def client():
    app_module.app.config["TESTING"] = True
    for suffix in ("", "-wal", "-shm"):
        leftover = Path(str(db.DB_PATH) + suffix)
        if leftover.exists():
            leftover.unlink()
    db.init_db()
    with app_module.app.test_client() as test_client:
        yield test_client


def register(client, username="alice", password="secret123"):
    return client.post(
        "/api/auth/register", json={"username": username, "password": password}
    )


def login(client, username="alice", password="secret123"):
    return client.post(
        "/api/auth/login", json={"username": username, "password": password}
    )


def sign_in(client, username="alice", password="secret123"):
    """Register (if needed) and sign in, returning the bearer token."""
    register(client, username, password)
    response = login(client, username, password)
    return response.get_json()["token"]


def auth_headers(token, csrf=None):
    headers = {"Authorization": f"Bearer {token}"}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    return headers


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_register_creates_account_with_initial_balance(client):
    response = register(client)
    assert response.status_code == 201
    payload = response.get_json()
    assert payload["username"] == "alice"
    assert payload["balance"] == 1000.00


def test_register_rejects_duplicate_username(client):
    register(client)
    response = register(client)
    assert response.status_code == 409
    assert "taken" in response.get_json()["error"].lower()


def test_register_requires_fields(client):
    assert client.post("/api/auth/register", json={"username": ""}).status_code == 400
    assert client.post("/api/auth/register", json={"password": "x"}).status_code == 400
    assert client.post("/api/auth/register", json={}).status_code == 400


def test_login_returns_token(client):
    register(client)
    response = login(client)
    assert response.status_code == 200
    assert response.get_json()["token"]


def test_login_with_wrong_password(client):
    register(client)
    response = login(client, password="nope")
    assert response.status_code == 401


def test_login_unknown_user(client):
    assert login(client, "ghost").status_code == 401


def test_account_requires_token(client):
    assert client.get("/api/account").status_code == 401
    assert (
        client.get("/api/account", headers={"Authorization": "Bearer bogus"}).status_code
        == 401
    )


def test_account_returns_username_and_balance(client):
    token = sign_in(client, "alice")
    response = client.get("/api/account", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.get_json() == {"username": "alice", "balance": 1000.00}


def test_csrf_endpoint(client):
    token = sign_in(client, "alice")
    response = client.get("/api/auth/csrf", headers=auth_headers(token))
    assert response.status_code == 200
    assert response.get_json()["csrf_token"]
    assert client.get("/api/auth/csrf").status_code == 401


def test_logout_invalidates_token(client):
    token = sign_in(client, "alice")
    assert (
        client.post("/api/auth/logout", headers=auth_headers(token)).status_code == 200
    )
    assert client.get("/api/account", headers=auth_headers(token)).status_code == 401


def test_transfer_moves_money(client):
    alice = sign_in(client, "alice")
    bob = sign_in(client, "bob")

    response = client.post(
        "/api/transfers",
        json={"amount": 250.5, "to_username": "bob", "memo": "rent"},
        headers=auth_headers(alice),
    )
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["from_username"] == "alice"
    assert payload["to_username"] == "bob"
    assert payload["amount"] == 250.50
    assert payload["memo"] == "rent"
    assert payload["direction"] == "out"
    assert payload["id"]
    assert payload["created_at"]

    assert (
        client.get("/api/account", headers=auth_headers(alice)).get_json()["balance"]
        == 749.50
    )
    assert (
        client.get("/api/account", headers=auth_headers(bob)).get_json()["balance"]
        == 1250.50
    )

    seen = client.get("/api/transfers", headers=auth_headers(bob)).get_json()["items"]
    assert len(seen) == 1
    assert seen[0]["direction"] == "in"
    assert seen[0]["amount"] == 250.50


def test_transfer_without_memo(client):
    alice = sign_in(client, "alice")
    sign_in(client, "bob")
    response = client.post(
        "/api/transfers",
        json={"amount": 10, "to_username": "bob"},
        headers=auth_headers(alice),
    )
    assert response.status_code == 200
    assert response.get_json()["memo"] == ""


def test_transfer_insufficient_funds(client):
    alice = sign_in(client, "alice")
    bob = sign_in(client, "bob")
    response = client.post(
        "/api/transfers",
        json={"amount": 5000, "to_username": "bob"},
        headers=auth_headers(alice),
    )
    assert response.status_code == 400
    assert "insufficient" in response.get_json()["error"].lower()
    assert (
        client.get("/api/account", headers=auth_headers(alice)).get_json()["balance"]
        == 1000.00
    )
    assert (
        client.get("/api/account", headers=auth_headers(bob)).get_json()["balance"]
        == 1000.00
    )


def test_transfer_unknown_recipient(client):
    alice = sign_in(client, "alice")
    response = client.post(
        "/api/transfers",
        json={"amount": 5, "to_username": "ghost"},
        headers=auth_headers(alice),
    )
    assert response.status_code == 404


def test_transfer_to_self_fails(client):
    alice = sign_in(client, "alice")
    response = client.post(
        "/api/transfers",
        json={"amount": 5, "to_username": "alice"},
        headers=auth_headers(alice),
    )
    assert response.status_code == 400


def test_transfer_invalid_amount(client):
    alice = sign_in(client, "alice")
    sign_in(client, "bob")
    for amount in (0, -5, "abc", None, 10.555):
        response = client.post(
            "/api/transfers",
            json={"amount": amount, "to_username": "bob"},
            headers=auth_headers(alice),
        )
        assert response.status_code == 400, amount


def test_transfers_require_auth(client):
    assert client.get("/api/transfers").status_code == 401
    assert (
        client.post("/api/transfers", json={"amount": 1, "to_username": "bob"}).status_code
        == 401
    )


def test_transfer_listing_is_paged_and_scoped(client):
    alice = sign_in(client, "alice")
    bob = sign_in(client, "bob")
    carol = sign_in(client, "carol")

    for _ in range(3):
        client.post(
            "/api/transfers",
            json={"amount": 5, "to_username": "bob"},
            headers=auth_headers(alice),
        )
    client.post(
        "/api/transfers",
        json={"amount": 7, "to_username": "alice"},
        headers=auth_headers(bob),
    )
    client.post(
        "/api/transfers",
        json={"amount": 9, "to_username": "alice"},
        headers=auth_headers(carol),
    )

    payload = client.get(
        "/api/transfers?page=1&page_size=2", headers=auth_headers(alice)
    ).get_json()
    assert payload["total"] == 5
    assert payload["page"] == 1
    assert payload["page_size"] == 2
    assert len(payload["items"]) == 2

    payload = client.get(
        "/api/transfers?page=2&page_size=2", headers=auth_headers(alice)
    ).get_json()
    assert len(payload["items"]) == 2

    payload = client.get(
        "/api/transfers?page=9&page_size=2", headers=auth_headers(alice)
    ).get_json()
    assert payload["items"] == []
    assert payload["total"] == 5

    # Newest first.
    items = client.get("/api/transfers", headers=auth_headers(alice)).get_json()["items"]
    timestamps = [item["created_at"] for item in items]
    assert timestamps == sorted(timestamps, reverse=True)

    # Carol only sees her own transfer.
    payload = client.get("/api/transfers", headers=auth_headers(carol)).get_json()
    assert payload["total"] == 1
    assert payload["items"][0]["to_username"] == "alice"
    assert payload["items"][0]["direction"] == "out"


def test_transfer_detail_visibility(client):
    alice = sign_in(client, "alice")
    sign_in(client, "bob")
    carol = sign_in(client, "carol")

    created = client.post(
        "/api/transfers",
        json={"amount": 12, "to_username": "bob", "memo": "lunch"},
        headers=auth_headers(alice),
    ).get_json()

    detail = client.get(f"/api/transfers/{created['id']}", headers=auth_headers(sig_in_bob(client)))
    assert detail.status_code == 200
    assert detail.get_json()["id"] == created["id"]
    assert detail.get_json()["direction"] == "in"

    hidden = client.get(f"/api/transfers/{created['id']}", headers=auth_headers(carol))
    assert hidden.status_code == 404


def sig_in_bob(client):
    return sign_in(client, "bob")


def test_csrf_token_is_accepted(client):
    alice = sign_in(client, "alice")
    csrf = client.get("/api/auth/csrf", headers=auth_headers(alice)).get_json()[
        "csrf_token"
    ]
    sign_in(client, "bob")
    response = client.post(
        "/api/transfers",
        json={"amount": 1, "to_username": "bob"},
        headers=auth_headers(alice, csrf),
    )
    assert response.status_code == 200

    bad = client.post(
        "/api/transfers",
        json={"amount": 1, "to_username": "bob"},
        headers=auth_headers(alice, "wrong"),
    )
    assert bad.status_code == 403


def test_unknown_api_route_answers_json(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.is_json


def test_concurrent_transfers_are_atomic(client):
    """Two transfers that cannot both be funded must not partially apply."""
    import threading

    alice = sign_in(client, "alice")
    sign_in(client, "bob")

    results = []
    lock = threading.Lock()

    def send():
        with app_module.app.test_client() as thread_client:
            response = thread_client.post(
                "/api/transfers",
                json={"amount": 600, "to_username": "bob"},
                headers=auth_headers(alice),
            )
        with lock:
            results.append(response.status_code)

    threads = [threading.Thread(target=send) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(results) == [200, 400]
    assert (
        client.get("/api/account", headers=auth_headers(alice)).get_json()["balance"]
        == 400.00
    )
    bob = sign_in(client, "bob")
    assert (
        client.get("/api/account", headers=auth_headers(bob)).get_json()["balance"]
        == 1600.00
    )
    assert client.get("/api/transfers", headers=auth_headers(bob)).get_json()["total"] == 1
