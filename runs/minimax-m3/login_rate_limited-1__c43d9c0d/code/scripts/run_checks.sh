#!/usr/bin/env bash
# Start the app, run the API checks, stop the app again.
set -u
cd /workspace
pkill -f "[g]unicorn" >/dev/null 2>&1
sleep 1
rm -rf data
ADMIN_PASSWORD=admin-pw .venv/bin/gunicorn --bind 127.0.0.1:8000 --pythonpath backend app:app > /tmp/gunicorn.log 2>&1 &
SRV=$!
sleep 3
.venv/bin/python scripts/check_api.py
RC=$?
kill $SRV >/dev/null 2>&1
wait $SRV 2>/dev/null
echo "test exit: $RC"
exit $RC
