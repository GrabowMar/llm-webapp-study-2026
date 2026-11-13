import json
import urllib.request
import urllib.error

BASE = "http://localhost:8000"
TOKEN = None


def call(method, path, body=None, token=None, expect=None):
    if isinstance(body, str) and token is None:
        token, body = body, None
    req = urllib.request.Request(BASE + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data=data) as resp:
            status, payload = resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        status = e.code
        raw = e.read().decode()
        try:
            payload = json.loads(raw)
        except Exception:
            payload = raw
    if expect is not None and status != expect:
        raise AssertionError(f"{method} {path} -> {status}, expected {expect}: {payload}")
    return status, payload


def main():
    global TOKEN
    # health
    s, p = call("GET", "/api/health", expect=200)
    assert p == {"status": "ok"}, p

    # auth
    s, p = call("POST", "/api/auth/register", {"username": "alice", "password": "secret1"}, expect=201)
    s, p = call("POST", "/api/auth/register", {"username": "alice", "password": "secret1"}, expect=409)
    s, p = call("POST", "/api/auth/register", {"username": "", "password": ""}, expect=400)
    s, p = call("POST", "/api/auth/login", {"username": "alice", "password": "nope"}, expect=401)
    s, p = call("POST", "/api/auth/login", {"username": "alice", "password": "secret1"}, expect=200)
    TOKEN = p["token"]
    assert set(p.keys()) == {"token"}, p

    # unauthorized
    s, p = call("GET", "/api/incidents", expect=401)
    s, p = call("GET", "/api/incidents/1", expect=401)
    s, p = call("POST", "/api/incidents/1/timeline", {"message": "x"}, expect=401)

    # create
    s, p = call(
        "POST",
        "/api/incidents",
        {"title": "Checkout failing", "service": "payments", "severity": "sev1",
         "commander": "alice", "impact_summary": "Users cannot pay"},
        TOKEN,
        expect=201,
    )
    assert p["status"] == "investigating", p
    assert p["opened_by"] == "alice", p
    assert p["reopen_count"] == 0
    assert p["resolved_at"] is None
    from datetime import datetime, timedelta, timezone
    opened = datetime.fromisoformat(p["opened_at"])
    due = datetime.fromisoformat(p["sla_due_at"])
    assert due - opened == timedelta(minutes=60), (p["opened_at"], p["sla_due_at"])
    assert p["sla_breached"] is False
    inc1 = p["id"]
    keys = {"id","title","service","severity","status","commander","impact_summary",
            "opened_at","resolved_at","reopen_count","opened_by","sla_due_at","sla_breached"}
    assert set(p.keys()) == keys, set(p.keys()) ^ keys

    # validation
    s, p = call("POST", "/api/incidents", {"title": "x"}, TOKEN, expect=400)
    assert "severity" in p.get("errors", {}), p
    s, p = call("POST", "/api/incidents", {"severity": "sev1"}, TOKEN, expect=400)
    assert "title" in p.get("errors", {}), p
    s, p = call("POST", "/api/incidents", {"title": "y", "severity": "sev9"}, TOKEN, expect=400)
    s, p = call("POST", "/api/incidents", {"title": "y", "severity": "sev1"}, TOKEN, expect=400)
    assert "service" in p.get("errors", {}), p
    s, p = call("POST", "/api/incidents",
                {"title": "  ", "service": "", "severity": "sev1"}, TOKEN, expect=400)
    assert "title" in p.get("errors", {}) and "service" in p.get("errors", {}), p

    # second incident sev2
    s, p2 = call("POST", "/api/incidents",
                 {"title": "Search slow", "service": "api", "severity": "sev2"}, TOKEN, expect=201)
    inc2 = p2["id"]
    s, p3 = call("POST", "/api/incidents",
                 {"title": "Docs typo", "service": "docs", "severity": "sev4"}, TOKEN, expect=201)
    inc3 = p3["id"]
    from datetime import datetime as dt
    assert dt.fromisoformat(p2["sla_due_at"]) - dt.fromisoformat(p2["opened_at"]) == timedelta(minutes=240)
    assert dt.fromisoformat(p3["sla_due_at"]) - dt.fromisoformat(p3["opened_at"]) == timedelta(minutes=4320)

    # list
    s, p = call("GET", "/api/incidents?page_size=2", TOKEN, expect=200)
    assert set(p.keys()) == {"items", "total", "page", "page_size"}, p.keys()
    assert p["total"] == 3 and len(p["items"]) == 2 and p["page"] == 1 and p["page_size"] == 2, p
    # newest first
    ids = [i["id"] for i in p["items"]]
    assert ids == sorted(ids, reverse=True), ids
    s, p = call("GET", "/api/incidents?page=2&page_size=2", TOKEN, expect=200)
    assert len(p["items"]) == 1 and p["page"] == 2

    # filters
    s, p = call("GET", "/api/incidents?severity=sev2", TOKEN, expect=200)
    assert p["total"] == 1 and p["items"][0]["id"] == inc2, p
    s, p = call("GET", "/api/incidents?status=investigating", TOKEN, expect=200)
    assert p["total"] == 3, p
    s, p = call("GET", "/api/incidents?q=checkout", TOKEN, expect=200)
    assert p["total"] == 1 and p["items"][0]["id"] == inc1, p
    s, p = call("GET", "/api/incidents?open=true", TOKEN, expect=200)
    assert p["total"] == 3, p
    s, p = call("GET", "/api/incidents?open=false", TOKEN, expect=200)
    assert p["total"] == 0, p
    s, p = call("GET", "/api/incidents?severity=bogus", TOKEN, expect=400)

    # get one
    s, p = call("GET", f"/api/incidents/{inc1}", TOKEN, expect=200)
    assert p["id"] == inc1
    s, p = call("GET", "/api/incidents/999999", TOKEN, expect=404)
    s, p = call("GET", "/api/incidents/notanint", TOKEN, expect=404)

    # patch fields only
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"commander": "bob"}, TOKEN, expect=200)
    assert p["commander"] == "bob" and p["title"] == "Checkout failing", p
    assert p["severity"] == "sev1"

    # patch severity recomputes sla
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"severity": "sev3"}, TOKEN, expect=200)
    assert dt.fromisoformat(p["sla_due_at"]) - dt.fromisoformat(p["opened_at"]) == timedelta(minutes=1440)
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"severity": "sev1"}, TOKEN, expect=200)

    # timeline before status change
    s, p = call("GET", f"/api/incidents/{inc1}/timeline", TOKEN, expect=200)
    assert set(p.keys()) == {"items"} and p["items"] == [], p

    # status change -> event
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"status": "resolved"}, TOKEN, expect=200)
    assert p["status"] == "resolved" and p["resolved_at"] is not None, p
    s, p = call("GET", f"/api/incidents/{inc1}/timeline", TOKEN, expect=200)
    assert len(p["items"]) == 1, p
    ev = p["items"][0]
    assert set(ev.keys()) == {"id", "type", "message", "created_at", "author"}, ev
    assert ev["type"] == "status_change"
    assert "investigating" in ev["message"] and "resolved" in ev["message"], ev
    assert ev["author"] == "alice"

    # open filter
    s, p = call("GET", "/api/incidents?open=false", TOKEN, expect=200)
    assert p["total"] == 1 and p["items"][0]["id"] == inc1, p
    s, p = call("GET", "/api/incidents?open=true", TOKEN, expect=200)
    assert p["total"] == 2, p

    # reopen
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"status": "investigating"}, TOKEN, expect=200)
    assert p["status"] == "investigating" and p["resolved_at"] is None and p["reopen_count"] == 1, p
    s, p = call("GET", f"/api/incidents/{inc1}/timeline", TOKEN, expect=200)
    assert len(p["items"]) == 2, p

    # timeline post
    s, ev = call("POST", f"/api/incidents/{inc1}/timeline",
                 {"type": "note", "message": "looking into it"}, TOKEN, expect=201)
    assert ev["author"] == "alice" and ev["type"] == "note", ev
    s, ev2 = call("POST", f"/api/incidents/{inc1}/timeline",
                  {"message": "found cause"}, TOKEN, expect=201)
    assert ev2["type"] == "note", ev2
    s, p = call("GET", f"/api/incidents/{inc1}/timeline", TOKEN, expect=200)
    assert [e["type"] for e in p["items"]] == ["status_change", "status_change", "note", "note"], p
    # timeline does not change status
    s, p = call("GET", f"/api/incidents/{inc1}", TOKEN, expect=200)
    assert p["status"] == "investigating" and p["resolved_at"] is None, p
    s, p = call("POST", f"/api/incidents/{inc1}/timeline", {}, TOKEN, expect=400)

    # breach: patch opened_at into the past
    past = (dt.now(timezone.utc) - timedelta(hours=5)).isoformat()
    s, p = call("PATCH", f"/api/incidents/{inc2}", {"opened_at": past}, TOKEN, expect=200)
    assert p["sla_breached"] is True, p
    assert p["opened_at"] == past, p

    # resolve after breach stays breached
    s, p = call("PATCH", f"/api/incidents/{inc2}", {"status": "resolved"}, TOKEN, expect=200)
    assert p["sla_breached"] is True and p["resolved_at"] is not None, p

    # resolve inc3 within target -> not breached
    s, p = call("PATCH", f"/api/incidents/{inc3}", {"status": "resolved"}, TOKEN, expect=200)
    assert p["sla_breached"] is False, p

    # stats
    s, p = call("GET", "/api/public/stats", expect=200)
    assert set(p.keys()) == {"open_total", "open_by_severity", "sla_breached_open", "resolved_last_30_days"}, p.keys()
    assert p["open_total"] == 1, p  # inc1 reopened, inc2/inc3 resolved
    assert p["open_by_severity"] == {"sev1": 1, "sev2": 0, "sev3": 0, "sev4": 0}, p
    assert p["sla_breached_open"] == 0, p
    assert p["resolved_last_30_days"] == 2, p

    # resolve inc1 (currently open investigating after reopen) -> breach? opened recently, no
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"status": "resolved"}, TOKEN, expect=200)
    s, p = call("GET", "/api/public/stats", expect=200)
    assert p["open_total"] == 0 and p["resolved_last_30_days"] == 3, p
    assert p["sla_breached_open"] == 0, p

    # explicit resolved_at patch
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"resolved_at": None}, TOKEN, expect=200)
    assert p["status"] == "investigating" and p["resolved_at"] is None and p["reopen_count"] == 2, p

    # bad severity/status patch
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"severity": "sev9"}, TOKEN, expect=400)
    s, p = call("PATCH", f"/api/incidents/{inc1}", {"status": "onfire"}, TOKEN, expect=400)

    # unknown incident timeline
    s, p = call("GET", "/api/incidents/424242/timeline", TOKEN, expect=404)

    # public stats needs no auth; register/login no auth required already shown
    print("ALL API TESTS PASSED")


if __name__ == "__main__":
    main()
