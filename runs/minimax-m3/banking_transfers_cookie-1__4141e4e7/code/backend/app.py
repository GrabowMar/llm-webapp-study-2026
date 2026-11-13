"""Flask entry point.

Serves the JSON API under /api and the built React frontend from the same
origin.  Persistent data lives in ./data (SQLite).
"""

from __future__ import annotations

from pathlib import Path

from flask import Flask, request, send_from_directory
from werkzeug.exceptions import HTTPException

from bank import db
from bank.api import ApiError, api, error_response

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.config["BANK_DATA_DIR"] = db.DATA_DIR
app.json.sort_keys = False

app.register_blueprint(api)
app.teardown_appcontext(db.close_db)


@app.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return error_response(error.status, error.message)


@app.errorhandler(404)
def handle_not_found(_error):
    if request.path.startswith("/api"):
        return error_response(404, "Not found")
    return serve_index()


@app.errorhandler(Exception)
def handle_unexpected_error(error: Exception):
    if isinstance(error, ApiError):
        return error_response(error.status, error.message)
    if isinstance(error, HTTPException):
        return error_response(error.code or 500, error.description or "Error")
    app.logger.exception("Unhandled error: %s", error)
    return error_response(500, "Internal server error")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return error_response(404, "Not found")
    if path and (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return serve_index()


def serve_index():
    index = DIST / "index.html"
    if not index.is_file():
        return error_response(
            404, "Frontend build not found; run 'npm run build' in frontend/"
        )
    return send_from_directory(DIST, "index.html")


def init() -> None:
    """Prepare the database before the app starts serving requests."""
    db.init_db()


init()
