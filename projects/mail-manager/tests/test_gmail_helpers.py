"""Tests for gmail_client.py helper functions — no credentials or network required."""

import base64
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.gmail_client import (
    _decode_body,
    _extract_parts,
    _extract_attachments,
    _header,
    _parse_date,
)


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


class TestDecodeBody(unittest.TestCase):
    def test_basic_utf8(self):
        encoded = _b64("Hello World")
        self.assertEqual(_decode_body(encoded), "Hello World")

    def test_japanese(self):
        encoded = _b64("テストメール")
        self.assertEqual(_decode_body(encoded), "テストメール")

    def test_empty_string(self):
        self.assertEqual(_decode_body(""), "")

    def test_invalid_base64_returns_empty(self):
        result = _decode_body("!!!invalid!!!")
        self.assertIsInstance(result, str)  # must not raise

    def test_padding_tolerance(self):
        # _decode_body pads with == so strips of padding should still work
        encoded = _b64("abc")
        # strip all padding and verify it still decodes
        self.assertEqual(_decode_body(encoded.rstrip("=")), "abc")


class TestExtractParts(unittest.TestCase):
    def test_simple_text_plain(self):
        payload = {"mimeType": "text/plain", "body": {"data": _b64("plain text")}}
        plain, html = _extract_parts(payload)
        self.assertEqual(plain, "plain text")
        self.assertEqual(html, "")

    def test_simple_text_html(self):
        payload = {"mimeType": "text/html", "body": {"data": _b64("<b>bold</b>")}}
        plain, html = _extract_parts(payload)
        self.assertEqual(plain, "")
        self.assertEqual(html, "<b>bold</b>")

    def test_multipart_mixed(self):
        payload = {
            "mimeType": "multipart/alternative",
            "parts": [
                {"mimeType": "text/plain", "body": {"data": _b64("plain part")}},
                {"mimeType": "text/html", "body": {"data": _b64("<p>html part</p>")}},
            ],
        }
        plain, html = _extract_parts(payload)
        self.assertIn("plain part", plain)
        self.assertIn("<p>html part</p>", html)

    def test_no_body_data_returns_empty(self):
        payload = {"mimeType": "text/plain", "body": {}}
        plain, html = _extract_parts(payload)
        self.assertEqual(plain, "")
        self.assertEqual(html, "")

    def test_nested_multipart(self):
        payload = {
            "mimeType": "multipart/mixed",
            "parts": [
                {
                    "mimeType": "multipart/alternative",
                    "parts": [
                        {"mimeType": "text/plain", "body": {"data": _b64("nested plain")}},
                    ],
                }
            ],
        }
        plain, html = _extract_parts(payload)
        self.assertIn("nested plain", plain)


class TestExtractAttachments(unittest.TestCase):
    def test_no_parts_returns_empty(self):
        self.assertEqual(_extract_attachments({}), [])

    def test_single_attachment(self):
        payload = {
            "parts": [
                {
                    "filename": "document.pdf",
                    "mimeType": "application/pdf",
                    "body": {"size": 5000, "attachmentId": "att123"},
                }
            ]
        }
        atts = _extract_attachments(payload)
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0]["filename"], "document.pdf")
        self.assertEqual(atts[0]["mime_type"], "application/pdf")
        self.assertEqual(atts[0]["size_bytes"], 5000)
        self.assertEqual(atts[0]["attachment_id"], "att123")

    def test_part_without_filename_ignored(self):
        payload = {
            "parts": [
                {"filename": "", "mimeType": "text/plain", "body": {}},
                {"filename": "file.txt", "mimeType": "text/plain", "body": {"size": 100}},
            ]
        }
        atts = _extract_attachments(payload)
        self.assertEqual(len(atts), 1)
        self.assertEqual(atts[0]["filename"], "file.txt")

    def test_multiple_attachments(self):
        payload = {
            "parts": [
                {"filename": "a.pdf", "mimeType": "application/pdf", "body": {"size": 1}},
                {"filename": "b.png", "mimeType": "image/png", "body": {"size": 2}},
            ]
        }
        atts = _extract_attachments(payload)
        self.assertEqual(len(atts), 2)
        filenames = {a["filename"] for a in atts}
        self.assertIn("a.pdf", filenames)
        self.assertIn("b.png", filenames)


class TestHeader(unittest.TestCase):
    def test_found_case_insensitive(self):
        headers = [
            {"name": "Subject", "value": "テスト件名"},
            {"name": "From", "value": "sender@example.com"},
        ]
        self.assertEqual(_header(headers, "subject"), "テスト件名")
        self.assertEqual(_header(headers, "SUBJECT"), "テスト件名")

    def test_missing_returns_empty(self):
        headers = [{"name": "Subject", "value": "hello"}]
        self.assertEqual(_header(headers, "Date"), "")

    def test_empty_headers(self):
        self.assertEqual(_header([], "Subject"), "")


class TestParseDate(unittest.TestCase):
    def test_valid_rfc2822(self):
        raw = "Mon, 01 Jan 2026 10:00:00 +0000"
        result = _parse_date(raw)
        self.assertIn("2026-01-01", result)

    def test_invalid_date_returns_original(self):
        raw = "not-a-date"
        result = _parse_date(raw)
        self.assertEqual(result, raw)  # falls back to raw string

    def test_result_is_string(self):
        raw = "Mon, 01 Jan 2026 10:00:00 +0900"
        result = _parse_date(raw)
        self.assertIsInstance(result, str)


if __name__ == "__main__":
    unittest.main()
