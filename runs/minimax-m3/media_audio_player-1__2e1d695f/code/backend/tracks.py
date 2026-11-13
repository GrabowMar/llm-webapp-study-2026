"""Track validation rules and JSON serialisation."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

ALLOWED_SCHEMES = ("http", "https")
MAX_TITLE = 200
MAX_ARTIST = 200
MAX_URL = 2000

_DURATION_CLOCK = re.compile(r"^(?:(?P<h>\d+):)?(?P<m>\d{1,2}):(?P<s>\d{1,2})$")


def validate_url(url: Any) -> tuple[str | None, str | None]:
    """Return ``(clean_url, error)`` for a user supplied audio address."""

    if not isinstance(url, str):
        return None, "URL must be a string"
    cleaned = url.strip()
    if not cleaned:
        return None, "URL is required"
    if len(cleaned) > MAX_URL:
        return None, f"URL must be {MAX_URL} characters or fewer"
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() not in ALLOWED_SCHEMES:
        return None, "Only http and https URLs are allowed"
    if not parsed.netloc:
        return None, "URL must include a host"
    return cleaned, None


def parse_duration(value: Any) -> tuple[Any, float | None, str | None]:
    """Interpret a duration value.

    Durations may be given as a number of seconds or as a ``mm:ss`` /
    ``hh:mm:ss`` string.  The original text is kept so the value can be
    echoed back unchanged, while the parsed number of seconds is used by
    the player.
    """

    if value is None:
        return None, None, None
    if isinstance(value, bool):
        return None, None, "Duration must be a number of seconds or mm:ss"
    if isinstance(value, (int, float)):
        seconds = float(value)
        if seconds < 0:
            return None, None, "Duration cannot be negative"
        return None, seconds, None
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None, None, None
        match = _DURATION_CLOCK.match(text)
        if match:
            hours = int(match.group("h") or 0)
            minutes = int(match.group("m"))
            seconds = int(match.group("s"))
            total = hours * 3600 + minutes * 60 + seconds
            return text, float(total), None
        try:
            number = float(text)
        except ValueError:
            return None, None, "Duration must be a number of seconds or mm:ss"
        if number < 0:
            return None, None, "Duration cannot be negative"
        return text, number, None
    return None, None, "Duration must be a number of seconds or mm:ss"


def validate_track_payload(payload: Any) -> tuple[dict[str, Any], dict[str, str]]:
    """Validate the body of a track creation request.

    Returns ``(values, errors)``; ``errors`` maps a field name to a message.
    """

    errors: dict[str, str] = {}
    if not isinstance(payload, dict):
        return {}, {"_": "A JSON object is required"}

    title = payload.get("title")
    if not isinstance(title, str) or not title.strip():
        errors["title"] = "Title is required"
    elif len(title.strip()) > MAX_TITLE:
        errors["title"] = f"Title must be {MAX_TITLE} characters or fewer"
    else:
        title = title.strip()

    artist_raw = payload.get("artist")
    if artist_raw is None:
        artist = ""
    elif not isinstance(artist_raw, str):
        errors["artist"] = "Artist must be a string"
        artist = ""
    else:
        artist = artist_raw.strip()
        if len(artist) > MAX_ARTIST:
            errors["artist"] = f"Artist must be {MAX_ARTIST} characters or fewer"

    url, url_error = validate_url(payload.get("url"))
    if url_error:
        errors["url"] = url_error

    duration_text, duration_seconds, duration_error = parse_duration(payload.get("duration"))
    if duration_error:
        errors["duration"] = duration_error

    if errors:
        return {}, errors

    return (
        {
            "title": title,
            "artist": artist,
            "url": url,
            "duration": duration_text,
            "duration_seconds": duration_seconds,
        },
        {},
    )


def serialize_track(row: Any) -> dict[str, Any]:
    """Convert a track row into the public JSON representation."""

    duration = row["duration"]
    if duration is None:
        duration = row["duration_seconds"]
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"] or "",
        "url": row["url"],
        "duration": duration,
        "play_count": row["play_count"],
        "created_at": row["created_at"],
        "added_by": row["added_by"] if "added_by" in row.keys() else None,
    }
