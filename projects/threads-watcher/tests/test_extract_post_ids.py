"""Tests for the pure post-ID extraction logic.

These tests intentionally exercise the regex parser WITHOUT spinning up
Playwright/Chromium, so they catch DOM-href regressions immediately and
form a fast safety net for the threads-watcher core."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher import extract_post_ids_from_hrefs  # noqa: E402


HANDLE = "@hal.lifedesign"


def test_returns_empty_for_empty_input() -> None:
    assert extract_post_ids_from_hrefs([], HANDLE) == []


def test_skips_none_and_empty_strings() -> None:
    assert extract_post_ids_from_hrefs([None, "", "  "], HANDLE) == []


def test_extracts_single_post_id_from_relative_href() -> None:
    assert extract_post_ids_from_hrefs(["/@hal.lifedesign/post/DYTopLnktn_"], HANDLE) == ["DYTopLnktn_"]


def test_extracts_id_from_absolute_url() -> None:
    href = "https://www.threads.com/@hal.lifedesign/post/DYT7Km9kj9y?source=foo"
    assert extract_post_ids_from_hrefs([href], HANDLE) == ["DYT7Km9kj9y"]


def test_deduplicates_repeated_ids_preserving_first_seen_order() -> None:
    hrefs = [
        "/@hal.lifedesign/post/AAA",
        "/@hal.lifedesign/post/BBB",
        "/@hal.lifedesign/post/AAA",  # duplicate
        "/@hal.lifedesign/post/CCC",
        "/@hal.lifedesign/post/BBB",  # duplicate
    ]
    assert extract_post_ids_from_hrefs(hrefs, HANDLE) == ["AAA", "BBB", "CCC"]


def test_filters_out_other_handles_posts() -> None:
    hrefs = [
        "/@hal.lifedesign/post/MINE_1",
        "/@someone.else/post/THEIR_1",  # different handle, skip
        "/@hal.lifedesign/post/MINE_2",
    ]
    assert extract_post_ids_from_hrefs(hrefs, HANDLE) == ["MINE_1", "MINE_2"]


def test_handle_argument_accepts_with_or_without_leading_at() -> None:
    href = ["/@hal.lifedesign/post/PID"]
    assert extract_post_ids_from_hrefs(href, "@hal.lifedesign") == ["PID"]
    assert extract_post_ids_from_hrefs(href, "hal.lifedesign") == ["PID"]


def test_special_handle_with_regex_metacharacters_is_escaped() -> None:
    """Defensive: handle containing '.' must be regex-escaped, not match wildcards."""
    hrefs = [
        "/@h.user/post/EXACT",
        "/@hXuser/post/MISMATCH",  # 'X' instead of '.', should NOT match
    ]
    assert extract_post_ids_from_hrefs(hrefs, "@h.user") == ["EXACT"]


def test_post_id_allows_alphanumeric_underscore_hyphen() -> None:
    hrefs = [
        "/@hal.lifedesign/post/abc123",
        "/@hal.lifedesign/post/with_underscore",
        "/@hal.lifedesign/post/with-dash",
        "/@hal.lifedesign/post/Mix_3-Z",
    ]
    assert extract_post_ids_from_hrefs(hrefs, HANDLE) == ["abc123", "with_underscore", "with-dash", "Mix_3-Z"]


def test_ignores_hrefs_without_post_segment() -> None:
    hrefs = [
        "/@hal.lifedesign",                # profile root
        "/@hal.lifedesign/replies",        # replies tab
        "/@hal.lifedesign/post/",          # missing id
        "/@hal.lifedesign/post/REAL_ID",   # the only valid one
    ]
    assert extract_post_ids_from_hrefs(hrefs, HANDLE) == ["REAL_ID"]


def test_realworld_threads_href_pattern() -> None:
    """Snapshot of a realistic href shape, with query strings and fragments."""
    hrefs = [
        "https://www.threads.com/@hal.lifedesign/post/DYVnNzVEtrK?xmt=AQAB",
        "/@hal.lifedesign/post/DYYUsJcEo3h#reply",
        "/@hal.lifedesign/post/DYS3RKvEnsq/media/1",
    ]
    assert extract_post_ids_from_hrefs(hrefs, HANDLE) == ["DYVnNzVEtrK", "DYYUsJcEo3h", "DYS3RKvEnsq"]
