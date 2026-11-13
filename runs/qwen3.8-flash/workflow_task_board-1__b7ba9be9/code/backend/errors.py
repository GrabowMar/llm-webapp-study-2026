"""Shared error types and Flask error handlers."""

from flask import Flask, jsonify


class ApiError(Exception):
    def __init__(self, status: int, message: str, errors: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.errors = errors or {}


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError):
        body = {"error": exc.message}
        if exc.errors:
            body["errors"] = exc.errors
        return jsonify(body), exc.status

    @app.errorhandler(404)
    def handle_not_found(_exc):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(405)
    def handle_method_not_allowed(_exc):
        return jsonify({"error": "Method not allowed"}), 405
