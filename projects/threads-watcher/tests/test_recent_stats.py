"""Tests for db.recent_stats(handle, window_hours=24).

Surfaces operator-visible health signals (ok / partial_error / error
counts + success rate over a rolling window) so the status UI can
show more than just "current run ok"."""

from __future__ import annotations

import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, latest_snapshot, recent_stats, record_check  # noqa: E402


@pytest.fixture
def conn(tmp_path: Path):
    c = connect(tmp_path / "rs.db")
    init_db(c)
    yield c
    c.close()


def _seed(conn, handle: str, status: str, hours_ago: float = 0.5) -> None:
    ts = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")
    record_check(conn, handle=handle, checked_at=ts, found_count=1, new_count=0, status=status)


class TestRecentStatsEmptyHistory:
    def test_no_rows_returns_zero_with_null_rate(self, conn: sqlite3.Connection) -> None:
        rs = recent_stats(conn, "@h")
        assert rs == {
            "window_hours": 24,
            "total": 0,
            "ok": 0,
            "partial_error": 0,
            "error": 0,
            "other": 0,
            "success_rate": None,
        }


class TestRecentStatsCounts:
    def test_all_ok(self, conn: sqlite3.Connection) -> None:
        for _ in range(5):
            _seed(conn, "@h", "ok")
        rs = recent_stats(conn, "@h")
        assert rs["total"] == 5
        assert rs["ok"] == 5
        assert rs["partial_error"] == 0
        assert rs["error"] == 0
        assert rs["success_rate"] == 1.0

    def test_mixed_status_breakdown(self, conn: sqlite3.Connection) -> None:
        for _ in range(10):
            _seed(conn, "@h", "ok")
        for _ in range(2):
            _seed(conn, "@h", "partial_error")
        for _ in range(1):
            _seed(conn, "@h", "error")
        rs = recent_stats(conn, "@h")
        assert rs == {
            "window_hours": 24,
            "total": 13,
            "ok": 10,
            "partial_error": 2,
            "error": 1,
            "other": 0,
            "success_rate": pytest.approx(10 / 13),
        }

    def test_forward_compatible_other_bucket(self, conn: sqlite3.Connection) -> None:
        """A future status string ('timeout', 'rate_limited') falls
        into `other` rather than silently inflating ok rate."""
        _seed(conn, "@h", "ok")
        _seed(conn, "@h", "future_status")
        rs = recent_stats(conn, "@h")
        assert rs["other"] == 1
        assert rs["ok"] == 1
        # success_rate counts only ok in numerator
        assert rs["success_rate"] == 0.5


class TestRecentStatsWindow:
    def test_excludes_rows_outside_window(self, conn: sqlite3.Connection) -> None:
        _seed(conn, "@h", "ok", hours_ago=0.5)   # within
        _seed(conn, "@h", "ok", hours_ago=25)    # outside default 24h
        rs = recent_stats(conn, "@h", window_hours=24)
        assert rs["total"] == 1

    def test_custom_window_hours(self, conn: sqlite3.Connection) -> None:
        _seed(conn, "@h", "ok", hours_ago=2)
        _seed(conn, "@h", "ok", hours_ago=5)
        # 4-hour window only sees the 2h-old row
        rs = recent_stats(conn, "@h", window_hours=4)
        assert rs["total"] == 1
        assert rs["window_hours"] == 4


class TestRecentStatsHandleIsolation:
    def test_other_handle_not_counted(self, conn: sqlite3.Connection) -> None:
        _seed(conn, "@a", "ok")
        _seed(conn, "@a", "ok")
        _seed(conn, "@b", "partial_error")
        rs = recent_stats(conn, "@a")
        assert rs["total"] == 2
        assert rs["ok"] == 2
        assert rs["partial_error"] == 0


class TestLatestSnapshotIncludesRecentStats:
    def test_snapshot_has_recent_stats_key(self, conn: sqlite3.Connection) -> None:
        """Pin that the dashboard payload actually carries the field.
        Without this, db.py's recent_stats would be invisible to the
        UI even if computed correctly."""
        _seed(conn, "@h", "ok")
        snap = latest_snapshot(conn, "@h")
        assert "recent_stats" in snap
        assert snap["recent_stats"]["total"] == 1
        assert snap["recent_stats"]["window_hours"] == 24
