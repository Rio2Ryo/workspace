"""Tests for db.export_status_screenshots and db._safe_asset_segment.

Both shipped with zero coverage. export_status_screenshots writes PNG
files under the public static site (threads-watcher-status/screenshots/)
and _safe_asset_segment is the path-safety primitive that decides what
filename each asset gets — a regression in either could leave a stale
screenshot on the public page or write a file outside the assets dir.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import (  # noqa: E402
    _safe_asset_segment,
    connect,
    export_status_screenshots,
    init_db,
    save_post_screenshot,
    update_post_screenshot,
)


@pytest.fixture
def conn(tmp_path: Path):
    c = connect(tmp_path / "test.db")
    init_db(c)
    yield c
    c.close()


def _save(conn: sqlite3.Connection, post_id: str, png: bytes, *, handle: str = "@h",
          local_path: str | None = None) -> None:
    save_post_screenshot(
        conn,
        handle=handle,
        post_id=post_id,
        post_url=f"https://www.threads.net/{handle}/post/{post_id}",
        first_seen_at="2026-05-23T00:00:00Z",
        captured_at="2026-05-23T00:00:00Z",
        screenshot_png=png,
        local_path=local_path,
    )


# ── _safe_asset_segment — path-safety primitive ────────────────────────


class TestSafeAssetSegment:
    def test_plain_name_passes_through(self) -> None:
        assert _safe_asset_segment("abc123.png", "fb") == "abc123.png"

    def test_forward_slash_is_neutralized(self) -> None:
        # A slash must never survive — it is the only character that
        # could turn a single path segment into a directory escape.
        assert "/" not in _safe_asset_segment("a/b/c", "fb")

    def test_backslash_is_neutralized(self) -> None:
        assert "\\" not in _safe_asset_segment("a\\b\\c", "fb")

    def test_dotdot_alone_collapses_to_fallback(self) -> None:
        # '..' is all strip()-able chars → empty → fallback, so it can
        # never become a literal `..` traversal segment.
        assert _safe_asset_segment("..", "fb") == "fb"
        assert _safe_asset_segment("../../", "fb") == "fb"

    def test_traversal_attempt_cannot_keep_a_separator(self) -> None:
        seg = _safe_asset_segment("../../etc/passwd", "fb")
        assert "/" not in seg and "\\" not in seg

    def test_spaces_and_specials_become_underscore(self) -> None:
        assert _safe_asset_segment("a b%c", "fb") == "a_b_c"

    def test_empty_input_returns_fallback(self) -> None:
        assert _safe_asset_segment("", "fb") == "fb"

    def test_all_strippable_input_returns_fallback(self) -> None:
        assert _safe_asset_segment("._._.", "fb") == "fb"

    def test_leading_and_trailing_dots_underscores_stripped(self) -> None:
        assert _safe_asset_segment("__name.png__", "fb") == "name.png"


# ── export_status_screenshots — DB BLOB → public PNG asset ─────────────


class TestExportStatusScreenshots:
    def test_exports_blob_to_a_relative_path_under_screenshots(self, conn, tmp_path) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"body"
        _save(conn, "p1", png, local_path="screenshots/h/p1.png")
        root = tmp_path / "status"
        out = export_status_screenshots(conn, "@h", root)

        assert list(out) == ["p1"]
        rel = out["p1"]
        # Browser-safe: relative, posix, no escape, under screenshots/.
        assert not rel.startswith("/")
        assert ".." not in rel
        assert rel.startswith("screenshots/")
        dest = root / rel
        assert dest.is_file()
        assert dest.read_bytes() == png

    def test_no_rows_returns_empty_mapping(self, conn, tmp_path) -> None:
        assert export_status_screenshots(conn, "@h", tmp_path / "status") == {}

    def test_recaptured_screenshot_of_equal_byte_length_is_re_exported(
        self, conn, tmp_path
    ) -> None:
        # The staleness bug: a same-length, different-content re-capture
        # must still overwrite the exported asset. A size-only cache
        # check skipped the rewrite and left the public page stale.
        png_a = b"\x89PNG\r\n\x1a\n" + b"A" * 64
        png_b = b"\x89PNG\r\n\x1a\n" + b"B" * 64
        assert len(png_a) == len(png_b) and png_a != png_b

        _save(conn, "p1", png_a, local_path="screenshots/h/p1.png")
        root = tmp_path / "status"
        dest = root / export_status_screenshots(conn, "@h", root)["p1"]
        assert dest.read_bytes() == png_a

        update_post_screenshot(
            conn, handle="@h", post_id="p1", captured_at="2026-05-23T01:00:00Z",
            screenshot_png=png_b, local_path="screenshots/h/p1.png",
        )
        dest2 = root / export_status_screenshots(conn, "@h", root)["p1"]
        assert dest2.read_bytes() == png_b

    def test_unchanged_content_is_not_rewritten(self, conn, tmp_path) -> None:
        # The content-equality cache must still SKIP a write when the
        # asset is unchanged — pinned via mtime so a future "always
        # write" regression (disk churn) is caught too.
        png = b"\x89PNG\r\n\x1a\n" + b"stable"
        _save(conn, "p1", png, local_path="screenshots/h/p1.png")
        root = tmp_path / "status"
        dest = root / export_status_screenshots(conn, "@h", root)["p1"]
        old = (1_700_000_000, 1_700_000_000)
        os.utime(dest, old)
        export_status_screenshots(conn, "@h", root)
        assert dest.stat().st_mtime == old[1]

    def test_unsafe_handle_cannot_escape_the_screenshots_dir(self, conn, tmp_path) -> None:
        # A handle carrying path-traversal characters must be sanitized
        # into a single safe directory segment.
        png = b"\x89PNG\r\n\x1a\n" + b"x"
        _save(conn, "p1", png, handle="@../../etc", local_path="screenshots/x/p1.png")
        root = tmp_path / "status"
        out = export_status_screenshots(conn, "@../../etc", root)
        rel = out["p1"]
        assert ".." not in rel
        dest = (root / rel).resolve()
        # The written file stays inside root/screenshots/.
        assert dest.is_relative_to((root / "screenshots").resolve())

    def test_non_png_local_path_falls_back_to_post_id_filename(self, conn, tmp_path) -> None:
        png = b"\x89PNG\r\n\x1a\n" + b"y"
        _save(conn, "p9", png, local_path="/tmp/host/capture.bin")
        root = tmp_path / "status"
        rel = export_status_screenshots(conn, "@h", root)["p9"]
        # local_path basename wasn't a .png → filename derived from post_id.
        assert rel.endswith("/p9.png")
