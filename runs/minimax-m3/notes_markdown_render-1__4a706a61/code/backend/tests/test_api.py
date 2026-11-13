"""End-to-end smoke test for the Markdown notes API."""

import json
import os
import sys
import tempfile

sys.path.insert(0, "/workspace/backend")

tmp = tempfile.mkdtemp(prefix="mdnotes-test-")
os.environ["NOTES_DATA_DIR"] = tmp
os.environ["NOTES_DB_PATH"] = os.path.join(tmp, "notes.db")

from mdnotes import create_app  # noqa: E402

app = create_app()
app.config["TESTING"] = True
client = app.test_client()

failures = []
checks = 0


def check(label, condition, detail=""):
    global checks
    checks += 1
    if not condition:
        failures.append(f"{label}: {detail}")
        print(f"FAIL {label} {detail}")
    else:
        print(f"ok   {label}")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


# --- health ---
r = client.get("/api/health")
check("health status", r.status_code == 200, r.status_code)
check("health body", r.get_json() == {"status": "ok"}, r.get_data())

# --- register ---
r = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
check("register 201", r.status_code == 201, r.status_code)
payload = r.get_json()
check("register body keys", set(payload) == {"id", "username"}, payload)

r = client.post("/api/auth/register", json={"username": "alice", "password": "secret123"})
check("duplicate register 409", r.status_code == 409, r.status_code)

r = client.post("/api/auth/register", json={"username": "bob", "password": "secret123"})
check("second register 201", r.status_code == 201, r.status_code)

r = client.post("/api/auth/register", json={"username": "", "password": "secret123"})
check("empty username 400", r.status_code == 400, r.status_code)

# --- login ---
r = client.post("/api/auth/login", json={"username": "alice", "password": "secret123"})
check("login 200", r.status_code == 200, r.status_code)
body = r.get_json()
check("login body exactly {token}", set(body) == {"token"}, body)
token = body["token"]
check("token non-empty string", isinstance(token, str) and len(token) > 20, token)

r = client.post("/api/auth/login", json={"username": "alice", "password": "wrong"})
check("bad password 401", r.status_code == 401, r.status_code)

r = client.post("/api/auth/login", json={"username": "nobody", "password": "secret123"})
check("unknown user 401", r.status_code == 401, r.status_code)

r = client.post("/api/auth/login", json={"username": "bob", "password": "secret123"})
bob_token = r.get_json()["token"]

# --- protected routes require auth ---
for method, url in [
    ("get", "/api/notes"),
    ("post", "/api/notes"),
    ("get", "/api/notes/1"),
    ("patch", "/api/notes/1"),
    ("delete", "/api/notes/1"),
    ("get", "/api/notes/1/html"),
]:
    r = getattr(client, method)(url)
    check(f"unauth {method.upper()} {url} -> 401", r.status_code == 401, r.status_code)

r = client.get("/api/notes", headers={"Authorization": "Bearer not-a-real-token"})
check("invalid token 401", r.status_code == 401, r.status_code)

r = client.get("/api/notes", headers={"Authorization": token})
check("token without Bearer prefix 401", r.status_code == 401, r.status_code)

# --- create notes ---
r = client.post(
    "/api/notes",
    headers=auth(token),
    json={"title": "First note", "body": "# Hello\n\nSome **bold** text.", "published": False},
)
check("create note 201", r.status_code == 201, r.status_code)
note = r.get_json()
check(
    "note keys",
    set(note) == {"id", "title", "body", "published", "updated_at", "author"},
    sorted(note),
)
check("note title", note["title"] == "First note", note["title"])
check("note published false", note["published"] is False, note["published"])
check("note author", note["author"] == "alice", note["author"])
note_id = note["id"]

r = client.post("/api/notes", headers=auth(token), json={"title": "Second note", "body": "Two"})
check("create second note 201", r.status_code == 201, r.status_code)
second_id = r.get_json()["id"]

r = client.post("/api/notes", headers=auth(token), json={})
check("create empty note 201", r.status_code == 201, r.status_code)
empty_id = r.get_json()["id"]

r = client.post("/api/notes", headers=auth(token), json={"title": "x", "published": "yes"})
check("non-bool published 400", r.status_code == 400, r.status_code)

# --- list ---
r = client.get("/api/notes", headers=auth(token))
check("list 200", r.status_code == 200, r.status_code)
items = r.get_json()["items"]
check("list has 3 items", len(items) == 3, len(items))
check(
    "list item keys",
    all(set(i) == {"id", "title", "published", "updated_at"} for i in items),
    items,
)
check("list excludes body", all("body" not in i for i in items), items)
check("list newest first", items[0]["id"] == empty_id, [i["id"] for i in items])
check(
    "list only own notes",
    {i["id"] for i in items} == {note_id, second_id, empty_id},
    [i["id"] for i in items],
)

r = client.get("/api/notes", headers=auth(bob_token))
check("bob sees no alice notes", r.get_json()["items"] == [], r.get_json())

# --- get ---
r = client.get(f"/api/notes/{note_id}", headers=auth(token))
check("get note 200", r.status_code == 200, r.status_code)
check("get note body", r.get_json()["body"] == "# Hello\n\nSome **bold** text.", r.get_json())

r = client.get(f"/api/notes/{note_id}", headers=auth(bob_token))
check("cross-user get 404", r.status_code == 404, r.status_code)

r = client.get("/api/notes/999999", headers=auth(token))
check("missing note 404", r.status_code == 404, r.status_code)

# --- patch ---
r = client.patch(
    f"/api/notes/{note_id}",
    headers=auth(token),
    json={"title": "Renamed", "body": "Updated body", "published": True},
)
check("patch 200", r.status_code == 200, r.status_code)
updated = r.get_json()
check("patch title", updated["title"] == "Renamed", updated["title"])
check("patch body", updated["body"] == "Updated body", updated["body"])
check("patch published", updated["published"] is True, updated["published"])
check("patch updated_at changed", updated["updated_at"] != note["updated_at"], updated["updated_at"])

r = client.patch(f"/api/notes/{note_id}", headers=auth(bob_token), json={"title": "hack"})
check("cross-user patch 404", r.status_code == 404, r.status_code)

r = client.patch(f"/api/notes/{note_id}", headers=auth(token), json={"title": 42})
check("bad title type 400", r.status_code == 400, r.status_code)

# --- note html ---
r = client.get(f"/api/notes/{note_id}/html", headers=auth(token))
check("note html 200", r.status_code == 200, r.status_code)
check("note html content type", r.headers["Content-Type"].startswith("text/html"), r.headers)
check("note html body", "<h1>Hello</h1>" in r.get_data(as_text=True), r.get_data(as_text=True))
check("note html bold", "<strong>bold</strong>" in r.get_data(as_text=True), r.get_data(as_text=True))

r = client.get(f"/api/notes/{note_id}/html", headers=auth(bob_token))
check("cross-user html 404", r.status_code == 404, r.status_code)

# --- public ---
r = client.get(f"/api/public/notes/{note_id}/html")
check("public html 200", r.status_code == 200, r.status_code)
check("public html content type", r.headers["Content-Type"].startswith("text/html"), r.headers)
check("public html content", "<h1>Hello</h1>" in r.get_data(as_text=True), r.get_data(as_text=True))

r = client.get(f"/api/public/notes/{second_id}/html")
check("public html unpublished 404", r.status_code == 404, r.status_code)

r = client.get(f"/api/public/notes/{note_id}")
check("public metadata 200", r.status_code == 200, r.status_code)
meta = r.get_json()
check("public metadata title", meta["title"] == "Renamed", meta)
check("public metadata author", meta["author"] == "alice", meta)

r = client.get(f"/api/public/notes/{empty_id}")
check("public metadata unpublished 404", r.status_code == 404, r.status_code)

# --- delete ---
r = client.delete(f"/api/notes/{empty_id}", headers=auth(token))
check("delete 204", r.status_code == 204, r.status_code)
check("delete empty body", r.get_data() == b"", r.get_data())

r = client.get(f"/api/notes/{empty_id}", headers=auth(token))
check("deleted note gone 404", r.status_code == 404, r.status_code)

r = client.delete(f"/api/notes/{empty_id}", headers=auth(token))
check("delete again 404", r.status_code == 404, r.status_code)

r = client.delete(f"/api/notes/{note_id}", headers=auth(bob_token))
check("cross-user delete 404", r.status_code == 404, r.status_code)

# --- render preview ---
r = client.post("/api/notes/render", headers=auth(token), json={"body": "# Preview\n\n*em*"})
check("render 200", r.status_code == 200, r.status_code)
check("render content type", r.headers["Content-Type"].startswith("text/html"), r.headers)
text = r.get_data(as_text=True)
check("render h1", "<h1>Preview</h1>" in text, text)
check("render em", "<em>em</em>" in text, text)

r = client.post("/api/notes/render", headers=auth(token), json={"body": "<script>alert(1)</script>"})
text = r.get_data(as_text=True)
check("render escapes raw html", "<script>" not in text, text)
check("render escapes script tag", "&lt;script&gt;" in text, text)

r = client.post("/api/notes/render", headers=auth(token), json={"body": "[x](javascript:alert(1))"})
text = r.get_data(as_text=True)
check("render blocks javascript link", "javascript:" not in text, text)

r = client.post("/api/notes/render", json={"body": "# x"})
check("render requires auth", r.status_code == 401, r.status_code)

# --- me / logout ---
r = client.get("/api/auth/me", headers=auth(token))
check("me 200", r.status_code == 200, r.status_code)
check("me username", r.get_json()["username"] == "alice", r.get_json())

r = client.post("/api/auth/logout", headers=auth(token))
check("logout 200", r.status_code == 200, r.status_code)

r = client.get("/api/notes", headers=auth(token))
check("token revoked after logout", r.status_code == 401, r.status_code)

# --- unknown api route ---
r = client.get("/api/nope")
check("unknown api 404", r.status_code == 404, r.status_code)
check("unknown api json", r.get_json() is not None and "error" in r.get_json(), r.get_data())

# --- xss in note body through html endpoint ---
r = client.post(
    "/api/notes",
    headers=auth(token),
    json={"title": "xss", "body": "<img src=x onerror=alert(1)>", "published": True},
)
xss_id = r.get_json()["id"]
r = client.get(f"/api/public/notes/{xss_id}/html")
text = r.get_data(as_text=True)
check("public html escapes raw html", "<img src=x" not in text, text)

print()
print(f"{checks - len(failures)}/{checks} checks passed")
if failures:
    print("FAILURES:")
    for f in failures:
        print(" -", f)
    sys.exit(1)
print("ALL PASSED")
