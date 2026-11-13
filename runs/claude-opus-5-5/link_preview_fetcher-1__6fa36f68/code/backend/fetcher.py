"""Fetching web pages and extracting link previews from them."""

from __future__ import annotations

import gzip
import ipaddress
import os
import re
import socket
import ssl
import time
import unicodedata
import zlib
from dataclasses import dataclass
from html.parser import HTMLParser
from http.client import HTTPConnection, HTTPException, HTTPSConnection
from urllib.parse import urljoin, urlsplit, urlunsplit

TIMEOUT = float(os.environ.get("FETCH_TIMEOUT", "10"))
TOTAL_TIMEOUT = float(os.environ.get("FETCH_TOTAL_TIMEOUT", "25"))
MAX_BYTES = int(os.environ.get("FETCH_MAX_BYTES", str(2 * 1024 * 1024)))
MAX_REDIRECTS = 5
MAX_URL_LENGTH = 2048
MAX_TITLE = 300
MAX_DESCRIPTION = 1000
USER_AGENT = "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)"
BLOCK_PRIVATE = os.environ.get("FETCH_BLOCK_PRIVATE", "").lower() in ("1", "true", "yes")


class FetchError(Exception):
    pass


class InvalidURL(ValueError):
    pass


@dataclass
class PageResult:
    final_url: str
    status_code: int
    title: str | None
    description: str | None
    image_url: str | None


def normalize_url(raw: object) -> str:
    if raw is None:
        raise InvalidURL("url is required")
    if not isinstance(raw, str):
        raise InvalidURL("url must be a string")
    url = raw.strip()
    if not url:
        raise InvalidURL("url is required")
    if len(url) > MAX_URL_LENGTH:
        raise InvalidURL("url is too long")
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in url):
        raise InvalidURL("url must not contain whitespace or control characters")
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise InvalidURL("url is not valid") from exc
    if parts.scheme.lower() not in ("http", "https"):
        raise InvalidURL("url must start with http:// or https://")
    if not parts.hostname:
        raise InvalidURL("url must include a host")
    if port == 0:
        raise InvalidURL("url port is not valid")
    return url


def _ip_allowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    if BLOCK_PRIVATE and (ip.is_private or ip.is_loopback or not ip.is_global):
        return False
    if ip.is_loopback or ip.is_private:
        return not ip.is_link_local
    if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
        return False
    return True


def _resolve(host: str, port: int) -> list[str]:
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError) as exc:
        raise FetchError(f"could not resolve host {host}") from exc
    addresses: list[str] = []
    for info in infos:
        addr = info[4][0]
        ip = ipaddress.ip_address(addr.split("%", 1)[0])
        if not _ip_allowed(ip):
            raise FetchError("this address is not allowed")
        if addr not in addresses:
            addresses.append(addr)
    if not addresses:
        raise FetchError(f"could not resolve host {host}")
    return addresses


def _connect(addresses: list[str], port: int) -> socket.socket:
    last: OSError | None = None
    for addr in addresses:
        try:
            return socket.create_connection((addr, port), timeout=TIMEOUT)
        except OSError as exc:
            last = exc
    raise FetchError(f"could not connect: {last}")


class _PinnedHTTPConnection(HTTPConnection):
    def __init__(self, host: str, port: int, addresses: list[str]):
        super().__init__(host, port, timeout=TIMEOUT)
        self._addresses = addresses

    def connect(self) -> None:
        self.sock = _connect(self._addresses, self.port)


class _PinnedHTTPSConnection(HTTPSConnection):
    def __init__(self, host: str, port: int, addresses: list[str]):
        context = ssl.create_default_context()
        super().__init__(host, port, timeout=TIMEOUT, context=context)
        self._addresses = addresses
        self._ctx = context

    def connect(self) -> None:
        sock = _connect(self._addresses, self.port)
        self.sock = self._ctx.wrap_socket(sock, server_hostname=self.host)


def _read_limited(resp, deadline: float) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while total < MAX_BYTES:
        if time.monotonic() > deadline:
            raise FetchError("timed out")
        chunk = resp.read(min(65536, MAX_BYTES - total))
        if not chunk:
            break
        chunks.append(chunk)
        total += len(chunk)
    return b"".join(chunks)


def _decompress(body: bytes, encoding: str) -> bytes:
    encoding = encoding.strip().lower()
    try:
        if encoding in ("gzip", "x-gzip"):
            d = zlib.decompressobj(16 + zlib.MAX_WBITS)
            return d.decompress(body, MAX_BYTES)
        if encoding == "deflate":
            try:
                return zlib.decompressobj().decompress(body, MAX_BYTES)
            except zlib.error:
                return zlib.decompressobj(-zlib.MAX_WBITS).decompress(body, MAX_BYTES)
    except (zlib.error, gzip.BadGzipFile):
        return b""
    return body


def _request(url: str, deadline: float) -> tuple[int, dict[str, str], bytes]:
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    host = parts.hostname or ""
    port = parts.port or (443 if scheme == "https" else 80)
    addresses = _resolve(host, port)
    conn_cls = _PinnedHTTPSConnection if scheme == "https" else _PinnedHTTPConnection
    conn = conn_cls(host, port, addresses)
    path = parts.path or "/"
    if parts.query:
        path += "?" + parts.query
    host_header = host if ":" not in host else f"[{host}]"
    if parts.port:
        host_header += f":{parts.port}"
    try:
        conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", host_header)
        conn.putheader("User-Agent", USER_AGENT)
        conn.putheader("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
        conn.putheader("Accept-Encoding", "gzip, deflate")
        conn.putheader("Accept-Language", "en;q=0.9, *;q=0.5")
        conn.endheaders()
        resp = conn.getresponse()
        headers = {k.lower(): v for k, v in resp.getheaders()}
        status = resp.status
        if 300 <= status < 400 and "location" in headers:
            body = b""
        else:
            body = _read_limited(resp, deadline)
        if headers.get("content-encoding"):
            body = _decompress(body, headers["content-encoding"])
        return status, headers, body
    except FetchError:
        raise
    except socket.timeout as exc:
        raise FetchError("timed out") from exc
    except ssl.SSLError as exc:
        raise FetchError(f"TLS error: {exc.reason or exc}") from exc
    except (OSError, HTTPException, ValueError) as exc:
        raise FetchError(f"request failed: {exc}") from exc
    finally:
        conn.close()


_META_CHARSET = re.compile(rb"""<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_\-:.]+)""", re.I)


def _decode(body: bytes, content_type: str) -> str:
    candidates: list[str] = []
    m = re.search(r"charset\s*=\s*[\"']?([A-Za-z0-9_\-:.]+)", content_type, re.I)
    if m:
        candidates.append(m.group(1))
    if body.startswith(b"\xef\xbb\xbf"):
        candidates.insert(0, "utf-8-sig")
    m2 = _META_CHARSET.search(body[:4096])
    if m2:
        candidates.append(m2.group(1).decode("ascii", "ignore"))
    candidates.append("utf-8")
    for enc in candidates:
        try:
            return body.decode(enc, errors="replace")
        except LookupError:
            continue
    return body.decode("utf-8", errors="replace")


class _PreviewParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] | None = None
        self.title: str | None = None
        self.meta: dict[str, str] = {}
        self.base_href: str | None = None
        self._svg_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        attrs_d = {k.lower(): (v or "") for k, v in attrs if k}
        if tag == "svg":
            self._svg_depth += 1
        elif tag == "title" and self.title is None and self._svg_depth == 0:
            self.title_parts = []
        elif tag == "meta":
            key = (attrs_d.get("property") or attrs_d.get("name") or "").strip().lower()
            if key and "content" in attrs_d and key not in self.meta:
                self.meta[key] = attrs_d["content"]
        elif tag == "base" and self.base_href is None and attrs_d.get("href"):
            self.base_href = attrs_d["href"].strip()

    def handle_startendtag(self, tag: str, attrs) -> None:
        if tag == "svg":
            return
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        if tag == "svg" and self._svg_depth:
            self._svg_depth -= 1
        elif tag == "title" and self.title_parts is not None:
            self.title = "".join(self.title_parts)
            self.title_parts = None

    def handle_data(self, data: str) -> None:
        if self.title_parts is not None:
            self.title_parts.append(data)

    def finish(self) -> None:
        if self.title_parts is not None and self.title is None:
            self.title = "".join(self.title_parts)
            self.title_parts = None


_SCRIPT_LIKE = re.compile(r"<(script|style)\b[^>]*>.*?(</\1\s*>|$)", re.I | re.S)
_TAG_LIKE = re.compile(r"</?[A-Za-z][^<>]*>|<!--.*?(-->|$)", re.S)


def clean_text(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    value = _SCRIPT_LIKE.sub(" ", value)
    value = _TAG_LIKE.sub(" ", value)
    value = "".join(
        " " if unicodedata.category(ch) in ("Cc", "Zl", "Zp") else ch
        for ch in value
        if unicodedata.category(ch) not in ("Cf", "Cs", "Co") or ch == "\u200d"
    )
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return None
    if len(value) > limit:
        value = value[: limit - 1].rstrip() + "\u2026"
    return value


def _clean_image(value: str | None, base: str) -> str | None:
    if not value:
        return None
    value = value.strip()
    if not value or any(ord(ch) < 32 for ch in value):
        return None
    try:
        absolute = urljoin(base, value)
        parts = urlsplit(absolute)
    except ValueError:
        return None
    if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
        return None
    absolute = urlunsplit(parts._replace(fragment=parts.fragment))
    if len(absolute) > MAX_URL_LENGTH:
        return None
    return absolute


def parse_html(html: str, base_url: str) -> tuple[str | None, str | None, str | None]:
    parser = _PreviewParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    parser.finish()
    meta = parser.meta
    title = clean_text(meta.get("og:title"), MAX_TITLE) or clean_text(parser.title, MAX_TITLE)
    description = clean_text(meta.get("og:description"), MAX_DESCRIPTION) or clean_text(
        meta.get("description"), MAX_DESCRIPTION
    )
    base = base_url
    if parser.base_href:
        candidate = _clean_image(parser.base_href, base_url)
        if candidate:
            base = candidate
    image = None
    for key in ("og:image", "og:image:url", "og:image:secure_url"):
        image = _clean_image(meta.get(key), base)
        if image:
            break
    return title, description, image


def fetch_preview(url: str) -> PageResult:
    current = normalize_url(url)
    deadline = time.monotonic() + TOTAL_TIMEOUT
    for _ in range(MAX_REDIRECTS + 1):
        if time.monotonic() > deadline:
            raise FetchError("timed out")
        status, headers, body = _request(current, deadline)
        location = headers.get("location")
        if status in (301, 302, 303, 307, 308) and location:
            try:
                nxt = urljoin(current, location.strip())
                current = normalize_url(nxt)
            except (InvalidURL, ValueError) as exc:
                raise FetchError("redirected to an invalid url") from exc
            continue
        content_type = headers.get("content-type", "")
        title = description = image = None
        mime = content_type.split(";", 1)[0].strip().lower()
        if body and (not mime or "html" in mime or mime == "text/plain" and b"<" in body[:1024]):
            title, description, image = parse_html(_decode(body, content_type), current)
        return PageResult(current, status, title, description, image)
    raise FetchError("too many redirects")
