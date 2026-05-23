"""Tests for the multi-window recent_stats payload in latest_snapshot.

latest_snapshot now pre-computes 1h / 24h / 168h (7d) windows so the
static UI can pick one via `?window=` URL param without a server
round-trip. The 24h `recent_stats` alias preserves backward compat
for callers that don't know about the indexed map.
"""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, latest_snapshot, record_check  # noqa: E402


@pytest.fixture
def conn(tmp_path: Path):
    c = connect(tmp_path / "rsw.db")
    init_db(c)
    yield c
    c.close()


def _ok_at(conn, handle: str, hours_ago: float) -> None:
    ts = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    record_check(conn, handle=handle, checked_at=ts, found_count=1, new_count=0, status="ok")


class TestLatestSnapshotMultiWindow:
    def test_payload_has_three_pre_computed_windows(self, conn: sqlite3.Connection):
        snap = latest_snapshot(conn, "@h")
        assert "recent_stats_by_window" in snap
        windows = snap["recent_stats_by_window"]
        assert set(windows.keys()) == {"1", "24", "168"}

    def test_each_window_has_the_full_recent_stats_shape(self, conn: sqlite3.Connection):
        snap = latest_snapshot(conn, "@h")
        for key in ("1", "24", "168"):
            w = snap["recent_stats_by_window"][key]
            expected_keys = {
                "window_hours", "total", "ok", "partial_error",
                "error", "other", "success_rate",
                # Observability extension (db.py recent_stats docstring):
                # partial_error_rate + top_partial_error_reason. Both
                # MUST appear on every window so the UI can render
                # 1h / 24h / 168h regimes consistently.
                "partial_error_rate", "top_partial_error_reason",
            }
            assert set(w.keys()) == expected_keys, f"window {key} shape drifted"

    def test_each_window_carries_its_own_window_hours_field(self, conn: sqlite3.Connection):
        snap = latest_snapshot(conn, "@h")
        assert snap["recent_stats_by_window"]["1"]["window_hours"] == 1
        assert snap["recent_stats_by_window"]["24"]["window_hours"] == 24
        assert snap["recent_stats_by_window"]["168"]["window_hours"] == 168

    def test_24h_alias_equals_indexed_24_window(self, conn: sqlite3.Connection):
        """`recent_stats` top-level field is the same object as the
        '24' indexed entry — preserves the backward-compat alias the
        UI's JS fallback relies on."""
        _ok_at(conn, "@h", 2.0)
        snap = latest_snapshot(conn, "@h")
        # Same data (not necessarily same identity — they were two
        # function calls).
        assert snap["recent_stats"] == snap["recent_stats_by_window"]["24"]

    def test_1h_window_excludes_rows_older_than_1h(self, conn: sqlite3.Connection):
        """A 2-hour-old ok should land in the 24h window but NOT in
        the 1h window. Pin the boundary."""
        _ok_at(conn, "@h", 2.0)  # outside 1h, inside 24h + 168h
        _ok_at(conn, "@h", 0.1)  # inside 1h, 24h, 168h
        windows = latest_snapshot(conn, "@h")["recent_stats_by_window"]
        assert windows["1"]["total"] == 1
        assert windows["24"]["total"] == 2
        assert windows["168"]["total"] == 2

    def test_168h_window_includes_rows_up_to_a_week_old(self, conn: sqlite3.Connection):
        """A 100-hour-old ok lands in 168h but not 24h/1h."""
        _ok_at(conn, "@h", 100.0)
        windows = latest_snapshot(conn, "@h")["recent_stats_by_window"]
        assert windows["1"]["total"] == 0
        assert windows["24"]["total"] == 0
        assert windows["168"]["total"] == 1

    def test_rows_older_than_168h_are_excluded_from_all_windows(self, conn: sqlite3.Connection):
        """200 hours = 8.3 days. Beyond the 7d window."""
        _ok_at(conn, "@h", 200.0)
        windows = latest_snapshot(conn, "@h")["recent_stats_by_window"]
        assert windows["1"]["total"] == 0
        assert windows["24"]["total"] == 0
        assert windows["168"]["total"] == 0

    def test_handle_isolation_holds_across_windows(self, conn: sqlite3.Connection):
        _ok_at(conn, "@a", 0.5)
        _ok_at(conn, "@b", 0.5)
        a_windows = latest_snapshot(conn, "@a")["recent_stats_by_window"]
        b_windows = latest_snapshot(conn, "@b")["recent_stats_by_window"]
        assert a_windows["24"]["total"] == 1
        assert b_windows["24"]["total"] == 1
        # No leakage to a non-existent handle either
        none_windows = latest_snapshot(conn, "@nobody")["recent_stats_by_window"]
        for k in ("1", "24", "168"):
            assert none_windows[k]["total"] == 0
