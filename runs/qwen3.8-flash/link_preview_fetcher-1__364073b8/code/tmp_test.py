import http.server
import threading

HDR = """
"""<!doctype html><html><head><title>  Hello &amp; \n  World </title>
<meta name="description" content="  A plain   description  ">
<meta property="og:title" content="OG Title <b>bold</b>">
<meta property="og:description" content='OG desc with &#39;quotes&#39;'>
<meta property="og:image" content="/images/pic.png">
</head><body>hi</body></html>"""

NO_OG = """<!doctype html><html><head><title>Only Title</title></head><body></body></html>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/moved":
            self.send_response(301)
            self.send_header("Location", "/final")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if self.path.startswith("/final"):
            body = NO_OG.encode()
        elif self.path == "/bad":
            self.send_response(500)
            self.end_headers()
            return
        elif self.path == "/notfound":
            self.send_response(404)
            self.end_headers()
            return
        else:
            body = HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        body = HTML.encode()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(("127.0.0.1", 9111), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
print("mock up on 9111")

import subprocess, sys, time, os, json, urllib.request

env = dict(os.environ)
app_proc = subprocess.Popen(
    [sys.executable, "-m", "flask", "--app", "app", "run", "--port", "8000"],
    cwd="backend", env=env,
)
time.sleep(2)

def call(method, path, body=None, token=None):
    req = urllib.request.Request("http://127.0.0.1:8000" + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as r:
            payload = r.read()
            return r.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as e:
        payload = e.read()
        return e.code, json.loads(payload) if payload else None

results = []
st, _ = call("GET", "/api/health")
results.append(("health", st))

st, _ = call("POST", "/api/previews", {"url": "http://x"})
results.append(("unauth -> 401", st))

st, _ = call("POST", "/api/auth/register", {"username": "alice", "password": "pw1"})
results.append(("register alice", st))
st, _ = call("POST", "/api/auth/register", {"username": "alice", "password": "pw1"})
results.append(("dup register -> 409", st))
st, login = call("POST", "/api/auth/login", {"username": "alice", "password": "wrong"})
results.append(("bad login -> 401", st))
st, login = call("POST", "/api/auth/login", {"username": "alice", "password": "pw1"})
results.append(("login", st))
tok = login["token"]

st, pv = call("POST", "/api/previews", {"url": "http://127.0.0.1:9111/"}, tok)
results.append(("create preview", st))
print("preview:", json.dumps(pv, indent=1))

st, pv2 = call("POST", "/api/previews", {"url": "127.0.0.1:9111/moved"}, tok)
results.append(("create with redirect", st))
print("redirect preview:", json.dumps(pv2, indent=1))

st, lst = call("GET", "/api/previews?page=1&page_size=1", None, tok)
results.append(("list p1", st))
print("list:", lst)
st, lst2 = call("GET", "/api/previews?page=2&page_size=1", None, tok)
print("list p2:", lst2)

st, one = call("GET", f"/api/previews/{pv['id']}", None, tok)
results.append(("get one", st))

st, ref = call("POST", f"/api/previews/{pv['id']}/refresh", {}, tok)
results.append(("refresh", st))

st, _ = call("POST", f"/api/previews/{pv['id']}/refresh", {}, None)
results.append(("refresh unauth -> 401", st))

# second user isolation
st, _ = call("POST", "/api/auth/register", {"username": "bob", "password": "pw2"})
st, l2 = call("POST", "/api/auth/login", {"username": "bob", "password": "pw2"})
tok2 = l2["token"]
st, _ = call("GET", f"/api/previews/{pv['id']}", tok2)
results.append(("bob get alice -> 404", st))
st, _ = call("DELETE", f"/api/previews/{pv['id']}", tok2)
results.append(("bob delete alice -> 404", st))
st, lst = call("GET", "/api/previews", None, tok2)
results.append(("bob empty list", st, lst))

st, _ = call("DELETE", f"/api/previews/{pv2['id']}", tok)
results.append(("delete", st))
st, _ = call("DELETE", f"/api/previews/{pv2['id']}", tok)
results.append(("delete again -> 404", st))

st, badp = call("POST", "/api/previews", {"url": "http://127.0.0.1:9111/bad"}, tok)
results.append(("fetch 500 page -> still stored", st, badp))

st, nf = call("POST", "/api/previews", {"url": "http://127.0.0.1:9999/nope"}, tok)
results.append(("unreachable -> 400", st))

for r in results:
    print(r)

app_proc.terminate()
