#!/bin/bash
cd /workspace
if [ -f /workspace/data/dev-server.pid ]; then
  kill "$(cat /workspace/data/dev-server.pid)" 2>/dev/null
  sleep 0.4
fi
ADMIN_PASSWORD=secretadmin nohup /workspace/.venv/bin/python backend/app.py > /workspace/data/dev-server.log 2>&1 &
echo $! > /workspace/data/dev-server.pid
