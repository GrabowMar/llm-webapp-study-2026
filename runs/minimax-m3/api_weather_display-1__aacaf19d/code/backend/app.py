"""Flask entry point: JSON API for weather reports plus the built web frontend."""

from __future__ import annotations

import os
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

import store
from security import hash_password, new_token, verify_password

DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
DEFAULT_RECENT_LIMIT = 10
MAX_RECENT_LIMIT = 100

app = Flask(__name__, static_folder=None)


def get_db():
    if "db" not in g:
        g.db = store.connect()
    return g.db


def init_store():
    conn = store.connect()
    try:
        store.init_db(conn)
    finally:
        conn.close()


@app.teardown_appcontext
def close_db(_exception=None):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error_response(status: int, message: str, errors: dict | None = None):
    payload: dict = {"error": message}
    if errors:
        payload["errors"] = errors
    return jsonify(payload), status


def validation_error(errors: dict):
    first = next(iter(errors.values()), "validation failed")
    return error_response(400, first, errors)


def require_auth(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if g.get("current_user") is None:
            return error_response(401, "authentication required")
        return view(*args, **kwargs)

    return wrapper


@app.before_request
def resolve_authentication():
    g.current_user = None
    header = request.headers.get("Authorization", "")
    if not header:
        return None
    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    if not token:
        return error_response(401, "authentication required")
    if request.path in ("/api/health", "/api/auth/login", "/api/auth/register"):
        return None
    user = store.find_user_by_token(get_db(), token)
    if user is None:
        return error_response(401, "invalid or expired token")
    g.current_user = user
    return None


def json_body():
    body = request.get_json(silent=True)
    if body is None:
        return {}
    return body


def as_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def clean_text(value):
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def validate_report_payload(payload):
    if not isinstance(payload, dict):
        return {"body": "request body must be a JSON object"}

    errors: dict = {}

    city = payload.get("city")
    if city is None or (isinstance(city, str) and not city.strip()):
        errors["city"] = "city is required"
    elif not isinstance(city, str):
        errors["city"] = "city must be a string"
    elif len(city.strip()) > 120:
        errors["city"] = "city must be at most 120 characters"

    for field in ("country", "condition"):
        value = payload.get(field)
        if value is None:
            continue
        if not isinstance(value, str):
            errors[field] = f"{field} must be a string"
        elif len(value.strip()) > 120:
            errors[field] = f"{field} must be at most 120 characters"

    temperature = payload.get("temperature_c")
    if temperature is not None:
        number = as_number(temperature)
        if number is None:
            errors["temperature_c"] = "temperature_c must be a number"
        elif number < -100 or number > 70:
            errors["temperature_c"] = "temperature_c must be between -100 and 70 degrees Celsius"

    humidity = payload.get("humidity")
    if humidity is not None:
        number = as_number(humidity)
        if number is None:
            errors["humidity"] = "humidity must be a number"
        elif number < 0 or number > 100:
            errors["humidity"] = "humidity must be between 0 and 100"

    wind = payload.get("wind_kph")
    if wind is not None:
        number = as_number(wind)
        if number is None:
            errors["wind_kph"] = "wind_kph must be a number"
        elif number < 0:
            errors["wind_kph"] = "wind_kph must be zero or greater"

    return errors


def clean_report_payload(payload):
    return {
        "city": clean_text(payload.get("city")),
        "country": clean_text(payload.get("country")),
        "temperature_c": as_number(payload.get("temperature_c")),
        "condition": clean_text(payload.get("condition")),
        "humidity": as_number(payload.get("humidity")),
        "wind_kph": as_number(payload.get("wind_kph")),
    }


def positive_int_arg(name: str, default: int, maximum: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    if value < 1:
        return default
    return min(value, maximum)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register")
def register():
    payload = json_body()
    if not isinstance(payload, dict):
        return error_response(400, "request body must be a JSON object")

    errors: dict = {}
    username = payload.get("username")
    password = payload.get("password")

    if username is None or (isinstance(username, str) and not username.strip()):
        errors["username"] = "username is required"
    elif not isinstance(username, str):
        errors["username"] = "username must be a string"
    elif len(username.strip()) > 64:
        errors["username"] = "username must be at most 64 characters"

    if password is None or (isinstance(password, str) and not password):
        errors["password"] = "password is required"
    elif not isinstance(password, str):
        errors["password"] = "password must be a string"
    elif len(password) < 4:
        errors["password"] = "password must be at least 4 characters"
    elif len(password) > 256:
        errors["password"] = "password must be at most 256 characters"

    if errors:
        return validation_error(errors)

    username = username.strip()
    conn = get_db()
    if store.find_user_by_username(conn, username) is not None:
        return error_response(409, "that username is already taken", {"username": "that username is already taken"})

    user = store.create_user(conn, username, hash_password(password))
    return jsonify({"id": user["id"], "username": user["username"]}), 201


@app.post("/api/auth/login")
def login():
    payload = json_body()
    if not isinstance(payload, dict):
        return error_response(400, "request body must be a JSON object")

    username = payload.get("username")
    password = payload.get("password")

    errors: dict = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "username is required"
    if not isinstance(password, str) or not password:
        errors["password"] = "password is required"
    if errors:
        return validation_error(errors)

    conn = get_db()
    row = store.find_user_by_username(conn, username.strip())
    if row is None or not verify_password(password, row["password_hash"]):
        return error_response(401, "invalid username or password")

    token = new_token()
    store.create_token(conn, row["id"], token)
    return jsonify({"token": token, "username": row["username"], "id": row["id"]})


@app.get("/api/auth/me")
@require_auth
def me():
    return jsonify(g.current_user)


@app.post("/api/auth/logout")
@require_auth
def logout():
    header = request.headers.get("Authorization", "")
    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    store.delete_token(get_db(), token)
    return jsonify({"ok": True})


@app.get("/api/weather")
def list_weather():
    city = (request.args.get("city") or "").strip()
    page = positive_int_arg("page", 1, 1_000_000)
    page_size = positive_int_arg("page_size", DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    conn = get_db()
    items, total = store.list_reports(conn, city=city or None, page=page, page_size=page_size)

    if city:
        found = store.find_report_by_city(conn, city) is not None
        store.record_lookup(conn, city, found)

    return jsonify({"items": items, "total": total, "page": page, "page_size": page_size})


@app.post("/api/weather")
@require_auth
def create_weather():
    payload = json_body()
    errors = validate_report_payload(payload)
    if errors:
        return validation_error(errors)

    data = clean_report_payload(payload)
    conn = get_db()
    if store.find_report_by_city(conn, data["city"]) is not None:
        message = f"a report for {data['city']} already exists"
        return error_response(409, message, {"city": message})

    report = store.create_report(conn, data)
    return jsonify(report), 201


@app.get("/api/weather/recent")
def recent_lookups():
    limit = positive_int_arg("limit", DEFAULT_RECENT_LIMIT, MAX_RECENT_LIMIT)
    items = store.recent_lookups(get_db(), limit)
    return jsonify({"items": items})


@app.get("/api/weather/<int:report_id>")
def get_weather(report_id: int):
    report = store.get_report(get_db(), report_id)
    if report is None:
        return error_response(404, "no weather report with that id")
    return jsonify(report)


@app.put("/api/weather/<int:report_id>")
@require_auth
def replace_weather(report_id: int):
    conn = get_db()
    existing = store.get_report(conn, report_id)
    if existing is None:
        return error_response(404, "no weather report with that id")

    payload = json_body()
    errors = validate_report_payload(payload)
    if errors:
        return validation_error(errors)

    data = clean_report_payload(payload)
    clash = store.find_report_by_city(conn, data["city"])
    if clash is not None and clash["id"] != report_id:
        message = f"a report for {data['city']} already exists"
        return error_response(409, message, {"city": message})

    observed_at = store.next_observed_at(existing["observed_at"])
    report = store.replace_report(conn, report_id, data, observed_at)
    return jsonify(report)


@app.delete("/api/weather/<int:report_id>")
@require_auth
def delete_weather(report_id: int):
    conn = get_db()
    if not store.delete_report(conn, report_id):
        return error_response(404, "no weather report with that id")
    return jsonify({"deleted": True, "id": report_id})


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return error_response(404, "not found")
    return frontend("index.html")


@app.errorhandler(405)
def method_not_allowed(_error):
    if request.path.startswith("/api/"):
        return error_response(405, "method not allowed")
    return error_response(405, "method not allowed")


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "index.html"):
    if path.startswith("api/") or path == "api":
        return error_response(404, "not found")
    if (DIST / path).is_file():
        return send_from_directory(DIST, path)
    return send_from_directory(DIST, "index.html")


init_store()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
