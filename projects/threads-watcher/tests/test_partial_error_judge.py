"""Tests for the real-time DOM-regression detector used inside run_once.

The watcher's main loop flags a check as `partial_error` when this run
returned strictly fewer posts than any previous successful run. The logic
lives in `health.judge_partial_error` / `health.previous_max_found` so it
can be unit-tested without spinning up Playwright or the full check loop.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import connect, init_db, record_check  # noqa: E402
from health import judge_partial_error, previous_max_found  # noqa: E402


# ── judge_partial_error (pure) ───────────────────────────────────────────


class TestJudgePartialError:
    def test_no_baseline_returns_none(self) -> None:
        # First-ever run: prev_max is 0 → nothing to compare → fine.
        assert judge_partial_error(found_count=0, prev_max=0) is None
        assert judge_partial_error(found_count=15, prev_max=0) is None

    def test_negative_baseline_treated_as_no_baseline(self) -> None:
        # Defensive: shouldn't happen, but never flag if baseline is bogus.
        assert judge_partial_error(found_count=0, prev_max=-5) is None

    def test_equal_count_is_ok(self) -> None:
        assert judge_partial_error(found_count=15, prev_max=15) is None

    def test_growth_is_ok(self) -> None:
        assert judge_partial_error(found_count=20, prev_max=15) is None

    def test_shrink_is_partial(self) -> None:
        reason = judge_partial_error(found_count=10, prev_max=15)
        assert reason is not None
        assert "found=10" in reason
        assert "previous_max=15" in reason

    def test_zero_after_history_is_partial(self) -> None:
        """Empty result on a previously-active handle — biggest red flag."""
        reason = judge_partial_error(found_count=0, prev_max=15)
        assert reason is not None
        assert "found=0" in reason
        assert "previous_max=15" in reason

    def test_one_off_by_one_below_is_partial(self) -> None:
        assert judge_partial_error(found_count=14, prev_max=15) is not None


# ── previous_max_found (SQL) ────────────────────────────────────────────


@pytest.fixture
def conn(tmp_path: Path):
    db_path = tmp_path / "pme.db"
    c = connect(db_path)
    init_db(c)
    yield c
    c.close()


def _ok(conn, found: int, ts: str = "2026-05-17T00:00:00Z") -> None:
    record_check(conn, handle="@h", checked_at=ts, found_count=found, new_count=0, status="ok")


class TestPreviousMaxFound:
    def test_returns_zero_when_no_checks(self, conn: sqlite3.Connection) -> None:
        assert previous_max_found(conn, "@h") == 0

    def test_returns_zero_when_only_errors(self, conn: sqlite3.Connection) -> None:
        # error / partial_error checks must NOT count as the baseline
        record_check(conn, handle="@h", checked_at="t", found_count=99, new_count=0, status="error")
        record_check(conn, handle="@h", checked_at="t", found_count=99, new_count=0, status="partial_error")
        assert previous_max_found(conn, "@h") == 0

    def test_max_across_multiple_ok_checks(self, conn: sqlite3.Connection) -> None:
        _ok(conn, 5)
        _ok(conn, 15)
        _ok(conn, 12)
        _ok(conn, 8)
        assert previous_max_found(conn, "@h") == 15

    def test_isolated_per_handle(self, conn: sqlite3.Connection) -> None:
        record_check(conn, handle="@a", checked_at="t", found_count=20, new_count=0, status="ok")
        record_check(conn, handle="@b", checked_at="t", found_count=5, new_count=0, status="ok")
        assert previous_max_found(conn, "@a") == 20
        assert previous_max_found(conn, "@b") == 5
        assert previous_max_found(conn, "@nobody") == 0


# ── integration: SQL + pure judge together ─────────────────────────────


class TestPreviousMaxJudgeIntegration:
    def test_history_then_partial_run_flags(self, conn: sqlite3.Connection) -> None:
        # Build a healthy baseline...
        _ok(conn, 15)
        _ok(conn, 15)
        # ...then this run only saw 4.
        prev = previous_max_found(conn, "@h")
        reason = judge_partial_error(found_count=4, prev_max=prev)
        assert reason is not None and "found=4" in reason

    def test_first_run_doesnt_self_flag(self, conn: sqlite3.Connection) -> None:
        # No prior `ok` checks → even a 0-found run is not partial.
        prev = previous_max_found(conn, "@brand_new")
        assert prev == 0
        assert judge_partial_error(found_count=0, prev_max=prev) is None


# ── previous_max_found(lookback_days=N) ─────────────────────────────────


class TestPreviousMaxFoundLookback:
    """Verify that the optional `lookback_days` argument lets the baseline
    adapt to a new steady state. Motivation: the all-time MAX is sticky
    — if a handle's true baseline permanently drops (user deletes
    posts, Threads UI change shifts what counts as 'a post', etc.),
    the historic peak still wins forever and every new run trips
    partial_error. Lookback is the opt-in escape valve."""

    def test_default_remains_all_time_peak(self, conn: sqlite3.Connection) -> None:
        # Old peak, then everything-low for a long time. Without
        # lookback, the old 15 still wins (existing behaviour preserved).
        record_check(
            conn, handle="@h", checked_at="2026-04-01T00:00:00Z",
            found_count=15, new_count=0, status="ok",
        )
        for day in range(1, 30):
            record_check(
                conn, handle="@h",
                checked_at=f"2026-05-{day:02d}T00:00:00Z",
                found_count=4, new_count=0, status="ok",
            )
        assert previous_max_found(conn, "@h") == 15

    def test_lookback_7d_ignores_old_peak(self, conn: sqlite3.Connection) -> None:
        # Same data shape, but ask for the 7-day peak — old 15 falls
        # outside the window, current 4 becomes the baseline.
        record_check(
            conn, handle="@h", checked_at="2026-04-01T00:00:00Z",
            found_count=15, new_count=0, status="ok",
        )
        # Insert one recent ok within 7 days of "now" (the test runs
        # at real now, so use a freshly-timestamped row).
        from datetime import datetime, timezone, timedelta
        recent_iso = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        record_check(
            conn, handle="@h", checked_at=recent_iso,
            found_count=4, new_count=0, status="ok",
        )
        # With 7-day lookback, only the 4-found row qualifies.
        assert previous_max_found(conn, "@h", lookback_days=7) == 4
        # And without lookback, still the old peak.
        assert previous_max_found(conn, "@h") == 15

    def test_lookback_returns_zero_when_no_recent_ok(self, conn: sqlite3.Connection) -> None:
        # Old data only → 7-day window returns 0 → judge_partial_error
        # would not flag (no baseline). This is the "handle just woke
        # up after a long gap" path.
        record_check(
            conn, handle="@h", checked_at="2026-01-01T00:00:00Z",
            found_count=42, new_count=0, status="ok",
        )
        assert previous_max_found(conn, "@h", lookback_days=7) == 0

    def test_lookback_zero_means_only_today_strict(self, conn: sqlite3.Connection) -> None:
        # lookback_days=0 → strftime('-0 days') is "today only" in
        # SQLite's date arithmetic. Defensive pin: should still find
        # rows whose checked_at is now.
        from datetime import datetime, timezone
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        record_check(
            conn, handle="@h", checked_at=now_iso,
            found_count=99, new_count=0, status="ok",
        )
        # With lookback_days=0, SQLite's `datetime('now', '-0 days')`
        # equals NOW; the strict `>` would exclude even rows at NOW.
        # Documenting this edge: lookback_days=0 is effectively useless,
        # operators should pass >=1.
        assert previous_max_found(conn, "@h", lookback_days=0) == 0

    def test_lookback_isolated_per_handle(self, conn: sqlite3.Connection) -> None:
        # Multi-handle: lookback for one handle doesn't leak to another.
        from datetime import datetime, timezone, timedelta
        recent = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        record_check(
            conn, handle="@a", checked_at=recent,
            found_count=10, new_count=0, status="ok",
        )
        record_check(
            conn, handle="@b", checked_at=recent,
            found_count=20, new_count=0, status="ok",
        )
        assert previous_max_found(conn, "@a", lookback_days=7) == 10
        assert previous_max_found(conn, "@b", lookback_days=7) == 20
