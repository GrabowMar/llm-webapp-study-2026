"""Flask entry point: JSON API under /api plus the built frontend."""

from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import auth
import todos
from db import close_db, init_db
from todos import ValidationError

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)
app.register_blueprint(auth.bp)
app.register_blueprint(todos.bp)


@app.errorhandler(ValidationError)
def handle_validation_error(error: ValidationError):
    return jsonify({"error": error.message}), 400


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "not found"}), 404
    return _serve_index()


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return jsonify({"error": "method not allowed"}), 405
    return _serve_index()


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


def _serve_index():
    if not (DIST / "index.html").is_file():
        return jsonify({"error": "frontend build not found"}), 404
    return send_from_directory(DIST, "index.html")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return _serve_index()


init_db()
