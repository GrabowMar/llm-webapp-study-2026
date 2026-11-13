"""Fetch a web page and build a plain-text preview from its metadata."""

from __future__ import annotations

import html
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser

MAX_BYTES = 1_500_000
TIMEOUT = 10.0
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 LinkPreview/1.0"
)
_OG_KEYS = ("og:title", "og:description", "og:image", "og:image:url", "og:image:secure_url")
_TAG_RE = re.compile(r"</?[a-zA-Z][^>]*>")
_WS_RE = re.compile(r"\s+")


class FetchError(Exception):
    """The page could not be fetched."""


class InvalidURL(FetchError):
    """The given URL is not a fetchable http(s) URL."""


@dataclass
class FetchedPreview:
    final_url: str
    status_code: int
    title: str
    description: str
    image_url: str


class _MetaCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.og: dict[str, str] = {}
        self.meta_description: str | None = None
        self.title_chunks: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "meta":
            attributes = {name.lower(): value for name, value in attrs if name}
            key = (attributes.get("property") or attributes.get("name") or "").strip().lower()
            content = attributes.get("content")
            if not key or content is None:
                return
            if key in _OG_KEYS and key not in self.og:
                self.og[key] = content
            elif key == "description" and self.meta_description is None:
                self.meta_description = content
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_chunks.append(data)


def clean_text(value: str | None) -> str:
    """Turn markup from a page into a single-line plain-text value."""
    if not value:
        return ""
    text = html.unescape(value)
    text = _TAG_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def parse_html(document: str) -> tuple[str, str, str]:
    """Return (title, description, image_url) plain-text values from HTML."""
    collector = _MetaCollector()
    try:
        collector.feed(document)
        collector.close()
    except Exception:
        pass

    title = clean_text(collector.og.get("og:title")) or clean_text(
        "".join(collector.title_chunks)
    )
    description = clean_text(collector.og.get("og:description")) or clean_text(
        collector.meta_description
    )
    image = ""
    for key in ("og:image", "og:image:url", "og:image:secure_url"):
        image = clean_text(collector.og.get(key))
        if image:
            break
    return title, description, image


def _decode(raw: bytes, charset: str | None) -> str:
    for encoding in (charset, "utf-8"):
        if not encoding:
            continue
        try:
            return raw.decode(encoding, errors="replace")
        except LookupError:
            continue
    return raw.decode("utf-8", errors="replace")


def _read(requested_url: str, response) -> FetchedPreview:
    status = getattr(response, "status", None) or getattr(response, "code", None) or 200
    final_url = response.geturl() or requested_url
    headers = response.headers
    content_type = (headers.get("Content-Type") or "").lower()
    charset = None
    get_charset = getattr(headers, "get_content_charset", None)
    if callable(get_charset):
        charset = get_charset()
    try:
        raw = response.read(MAX_BYTES)
    except OSError as error:
        raise FetchError(f"could not read response: {error}") from error

    title = description = image = ""
    looks_like_html = not content_type or "html" in content_type or "xml" in content_type
    if looks_like_html:
        title, description, image = parse_html(_decode(raw, charset))
        if image:
            image = urllib.parse.urljoin(final_url, image)

    return FetchedPreview(
        final_url=final_url,
        status_code=int(status),
        title=title,
        description=description,
        image_url=image,
    )


def fetch_preview(url: str) -> FetchedPreview:
    """Fetch ``url`` (following redirects) and return its preview fields."""
    candidate = url.strip()
    if not candidate:
        raise InvalidURL("url is required")
    if "://" not in candidate:
        candidate = "https://" + candidate

    split = urllib.parse.urlsplit(candidate)
    if split.scheme not in ("http", "https") or not split.netloc:
        raise InvalidURL("url must be an http or https URL")

    request = urllib.request.Request(
        candidate,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
    )
    try:
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return _read(candidate, response)
        except urllib.error.HTTPError as error:
            try:
                return _read(candidate, error)
            finally:
                error.close()
    except InvalidURL:
        raise
    except FetchError:
        raise
    except urllib.error.URLError as error:
        reason = getattr(error, "reason", None) or error
        raise FetchError(f"could not fetch url: {reason}") from error
    except (TimeoutError, ConnectionError, OSError) as error:
        raise FetchError(f"could not fetch url: {error}") from error
    except ValueError as error:
        raise InvalidURL(str(error)) from error
