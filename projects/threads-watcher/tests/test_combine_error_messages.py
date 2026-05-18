"""Tests for combine_error_messages — the pure helper that merges a
partial-result base reason with per-post capture failures before they are
written to the `checks.error` audit-log column.

Before this helper existed, per-post capture exceptions only flipped
`status` to `partial_error` and were lost from the audit log, so health
checks could not distinguish "DOM scraper degraded" from "screenshot
capture failed for one specific post."
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from watcher_pure import combine_error_messages  # noqa: E402


def test_no_base_and_no_capture_errors_returns_none():
    assert combine_error_messages(None, []) is None


def test_base_alone_is_returned_unchanged_when_no_capture_errors():
    base = "profile extraction returned partial result: found=3 previous_max=15"
    assert combine_error_messages(base, []) == base


def test_single_capture_error_alone_produces_failure_summary():
    result = combine_error_messages(None, ["abc123: Timeout 30000ms exceeded"])
    assert result == "capture_failures: abc123: Timeout 30000ms exceeded"


def test_multiple_capture_errors_are_semicolon_joined():
    result = combine_error_messages(
        None,
        ["abc: TimeoutError", "def: ConnectionReset", "ghi: 500 Server Error"],
    )
    assert (
        result
        == "capture_failures: abc: TimeoutError; def: ConnectionReset; ghi: 500 Server Error"
    )


def test_base_and_capture_errors_are_both_preserved():
    base = "profile extraction returned partial result: found=2 previous_max=15"
    result = combine_error_messages(base, ["abc: Timeout"])
    assert (
        result
        == "profile extraction returned partial result: found=2 previous_max=15 "
        "| capture_failures: abc: Timeout"
    )


def test_empty_string_base_is_treated_as_no_base():
    # An empty string is falsy; the helper should not prefix " | " on an
    # empty base, which would produce a misleading leading separator.
    result = combine_error_messages("", ["abc: Boom"])
    assert result == "capture_failures: abc: Boom"


def test_helper_does_not_mutate_input_list():
    capture_errors = ["abc: Timeout", "def: Boom"]
    snapshot = list(capture_errors)
    combine_error_messages("base reason", capture_errors)
    assert capture_errors == snapshot
