#!/usr/bin/env bash
# Temporary end-to-end API test. Not part of the app.
set -u
cd /workspace
PASS=0; FAIL=0
check() {
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: $1 (expected [$2], got [$3])"; fi
}
jget() { python3 -c "import json,sys; d=json.load(sys.stdin); print(d$1)" 2>/dev/null || echo "PARSE_ERR"; }
jlen() { python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['items']))" 2>/dev/null || echo "PARSE_ERR"; }

pkill -f "gunicorn.*app:app" 2>/dev/null; sleep 1
rm -rf data
setsid .venv/bin/gunicorn --bind 127.0.0.1:8000 --pythonpath backend app:app > .server.log 2>&1 < /dev/null &
sleep 2

B=http://127.0.0.1:8000
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

check "health" "ok" "$(curl -s $B/api/health | jget "['status']")"

TOTAL=$(curl -s "$B/api/weather" | jget "['total']")
check "seed total >= 5" "ok" "$([ "${TOTAL:-0}" -ge 5 ] 2>/dev/null && echo ok || echo "bad($TOTAL)")"
check "ordered by city (first=Berlin)" "Berlin" "$(curl -s "$B/api/weather" | jget "['items'][0]['city']")"

R=$(curl -s "$B/api/weather?page=2&page_size=2")
check "page echo" "2" "$(echo "$R" | jget "['page']")"
check "page_size echo" "2" "$(echo "$R" | jget "['page_size']")"
check "page2 size" "2" "$(echo "$R" | jlen)"

R=$(curl -s "$B/api/weather?city=paris")
check "city filter total" "1" "$(echo "$R" | jget "['total']")"
check "city filter item" "Paris" "$(echo "$R" | jget "['items'][0]['city']")"
check "missing city total" "0" "$(curl -s "$B/api/weather?city=Atlantis" | jget "['total']")"

R=$(curl -s "$B/api/weather/recent?limit=5")
check "recent newest first" "Atlantis" "$(echo "$R" | jget "['items'][0]['city']")"
check "recent second" "paris" "$(echo "$R" | jget "['items'][1]['city']")"
check "recent found flag" "False" "$(echo "$R" | jget "['items'][0]['found']")"
check "recent not-found flag" "True" "$(echo "$R" | jget "['items'][1]['found']")"
check "recent limit=1" "1" "$(curl -s "$B/api/weather/recent?limit=1" | jlen)"

check "POST unauth" "401" "$(code -X POST $B/api/weather -H 'Content-Type: application/json' -d '{}')"
check "PUT unauth" "401" "$(code -X PUT $B/api/weather/1 -H 'Content-Type: application/json' -d '{}')"
check "DELETE unauth" "401" "$(code -X DELETE $B/api/weather/1)"
check "bad token" "401" "$(code -X POST $B/api/weather -H 'Authorization: Bearer nope' -H 'Content-Type: application/json' -d '{}')"

check "register" "201" "$(code -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}')"
check "dup register" "409" "$(code -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}')"
check "register no user" "400" "$(code -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"password":"x"}')"
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}' | jget "['token']")
check "login token present" "ok" "$([ -n "${TOKEN:-}" ] && [ "$TOKEN" != "PARSE_ERR" ] && [ "$TOKEN" != "None" ] && echo ok || echo bad)"
check "login wrong pw" "401" "$(code -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"wrong"}')"
check "login unknown user" "401" "$(code -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"nobody","password":"x"}')"
AUTH="Authorization: Bearer $TOKEN"

R=$(curl -s -w '\n%{http_code}' -X POST $B/api/weather -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"Oslo","country":"Norway","temperature_c":3.2,"condition":"Snow","humidity":80,"wind_kph":6.1}')
CODE=$(echo "$R" | tail -1); BODY=$(echo "$R" | head -1)
check "create status" "201" "$CODE"
check "create city" "Oslo" "$(echo "$BODY" | jget "['city']")"
NEWID=$(echo "$BODY" | jget "['id']")
check "observed_at set" "ok" "$(echo "$BODY" | jget "['observed_at'] and 'ok'")"
check "dup city case-insens" "409" "$(code -X POST $B/api/weather -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"OSLO","temperature_c":1}')"
check "create missing city" "400" "$(code -X POST $B/api/weather -H "$AUTH" -H 'Content-Type: application/json' -d '{"temperature_c":1}')"
check "create bad temp" "400" "$(code -X POST $B/api/weather -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"X1","temperature_c":"hot"}')"
check "create bad humidity" "400" "$(code -X POST $B/api/weather -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"X1","temperature_c":1,"humidity":150}')"

check "get by id" "Oslo" "$(curl -s $B/api/weather/$NEWID | jget "['city']")"
check "get missing id" "404" "$(code $B/api/weather/999999)"

OLD_OBS=$(curl -s $B/api/weather/$NEWID | jget "['observed_at']")
sleep 1.1
R=$(curl -s -X PUT $B/api/weather/$NEWID -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"Oslo","temperature_c":5.5}')
check "put city kept" "Oslo" "$(echo "$R" | jget "['city']")"
check "put temp" "5.5" "$(echo "$R" | jget "['temperature_c']")"
check "put country cleared" "None" "$(echo "$R" | jget "['country']")"
check "put condition cleared" "None" "$(echo "$R" | jget "['condition']")"
check "put humidity cleared" "None" "$(echo "$R" | jget "['humidity']")"
check "put wind cleared" "None" "$(echo "$R" | jget "['wind_kph']")"
NEW_OBS=$(echo "$R" | jget "['observed_at']")
check "put resets observed_at" "ok" "$([ "$OLD_OBS" != "$NEW_OBS" ] && echo ok || echo same)"
check "put missing temp" "400" "$(code -X PUT $B/api/weather/$NEWID -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"Oslo"}')"
check "put missing id" "404" "$(code -X PUT $B/api/weather/999999 -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"A","temperature_c":1}')"
check "put dup city" "409" "$(code -X PUT $B/api/weather/$NEWID -H "$AUTH" -H 'Content-Type: application/json' -d '{"city":"paris","temperature_c":1}')"

check "delete" "204" "$(code -X DELETE $B/api/weather/$NEWID -H "$AUTH")"
check "deleted gone" "404" "$(code $B/api/weather/$NEWID)"
check "delete again" "404" "$(code -X DELETE $B/api/weather/$NEWID -H "$AUTH")"

COUNT=$(curl -s "$B/api/weather/recent?limit=100" | jlen)
check "recent count >= 2" "ok" "$([ "${COUNT:-0}" -ge 2 ] 2>/dev/null && echo ok || echo "bad($COUNT)")"

check "unknown api" '{"error":"Not found"}' "$(curl -s $B/api/nope | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin),separators=(",",":")))' 2>/dev/null || echo PARSE_ERR)"

pkill -f "gunicorn.*app:app" 2>/dev/null
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
