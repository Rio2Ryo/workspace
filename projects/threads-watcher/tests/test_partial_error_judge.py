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
