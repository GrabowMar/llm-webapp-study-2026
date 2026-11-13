import codecs
import http.client
import ipaddress
import os
import re
import socket
import ssl
import time
from urllib.parse import quote, urljoin, urlsplit

MAX_BYTES = 1024 * 1024
MAX_REDIRECTS = 5
TOTAL_TIMEOUT = 15.0
SOCKET_TIMEOUT = 8.0
USER_AGENT = "Mozilla/5.0 (compatible; LinkPreviewBot/1.0)"
STRICT = os.environ.get("BLOCK_PRIVATE_FETCH", "").lower() in ("1", "true", "yes")

_SSL_CONTEXT = ssl.create_default_context()
_META_CHARSET = re.compile(rb"""<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_\-:.]+)""", re.I)
_NAT64 = ipaddress.ip_network("64:ff9b::/96")
_BROADCAST = ipaddress.ip_network("255.255.255.255/32")
_SIXTOFOUR = ipaddress.ip_network("2002::/16")


class FetchError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.message = message
        self.status = status


class InvalidUrl(FetchError):
    def __init__(self, message):
        super().__init__(message, 400)


def _ip_allowed(ip):
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return _ip_allowed(ip.ipv4_mapped)
        if ip in _NAT64:
            return _ip_allowed(ipaddress.IPv4Address(int(ip) & 0xFFFFFFFF))
        if ip in _SIXTOFOUR:
            return _ip_allowed(ipaddress.IPv4Address((int(ip) >> 80) & 0xFFFFFFFF))
    if STRICT:
        return ip.is_global and not ip.is_multicast
    if ip.is_loopback:
        return True
    return not (
        ip.is_link_local or ip.is_unspecified or ip.is_multicast or ip.is_reserved
        or (isinstance(ip, ipaddress.IPv4Address) and ip in _BROADCAST)
    )


def parse_url(url):
    if not isinstance(url, str):
        raise InvalidUrl("url must be a string")
    url = url.strip()
    if not url or len(url) > 2048 or re.search(r"[\x00-\x20\x7f]", url):
        raise InvalidUrl("invalid url")
    try:
        parts = urlsplit(url)
        host = parts.hostname
        port = parts.port
    except ValueError:
        raise InvalidUrl("invalid url")
    if parts.scheme not in ("http", "https"):
        raise InvalidUrl("url must start with http:// or https://")
    if not host:
        raise InvalidUrl("url has no host")
    if parts.username is not None or parts.password is not None:
        raise InvalidUrl("credentials in url are not allowed")
    return url, parts, host, port


def _resolve(host, port):
    try:
        host_ascii = host.encode("idna").decode("ascii")
    except UnicodeError:
        raise InvalidUrl("invalid host")
    try:
        infos = socket.getaddrinfo(host_ascii, port, type=socket.SOCK_STREAM)
    except (socket.gaierror, UnicodeError):
        raise FetchError("could not resolve host")
    addrs = []
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0].split("%")[0])
        except ValueError:
            continue
        addrs.append((info[0], info[4][0], ip))
    if not addrs:
        raise FetchError("could not resolve host")
    for _, _, ip in addrs:
        if not _ip_allowed(ip):
            raise InvalidUrl("url points to a non-public address")
    return host_ascii, addrs


def _connect(addrs, port, deadline):
    last = None
    for family, addr, _ in addrs:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        try:
            sock = socket.socket(family, socket.SOCK_STREAM)
            sock.settimeout(min(SOCKET_TIMEOUT, remaining))
            sock.connect((addr, port) if family == socket.AF_INET else (addr, port, 0, 0))
            return sock
        except OSError as exc:
            last = exc
            try:
                sock.close()
            except OSError:
                pass
    raise FetchError("could not connect to host" if last else "timed out")


def _request_once(url, deadline):
    _, parts, host, port = parse_url(url)
    secure = parts.scheme == "https"
    port = port or (443 if secure else 80)
    host_ascii, addrs = _resolve(host, port)
    sock = _connect(addrs, port, deadline)
    try:
        if secure:
            try:
                sock = _SSL_CONTEXT.wrap_socket(sock, server_hostname=host_ascii)
            except (ssl.SSLError, OSError):
                raise FetchError("TLS handshake failed")
        path = quote(parts.path or "/", safe="/%:@!$&'()*+,;=~-._")
        if parts.query:
            path += "?" + quote(parts.query, safe="/%:@!$&'()*+,;=~-._?")
        default_port = 443 if secure else 80
        host_header = host_ascii if ":" not in host_ascii else f"[{host_ascii}]"
        if port != default_port:
            host_header += f":{port}"
        conn = http.client.HTTPConnection("localhost")
        conn.sock = sock
        conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
        conn.putheader("Host", host_header)
        conn.putheader("User-Agent", USER_AGENT)
        conn.putheader("Accept", "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5")
        conn.putheader("Accept-Encoding", "identity")
        conn.putheader("Connection", "close")
        conn.endheaders()
        try:
            resp = conn.getresponse()
            status = resp.status
            headers = resp.headers
            location = headers.get("Location")
            body = b""
            if not (300 <= status < 400 and location):
                chunks = []
                size = 0
                while size < MAX_BYTES:
                    if time.monotonic() > deadline:
                        raise FetchError("timed out")
                    chunk = resp.read(min(16384, MAX_BYTES - size))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    size += len(chunk)
                body = b"".join(chunks)
            return status, headers, location, body
        except (http.client.HTTPException, OSError):
            raise FetchError("failed to read response from host")
    finally:
        try:
            sock.close()
        except OSError:
            pass


def _decode(body, content_type):
    charset = None
    m = re.search(r"charset\s*=\s*[\"']?([A-Za-z0-9_\-:.]+)", content_type or "", re.I)
    if m:
        charset = m.group(1)
    if not charset:
        m = _META_CHARSET.search(body[:4096])
        if m:
            charset = m.group(1).decode("ascii", "ignore")
    if body.startswith(codecs.BOM_UTF8):
        charset = "utf-8-sig"
    try:
        return body.decode(charset or "utf-8", "replace")
    except (LookupError, TypeError):
        return body.decode("utf-8", "replace")


def fetch_page(url):
    url, _, _, _ = parse_url(url)
    deadline = time.monotonic() + TOTAL_TIMEOUT
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        try:
            status, headers, location, body = _request_once(current, deadline)
        except InvalidUrl:
            if current == url:
                raise
            raise FetchError("redirected to an invalid or disallowed url")
        if 300 <= status < 400 and location:
            current = urljoin(current, location.strip())
            try:
                parse_url(current)
            except InvalidUrl:
                raise FetchError("redirected to an invalid or disallowed url")
            continue
        content_type = headers.get("Content-Type", "")
        mime = content_type.split(";")[0].strip().lower()
        html = None
        if not mime or mime in ("text/html", "application/xhtml+xml"):
            html = _decode(body, content_type)
        return {"final_url": current, "status_code": status, "html": html}
    raise FetchError("too many redirects")
