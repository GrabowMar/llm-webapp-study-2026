set -e
B=http://localhost:8000
pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "ok   $1";
  else fail=$((fail+1)); echo "FAIL $1: expected [$2] got [$3]"; fi
}

# register + login
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}')
check register201 201 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}')
check register-dup409 409 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"","password":"x"}')
check register-bad400 400 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"wrong"}')
check login-bad401 401 "$code"
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"alice","password":"secret1"}' | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["token"])')
check login-token-nonempty yes $([ -n "$TOKEN" ] && echo yes || echo no)
A="Authorization: Bearer $TOKEN"

# auth required
code=$(curl -s -o /dev/null -w '%{http_code}' $B/api/subscriptions)
check list401 401 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{}')
check create401 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions -H 'Content-Type: application/json' -d '{"customer_name":"x","plan":"p"}')"

# create subs
r=$(curl -s -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"Acme Corp","plan":"pro","monthly_amount":49.99,"renewal_date":"2026-12-01","status":"active"}')
ID1=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
check create-fields yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(sorted(d)==["created_at","customer_name","failed_payment_count","id","monthly_amount","plan","renewal_date","status"] and d["monthly_amount"]==49.99 and d["status"]=="active" and d["failed_payment_count"]==0)')"
r=$(curl -s -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"Beta LLC","plan":"basic","monthly_amount":19.0,"renewal_date":"2026-11-15","status":"trial"}')
ID2=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
r=$(curl -s -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"Gamma Inc","plan":"pro","monthly_amount":100.0,"renewal_date":"2026-10-01","status":"past_due"}')
ID3=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
r=$(curl -s -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"Delta Co","plan":"basic","monthly_amount":25.0,"renewal_date":"2026-09-01","status":"cancelled"}')
ID4=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
echo "ids: $ID1 $ID2 $ID3 $ID4"

# bad creates
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"x"}')
check create-missing-plan400 400 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"x","plan":"p","status":"bogus"}')
check create-bad-status400 400 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"x","plan":"p","monthly_amount":"abc"}')
check create-bad-amount400 400 "$code"

# list: newest first, paged
r=$(curl -s "$B/api/subscriptions?page_size=2" -H "$A")
check list-order yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print([i["id"] for i in d["items"]]==[$ID4,$ID3] and d["total"]==4 and d["page"]==1 and d["page_size"]==2)')"
r=$(curl -s "$B/api/subscriptions?page=2&page_size=2" -H "$A")
check list-p2 yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print([i["id"] for i in d["items"]]==[$ID2,$ID1])')"
r=$(curl -s "$B/api/subscriptions?status=active" -H "$A")
check list-filter-status yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["total"]==1 and d["items"][0]["id']==$ID1)')"
r=$(curl -s "$B/api/subscriptions?q=gamma" -H "$A")
check list-filter-q-caseless yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["total"]==1 and d["items"][0]["id"]==ID3)'.replace('ID3','$ID3'))"
r=$(curl -s "$B/api/subscriptions?plan=pro" -H "$A")
check list-filter-plan yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["total"]==2)')"
r=$(curl -s "$B/api/subscriptions?q=ac&status=active&plan=pro" -H "$A")
check list-combo yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["total"]==1)')"

# get one / 404
r=$(curl -s $B/api/subscriptions/$ID1 -H "$A")
check get-one yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["customer_name"]=="Acme Corp")')"
code=$(curl -s -o /dev/null -w '%{http_code}' $B/api/subscriptions/99999 -H "$A")
check get404 404 "$code"

# patch partial
r=$(curl -s -X PATCH $B/api/subscriptions/$ID2 -H "$A" -H 'Content-Type: application/json' -d '{"monthly_amount":22.5}')
check patch-partial yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["monthly_amount"]==22.5 and d["customer_name"]=="Beta LLC" and d["plan"]=="basic")')"
r=$(curl -s -X PATCH $B/api/subscriptions/$ID2 -H "$A" -H 'Content-Type: application/json' -d '{"status":"active"}')
check patch-status yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["status"]=="active")')"
code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $B/api/subscriptions/$ID2 -H "$A" -H 'Content-Type: application/json' -d '{"status":"nope"}')
check patch-bad400 400 "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH $B/api/subscriptions/99999 -H "$A" -H 'Content-Type: application/json' -d '{"plan":"x"}')
check patch404 404 "$code"

# invoices
r=$(curl -s -X POST $B/api/subscriptions/$ID3/invoices -H "$A" -H 'Content-Type: application/json' -d '{}')
check invoice-default-amount yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["amount_due"]==100.0 and d["status"]=="open" and d["due_date"]=="2026-10-01" and d["paid_at"] is None and d["subscription_id"]==ID3)'.replace('ID3','$ID3'))"
INV1=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
r=$(curl -s -X POST $B/api/subscriptions/$ID3/invoices -H "$A" -H 'Content-Type: application/json' -d '{"amount_due":35.5,"due_date":"2026-12-20"}')
check invoice-custom yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["amount_due"]==35.5 and d["due_date"]=="2026-12-20")')"
INV2=$(echo "$r" | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["id"])')
r=$(curl -s $B/api/subscriptions/$ID3/invoices -H "$A")
check invoices-newest yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print([i["id"] for i in d["items"]]==[INV2,INV1])'.replace('INV2','$INV2').replace('INV1','$INV1'))"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions/99999/invoices -H "$A" -H 'Content-Type: application/json' -d '{}')
check invoice-404 404 "$code"

# public stats (active: ID1 49.99 + ID2 22.5, past_due ID3 100)
r=$(curl -s $B/api/public/stats)
check stats-mrr yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(abs(d["mrr"]-172.49)<1e-9 and d["counts"]=={"trial":0,"active":2,"past_due":1,"cancelled":1})')"
code=$(curl -s -o /dev/null -w '%{http_code}' $B/api/public/stats)
check stats-open 200 "$code"

# collection: failed
r=$(curl -s -X POST $B/api/subscriptions/$ID3/collections -H "$A" -H 'Content-Type: application/json' -d '{"outcome":"failed"}')
check collection-failed yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);s=d["subscription"];print(s["failed_payment_count"]==1 and s["status"]=="past_due")')"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/api/subscriptions/$ID3/collections -H "$A" -H 'Content-Type: application/json' -d '{"outcome":"maybe"}')
check collection-bad400 400 "$code"

# collection: succeeded -> invoices paid
r=$(curl -s -X POST $B/api/subscriptions/$ID3/collections -H "$A" -H 'Content-Type: application/json' -d '{"outcome":"succeeded"}')
check collection-succeeded yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);s=d["subscription"];print(s["failed_payment_count"]==0 and s["status"]=="active" and d["processed_invoices"]==2 and d["open_invoices"]==0)')"
r=$(curl -s $B/api/subscriptions/$ID3/invoices -H "$A")
check invoices-paid yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(all(i["status"]=="paid" and i["paid_at"] for i in d["items"]))')"

# failed collection on active flips to past_due
r=$(curl -s -X POST $B/api/subscriptions/$ID1/collections -H "$A" -H 'Content-Type: application/json' -d '{"outcome":"failed"}')
check flip-pastdue yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["subscription"]["status"]=="past_due" and d["processed_invoices"]==0)')"

# money rounding two decimals
r=$(curl -s -X POST $B/api/subscriptions -H "$A" -H 'Content-Type: application/json' -d '{"customer_name":"Round Co","plan":"pro","monthly_amount":10.005}')
check money-round yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(round(d["monthly_amount"],2)==d["monthly_amount"])')"

# second user sees everything
curl -s -o /dev/null -X POST $B/api/auth/register -H 'Content-Type: application/json' -d '{"username":"bob","password":"pw2"}'
T2=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"username":"bob","password":"pw2"}' | .venv/bin/python -c 'import sys,json;print(json.load(sys.stdin)["token"])')
r=$(curl -s $B/api/subscriptions/$ID1 -H "Authorization: Bearer $T2")
check shared-visibility yes "$(echo "$r" | .venv/bin/python -c 'import sys,json;d=json.load(sys.stdin);print(d["id"]==ID1)'.replace('ID1','$ID1'))"
code=$(curl -s -o /dev/null -w '%{http_code}' $B/api/subscriptions/$ID1 -H "Authorization: Bearer garbage")
check badtoken401 401 "$code"

echo "PASS=$pass FAIL=$fail"
