#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://127.0.0.1:8000/api}"
pass=0
fail=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$expected" == "$actual" ]]; then
    echo "ok   $label"
    pass=$((pass + 1))
  else
    echo "FAIL $label: expected [$expected] got [$actual]"
    fail=$((fail + 1))
  fi
}

status() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

jqf() {
  python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1],{'d':d}))" "$1"
}

# health
check "health status" "200" "$(status "$BASE/health")"
check "health body" "ok" "$(curl -s "$BASE/health" | jqf "d['status']")"

# register
check "register alice" "201" "$(status -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"alice","password":"pw12345"}')"
check "register alice again" "409" "$(status -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"alice","password":"pw12345"}')"
check "register bob" "201" "$(status -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"bob","password":"pw12345"}')"
check "register missing password" "400" "$(status -X POST "$BASE/auth/register" -H 'Content-Type: application/json' -d '{"username":"carol"}')"

# login
check "login wrong password" "401" "$(status -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"alice","password":"nope"}')"
check "login alice" "200" "$(status -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"alice","password":"pw12345"}')"
ALICE=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"alice","password":"pw12345"}' | jqf "d['token']")
BOB=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"username":"bob","password":"pw12345"}' | jqf "d['token']")
ADMIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"admin\",\"password\":\"${ADMIN_PASSWORD:-}\"}" | jqf "d.get('token','')")
check "token issued" "True" "$([[ -n "$ALICE" ]] && echo True || echo False)"

# auth required
check "list without token" "401" "$(status "$BASE/notifications")"
check "list with bad token" "401" "$(status "$BASE/notifications" -H 'Authorization: Bearer nope')"

# create notifications
check "create notification" "201" "$(status -X POST "$BASE/notifications" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"message":"hello world","type":"info"}')"
check "create notification no message" "400" "$(status -X POST "$BASE/notifications" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"type":"info"}')"
check "create notification bob" "201" "$(status -X POST "$BASE/notifications" -H "Authorization: Bearer $BOB" -H 'Content-Type: application/json' -d '{"message":"bob msg","type":"warning"}')"

# list
LIST=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ALICE")
check "alice total" "1" "$(echo "$LIST" | jqf "d['total']")"
check "alice unread" "1" "$(echo "$LIST" | jqf "d['unread_count']")"
check "alice page" "1" "$(echo "$LIST" | jqf "d['page']")"
check "alice page size" "20" "$(echo "$LIST" | jqf "d['page_size']")"
check "alice items" "1" "$(echo "$LIST" | jqf "len(d['items'])")"
check "alice message" "hello world" "$(echo "$LIST" | jqf "d['items'][0]['message']")"
check "alice item read" "False" "$(echo "$LIST" | jqf "d['items'][0]['read']")"
check "alice item type" "info" "$(echo "$LIST" | jqf "d['items'][0]['type']")"
check "alice item has created_at" "True" "$(echo "$LIST" | jqf "'created_at' in d['items'][0]")"

BOBLIST=$(curl -s "$BASE/notifications" -H "Authorization: Bearer $BOB")
check "bob total" "1" "$(echo "$BOBLIST" | jqf "d['total']")"
check "bob message" "bob msg" "$(echo "$BOBLIST" | jqf "d['items'][0]['message']")"

ID=$(echo "$LIST" | jqf "d['items'][0]['id']")
BOBID=$(echo "$BOBLIST" | jqf "d['items'][0]['id']")

# isolation
check "alice cannot read bob notification" "404" "$(status "$BASE/notifications/$BOBID" -H "Authorization: Bearer $ALICE")"
check "alice cannot patch bob notification" "404" "$(status -X PATCH "$BASE/notifications/$BOBID" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"read":true}')"
check "alice cannot delete bob notification" "404" "$(status -X DELETE "$BASE/notifications/$BOBID" -H "Authorization: Bearer $ALICE")"
check "bob notification still there" "200" "$(status "$BASE/notifications/$BOBID" -H "Authorization: Bearer $BOB")"

# get one
check "get own notification" "200" "$(status "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE")"
check "get missing notification" "404" "$(status "$BASE/notifications/999999" -H "Authorization: Bearer $ALICE")"

# patch
check "patch read true" "200" "$(status -X PATCH "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"read":true}')"
check "patched read" "True" "$(curl -s "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE" | jqf "d['read']")"
check "unread count now" "0" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ALICE" | jqf "d['unread_count']")"
check "patch read false" "200" "$(status -X PATCH "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"read":false}')"
check "patched unread" "False" "$(curl -s "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE" | jqf "d['read']")"
check "patch missing field" "400" "$(status -X PATCH "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{}')"

# filters
curl -s -X POST "$BASE/notifications" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"message":"second","type":"info"}' >/dev/null
curl -s -X POST "$BASE/notifications" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"message":"third","type":"error"}' >/dev/null
check "filter type error" "1" "$(curl -s "$BASE/notifications?type=error" -H "Authorization: Bearer $ALICE" | jqf "d['total']")"
check "filter read false total" "3" "$(curl -s "$BASE/notifications?read=false" -H "Authorization: Bearer $ALICE" | jqf "d['total']")"
check "filter read false unread_count" "3" "$(curl -s "$BASE/notifications?read=false" -H "Authorization: Bearer $ALICE" | jqf "d['unread_count']")"
check "filter read true total" "0" "$(curl -s "$BASE/notifications?read=true" -H "Authorization: Bearer $ALICE" | jqf "d['total']")"
check "filter read true unread_count" "3" "$(curl -s "$BASE/notifications?read=true" -H "Authorization: Bearer $ALICE" | jqf "d['unread_count']")"
check "filter type+read" "1" "$(curl -s "$BASE/notifications?type=error&read=false" -H "Authorization: Bearer $ALICE" | jqf "d['total']")"

# pagination
check "page 1 size 2 total" "3" "$(curl -s "$BASE/notifications?page=1&page_size=2" -H "Authorization: Bearer $ALICE" | jqf "d['total']")"
check "page 1 size 2 items" "2" "$(curl -s "$BASE/notifications?page=1&page_size=2" -H "Authorization: Bearer $ALICE" | jqf "len(d['items'])")"
check "page 2 size 2 items" "1" "$(curl -s "$BASE/notifications?page=2&page_size=2" -H "Authorization: Bearer $ALICE" | jqf "len(d['items'])")"
check "page 2 page_size" "2" "$(curl -s "$BASE/notifications?page=2&page_size=2" -H "Authorization: Bearer $ALICE" | jqf "d['page_size']")"
check "newest first" "third" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ALICE" | jqf "d['items'][0]['message']")"

# read-all
READALL=$(curl -s -X POST "$BASE/notifications/read-all" -H "Authorization: Bearer $ALICE")
check "read-all updated" "3" "$(echo "$READALL" | jqf "d['updated']")"
check "read-all idempotent" "0" "$(curl -s -X POST "$BASE/notifications/read-all" -H "Authorization: Bearer $ALICE" | jqf "d['updated']")"
check "unread count zero" "0" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ALICE" | jqf "d['unread_count']")"

# delete
check "delete" "204" "$(status -X DELETE "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE")"
check "deleted gone" "404" "$(status "$BASE/notifications/$ID" -H "Authorization: Bearer $ALICE")"

# broadcast
check "broadcast without auth" "401" "$(status -X POST "$BASE/admin/broadcast" -H 'Content-Type: application/json' -d '{"message":"hi"}')"
check "broadcast as normal user" "403" "$(status -X POST "$BASE/admin/broadcast" -H "Authorization: Bearer $ALICE" -H 'Content-Type: application/json' -d '{"message":"hi"}')"
if [[ -n "$ADMIN" ]]; then
  check "broadcast as admin" "200" "$(status -X POST "$BASE/admin/broadcast" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"message":"announcement","type":"announcement"}')"
  check "broadcast delivered" "2" "$(curl -s -X POST "$BASE/admin/broadcast" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' -d '{"message":"announcement2"}' | jqf "d['delivered']")"
  check "alice got broadcast" "True" "$(curl -s "$BASE/notifications?type=announcement" -H "Authorization: Bearer $ALICE" | jqf "d['total'] > 0")"
  check "bob got broadcast" "True" "$(curl -s "$BASE/notifications?type=announcement" -H "Authorization: Bearer $BOB" | jqf "d['total'] > 0")"
  check "admin inbox has broadcast" "True" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ADMIN" | jqf "d['total'] > 0")"
  check "alice unread after broadcast" "2" "$(curl -s "$BASE/notifications" -H "Authorization: Bearer $ALICE" | jqf "d['unread_count']")"
fi

echo "-----"
echo "passed: $pass  failed: $fail"
[[ $fail -eq 0 ]]
