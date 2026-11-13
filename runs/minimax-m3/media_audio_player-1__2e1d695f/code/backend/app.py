"""Flask entry point: JSON API under /api plus the built web frontend."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from flask import Flask, jsonify, send_from_directory  # noqa: E402

from auth_routes import bp as auth_bp  # noqa: E402
from common import close_db  # noqa: E402
from db import init_db  # noqa: E402
from tracks_routes import bp as tracks_bp  # noqa: E402

DIST = BACKEND_DIR.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)
app.register_blueprint(auth_bp)
app.register_blueprint(tracks_bp)


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    if (DIST / "index.html").is_file():
        return send_from_directory(DIST, "index.html")
    return jsonify({"error": "Frontend build is missing"}), 404


init_db()
