"""Flask entry point: the JSON API plus the built frontend."""

from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import NotFound

from api import api
from db import init_db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def create_app() -> Flask:
    app = Flask(__name__, static_folder=None)
    init_db()
    app.register_blueprint(api)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.after_request
    def add_cors_headers(response):
        if request.path.startswith("/api"):
            response.headers["Access-Control-Allow-Origin"] = "*"
            response.headers["Access-Control-Allow-Headers"] = (
                "Authorization, Content-Type"
            )
            response.headers["Access-Control-Allow-Methods"] = (
                "GET, POST, PUT, DELETE, OPTIONS"
            )
        return response

    @app.before_request
    def handle_preflight():
        if request.method == "OPTIONS" and request.path.startswith("/api"):
            return ("", 204)

    @app.get("/")
    @app.get("/<path:path>")
    def frontend(path: str = "index.html"):
        if path == "api" or path.startswith("api/"):
            return jsonify({"error": "Not found."}), 404
        root = DIST.resolve()
        target = (DIST / path).resolve()
        if target.is_file() and target.is_relative_to(root):
            try:
                return send_from_directory(DIST, path)
            except NotFound:
                pass
        if (DIST / "index.html").is_file():
            return send_from_directory(DIST, "index.html")
        return jsonify({"error": "Frontend build not found."}), 404

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
