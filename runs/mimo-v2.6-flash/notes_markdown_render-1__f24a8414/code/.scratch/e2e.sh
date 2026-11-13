#!/usr/bin/env bash
set -euo pipefail

cd /workspace
rm -rf data
mkdir -p .scratch

.venv/bin/gunicorn --bind 127.0.0.1:8000 --pythonpath backend --pid .scratch/gunicorn.pid app:app >.scratch/gunicorn.log 2>&1 &
GUNICORN_PID=$!

cleanup() {
  kill "$GUNICORN_PID" 2>/dev/null || true
  wait "$GUNICORN_PID" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:8000/api/health >/dev/null; then break; fi
  sleep 0.25
done

fail=0
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo "ok   $name"
  else
    echo "FAIL $name"
    fail=1
  fi
}

BASE=http://127.0.0.1:8000

# --- static SPA ---
check "GET / serves app shell" grep -q '<div id="root">' <(curl -s "$BASE/")
check "GET / deep path serves app shell" grep -q '<div id="root">' <(curl -s "$BASE/some/deep/path")
check "GET /notes/123 serves app shell" grep -q '<div id="root">' <(curl -s "$BASE/notes/123")
ASSET=$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.js' | head -1)
check "asset path present" test -n "$ASSET"
check "asset served" curl -sf -o /dev/null "$BASE$ASSET"
CSS=$(curl -s "$BASE/" | grep -o '/assets/[^"]*\.css' | head -1)
check "css served" curl -sf -o /dev/null "$BASE$CSS"
check "html content-type" grep -qi 'text/html' <(curl -sI "$BASE/")
check "nosniff header" grep -qi 'x-content-type-options: nosniff' <(curl -sI "$BASE/")

# --- API ---
check "health json" grep -q '{"status":"ok"}' <(curl -s "$BASE/api/health")
check "api 404 is json" grep -q '"error"' <(curl -s "$BASE/api/nope")
check "api 404 status" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/nope")" = "404"
check "no-store on api" grep -qi 'cache-control: no-store' <(curl -sI "$BASE/api/health")

REG=$(curl -s -o /tmp/e2e_reg.json -w '%{http_code}' -X POST "$BASE/api/auth/register" \
  -H 'Content-Type: application/json' -d '{"username":"e2e","password":"hunter22"}')
check "register 201" test "$REG" = "201"

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"username":"e2e","password":"hunter22"}' | .venv/bin/python -c 'import sys,json; print(json.load(sys.stdin)["token"])')
check "login token" test -n "$TOKEN"
AUTH="Authorization: Bearer $TOKEN"

NOTE_ID=$(curl -s -X POST "$BASE/api/notes" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"title":"E2E Note","body":"# Hi\n\n**bold** and [link](https://example.com)"}' \
  | .venv/bin/python -c 'import sys,json; print(json.load(sys.stdin)["id"])')
check "create note id" test -n "$NOTE_ID"

check "list has note" grep -q '"title":"E2E Note"' <(curl -s "$BASE/api/notes" -H "$AUTH")
check "list has no body" bash -c "! curl -s '$BASE/api/notes' -H '$AUTH' | grep -q '\"body\"'"
check "note html fragment" grep -q '<strong>bold</strong>' <(curl -s "$BASE/api/notes/$NOTE_ID/html" -H "$AUTH")
check "note html content-type" grep -qi 'text/html' <(curl -sI "$BASE/api/notes/$NOTE_ID/html" -H "$AUTH")

check "unauth notes 401" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/notes")" = "401"
check "public unpublished 404" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/public/notes/$NOTE_ID/html")" = "404"

check "publish patch" grep -q '"published":true' <(curl -s -X PATCH "$BASE/api/notes/$NOTE_ID" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"published":true}')
check "public html now 200" grep -q '<h1>Hi</h1>' <(curl -s "$BASE/api/public/notes/$NOTE_ID/html")
check "public meta" grep -q '"author":"e2e"' <(curl -s "$BASE/api/public/notes/$NOTE_ID")

check "delete 204" test "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/notes/$NOTE_ID" -H "$AUTH")" = "204"
check "deleted 404" test "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/notes/$NOTE_ID" -H "$AUTH")" = "404"

if [ "$fail" -ne 0 ]; then
  echo "--- gunicorn log ---"
  cat .scratch/gunicorn.log
  exit 1
fi
echo "ALL E2E CHECKS PASSED"
