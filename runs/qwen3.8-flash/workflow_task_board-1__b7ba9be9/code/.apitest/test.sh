#!/bin/bash
B=http://127.0.0.1:8000/api
O=/workspace/.apitest/out.json
pass=0; fail=0
check() {
  if [ "$2" == "$3" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $1 — expected [$2] got [$3]"; fi
}
j() { curl -s -o $O -w "%{http_code}" "$@"; }
f() { python3 -c "import json;print(json.load(open('$O'))$1)"; }

H() { echo "Authorization: Bearer $1"; }

check "health" 200 "$(j $B/health)"
check "health body" '{"status":"ok"}' "$(cat $O)"

check "register" 201 "$(j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"password123"}')"
check "register dup" 409 "$(j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"password123"}')"
check "register dup has field errors" 1 "$(python3 -c "import json;print(int(json.load(open('$O'))['errors']['username']=='Username is already taken'))")"
check "register short pw" 400 "$(j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"bob","password":"short"}')"
check "register blank user" 400 "$(j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"  ","password":"password123"}')"
check "register no body" 400 "$(j -X POST $B/auth/register)"
check "register case-insensitive dup" 409 "$(j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"ALICE","password":"password123"}')"
check "login wrong pw" 401 "$(j -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"wrongpass1"}')"
check "login unknown user" 401 "$(j -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"username":"carol","password":"password123"}')"
check "login" 200 "$(j -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"password123"}')"
T1=$(f "['token']")
check "login token" 1 "$([ -n "$T1" ] && echo 1 || echo 0)"
j -X POST $B/auth/register -H 'Content-Type: application/json' -d '{"username":"bob","password":"password456"}' >/dev/null
check "login bob" 200 "$(j -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"username":"bob","password":"password456"}')"
T2=$(f "['token']")
A1=$(H $T1); A2=$(H $T2); BAD=$(H nope)

check "list open" 200 "$(j $B/tasks)"
check "list empty" "[],0,{'todo': 0, 'in_progress': 0, 'done': 0}" "$(python3 -c "import json;d=json.load(open('$O'));print(d['items'],d['total'],{k:d['counts'][k] for k in ['todo','in_progress','done']},sep=',')")"

check "create no token" 401 "$(j -X POST $B/tasks -H 'Content-Type: application/json' -d '{"title":"t"}')"
check "create bad token" 401 "$(j -X POST $B/tasks -H "$BAD" -H 'Content-Type: application/json' -d '{"title":"t"}')"
check "create wrong scheme" 401 "$(j -X POST $B/tasks -H "Authorization: Token $T1" -H 'Content-Type: application/json' -d '{"title":"t"}')"
check "patch no token" 401 "$(j -X PATCH $B/tasks/1 -H 'Content-Type: application/json' -d '{"title":"t"}')"
check "delete no token" 401 "$(j -X DELETE $B/tasks/1)"
check "create no json body" 400 "$(j -X POST $B/tasks -H "$A1")"
check "create not-object json" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '[1,2]')"

check "create no title" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{}')"
check "create blank title" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{"title":"   "}')"
check "create bad status" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{"title":"t","status":"nope"}')"
check "create bad priority" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{"title":"t","priority":"urgent"}')"
check "create desc not str" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{"title":"t","description":5}')"
LONG=$(python3 -c "print('x'*201)")
check "create long title" 400 "$(j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d "{\"title\":\"$LONG\"}")"
j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d '{"title":"t","priority":"urgent"}' >/dev/null
check "create validation error body" "True" "$(f "['errors']['priority'].startswith('Priority')")"

mk() { j -X POST $B/tasks -H "$A1" -H 'Content-Type: application/json' -d "$1"; }
check "create t1" 201 "$(mk '{"title":"Task one","description":"first"}')"
ID1=$(f "['id']")
check "t1 pos" 1 "$(f "['position']")"
check "t1 keys" "id,title,description,status,priority,position,updated_at" "$(python3 -c "import json;print(','.join(json.load(open('$O')).keys()))")"

mk '{"title":"Task two","status":"todo","priority":"high"}' >/dev/null; ID2=$(f "['id']"); check "t2 pos" 2 "$(f "['position']")"
mk '{"title":"Doing","status":"in_progress","priority":"low"}' >/dev/null; ID3=$(f "['id']")
mk '{"title":"Finished","status":"done"}' >/dev/null; ID4=$(f "['id']"); check "d1 pos" 1 "$(f "['position']")"; check "d1 default prio" "medium" "$(f "['priority']")"

j $B/tasks >/dev/null
check "list order" "$ID1,$ID2,$ID3,$ID4" "$(python3 -c "import json;print(','.join(str(i['id']) for i in json.load(open('$O'))['items']))")"
check "counts" "{'todo': 2, 'in_progress': 1, 'done': 1}" "$(python3 -c "import json;c=json.load(open('$O'))['counts'];print({k:c[k] for k in ['todo','in_progress','done']})")"
check "total" 4 "$(f "['total']")"

check "filter status" 200 "$(j "$B/tasks?status=todo")"; check "filter status n" 2 "$(f "['total']")"
check "filter prio" 200 "$(j "$B/tasks?priority=high")"; check "filter prio n" 1 "$(f "['total']")"
check "filter combo" 200 "$(j "$B/tasks?status=in_progress&priority=low")"; check "filter combo n" 1 "$(f "['total']")"
check "filter bad status" 400 "$(j "$B/tasks?status=nope")"
check "filter bad prio" 400 "$(j "$B/tasks?priority=nope")"
check "counts when filtered" "{'todo': 2, 'in_progress': 0, 'done': 0}" "$(j "$B/tasks?status=todo" >/dev/null; python3 -c "import json;c=json.load(open('$O'))['counts'];print({k:c[k] for k in ['todo','in_progress','done']})")"

check "get one" 200 "$(j $B/tasks/$ID1)"; check "get one title" "Task one" "$(f "['title']")"
check "get missing" 404 "$(j $B/tasks/999999)"
check "get bad id" 404 "$(j $B/tasks/abc)"

p1() { j -X PATCH $B/tasks/$1 -H "$A1" -H 'Content-Type: application/json' -d "$2"; }
check "patch fields" 200 "$(p1 $ID1 '{"title":"Renamed","description":"new desc"}')"
check "patch applied" "Renamed|new desc|todo|1" "$(python3 -c "import json;d=json.load(open('$O'));print('|'.join(str(d[k]) for k in ('title','description','status','position')))")"
check "patch keeps other fields" "medium" "$(f "['priority']")"
check "patch empty" 400 "$(p1 $ID1 '{}')"
check "patch no known fields" 400 "$(p1 $ID1 '{"foo":1}')"
check "patch invalid title" 400 "$(p1 $ID1 '{"title":""}')"
check "patch invalid status" 400 "$(p1 $ID1 '{"status":"x"}')"
check "patch no token" 401 "$(j -X PATCH $B/tasks/$ID1 -H 'Content-Type: application/json' -d '{"title":"z"}')"

check "move ID2 to done pos1" 200 "$(p1 $ID2 '{"status":"done","position":1}')"
j "$B/tasks?status=done" >/dev/null
check "done order" "$ID2,$ID4" "$(python3 -c "import json;print(','.join(str(i['id']) for i in json.load(open('$O'))['items']))")"
check "done positions" "1,2" "$(python3 -c "import json;print(','.join(str(i['position']) for i in json.load(open('$O'))['items']))")"
j "$B/tasks?status=todo" >/dev/null
check "todo gap closed" "1" "$(f "['total']")"

mk '{"title":"Second doing","status":"in_progress"}' >/dev/null; ID5=$(f "['id']")
check "reorder same col" 200 "$(p1 $ID3 '{"position":2}')"
j "$B/tasks?status=in_progress" >/dev/null
check "in_progress order after reorder" "$ID5,$ID3" "$(python3 -c "import json;print(','.join(str(i['id']) for i in json.load(open('$O'))['items']))")"
check "reorder keeps status" "in_progress" "$(p1 $ID5 '{"position":2}' >/dev/null; f "['status']")"

check "status only appends" 200 "$(p1 $ID1 '{"status":"in_progress"}')"
j "$B/tasks?status=in_progress" >/dev/null
check "appended at end" "$ID3,$ID5,$ID1" "$(python3 -c "import json;print(','.join(str(i['id']) for i in json.load(open('$O'))['items']))")"

check "pos too big" 400 "$(p1 $ID1 '{"position":99}')"
check "pos 0" 400 "$(p1 $ID1 '{"position":0}')"
check "pos float" 400 "$(p1 $ID1 '{"position":1.5}')"
check "pos string" 400 "$(p1 $ID1 '{"position":"2"}')"
check "pos bool" 400 "$(p1 $ID1 '{"position":true}')"
check "bob edits alice task" 200 "$(j -X PATCH $B/tasks/$ID1 -H "$A2" -H 'Content-Type: application/json' -d '{"priority":"high"}')"
check "bob creates" 201 "$(j -X POST $B/tasks -H "$A2" -H 'Content-Type: application/json' -d '{"title":"bob task"}')"
check "bob deletes" 204 "$(j -X DELETE $B/tasks/$(f "['id']") -H "$A2")"

check "delete" 204 "$(j -X DELETE $B/tasks/$ID5 -H "$A1")"
check "delete body empty" "" "$(cat $O)"
check "delete again" 404 "$(j -X DELETE $B/tasks/$ID5 -H "$A1")"
j "$B/tasks?status=in_progress" >/dev/null
check "gap closed after delete" "1,2" "$(python3 -c "import json;print(','.join(str(i['position']) for i in json.load(open('$O'))['items']))")"
check "delete no token" 401 "$(j -X DELETE $B/tasks/$ID1)"

j $B/tasks >/dev/null
check "1..n invariant" ok "$(python3 -c "
import json
d=json.load(open('$O')); cols={}
for i in d['items']: cols.setdefault(i['status'],[]).append(i['position'])
print('ok' if all(sorted(v)==list(range(1,len(v)+1)) for v in cols.values()) else cols)")"
check "updated_at parseable" 1 "$(python3 -c "
import json,datetime
datetime.datetime.fromisoformat(json.load(open('$O'))['items'][0]['updated_at']); print(1)")"

# move single task into its own column repeatedly (idempotent positions)
check "move ID4 to todo" 200 "$(p1 $ID4 '{"status":"todo"}')"
j "$B/tasks?status=todo" >/dev/null
check "todo has 1" 1 "$(f "['total']")"
check "move ID4 back to done" 200 "$(p1 $ID4 '{"status":"done"}')"
j "$B/tasks?status=done" >/dev/null
check "done positions" "1,2" "$(python3 -c "import json;print(','.join(str(i['position']) for i in json.load(open('$O'))['items']))")"

echo "PASS=$pass FAIL=$fail"
