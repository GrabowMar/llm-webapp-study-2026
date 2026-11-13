import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

TITLE_MAX = 300
DESCRIPTION_MAX = 1000
IMAGE_URL_MAX = 2048

_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]")
_SPACE = re.compile(r"\s+")


def clean_text(value, limit):
    if not value:
        return None
    value = _CONTROL.sub("", value)
    value = _SPACE.sub(" ", value).strip()
    if not value:
        return None
    return value[:limit]


def clean_url(value, base):
    if not value:
        return None
    value = _CONTROL.sub("", value).strip()
    if not value:
        return None
    try:
        absolute = urljoin(base, value)
        parts = urlsplit(absolute)
        if parts.scheme not in ("http", "https") or not parts.hostname:
            return None
    except ValueError:
        return None
    if len(absolute) > IMAGE_URL_MAX:
        return None
    return absolute


class _Parser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = None
        self._title_parts = []
        self._in_title = False
        self._svg_depth = 0
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        if tag == "svg":
            self._svg_depth += 1
        elif tag == "title" and self._svg_depth == 0 and self.title is None:
            self._in_title = True
            self._title_parts = []
        elif tag == "meta":
            self._handle_meta(attrs)

    def handle_startendtag(self, tag, attrs):
        if tag == "meta":
            self._handle_meta(attrs)

    def handle_endtag(self, tag):
        if tag == "svg" and self._svg_depth:
            self._svg_depth -= 1
        elif tag == "title" and self._in_title:
            self._in_title = False
            self.title = "".join(self._title_parts)

    def handle_data(self, data):
        if self._in_title:
            self._title_parts.append(data)

    def _handle_meta(self, attrs):
        d = {k.lower(): v for k, v in attrs if v is not None}
        key = (d.get("property") or d.get("name") or "").strip().lower()
        content = d.get("content")
        if key and content is not None and key not in self.meta:
            self.meta[key] = content

    def close(self):
        super().close()
        if self._in_title and self.title is None:
            self.title = "".join(self._title_parts)


def extract_preview(html, base_url):
    parser = _Parser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    title = clean_text(parser.meta.get("og:title"), TITLE_MAX) or clean_text(parser.title, TITLE_MAX)
    description = clean_text(parser.meta.get("og:description"), DESCRIPTION_MAX) or clean_text(
        parser.meta.get("description"), DESCRIPTION_MAX
    )
    image_url = clean_url(parser.meta.get("og:image"), base_url)
    return {"title": title, "description": description, "image_url": image_url}
