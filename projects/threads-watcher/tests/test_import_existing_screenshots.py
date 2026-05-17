"""Pure-function tests for the screenshot backfill helper.

`import_existing_screenshots.py` runs once to ingest pre-DB PNGs. The
ingestion path uses three pure helpers that the live watcher does NOT
exercise on every run, so a silent regression here only surfaces during
a backfill (i.e. precisely when you need it to work). These tests cover
those helpers with happy-path + boundary + malformed inputs.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from import_existing_screenshots import (  # noqa: E402
    FILENAME_RE,
    PNG_SIG,
    _iso_from_compact,
    _png_dimensions,
)


# ── _iso_from_compact ──────────────────────────────────────────────────────


class TestIsoFromCompact:
    def test_basic_conversion(self) -> None:
        assert _iso_from_compact("20260516T025748Z") == "2026-05-16T02:57:48Z"

    def test_year_boundary(self) -> None:
        assert _iso_from_compact("20251231T235959Z") == "2025-12-31T23:59:59Z"
        assert _iso_from_compact("20260101T000000Z") == "2026-01-01T00:00:00Z"

    def test_leap_day_accepted(self) -> None:
        assert _iso_from_compact("20240229T120000Z") == "2024-02-29T12:00:00Z"

    def test_non_leap_29feb_rejected(self) -> None:
        with pytest.raises(ValueError):
            _iso_from_compact("20250229T120000Z")

    def test_missing_trailing_z_rejected(self) -> None:
        with pytest.raises(ValueError):
            _iso_from_compact("20260516T025748")

    def test_wrong_separator_rejected(self) -> None:
        with pytest.raises(ValueError):
            _iso_from_compact("20260516X025748Z")

    def test_empty_string_rejected(self) -> None:
        with pytest.raises(ValueError):
            _iso_from_compact("")

    def test_truncated_input_rejected(self) -> None:
        with pytest.raises(ValueError):
            _iso_from_compact("20260516T02")


# ── _png_dimensions ───────────────────────────────────────────────────────


def _make_png_bytes(width: int, height: int, *, sig: bytes = PNG_SIG, ihdr_pad: bytes = b"") -> bytes:
    """Construct enough PNG-like bytes that _png_dimensions can read width/height.

    Real format is: 8-byte signature, then IHDR chunk (4-byte length, 4-byte 'IHDR',
    4-byte width, 4-byte height, ...). _png_dimensions cheats and just unpacks
    bytes 16:24 as two big-endian uint32s, so anything past byte 24 doesn't matter.
    """
    chunk_length = b"\x00\x00\x00\x0d"  # 13 (real IHDR length, not actually validated)
    chunk_type = b"IHDR"
    w = struct.pack(">I", width)
    h = struct.pack(">I", height)
    return sig + chunk_length + chunk_type + w + h + ihdr_pad


class TestPngDimensions:
    def test_reads_dimensions_for_valid_png_header(self) -> None:
        assert _png_dimensions(_make_png_bytes(1280, 2400)) == (1280, 2400)

    def test_reads_1x1_minimum_dimensions(self) -> None:
        assert _png_dimensions(_make_png_bytes(1, 1)) == (1, 1)

    def test_reads_large_dimensions(self) -> None:
        # 4K-ish — make sure big-endian uint32 unpacks correctly
        assert _png_dimensions(_make_png_bytes(3840, 2160)) == (3840, 2160)

    def test_returns_none_for_bytes_under_24(self) -> None:
        assert _png_dimensions(PNG_SIG) == (None, None)              # 8 bytes only
        assert _png_dimensions(PNG_SIG + b"\x00" * 15) == (None, None)  # 23 bytes

    def test_returns_none_for_empty_input(self) -> None:
        assert _png_dimensions(b"") == (None, None)

    def test_returns_none_for_jpeg_signature(self) -> None:
        # JPEG (FF D8) prefix — definitely not PNG
        jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 30
        assert _png_dimensions(jpeg_bytes) == (None, None)

    def test_returns_none_when_signature_corrupted(self) -> None:
        # Flip one byte of the PNG signature
        broken_sig = bytes([PNG_SIG[0] ^ 0x01]) + PNG_SIG[1:]
        assert _png_dimensions(_make_png_bytes(100, 100, sig=broken_sig)) == (None, None)


# ── FILENAME_RE ───────────────────────────────────────────────────────────


class TestFilenameRegex:
    @pytest.mark.parametrize(
        "name,expected_id,expected_ts",
        [
            ("DYT7Km9kj9y__20260516T025748Z.png", "DYT7Km9kj9y", "20260516T025748Z"),
            ("abc__20260101T000000Z.png", "abc", "20260101T000000Z"),
            ("with-dash_and_under__20260516T025748Z.png", "with-dash_and_under", "20260516T025748Z"),
        ],
    )
    def test_matches_expected_filenames(self, name: str, expected_id: str, expected_ts: str) -> None:
        m = FILENAME_RE.match(name)
        assert m is not None
        assert m.group("post_id") == expected_id
        assert m.group("ts") == expected_ts

    @pytest.mark.parametrize(
        "name",
        [
            "no-timestamp.png",
            "DYT7Km9kj9y.png",                           # missing __ts
            "DYT7Km9kj9y__20260516T025748Z.jpg",         # wrong extension
            "DYT7Km9kj9y__20260516T025748.png",          # missing Z
            "__20260516T025748Z.png",                    # missing post id
            "DYT7Km9kj9y__2026-05-16T02-57-48Z.png",     # dashes not compact
            "DYT7Km9kj9y__20260516T025748Z.png.bak",     # trailing junk
        ],
    )
    def test_rejects_malformed_filenames(self, name: str) -> None:
        assert FILENAME_RE.match(name) is None

    def test_roundtrip_with_iso_from_compact(self) -> None:
        """A filename's ts group can flow through _iso_from_compact end to end."""
        m = FILENAME_RE.match("PID_42__20260516T025748Z.png")
        assert m is not None
        iso = _iso_from_compact(m.group("ts"))
        assert iso == "2026-05-16T02:57:48Z"
