"""Tests for the health-check / DOM regression detection logic."""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, record_check  # noqa: E402
from health import check_dom_regression, check_recent_errors  # noqa: E402


@pytest.fixture
def conn(tmp_path: Path):
    db_path = tmp_path / "health.db"
    c = connect(db_path)
    init_db(c)
    yield c
    c.close()


def _check(conn, handle="@h", found=5, new=0, status="ok", error=None, ts="2026-05-17T00:00:00Z"):
    record_check(conn, handle=handle, checked_at=ts, found_count=found, new_count=new, status=status, error=error)


# ── check_dom_regression ────────────────────────────────────────────


def test_dom_regression_healthy_when_no_history(conn: sqlite3.Connection) -> None:
    r = check_dom_regression(conn, "@h")
    assert r.is_healthy is True
    assert "not enough history" in r.reason


def test_dom_regression_healthy_when_recent_finds_posts(conn: sqlite3.Connection) -> None:
    _check(conn, found=10)
    _check(conn, found=0)
    _check(conn, found=8)
    r = check_dom_regression(conn, "@h")
    assert r.is_healthy is True
    assert "found posts" in r.reason


def test_dom_regression_healthy_when_handle_never_found_posts(conn: sqlite3.Connection) -> None:
    # Handle has 3 zero-finds but never produced posts (e.g., new profile, private)
    _check(conn, found=0)
    _check(conn, found=0)
    _check(conn, found=0)
    r = check_dom_regression(conn, "@h")
    assert r.is_healthy is True
    assert "never produced posts" in r.reason


def test_dom_regression_DETECTED_after_previous_success(conn: sqlite3.Connection) -> None:
    """The killer test: handle WAS producing posts, now last N are all zero."""
    _check(conn, found=15)  # ever-found marker
    _check(conn, found=10)
    _check(conn, found=0)
    _check(conn, found=0)
    _check(conn, found=0)
    r = check_dom_regression(conn, "@h")
    assert r.is_healthy is False, f"expected DOM regression to be detected, got: {r.reason}"
    assert "likely DOM regression" in r.reason
    # Recent checks should be in DESC order, last 3
    assert [c["found_count"] for c in r.recent_checks] == [0, 0, 0]


def test_dom_regression_respects_custom_threshold(conn: sqlite3.Connection) -> None:
    _check(conn, found=15)
    _check(conn, found=0)
    _check(conn, found=0)
    # threshold=2 should DETECT, threshold=3 should NOT (only 2 zeros after previous success)
    assert check_dom_regression(conn, "@h", threshold=2).is_healthy is False
    assert check_dom_regression(conn, "@h", threshold=3).is_healthy is True


def test_dom_regression_isolates_by_handle(conn: sqlite3.Connection) -> None:
    _check(conn, handle="@broken", found=15)
    _check(conn, handle="@broken", found=0)
    _check(conn, handle="@broken", found=0)
    _check(conn, handle="@broken", found=0)
    _check(conn, handle="@ok", found=5)
    _check(conn, handle="@ok", found=5)
    _check(conn, handle="@ok", found=5)
    assert check_dom_regression(conn, "@broken").is_healthy is False
    assert check_dom_regression(conn, "@ok").is_healthy is True


# ── check_recent_errors ─────────────────────────────────────────────


def test_recent_errors_healthy_when_mostly_ok(conn: sqlite3.Connection) -> None:
    _check(conn, status="ok")
    _check(conn, status="error")
    _check(conn, status="ok")
    assert check_recent_errors(conn, "@h").is_healthy is True


def test_recent_errors_DETECTED_when_all_recent_failed(conn: sqlite3.Connection) -> None:
    _check(conn, status="error")
    _check(conn, status="partial_error")
    _check(conn, status="error")
    r = check_recent_errors(conn, "@h")
    assert r.is_healthy is False
    assert "non-ok" in r.reason


def test_recent_errors_healthy_with_insufficient_history(conn: sqlite3.Connection) -> None:
    _check(conn, status="error")
    _check(conn, status="error")
    r = check_recent_errors(conn, "@h")
    assert r.is_healthy is True
    assert "not enough history" in r.reason


# ── HealthReport.to_text ────────────────────────────────────────────


def test_health_report_to_text_includes_recent_checks(conn: sqlite3.Connection) -> None:
    _check(conn, found=5, status="ok", ts="2026-05-17T00:00:00Z")
    r = check_dom_regression(conn, "@h")
    text = r.to_text()
    assert "handle=@h" in text
    assert "2026-05-17T00:00:00Z" in text
    assert "found=5" in text
