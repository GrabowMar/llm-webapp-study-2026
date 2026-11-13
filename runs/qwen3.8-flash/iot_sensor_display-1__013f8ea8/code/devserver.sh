#!/bin/bash
set -u
cd /workspace
PIDFILE=/workspace/server.pid
if [ -f "$PIDFILE" ]; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
  sleep 1
fi
case "${1:-start}" in
  stop) exit 0 ;;
esac
rm -rf data_test g.log
DATA_DIR=data_test setsid .venv/bin/gunicorn --bind 127.0.0.1:8000 --pid "$PIDFILE" \
  --pythonpath backend "app:app" > g.log 2>&1 < /dev/null &
for i in $(seq 1 20); do
  if curl -s --max-time 1 http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
    echo "server up (pid $(cat "$PIDFILE" 2>/dev/null))"
    exit 0
  fi
  sleep 0.5
done
echo "server failed to start"; cat g.log
