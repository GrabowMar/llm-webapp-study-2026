"""Flask entry point."""

from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from auth import auth_bp
from db import init_db
from errors import register_error_handlers
from tasks import tasks_bp

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
app.register_blueprint(auth_bp)
app.register_blueprint(tasks_bp)
register_error_handlers(app)

init_db()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "Not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
