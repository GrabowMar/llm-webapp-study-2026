"""Fetching remote pages and building preview metadata from their HTML."""

import html
import os
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 LinkPreviewBot/1.0"
)
REQUEST_TIMEOUT = (10, 20)
MAX_BYTES = 2_000_000
MAX_TITLE = 1_024
MAX_DESCRIPTION = 4_096

VERIFY_SSL = os.environ.get("VERIFY_SSL", "1").lower() not in {"0", "false", "no"}

HOSTNAME_RE = re.compile(
    r"^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*\.?$"
)


@dataclass
class FetchResult:
    """Outcome of fetching a page."""

    requested_url: str
    final_url: str
    status_code: int | None = None
    title: str | None = None
    description: str | None = None
    image_url: str | None = None
    error: str | None = None


class _MetadataParser(HTMLParser):
    """Collects the title tag and the meta tags used for link previews."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_title = False
        self.title_parts: list[str] = []
        self.meta: dict[str, str] = {}

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag == "title":
            self.in_title = True
        elif tag == "meta":
            attributes = {key.lower(): (value or "") for key, value in attrs}
            key = (attributes.get("property") or attributes.get("name") or "").strip().lower()
            content = attributes.get("content", "")
            if key and content and key not in self.meta:
                self.meta[key] = content

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)


def normalize_url(url: str) -> str | None:
    """Add a scheme when missing and reject anything that is not http(s)."""
    url = (url or "").strip()
    if not url:
        return None
    if "://" not in url:
        url = "https://" + url.lstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    if any(character.isspace() for character in parsed.netloc):
        return None
    host = (parsed.hostname or "").lower()
    if not host:
        return None
    if ":" not in host and not HOSTNAME_RE.match(host):
        return None
    return url


def clean_text(value: str | None, limit: int) -> str | None:
    """Turn a piece of HTML into plain text."""
    if value is None:
        return None
    text = html.unescape(value)
    text = re.sub(r"<[^>]*>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return None
    return text[:limit]


def parse_metadata(markup: str, final_url: str) -> tuple[str | None, str | None, str | None]:
    """Extract title, description and image from an HTML document."""
    parser = _MetadataParser()
    try:
        parser.feed(markup)
        parser.close()
    except Exception:  # malformed markup should never break the request
        pass

    meta = parser.meta
    title = clean_text(meta.get("og:title"), MAX_TITLE) or clean_text(
        "".join(parser.title_parts), MAX_TITLE
    )
    description = clean_text(meta.get("og:description"), MAX_DESCRIPTION) or clean_text(
        meta.get("description"), MAX_DESCRIPTION
    )

    image = meta.get("og:image") or meta.get("og:image:url") or meta.get("og:image:secure_url")
    image_url = clean_text(image, MAX_DESCRIPTION)
    if image_url:
        image_url = urljoin(final_url, image_url)
    else:
        image_url = None

    return title, description, image_url


def _decode(raw: bytes, content_type: str, encoding: str | None) -> str:
    if "charset=" in (content_type or "").lower():
        return raw.decode(encoding or "utf-8", errors="replace")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode(encoding or "latin-1", errors="replace")


def fetch(url: str) -> FetchResult:
    """Fetch a page and build preview metadata from it."""
    result = FetchResult(requested_url=url, final_url=url)
    try:
        response = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
            stream=True,
            verify=VERIFY_SSL,
        )
    except requests.exceptions.SSLError:
        try:
            response = requests.get(
                url,
                headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8"},
                timeout=REQUEST_TIMEOUT,
                allow_redirects=True,
                stream=True,
                verify=False,
            )
        except requests.RequestException as exc:
            result.error = f"could not fetch page: {exc}"
            return result
    except requests.RequestException as exc:
        result.error = f"could not fetch page: {exc}"
        return result

    try:
        raw = b""
        for chunk in response.iter_content(chunk_size=65536):
            raw += chunk
            if len(raw) >= MAX_BYTES:
                break
        raw = raw[:MAX_BYTES]
        markup = _decode(raw, response.headers.get("Content-Type", ""), response.encoding)
        result.status_code = response.status_code
        result.final_url = response.url or url
        title, description, image_url = parse_metadata(markup, result.final_url)
        result.title = title
        result.description = description
        result.image_url = image_url
    except requests.RequestException as exc:
        result.error = f"could not read page: {exc}"
    finally:
        response.close()
    return result
