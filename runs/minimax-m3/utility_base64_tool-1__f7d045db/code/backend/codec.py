"""Base64 helpers shared by the API endpoints."""

from __future__ import annotations

import base64
import binascii

PREVIEW_LIMIT = 200


class ConversionError(ValueError):
    """Raised when a payload cannot be converted."""


def encode_text(text: str) -> str:
    """Encode text as UTF-8 into standard, padded base64."""
    return base64.b64encode(text.encode("utf-8")).decode("ascii")


def decode_base64(value: str) -> str:
    """Decode standard base64 into UTF-8 text."""
    compact = "".join(value.split())
    if not compact:
        return ""
    try:
        raw = base64.b64decode(compact, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ConversionError("Invalid base64 input") from exc
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ConversionError("Decoded value is not valid UTF-8 text") from exc


def convert(direction: str, value: str) -> str:
    """Convert a value in the given direction ("encode" or "decode")."""
    if direction == "encode":
        return encode_text(value)
    if direction == "decode":
        return decode_base64(value)
    raise ConversionError("Direction must be 'encode' or 'decode'")


def preview(text: str, limit: int = PREVIEW_LIMIT) -> str:
    """Return a short preview of a text."""
    return text[:limit]
