"""End-to-end API tests. Run: python3 tests/test_api.py"""

from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUN_DIR = ROOT / ".testrun"
PORT = 8765
BASE = f"http://127.0.0.1:{PORT}"

failures: list[str] = []


def check(name: str, cond: bool, detail: str = ""):
    if cond:
        print(f"  ok  {name}")
    else:
        print(f"  FAIL {name} {detail}")
        failures.append(name)


def api(method: str, path: str, body=None, token: str | None = None):
    req = urllib.request.Request(BASE + path, method=method)
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, data) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            return e.code, json.loads(payload or b"null")
        except json.JSONDecodeError:
            return e.code, payload.decode()


def start_server(with_admin: bool = True) -> subprocess.Popen:
    env = dict(os.environ, PYTHONPATH=str(ROOT / "backend"))
    if with_admin:
        env["ADMIN_PASSWORD"] = "admin123"
    else:
        env.pop("ADMIN_PASSWORD", None)
    proc = subprocess.Popen(
        [sys.executable, "-m", "gunicorn", "--bind", f"127.0.0.1:{PORT}", "--pythonpath", str(ROOT / "backend"), "app:app"],
        cwd=RUN_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 20
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.5):
                st, _ = api("GET", "/api/health")
                if st == 200:
                    return proc
        except OSError:
            pass
        time.sleep(0.2)
    raise RuntimeError("server did not start")


def stop_server(proc: subprocess.Popen):
    proc.terminate()
    proc.wait(timeout=10)


shutil.rmtree(RUN_DIR, ignore_errors=True)
RUN_DIR.mkdir()
proc = start_server()

try:
    print("health")
    st, body = api("GET", "/api/health")
    check("health", st == 200 and body == {"status": "ok"}, str(body))

    print("auth")
    st, _ = api("POST", "/api/auth/register", {"username": "alice", "password": "pw-alice"})
    check("register alice 201", st == 201)
    st, _ = api("POST", "/api/auth/register", {"username": "bob", "password": "pw-bob"})
    check("register bob 201", st == 201)
    st, _ = api("POST", "/api/auth/register", {"username": "alice", "password": "x"})
    check("duplicate 409", st == 409)
    st, _ = api("POST", "/api/auth/register", {"username": "bad name!", "password": "x"})
    check("bad username 400", st == 400)
    st, body = api("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
    check("bad login 401", st == 401)
    st, body = api("POST", "/api/auth/login", {"username": "alice", "password": "pw-alice"})
    check("login alice 200+token", st == 200 and bool(body.get("token")))
    alice = body["token"]
    st, body = api("POST", "/api/auth/login", {"username": "bob", "password": "pw-bob"})
    bob = body["token"]
    st, body = api("POST", "/api/auth/login", {"username": "admin", "password": "admin123"})
    check("admin login", st == 200)
    admin = body["token"]

    print("scores")
    st, _ = api("POST", "/api/scores", {"score": 10})
    check("score without token 401", st == 401)
    st, _ = api("POST", "/api/scores", {"score": 10}, token="bogus")
    check("score bad token 401", st == 401)
    st, body = api("POST", "/api/scores", {"score": 100}, token=alice)
    check("alice 100 rank1 pb", st == 201 and body["rank"] == 1 and body["personal_best"] is True, str(body))
    check("score shape", {"id", "score", "achieved_at", "is_hidden", "player"} <= set(body), str(body))
    check("player alice", body["player"] == "alice")
    st, body = api("POST", "/api/scores", {"score": 50}, token=alice)
    check("alice 50 pb false", body["personal_best"] is False and body["rank"] == 1, str(body))
    st, body = api("POST", "/api/scores", {"score": 300}, token=alice)
    check("alice 300 pb true", body["personal_best"] is True and body["rank"] == 1)
    st, body = api("POST", "/api/scores", {"score": 200}, token=bob)
    check("bob 200 rank2 pb", st == 201 and body["rank"] == 2 and body["personal_best"] is True)
    st, _ = api("POST", "/api/scores", {"score": -5}, token=alice)
    check("negative 400", st == 400)
    st, _ = api("POST", "/api/scores", {"score": 12.5}, token=alice)
    check("float 400", st == 400)

    print("leaderboard")
    st, body = api("GET", "/api/leaderboard")
    check("lb all-time", st == 200 and body["total"] == 2, str(body))
    items = body["items"]
    check("lb order", items[0]["player"] == "alice" and items[0]["score"] == 300 and items[0]["rank"] == 1, str(items))
    check("lb bob", items[1]["player"] == "bob" and items[1]["score"] == 200 and items[1]["rank"] == 2)
    check("lb fields", set(items[0]) == {"rank", "player", "score", "achieved_at"}, str(items[0]))
    st, body = api("GET", "/api/leaderboard?period=week")
    check("lb week 2", st == 200 and body["total"] == 2)
    st, body = api("GET", "/api/leaderboard?period=today")
    check("lb today 2", body["total"] == 2)
    st, body = api("GET", "/api/leaderboard?period=bogus")
    check("lb bad period 400", st == 400)
    st, body = api("GET", "/api/leaderboard?limit=1")
    check("lb limit", len(body["items"]) == 1 and body["total"] == 2)
    st, body = api("GET", "/api/leaderboard?player=ali")
    check("lb search ali", body["total"] == 1 and body["items"][0]["player"] == "alice")
    st, body = api("GET", "/api/leaderboard?player=zzz")
    check("lb search none", body["total"] == 0 and body["items"] == [])

    print("my scores")
    st, _ = api("GET", "/api/scores")
    check("my scores 401", st == 401)
    st, body = api("GET", "/api/scores", token=alice)
    check("alice best 300", st == 200 and body["best_score"] == 300)
    scores = body["items"]
    check("alice 3 scores", len(scores) == 3)
    check("newest first", scores[0]["score"] == 300 and scores[-1]["score"] == 100, str(scores))
    check("score objects", all({"id", "score", "achieved_at", "is_hidden", "player"} <= set(s) for s in scores))

    print("admin")
    st, _ = api("GET", "/api/admin/scores")
    check("admin list 401 anon", st == 401)
    st, _ = api("GET", "/api/admin/scores", token=alice)
    check("admin list 403 player", st == 403)
    st, body = api("GET", "/api/admin/scores", token=admin)
    check("admin list 4", st == 200 and body["total"] == 4 and len(body["items"]) == 4, str(body)[:200])
    check("admin newest first", body["items"][0]["score"] == 200 and body["items"][-1]["score"] == 100)
    bob_score = body["items"][0]
    st, page2 = api("GET", "/api/admin/scores?page=2&page_size=2", token=admin)
    check("pagination", page2["page"] == 2 and page2["page_size"] == 2 and len(page2["items"]) == 2 and page2["total"] == 4)
    st, body = api("POST", f"/api/admin/scores/{bob_score['id']}/toggle", token=admin)
    check("toggle hide", st == 200 and body["is_hidden"] is True, str(body))
    st, lb = api("GET", "/api/leaderboard")
    check("hidden removed from lb", lb["total"] == 1 and lb["items"][0]["player"] == "alice", str(lb))
    st, body = api("GET", "/api/scores", token=bob)
    check("hidden not in best", body["best_score"] is None)
    st, body = api("POST", f"/api/admin/scores/{bob_score['id']}/toggle", token=admin)
    check("toggle show", body["is_hidden"] is False)
    st, lb = api("GET", "/api/leaderboard")
    check("shown back in lb", lb["total"] == 2)
    alice300 = next(s for s in api("GET", "/api/scores", token=alice)[1]["items"] if s["score"] == 300)
    st, _ = api("POST", f"/api/admin/scores/{alice300['id']}/toggle", token=admin)
    st, body = api("GET", "/api/scores", token=alice)
    check("best excludes hidden", body["best_score"] == 100, str(body["best_score"]))
    st, _ = api("POST", "/api/admin/scores/999999/toggle", token=admin)
    check("toggle 404", st == 404)

    print("persistence")
    stop_server(proc)
    proc = start_server()
    st, body = api("POST", "/api/auth/login", {"username": "alice", "password": "pw-alice"})
    check("alice re-login after restart", st == 200)
    token2 = body["token"]
    st, body = api("GET", "/api/scores", token=token2)
    check("data survived restart", st == 200 and len(body["items"]) == 3 and body["best_score"] == 100)
    st, body = api("GET", "/api/leaderboard?period=all")
    check("rank after re-hide 300 gone", body["items"][0]["player"] == "bob")
    st, _ = api("POST", "/api/scores", {"score": 120}, token=token2)
    check("old token still valid restart", st == 201)

    print("admin disabled without env")
    stop_server(proc)
    proc = start_server(with_admin=False)
    st, _ = api("POST", "/api/auth/login", {"username": "admin", "password": "admin123"})
    check("admin login 401 without ADMIN_PASSWORD", st == 401)
    st, _ = api("GET", "/api/leaderboard")
    check("lb still public", st == 200)

    print("frontend serving")
    with urllib.request.urlopen(BASE + "/") as res:
        html = res.read().decode()
    check("index served", res.status == 200 and "<div id=\"root\">" in html, html[:120])
    asset = next((p for p in Path(ROOT / "frontend" / "dist" / "assets").glob("index-*.js")), None)
    if asset:
        with urllib.request.urlopen(BASE + f"/assets/{asset.name}") as res:
            check("asset served", res.status == 200)
    with urllib.request.urlopen(BASE + "/some/spa/route") as res:
        check("spa fallback", res.status == 200 and "<div id=\"root\">" in res.read().decode())
    st, _ = api("GET", "/api/nope")
    check("unknown api 404 json", st == 404)
finally:
    stop_server(proc)
    shutil.rmtree(RUN_DIR, ignore_errors=True)

print()
if failures:
    print(f"{len(failures)} FAILURES: {failures}")
    sys.exit(1)
print("ALL TESTS PASSED")
