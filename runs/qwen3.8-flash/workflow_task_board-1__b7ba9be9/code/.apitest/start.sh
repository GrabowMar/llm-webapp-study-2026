#!/bin/bash
# Start (or restart) the backend for local testing.
cd /workspace
kill_gunicorn() {
  for pid in $(ps -eo pid,args | grep -E "[g]unicorn.*app:app" | awk '{print $1}'); do
    kill "$pid" 2>/dev/null
  done
  sleep 1
}
kill_gunicorn
rm -rf data
nohup .venv/bin/gunicorn --bind 127.0.0.1:8000 --pythonpath backend --chdir /workspace app:app > /workspace/.apitest/server.log 2>&1 &
for _ in $(seq 1 20); do
  if curl -s -m 1 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then echo "server up"; exit 0; fi
  sleep 0.5
done
echo "server failed to start"; tail -20 /workspace/.apitest/server.log; exit 1
