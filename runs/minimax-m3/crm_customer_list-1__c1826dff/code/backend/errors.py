"""JSON error helpers shared by the API."""

from typing import Mapping, Optional

from flask import jsonify


def api_error(status: int, message: str, fields: Optional[Mapping[str, str]] = None):
    payload = {
        "error": message,
        "message": message,
    }
    if fields:
        payload["fields"] = dict(fields)
        payload["errors"] = dict(fields)
        payload["details"] = [
            {"field": field, "message": text} for field, text in fields.items()
        ]
    return jsonify(payload), status
