"""Shared helpers: per-request database access and error responses."""

from __future__ import annotations

from typing import Any

from flask import g, jsonify

from db import connect


def get_db():
    """Return the SQLite connection bound to the current request."""

    if "db" not in g:
        g.db = connect()
    return g.db


def close_db(_exc=None) -> None:
    """Close the request's database connection (registered as teardown)."""

    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def error_response(message: str, status: int = 400, errors: dict[str, str] | None = None):
    """Build a JSON error body.

    The body always carries a human readable ``error`` message and may carry
    per-field ``errors`` so a form can show validation messages next to the
    fields that caused them.
    """

    body: dict[str, Any] = {"error": message}
    if errors:
        body["errors"] = errors
    return jsonify(body), status
