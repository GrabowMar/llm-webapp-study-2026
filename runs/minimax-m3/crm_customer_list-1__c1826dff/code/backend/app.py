"""Flask entry point for the customer directory API and web frontend."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request, send_from_directory

from auth import (
    bearer_token,
    create_session,
    current_user,
    delete_session,
    hash_password,
    login_required,
    verify_password,
)
from db import close_db, get_db, init_db, utcnow
from directory import (
    FIELD_LABELS,
    create_interaction,
    fetch_customer,
    list_companies,
    list_customers,
    list_interactions,
    parse_customer_payload,
    parse_timestamp,
    serialize_customer,
)
from errors import api_error

DIST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", "dist"
)

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 20

app = Flask(__name__, static_folder=None)
app.teardown_appcontext(close_db)


def int_arg(name, default):
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None
    return data


def is_api_request():
    return request.path == "/api" or request.path.startswith("/api/")


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    data = json_body()
    if data is None:
        return api_error(400, "Send a JSON body with a username and a password.")
    username = data.get("username")
    password = data.get("password")
    errors = {}
    if not isinstance(username, str) or not username.strip():
        errors["username"] = "Username is required."
    if not isinstance(password, str) or not password:
        errors["password"] = "Password is required."
    if errors:
        return api_error(400, "Please fix the highlighted fields.", errors)
    username = username.strip()
    if len(username) > 64:
        return api_error(400, "Please fix the highlighted fields.", {"username": "Username is too long."})
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        return api_error(
            400,
            "Please fix the highlighted fields.",
            {"username": "That username is already taken."},
        )
    cursor = db.execute(
        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
        (username, hash_password(password), utcnow()),
    )
    user_id = cursor.lastrowid
    token = create_session(user_id)
    return jsonify({"token": token, "id": user_id, "username": username}), 201


@app.post("/api/auth/login")
def login():
    data = json_body()
    if data is None:
        return api_error(400, "Send a JSON body with a username and a password.")
    username = data.get("username")
    password = data.get("password")
    if not isinstance(username, str) or not isinstance(password, str) or not username.strip() or not password:
        return api_error(
            400,
            "Please fix the highlighted fields.",
            {"username": "Username is required.", "password": "Password is required."},
        )
    row = get_db().execute(
        "SELECT id, username, password_hash FROM users WHERE username = ?", (username.strip(),)
    ).fetchone()
    if row is None or not verify_password(row["password_hash"], password):
        return api_error(401, "Invalid username or password.")
    return jsonify({"token": create_session(row["id"])})


@app.post("/api/auth/logout")
@login_required
def logout():
    delete_session(bearer_token())
    return jsonify({"status": "signed out"})


@app.get("/api/auth/me")
@login_required
def me():
    user = current_user()
    return jsonify({"id": user["id"], "username": user["username"]})


@app.get("/api/companies")
@login_required
def companies():
    return jsonify({"items": list_companies()})


@app.get("/api/customers")
@login_required
def customers_index():
    query = (request.args.get("q") or "").strip()
    company = (request.args.get("company") or "").strip()
    page = max(1, int_arg("page", 1))
    page_size = min(MAX_PAGE_SIZE, max(1, int_arg("page_size", DEFAULT_PAGE_SIZE)))
    items, total = list_customers(query, company, page, page_size)
    return jsonify(
        {"items": items, "total": total, "page": page, "page_size": page_size}
    )


@app.post("/api/customers")
@login_required
def customers_create():
    data = json_body()
    if data is None:
        return api_error(400, "Send a JSON body with the customer details.")
    values, errors = parse_customer_payload(data)
    if errors:
        return api_error(400, "Please fix the highlighted fields.", errors)
    db = get_db()
    moment = utcnow()
    cursor = db.execute(
        "INSERT INTO customers (name, email, phone, company, notes, created_at, updated_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            values["name"],
            values["email"],
            values["phone"],
            values["company"],
            values["notes"],
            moment,
            moment,
        ),
    )
    row = fetch_customer(cursor.lastrowid)
    return jsonify(serialize_customer(row)), 201


@app.get("/api/customers/<int:customer_id>")
@login_required
def customers_show(customer_id):
    row = fetch_customer(customer_id)
    if row is None:
        return api_error(404, "That customer does not exist.")
    return jsonify(serialize_customer(row))


def _update_customer(customer_id, partial):
    existing = fetch_customer(customer_id)
    if existing is None:
        return api_error(404, "That customer does not exist.")
    data = json_body()
    if data is None:
        return api_error(400, "Send a JSON body with the customer details.")
    payload = data
    if partial:
        payload = {key: existing[key] for key in FIELD_LABELS}
        payload.update({key: value for key, value in data.items() if key in FIELD_LABELS})
    values, errors = parse_customer_payload(payload, exclude_id=customer_id)
    if errors:
        return api_error(400, "Please fix the highlighted fields.", errors)
    get_db().execute(
        "UPDATE customers SET name = ?, email = ?, phone = ?, company = ?, notes = ?, updated_at = ? "
        "WHERE id = ?",
        (
            values["name"],
            values["email"],
            values["phone"],
            values["company"],
            values["notes"],
            utcnow(),
            customer_id,
        ),
    )
    return jsonify(serialize_customer(fetch_customer(customer_id)))


@app.put("/api/customers/<int:customer_id>")
@login_required
def customers_update(customer_id):
    return _update_customer(customer_id, partial=False)


@app.patch("/api/customers/<int:customer_id>")
@login_required
def customers_patch(customer_id):
    return _update_customer(customer_id, partial=True)


@app.delete("/api/customers/<int:customer_id>")
@login_required
def customers_delete(customer_id):
    if fetch_customer(customer_id) is None:
        return api_error(404, "That customer does not exist.")
    db = get_db()
    db.execute("DELETE FROM interactions WHERE customer_id = ?", (customer_id,))
    db.execute("DELETE FROM customers WHERE id = ?", (customer_id,))
    return jsonify({"status": "deleted", "id": customer_id})


@app.get("/api/customers/<int:customer_id>/interactions")
@login_required
def interactions_index(customer_id):
    if fetch_customer(customer_id) is None:
        return api_error(404, "That customer does not exist.")
    return jsonify({"items": list_interactions(customer_id)})


@app.post("/api/customers/<int:customer_id>/interactions")
@login_required
def interactions_create(customer_id):
    if fetch_customer(customer_id) is None:
        return api_error(404, "That customer does not exist.")
    data = json_body()
    if data is None:
        return api_error(400, "Send a JSON body with the interaction details.")
    errors = {}
    kind = data.get("kind")
    if not isinstance(kind, str) or not kind.strip():
        errors["kind"] = "Kind is required."
    summary = data.get("summary")
    if summary is None:
        summary = ""
    elif isinstance(summary, bool) or not isinstance(summary, (str, int, float)):
        errors["summary"] = "Summary must be text."
        summary = ""
    else:
        summary = str(summary).strip()
    occurred_at = None
    raw_occurred = data.get("occurred_at")
    if raw_occurred is None:
        raw_occurred = data.get("occurredAt")
    try:
        occurred_at = parse_timestamp(raw_occurred)
    except ValueError:
        errors["occurred_at"] = "Use a valid date and time."
    if errors:
        return api_error(400, "Please fix the highlighted fields.", errors)
    item = create_interaction(
        customer_id,
        kind.strip(),
        summary,
        occurred_at or utcnow(),
        current_user()["id"],
    )
    return jsonify(item), 201


def serve_frontend(path):
    target = os.path.join(DIST, path)
    if path and os.path.isfile(target):
        response = send_from_directory(DIST, path)
        if path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response
    index = os.path.join(DIST, "index.html")
    if os.path.isfile(index):
        response = send_from_directory(DIST, "index.html")
        response.headers["Cache-Control"] = "no-cache"
        return response
    return (
        "The frontend build is missing. Run `npm run build` in frontend/ and restart.",
        500,
    )


@app.get("/")
@app.get("/<path:path>")
def frontend(path="index.html"):
    if path == "api" or path.startswith("api/"):
        return api_error(404, "Unknown API endpoint.")
    return serve_frontend(path)


@app.errorhandler(404)
def handle_not_found(_error):
    if is_api_request():
        return api_error(404, "Unknown API endpoint.")
    return serve_frontend(request.path.lstrip("/"))


@app.errorhandler(405)
def handle_method_not_allowed(_error):
    if is_api_request():
        return api_error(405, "That method is not allowed for this endpoint.")
    return serve_frontend(request.path.lstrip("/"))


@app.errorhandler(500)
def handle_server_error(_error):
    if is_api_request():
        return api_error(500, "Something went wrong on the server.")
    return serve_frontend(request.path.lstrip("/"))


init_db()
