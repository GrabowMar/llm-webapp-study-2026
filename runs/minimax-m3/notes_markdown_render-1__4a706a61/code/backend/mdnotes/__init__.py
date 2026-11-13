"""Application factory for the Markdown notes app."""

from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from .api import api
from .db import init_app as init_db

DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    init_db(app)
    app.register_blueprint(api, url_prefix="/api")

    @app.get("/api/<path:_unknown>")
    def api_not_found(_unknown: str):
        return jsonify({"error": "not found"}), 404

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path: str = "index.html"):
        if path == "index.html" and not (DIST / "index.html").is_file():
            return jsonify({"error": "frontend build is missing"}), 404
        candidate = DIST / path
        if path and candidate.is_file():
            return send_from_directory(DIST, path)
        return send_from_directory(DIST, "index.html")

    return app
