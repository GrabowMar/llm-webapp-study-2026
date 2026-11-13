"""Small shared helpers."""

from datetime import datetime, timezone


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
