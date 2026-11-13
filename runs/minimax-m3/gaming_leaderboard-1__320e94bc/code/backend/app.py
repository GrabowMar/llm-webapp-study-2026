"""Flask entry point: serves the JSON API under /api and the built frontend."""

from pathlib import Path

from flask import Flask, jsonify, send_from_directory

from api import api, setup_admin
from db import close_db, init_db

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
app.register_blueprint(api)
app.teardown_appcontext(close_db)

init_db()
setup_admin()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/"):
        return jsonify({"error": "not found"}), 404
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")
