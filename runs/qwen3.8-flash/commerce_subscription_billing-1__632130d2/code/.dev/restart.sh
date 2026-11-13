#!/bin/bash
cd /workspace
if [ -f .dev/server.pid ]; then kill -9 "$(cat .dev/server.pid)" 2>/dev/null; sleep 0.3; fi
rm -rf data .dev/server.log
setsid .venv/bin/python backend/app.py </dev/null > .dev/server.log 2>&1 &
echo $! > .dev/server.pid
sleep 2
curl -s -m 3 http://127.0.0.1:8000/api/health
