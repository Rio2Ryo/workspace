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
            # New observability fields. Both None on empty window —
            # operator dashboards should treat None as "no data" not "0%".
            "partial_error_rate": None,
            "top_partial_error_reason": None,
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
            "partial_error_rate": pytest.approx(2 / 13),
            # No `error` text was seeded on the partial_error rows
            # (default None), so the top-reason aggregator finds nothing
            # to count → None. The new test class below pins the
            # populated case.
            "top_partial_error_reason": None,
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


class TestPartialErrorRate:
    """The partial_error_rate field is the dashboard metric that would
    have surfaced the 2026-05-23 regime shift days earlier (93% rate
    went unnoticed because operators only saw success_rate)."""

    def _seed_with_reason(
        self, conn: sqlite3.Connection, status: str, reason: str | None
    ) -> None:
        from datetime import datetime, timedelta, timezone

        ts = (datetime.now(timezone.utc) - timedelta(hours=0.5)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        record_check(
            conn,
            handle="@h",
            checked_at=ts,
            found_count=4 if status == "partial_error" else 15,
            new_count=0,
            status=status,
            error=reason,
        )

    def test_zero_partial_error_yields_zero_rate(self, conn: sqlite3.Connection) -> None:
        for _ in range(5):
            _seed(conn, "@h", "ok")
        rs = recent_stats(conn, "@h")
        assert rs["partial_error_rate"] == 0.0

    def test_all_partial_error_yields_one_point_zero(self, conn: sqlite3.Connection) -> None:
        # The sticky-regime case — 100% partial_error.
        for _ in range(5):
            _seed(conn, "@h", "partial_error")
        rs = recent_stats(conn, "@h")
        assert rs["partial_error_rate"] == 1.0
        # And success_rate is correspondingly 0 — pin both sides for
        # the operator dashboard's coherency.
        assert rs["success_rate"] == 0.0

    def test_realistic_93pct_regime(self, conn: sqlite3.Connection) -> None:
        # The exact shape observed 2026-05-23: 28 partial_error + 2 ok.
        for _ in range(2):
            _seed(conn, "@h", "ok")
        for _ in range(28):
            _seed(conn, "@h", "partial_error")
        rs = recent_stats(conn, "@h")
        assert rs["partial_error_rate"] == pytest.approx(28 / 30)
        assert rs["partial_error_rate"] > 0.9  # easy operator threshold

    def test_empty_window_returns_none_not_zero(self, conn: sqlite3.Connection) -> None:
        # 0% != "no data". Dashboards must show "—" not "0%" when there
        # is nothing to report; the None signal carries that.
        rs = recent_stats(conn, "@h")
        assert rs["partial_error_rate"] is None
        assert rs["success_rate"] is None


class TestTopPartialErrorReason:
    """top_partial_error_reason surfaces WHY partial_error dominates,
    which is the smoking-gun signal the operator needs to recognise a
    sticky-DOM-regression regime in a single glance at the dashboard."""

    def _seed_reason(
        self, conn: sqlite3.Connection, status: str, reason: str | None
    ) -> None:
        from datetime import datetime, timedelta, timezone

        ts = (datetime.now(timezone.utc) - timedelta(hours=0.5)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        record_check(
            conn,
            handle="@h",
            checked_at=ts,
            found_count=1,
            new_count=0,
            status=status,
            error=reason,
        )

    def test_no_partial_error_returns_none(self, conn: sqlite3.Connection) -> None:
        for _ in range(3):
            _seed(conn, "@h", "ok")
        assert recent_stats(conn, "@h")["top_partial_error_reason"] is None

    def test_uniform_reason_is_returned_with_count(self, conn: sqlite3.Connection) -> None:
        # 3 partial_error rows, all the same reason → reason + count=3.
        for _ in range(3):
            self._seed_reason(
                conn, "partial_error",
                "profile extraction returned partial result: found=4 previous_max=15",
            )
        rs = recent_stats(conn, "@h")
        top = rs["top_partial_error_reason"]
        assert top is not None
        assert top["reason"] == (
            "profile extraction returned partial result: found=4 previous_max=15"
        )
        assert top["count"] == 3

    def test_picks_majority_reason_when_mixed(self, conn: sqlite3.Connection) -> None:
        # Two reasons: "A" x 4 and "B" x 1 → top is "A" with count 4.
        for _ in range(4):
            self._seed_reason(conn, "partial_error", "reason A: found=4")
        self._seed_reason(conn, "partial_error", "reason B: found=2")
        top = recent_stats(conn, "@h")["top_partial_error_reason"]
        assert top == {"reason": "reason A: found=4", "count": 4}

    def test_ignores_error_text_from_status_error_rows(self, conn: sqlite3.Connection) -> None:
        # A row with status='error' (full failure) should NOT contribute
        # its error text to the partial-error reason aggregator. Pin
        # the scoping so a full outage doesn't pollute the partial-
        # regression diagnostic.
        self._seed_reason(conn, "error", "playwright timeout")
        self._seed_reason(conn, "partial_error", "found=4 previous_max=15")
        top = recent_stats(conn, "@h")["top_partial_error_reason"]
        assert top is not None
        assert top["reason"] == "found=4 previous_max=15"
        assert top["count"] == 1
        # The "playwright timeout" must NOT appear anywhere in the
        # top-reason dict.
        assert "playwright" not in top["reason"]

    def test_ignores_rows_with_null_error(self, conn: sqlite3.Connection) -> None:
        # partial_error with NULL `error` carries no diagnostic; it
        # shouldn't get rolled in as a phantom reason string.
        self._seed_reason(conn, "partial_error", None)
        self._seed_reason(conn, "partial_error", None)
        # Only one row has a real reason — but that one row is still
        # enough to be the "top" reason.
        self._seed_reason(conn, "partial_error", "found=4 previous_max=15")
        top = recent_stats(conn, "@h")["top_partial_error_reason"]
        assert top is not None
        assert top["reason"] == "found=4 previous_max=15"
        assert top["count"] == 1

    def test_stable_tie_breaking_uses_reason_string(self, conn: sqlite3.Connection) -> None:
        # Tie: two reasons each with count 2 → break by the reason
        # string so the dashboard doesn't flicker between equally-
        # frequent reasons each load.
        for _ in range(2):
            self._seed_reason(conn, "partial_error", "alpha")
        for _ in range(2):
            self._seed_reason(conn, "partial_error", "beta")
        top = recent_stats(conn, "@h")["top_partial_error_reason"]
        # Among ties (count=2 vs count=2), max() with key=(count, reason)
        # picks the lexicographically larger reason → "beta".
        assert top == {"reason": "beta", "count": 2}


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
