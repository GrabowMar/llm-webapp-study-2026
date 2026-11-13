import socket
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from backend.preview import PreviewError, fetch_preview, parse_page, public_addresses, validated_url


class MetadataTests(unittest.TestCase):
    def parse(self, html, url="https://example.com/articles/page", content_type="text/html"):
        return parse_page(html.encode(), content_type, url)

    def test_open_graph_takes_precedence_and_is_plain_text(self):
        result = self.parse("""
            <title>Fallback title</title>
            <meta name="description" content="Fallback description">
            <META content="&lt;b&gt;Good &amp; curious&lt;/b&gt;" PROPERTY="og:title">
            <meta property="og:description" content="&lt;script&gt;bad()&lt;/script&gt;Plain &lt;i&gt;text&lt;/i&gt;">
            <meta property="og:image" content="../cover.png">
        """)
        self.assertEqual(result, {"title": "Good & curious", "description": "Plain text", "image_url": "https://example.com/cover.png"})

    def test_title_and_description_fallback(self):
        result = self.parse('<title> Hello &amp;  world </title><meta content="A short summary" name="description">')
        self.assertEqual(result["title"], "Hello & world")
        self.assertEqual(result["description"], "A short summary")
        self.assertIsNone(result["image_url"])

    def test_empty_or_unsafe_open_graph_falls_back(self):
        result = self.parse('<title>Good title</title><meta property="og:title" content="&lt;script&gt;bad()&lt;/script&gt;"><meta name="description" content="Good description"><meta property="og:description" content=" ">')
        self.assertEqual(result["title"], "Good title")
        self.assertEqual(result["description"], "Good description")

    def test_missing_metadata(self):
        self.assertEqual(self.parse("<html><body>No metadata</body></html>"), {"title": "", "description": "", "image_url": None})

    def test_unsafe_image_urls_are_discarded(self):
        for image in ("javascript:alert(1)", "data:text/html,bad", "http://127.0.0.1/image", "http://localhost/image", "http://[::1]/image", "http://user:pass@example.com/image"):
            with self.subTest(image=image):
                self.assertIsNone(self.parse(f'<meta property="og:image" content="{image}">')["image_url"])

    def test_protocol_relative_image_and_first_tag(self):
        result = self.parse('<meta property="og:title" content="First"><meta property="og:title" content="Second"><meta property="og:image" content="//images.example.com/photo.jpg">')
        self.assertEqual(result["title"], "First")
        self.assertEqual(result["image_url"], "https://images.example.com/photo.jpg")

    def test_charset_is_respected(self):
        body = '<title>Café</title>'.encode("iso-8859-1")
        self.assertEqual(parse_page(body, "text/html; charset=iso-8859-1", "https://example.com/")["title"], "Café")
        self.assertEqual(parse_page(b"<title>Hello</title>", "text/html; charset=unknown-encoding", "https://example.com/")["title"], "Hello")

    def test_metadata_lengths_are_bounded(self):
        result = self.parse(f'<title>{"t" * 1000}</title><meta name="description" content="{"d" * 6000}">')
        self.assertEqual(len(result["title"]), 500)
        self.assertEqual(len(result["description"]), 5000)


class UrlSafetyTests(unittest.TestCase):
    def test_invalid_urls(self):
        for value in (None, 1, "", "example.com", "file:///tmp/file", "ftp://example.com", "https://", "http://example.com:0", "http://example.com:99999", "https://a:b@example.com", "https://example.com/a\nb", "http://example.com\\@localhost"):
            with self.subTest(value=value), self.assertRaises(PreviewError):
                validated_url(value)

    def test_unicode_url_is_encoded(self):
        self.assertEqual(validated_url("https://example.com/café?q=é#fragment"), "https://example.com/caf%C3%A9?q=%C3%A9")
        self.assertEqual(validated_url("https://bücher.example/"), "https://xn--bcher-kva.example/")

    def test_private_reserved_and_mixed_addresses_are_blocked(self):
        for address in ("127.0.0.1", "10.0.0.1", "192.168.1.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "::1", "fc00::1", "::ffff:8.8.8.8"):
            with self.subTest(address=address), patch("backend.preview.socket.getaddrinfo", return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 80))]), self.assertRaises(PreviewError):
                public_addresses("example.com", 80)
        with patch("backend.preview.socket.getaddrinfo", return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 80)),
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80)),
        ]), self.assertRaises(PreviewError):
            public_addresses("example.com", 80)

    def test_public_address_allowed_and_dns_error_is_handled(self):
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("8.8.8.8", 80))]
        with patch("backend.preview.socket.getaddrinfo", return_value=addresses):
            self.assertEqual(public_addresses("example.com", 80), addresses)
        with patch("backend.preview.socket.getaddrinfo", side_effect=socket.gaierror), self.assertRaises(PreviewError) as error:
            public_addresses("example.com", 80)
        self.assertEqual(error.exception.status, 502)


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        pass

    def do_GET(self):
        if self.path in ("/redirect", "/loop", "/private"):
            self.send_response(302)
            self.send_header("Location", {"/redirect": "/page", "/loop": "/loop", "/private": "http://127.0.0.1/private"}[self.path])
            self.end_headers()
            return
        self.send_response(404 if self.path == "/missing" else 200)
        self.send_header("Content-Type", "application/json" if self.path == "/json" else "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(b'<title>Fixture title</title><meta property="og:description" content="Fixture description"><meta property="og:image" content="/cover.png">')


class FetchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), FixtureHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.base = f"http://example.com:{self.server.server_port}"

        def fixture_addresses(host, port):
            if host != "example.com":
                raise PreviewError("Only public web links can be previewed.", 400)
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", port))]

        self.patcher = patch("backend.preview.public_addresses", side_effect=fixture_addresses)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def test_fetch_and_relative_redirect(self):
        result = fetch_preview(self.base + "/redirect")
        self.assertEqual(result["url"], self.base + "/redirect")
        self.assertEqual(result["final_url"], self.base + "/page")
        self.assertEqual(result["status_code"], 200)
        self.assertEqual(result["title"], "Fixture title")
        self.assertEqual(result["description"], "Fixture description")
        self.assertEqual(result["image_url"], self.base + "/cover.png")
        self.assertTrue(result["fetched_at"].endswith("+00:00"))

    def test_redirect_to_private_address_is_blocked(self):
        with self.assertRaises(PreviewError) as error:
            fetch_preview(self.base + "/private")
        self.assertEqual(error.exception.status, 400)

    def test_original_url_is_preserved(self):
        result = fetch_preview(self.base + "/page#section")
        self.assertEqual(result["url"], self.base + "/page#section")
        self.assertEqual(result["final_url"], self.base + "/page")

    def test_redirect_limit(self):
        with self.assertRaises(PreviewError) as error:
            fetch_preview(self.base + "/loop")
        self.assertEqual(error.exception.status, 502)

    def test_non_html_is_rejected(self):
        with self.assertRaises(PreviewError) as error:
            fetch_preview(self.base + "/json")
        self.assertEqual(error.exception.status, 422)

    def test_error_page_status_is_retained(self):
        self.assertEqual(fetch_preview(self.base + "/missing")["status_code"], 404)

    def test_response_size_limit(self):
        with patch("backend.preview.MAX_PAGE_BYTES", 32), self.assertRaises(PreviewError):
            fetch_preview(self.base + "/page")


if __name__ == "__main__":
    unittest.main()
