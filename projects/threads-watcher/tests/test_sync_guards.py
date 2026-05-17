"""Tests for sync_guards — the pure-Python ports of sync.sh.example gates.

Each test exercises a single guard in isolation, plus integration tests
that run `evaluate_all` against an in-memory DB and synthetic snapshots
to verify short-circuit ordering and total decision shape.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import init_db, record_check  # noqa: E402
from sync_guards import (  # noqa: E402
    BAD_CHECK_STATUSES,
    DEFAULT_COMMIT_MIN_GAP_SEC,
    DEFAULT_RECENT_CHECKS_WINDOW,
    GuardDecision,
    SyncDecision,
    commit_gap_guard,
    detect_delta,
    evaluate_all,
    recent_failures_guard,
    snapshot_sanity_check,
)


# ── fixtures ─────────────────────────────────────────────────────────────


@pytest.fixture
def conn() -> sqlite3.Connection:
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    init_db(c)
    yield c
    c.close()


def _add_check(conn: sqlite3.Connection, status: str, error: str | None = None) -> None:
    record_check(
        conn,
        handle="@hal.lifedesign",
        checked_at="2026-05-17T22:00:00Z",
        found_count=15 if status == "ok" else 0,
        new_count=0,
        status=status,
        error=error,
    )


def _write_snapshot(path: Path, posts: list[dict]) -> None:
    path.write_text(json.dumps({"posts": posts, "handle": "@hal.lifedesign"}), encoding="utf-8")


# ── detect_delta ─────────────────────────────────────────────────────────


def test_delta_guard_skips_when_db_max_equals_cursor():
    d = detect_delta(current_max=42, last_cursor=42)
    assert not d.proceed
    assert "no delta" in d.reason


def test_delta_guard_skips_when_db_max_below_cursor():
    # Possible if DB was wiped & rebuilt; cursor file would be stale.
    d = detect_delta(current_max=10, last_cursor=42)
    assert not d.proceed


def test_delta_guard_proceeds_when_strictly_greater():
    d = detect_delta(current_max=50, last_cursor=42)
    assert d.proceed
    assert "delta=8" in d.reason


def test_delta_guard_first_run_proceeds_with_any_posts():
    d = detect_delta(current_max=1, last_cursor=0)
    assert d.proceed


def test_delta_guard_tolerates_negative_cursor_file():
    # Corrupted cursor should not push past zero.
    d = detect_delta(current_max=5, last_cursor=-7)
    assert d.proceed
    assert "delta=5" in d.reason


# ── recent_failures_guard ────────────────────────────────────────────────


def test_recent_failures_proceeds_when_no_history(conn):
    d = recent_failures_guard(conn)
    assert d.proceed
    assert "ok" in d.reason  # "(statuses=<none>)" path


def test_recent_failures_proceeds_when_all_ok(conn):
    for _ in range(3):
        _add_check(conn, "ok")
    d = recent_failures_guard(conn)
    assert d.proceed


def test_recent_failures_skips_on_explicit_error(conn):
    _add_check(conn, "ok")
    _add_check(conn, "ok")
    _add_check(conn, "error", "DOM regression")
    d = recent_failures_guard(conn)
    assert not d.proceed


def test_recent_failures_skips_on_partial_error(conn):
    # Mirrors shell's substring match — partial_error contains 'error'.
    _add_check(conn, "ok")
    _add_check(conn, "partial_error", "abc: timeout")
    _add_check(conn, "ok")
    d = recent_failures_guard(conn)
    assert not d.proceed


def test_recent_failures_only_inspects_window(conn):
    # An old error outside the window must not trigger a skip.
    _add_check(conn, "error", "old")
    for _ in range(3):
        _add_check(conn, "ok")
    d = recent_failures_guard(conn, window=3)
    assert d.proceed


# ── commit_gap_guard ─────────────────────────────────────────────────────


def test_commit_gap_first_run_allows_through():
    d = commit_gap_guard(last_commit_ts=0, now_ts=1_700_000_000)
    assert d.proceed


def test_commit_gap_blocks_within_threshold():
    d = commit_gap_guard(last_commit_ts=1_700_000_000, now_ts=1_700_000_500)
    assert not d.proceed


def test_commit_gap_proceeds_past_threshold():
    d = commit_gap_guard(
        last_commit_ts=1_700_000_000,
        now_ts=1_700_000_000 + DEFAULT_COMMIT_MIN_GAP_SEC + 1,
    )
    assert d.proceed


def test_commit_gap_exact_threshold_proceeds():
    # gap == threshold means >= threshold seconds have passed. Shell uses <.
    d = commit_gap_guard(
        last_commit_ts=1_700_000_000,
        now_ts=1_700_000_000 + DEFAULT_COMMIT_MIN_GAP_SEC,
    )
    assert d.proceed


def test_commit_gap_custom_threshold():
    d = commit_gap_guard(last_commit_ts=100, now_ts=200, min_gap_sec=50)
    assert d.proceed


# ── snapshot_sanity_check ────────────────────────────────────────────────


def test_sanity_check_passes_on_clean_snapshot(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "post_url": "https://..."}])
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


def test_sanity_check_blocks_when_screenshot_png_leaks(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "screenshot_png": "AAAA"}])
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "screenshot_png" in d.reason


def test_sanity_check_blocks_when_local_path_leaks(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc", "local_path": "/Users/x/secret"}])
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "local_path" in d.reason


def test_sanity_check_reports_which_post_index_leaked(tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(
        snapshot,
        [
            {"post_id": "a"},
            {"post_id": "b", "screenshot_png": "X"},
        ],
    )
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "post[1]" in d.reason


def test_sanity_check_handles_missing_file(tmp_path):
    d = snapshot_sanity_check(tmp_path / "missing.json")
    assert not d.proceed
    assert "not found" in d.reason


def test_sanity_check_handles_invalid_json(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text("{not json", encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert not d.proceed
    assert "JSON" in d.reason


def test_sanity_check_passes_with_zero_posts(tmp_path):
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps({"posts": []}), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


def test_sanity_check_passes_when_posts_key_missing(tmp_path):
    # Sanity allows snapshots that just omit posts; shell only iterates if present.
    snapshot = tmp_path / "state.json"
    snapshot.write_text(json.dumps({"handle": "@x"}), encoding="utf-8")
    d = snapshot_sanity_check(snapshot)
    assert d.proceed


# ── evaluate_all (composite, short-circuit) ──────────────────────────────


def test_evaluate_all_short_circuits_on_no_delta(conn, tmp_path):
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=10,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert not result.proceed
    assert result.delta == 0
    assert len(result.decisions) == 1  # short-circuited before fail/gap/sanity


def test_evaluate_all_short_circuits_on_recent_failure(conn, tmp_path):
    _add_check(conn, "error", "fail")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=5,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert not result.proceed
    assert result.delta == 5
    assert len(result.decisions) == 2  # delta + fail; gap & sanity skipped


def test_evaluate_all_passes_all_gates(conn, tmp_path):
    for _ in range(3):
        _add_check(conn, "ok")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [{"post_id": "abc"}])
    result = evaluate_all(
        current_max=43,
        last_cursor=0,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    assert result.proceed
    assert result.delta == 43
    assert all(d.proceed for d in result.decisions)
    assert len(result.decisions) == 4


def test_evaluate_all_first_blocker_helper(conn, tmp_path):
    _add_check(conn, "error", "boom")
    snapshot = tmp_path / "state.json"
    _write_snapshot(snapshot, [])
    result = evaluate_all(
        current_max=10,
        last_cursor=5,
        conn=conn,
        last_commit_ts=0,
        now_ts=1_700_000_000,
        snapshot_path=snapshot,
    )
    blocker = result.first_blocker()
    assert blocker is not None
    assert "recent failures" in blocker.reason


# ── safety constants regression ──────────────────────────────────────────


def test_default_thresholds_match_shell_script():
    # If these defaults drift from sync.sh.example, the launchd cron and
    # this Python evaluator will silently diverge. Hard-code & assert.
    assert DEFAULT_COMMIT_MIN_GAP_SEC == 3600
    assert DEFAULT_RECENT_CHECKS_WINDOW == 3
    assert "error" in BAD_CHECK_STATUSES
