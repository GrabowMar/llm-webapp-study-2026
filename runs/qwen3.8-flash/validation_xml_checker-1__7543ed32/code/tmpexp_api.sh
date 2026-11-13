set -e
cd /workspace
rm -rf data
/workspace/.venv/bin/python -m flask --app backend/app run --port 8001 > /workspace/tmpexp_server.log 2>&1 &
sleep 2
