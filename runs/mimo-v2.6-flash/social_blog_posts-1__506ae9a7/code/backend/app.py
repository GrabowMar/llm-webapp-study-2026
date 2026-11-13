"""Flask entry point."""

from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import auth
import db
import posts

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)

db.init_db()
auth.bootstrap_admin()


@app.before_request
def _load_user():
    auth.load_user_into_g()


def _api_not_found(message: str, status: int):
    return jsonify({"error": message, "message": message}), status


@app.errorhandler(404)
def not_found(err):
    if request.path.startswith("/api/"):
        return _api_not_found("Not found", 404)
    return err


@app.errorhandler(405)
def method_not_allowed(err):
    if request.path.startswith("/api/"):
        return _api_not_found("Method not allowed", 405)
    return err


@app.get("/api/health")
def health():
    return {"status": "ok"}


auth.register_routes(app)
posts.register_routes(app)


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return _api_not_found("Not found", 404)
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
