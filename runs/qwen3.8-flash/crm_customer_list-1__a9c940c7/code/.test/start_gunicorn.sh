#!/bin/sh
cd /workspace
rm -rf .test/data && mkdir -p .test/data
PYTHONPATH=backend DATA_DIR=.test/data exec .venv-test/bin/gunicorn --bind 127.0.0.1:8111 --pythonpath backend --workers 2 app:app > .test/gunicorn.log 2>&1
