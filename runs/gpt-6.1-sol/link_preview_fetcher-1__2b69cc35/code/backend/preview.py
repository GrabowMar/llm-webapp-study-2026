import http.client
import ipaddress
import re
import socket
import ssl
import time
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

MAX_PAGE_BYTES = 2 * 1024 * 1024
FETCH_TIMEOUT = 20
MAX_REDIRECTS = 5


class PreviewError(Exception):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


class PlainTextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, _attrs):
        if tag in ("script", "style"):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def plain_text(value, limit):
    parser = PlainTextParser()
    parser.feed(value)
    parser.close()
    return " ".join(" ".join(parser.parts).split())[:limit]


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.metadata = {}
        self.title_parts = []
        self.in_title = False
        self.title_finished = False

    def handle_starttag(self, tag, attrs):
        attributes = {key.lower(): value for key, value in attrs if value is not None}
        if tag == "title" and not self.title_finished:
            self.in_title = True
        if tag == "meta":
            key = (attributes.get("property") or attributes.get("name") or "").lower()
            value = attributes.get("content", "").strip()
            if key in ("og:title", "og:description", "og:image", "description") and value:
                self.metadata.setdefault(key, value)

    def handle_endtag(self, tag):
        if tag == "title":
            self.in_title = False
            self.title_finished = True

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)


def validated_url(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 4096:
        raise PreviewError("Enter a valid HTTP or HTTPS URL.", 400)
    value = value.strip()
    if any(ord(character) < 33 or ord(character) == 127 for character in value) or "\\" in value:
        raise PreviewError("The URL contains invalid characters.", 400)
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in ("http", "https") or not parsed.hostname:
            raise ValueError
        if parsed.username is not None or parsed.password is not None:
            raise ValueError
        port = parsed.port
        if port is not None and not 1 <= port <= 65535:
            raise ValueError
        hostname = parsed.hostname.encode("idna").decode("ascii")
        if "%" in hostname or not hostname:
            raise ValueError
        host = f"[{hostname}]" if ":" in hostname else hostname
        netloc = host + (f":{port}" if port is not None else "")
        return urlunsplit((parsed.scheme.lower(), netloc,
                           quote(parsed.path or "/", safe="/%:@!$&'()*+,;=-._~"),
                           quote(parsed.query, safe="/%?:@!$&'()*+,;=-._~"), ""))
    except (ValueError, UnicodeError):
        raise PreviewError("Enter a valid HTTP or HTTPS URL without credentials.", 400) from None


def public_addresses(hostname, port):
    try:
        addresses = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError:
        raise PreviewError("Could not resolve this site's address.", 502) from None
    if not addresses:
        raise PreviewError("Could not resolve this site's address.", 502)
    for _, _, _, _, address in addresses:
        ip = ipaddress.ip_address(address[0])
        if not ip.is_global or ip.is_multicast or (ip.version == 6 and ip.ipv4_mapped):
            raise PreviewError("Only public web links can be previewed.", 400)
    return addresses


def open_page(url, deadline):
    parsed = urlsplit(url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = public_addresses(parsed.hostname, port)
    connection = http.client.HTTPConnection(parsed.hostname, port, timeout=8)
    last_error = None
    for family, socktype, protocol, _, address in addresses:
        sock = socket.socket(family, socktype, protocol)
        try:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError
            sock.settimeout(min(8, remaining))
            sock.connect(address)
            if parsed.scheme == "https":
                sock = ssl.create_default_context().wrap_socket(sock, server_hostname=parsed.hostname)
            connection.sock = sock
            target = parsed.path + ("?" + parsed.query if parsed.query else "")
            connection.request("GET", target, headers={
                "User-Agent": "Marginal-LinkPreview/1.0",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Encoding": "identity",
                "Connection": "close",
            })
            return connection, connection.getresponse()
        except (OSError, http.client.HTTPException) as error:
            last_error = error
            sock.close()
            connection.close()
    raise PreviewError("The site could not be reached. Please try again.", 502) from last_error


def parse_page(body, content_type, final_url):
    charset_match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", content_type, re.IGNORECASE)
    if charset_match is None:
        charset_match = re.search(r"charset\s*=\s*[\"']?([\w-]+)", body[:4096].decode("ascii", "ignore"), re.IGNORECASE)
    charset = charset_match.group(1) if charset_match else "utf-8"
    try:
        html = body.decode(charset, errors="replace")
    except LookupError:
        html = body.decode("utf-8", errors="replace")
    parser = MetadataParser()
    parser.feed(html)
    parser.close()
    metadata = parser.metadata
    title = plain_text(metadata.get("og:title", ""), 500)
    title = title or plain_text("".join(parser.title_parts), 500)
    description = plain_text(metadata.get("og:description", ""), 5000)
    description = description or plain_text(metadata.get("description", ""), 5000)
    image_url = None
    if metadata.get("og:image"):
        try:
            candidate = validated_url(urljoin(final_url, metadata["og:image"]))
            hostname = urlsplit(candidate).hostname
            if hostname.lower().rstrip(".") == "localhost" or hostname.lower().endswith(".localhost"):
                raise PreviewError("Unsafe image URL.")
            try:
                ip = ipaddress.ip_address(hostname)
            except ValueError:
                ip = None
            if ip is not None and (not ip.is_global or ip.is_multicast):
                raise PreviewError("Unsafe image URL.")
            image_url = candidate
        except PreviewError:
            pass
    return {"title": title, "description": description, "image_url": image_url}


def fetch_preview(value):
    url = validated_url(value)
    final_url = url
    deadline = time.monotonic() + FETCH_TIMEOUT
    for redirect in range(MAX_REDIRECTS + 1):
        connection, response = open_page(final_url, deadline)
        try:
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location:
                    raise PreviewError("The site returned a redirect without a destination.", 502)
                if redirect == MAX_REDIRECTS:
                    raise PreviewError("The site redirected too many times.", 502)
                final_url = validated_url(urljoin(final_url, location))
                continue
            content_type = response.getheader("Content-Type", "")
            if content_type and content_type.split(";", 1)[0].strip().lower() not in (
                "text/html", "application/xhtml+xml",
            ):
                raise PreviewError("This link is not an HTML web page.")
            encoding = response.getheader("Content-Encoding", "identity").lower()
            if encoding not in ("identity", ""):
                raise PreviewError("The site returned an unsupported page encoding.", 502)
            chunks = []
            size = 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimeoutError
                if connection.sock is not None:
                    connection.sock.settimeout(min(8, remaining))
                chunk = response.read1(min(65536, MAX_PAGE_BYTES + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_PAGE_BYTES:
                    raise PreviewError("This page is too large to preview.")
                chunks.append(chunk)
            metadata = parse_page(b"".join(chunks), content_type, final_url)
            return {"url": value.strip(), "final_url": final_url, "status_code": response.status,
                    **metadata, "fetched_at": datetime.now(UTC).isoformat()}
        except (OSError, http.client.HTTPException):
            raise PreviewError("The site took too long or returned an incomplete page.", 502) from None
        finally:
            response.close()
            connection.close()
    raise PreviewError("The site redirected too many times.", 502)
