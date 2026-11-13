#!/usr/bin/env bash
# Starts the app, runs a command against it, then stops it.
set -u
cd /workspace
PORT="${PORT:-8013}"
export DATA_DIR="${DATA_DIR:-./data}"

setsid nohup .venv/bin/python -c "
import sys; sys.path.insert(0,'backend')
import app
app.app.run(host='127.0.0.1', port=int('$PORT'))
" > /workspace/server.log 2>&1 < /dev/null &
SERVER_PID=$!

for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:${PORT}/api/health" > /dev/null; then break; fi
  sleep 0.25
done

BASE="http://127.0.0.1:${PORT}/api" "$@"
STATUS=$?

kill -TERM -"$SERVER_PID" 2>/dev/null
pkill -f "port=int('$PORT')" 2>/dev/null
exit $STATUS
