#!/bin/bash
# Start (or restart) the backend for local testing, fully detached.
cd /workspace
for pid in $(ps -eo pid,args | grep -E "[g]unicorn.*app:app" | awk '{print $1}'); do
  kill "$pid" 2>/dev/null
done
sleep 1
W=${1:-3}
setsid nohup .venv/bin/gunicorn --bind 127.0.0.1:8000 --workers "$W" \
  --pythonpath backend --chdir /workspace app:app \
  > /workspace/.apitest/server.log 2>&1 < /dev/null &
disown
for _ in $(seq 1 30); do
  curl -s -m 1 http://127.0.0.1:8000/api/health >/dev/null 2>&1 && { echo "server up (workers=$W)"; exit 0; }
  sleep 0.4
done
echo "server failed to start"; tail -20 /workspace/.apitest/server.log; exit 1
