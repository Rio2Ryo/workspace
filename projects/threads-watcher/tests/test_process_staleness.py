"""Tests for check_process_staleness — the pure helper that detects
when the live watcher.py --watch process is running stale (pre-edit)
code that won't reload until restart.

Background: Python's import-once model bit us hard on 2026-05-18 —
the --watch loop ran from 5/17 20:00 but the partial_error code
landed at 5/17 23:16; the live process never picked up the new
behaviour for ~13 hours. The pure helper here lets `--health-check`
flag the same situation without needing a live process or
mutable filesystem state for tests.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from health import HealthReport, check_process_staleness  # noqa: E402


def test_no_running_process_returns_healthy_n_a():
    """No --watch loop is running. Distinct from "watcher is stale";
    we don't conflate the two checks. Caller can layer a separate
    'watcher down' warning if they care."""
    report = check_process_staleness(
        process_start_iso=None,
        source_files=[("watcher.py", "2026-05-18T23:00:00Z")],
    )
    assert isinstance(report, HealthReport)
    assert report.is_healthy is True
    assert "not applicable" in report.reason or "no running" in report.reason


def test_process_newer_than_all_sources_is_healthy():
    """Process started AFTER all source mtimes → running the latest code."""
    report = check_process_staleness(
        process_start_iso="2026-05-18T23:00:00Z",
        source_files=[
            ("watcher.py", "2026-05-18T22:00:00Z"),
            ("watcher_pure.py", "2026-05-18T22:30:00Z"),
            ("health.py", "2026-05-18T22:45:00Z"),
        ],
    )
    assert report.is_healthy is True
    assert "fresh" in report.reason
    assert "23:00:00" in report.reason  # process start time pinned in reason


def test_process_older_than_one_source_is_stale():
    """The actual production bug shape: process started 5/17 20:00,
    health.py edited 5/17 23:16. Result: stale."""
    report = check_process_staleness(
        process_start_iso="2026-05-17T20:00:00Z",
        source_files=[
            ("health.py", "2026-05-17T23:16:00Z"),  # edited AFTER process start
            ("watcher.py", "2026-05-17T19:00:00Z"),  # older than process — OK
        ],
    )
    assert report.is_healthy is False
    assert "watcher started at 2026-05-17T20:00:00Z" in report.reason
    assert "1 source file(s) have been edited" in report.reason
    assert "restart-watcher.sh" in report.reason


def test_process_older_than_multiple_sources_reports_count():
    report = check_process_staleness(
        process_start_iso="2026-05-17T20:00:00Z",
        source_files=[
            ("watcher.py", "2026-05-17T22:00:00Z"),
            ("watcher_pure.py", "2026-05-17T22:30:00Z"),
            ("health.py", "2026-05-17T23:16:00Z"),
            ("db.py", "2026-05-17T19:00:00Z"),  # older than process — OK
        ],
    )
    assert report.is_healthy is False
    assert "3 source file(s)" in report.reason


def test_missing_source_file_is_skipped():
    """Defensive: a missing file (mtime=None) shouldn't crash or flag false."""
    report = check_process_staleness(
        process_start_iso="2026-05-17T20:00:00Z",
        source_files=[
            ("watcher.py", "2026-05-17T19:00:00Z"),
            ("nonexistent.py", None),
        ],
    )
    assert report.is_healthy is True


def test_recent_checks_field_lists_each_offending_file():
    """The HealthReport.recent_checks shape lets to_text() print which
    files are stale. Pin so a UI/log reader can rely on the shape."""
    report = check_process_staleness(
        process_start_iso="2026-05-17T20:00:00Z",
        source_files=[
            ("health.py", "2026-05-17T23:16:00Z"),
            ("watcher.py", "2026-05-17T22:00:00Z"),
        ],
    )
    assert len(report.recent_checks) == 2
    paths_in_status = [c["status"] for c in report.recent_checks]
    assert any("health.py" in s for s in paths_in_status)
    assert any("watcher.py" in s for s in paths_in_status)


def test_equal_timestamps_treated_as_fresh_not_stale():
    """Defensive: timestamp tie should not flag. The check uses strict
    `>` not `>=` so files edited at the exact same second as the
    process start are considered already-loaded."""
    report = check_process_staleness(
        process_start_iso="2026-05-18T08:00:00Z",
        source_files=[("watcher.py", "2026-05-18T08:00:00Z")],
    )
    assert report.is_healthy is True


def test_iso_lexicographic_compare_year_boundary():
    """The compare is lexicographic on the ISO string. Sanity-check
    year boundary so a future date-lib swap is a deliberate change."""
    report = check_process_staleness(
        process_start_iso="2026-12-31T23:59:00Z",
        source_files=[("watcher.py", "2027-01-01T00:00:00Z")],
    )
    assert report.is_healthy is False
