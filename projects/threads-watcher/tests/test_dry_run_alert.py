"""Tests for sync.py's dry-run accumulator (DryRunState + helpers).

Concrete operational gap observed in production logs/sync.log:
  - delta=1 has been pending for 5+ hours across 10+ launchd ticks
  - every tick re-logs "DRY: would commit (delta=1)" identically
  - operator running `launchctl list` sees exit=0 = "healthy"
  - no signal anywhere that promotion to --confirm is overdue

Fix (sync.py):
  - persist {delta, count, since} across ticks in
    logs/dry-run-state.json
  - on tick N >= 3 of the same pending delta, emit a single ALERT
    line above the existing DRY: lines so operators can grep for it

These tests pin the state-machine transitions and file I/O round-
trip without touching the launchd flow.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import (  # noqa: E402
    DRY_RUN_ALERT_THRESHOLD,
    DryRunState,
    load_dry_run_state,
    save_dry_run_state,
    should_emit_dry_run_alert,
    update_dry_run_state,
)


NOW_A = "2026-05-18T10:00:00Z"
NOW_B = "2026-05-18T10:30:00Z"
NOW_C = "2026-05-18T11:00:00Z"
NOW_D = "2026-05-18T11:30:00Z"


# ── update_dry_run_state — state transitions ────────────────────────────


def test_first_tick_with_pending_delta_starts_streak_at_1():
    next_ = update_dry_run_state(prev=None, current_delta=1, now_ts_iso=NOW_A)
    assert next_ == DryRunState(delta=1, count=1, since=NOW_A)


def test_same_delta_next_tick_bumps_count_keeps_since():
    prev = DryRunState(delta=1, count=1, since=NOW_A)
    next_ = update_dry_run_state(prev, current_delta=1, now_ts_iso=NOW_B)
    assert next_ == DryRunState(delta=1, count=2, since=NOW_A)


def test_three_consecutive_same_delta_reaches_count_3():
    state = update_dry_run_state(None, 1, NOW_A)
    state = update_dry_run_state(state, 1, NOW_B)
    state = update_dry_run_state(state, 1, NOW_C)
    assert state.count == 3
    assert state.since == NOW_A  # original streak start preserved


def test_delta_change_resets_streak_to_1_with_new_since():
    prev = DryRunState(delta=1, count=5, since=NOW_A)
    next_ = update_dry_run_state(prev, current_delta=2, now_ts_iso=NOW_B)
    assert next_ == DryRunState(delta=2, count=1, since=NOW_B)


def test_zero_delta_resets_to_count_zero():
    # delta=0 means "nothing to do" — not pending, so the streak
    # collapses to zero (no alert can fire).
    prev = DryRunState(delta=1, count=5, since=NOW_A)
    next_ = update_dry_run_state(prev, current_delta=0, now_ts_iso=NOW_B)
    assert next_.count == 0
    assert next_.delta == 0


def test_negative_delta_also_resets():
    # Shouldn't happen in practice (delta is current_max - last_cursor
    # which is non-negative), but defensive — treat like zero.
    prev = DryRunState(delta=1, count=5, since=NOW_A)
    next_ = update_dry_run_state(prev, current_delta=-1, now_ts_iso=NOW_B)
    assert next_.count == 0


# ── should_emit_dry_run_alert — threshold ────────────────────────────────


def test_alert_silent_under_threshold():
    state = DryRunState(delta=1, count=DRY_RUN_ALERT_THRESHOLD - 1, since=NOW_A)
    assert not should_emit_dry_run_alert(state)


def test_alert_fires_at_exactly_threshold():
    state = DryRunState(delta=1, count=DRY_RUN_ALERT_THRESHOLD, since=NOW_A)
    assert should_emit_dry_run_alert(state)


def test_alert_keeps_firing_past_threshold():
    state = DryRunState(delta=1, count=DRY_RUN_ALERT_THRESHOLD + 7, since=NOW_A)
    assert should_emit_dry_run_alert(state)


def test_alert_silent_for_zero_delta_even_if_count_inflated():
    # Defensive: if some past tick somehow stored count > threshold
    # but delta is 0, we don't fire (nothing actually pending).
    state = DryRunState(delta=0, count=100, since=NOW_A)
    assert not should_emit_dry_run_alert(state)


def test_alert_threshold_override():
    state = DryRunState(delta=1, count=2, since=NOW_A)
    assert not should_emit_dry_run_alert(state, threshold=3)
    assert should_emit_dry_run_alert(state, threshold=2)


# ── load/save round-trip + corruption tolerance ─────────────────────────


def test_save_then_load_returns_identical_state(tmp_path):
    path = tmp_path / "dry-run-state.json"
    state = DryRunState(delta=42, count=7, since=NOW_C)
    save_dry_run_state(path, state)
    loaded = load_dry_run_state(path)
    assert loaded == state


def test_load_missing_file_returns_none(tmp_path):
    path = tmp_path / "never-existed.json"
    assert load_dry_run_state(path) is None


def test_load_corrupt_json_returns_none(tmp_path):
    path = tmp_path / "corrupt.json"
    path.write_text("{not json", encoding="utf-8")
    assert load_dry_run_state(path) is None


def test_load_valid_json_missing_required_field_returns_none(tmp_path):
    path = tmp_path / "partial.json"
    path.write_text(json.dumps({"delta": 1}), encoding="utf-8")  # no count/since
    assert load_dry_run_state(path) is None


def test_save_creates_parent_directory(tmp_path):
    # Mirrors the real launchd flow: logs/ may not exist on first run.
    path = tmp_path / "nested" / "subdir" / "state.json"
    state = DryRunState(delta=1, count=1, since=NOW_A)
    save_dry_run_state(path, state)
    assert path.exists()
    assert load_dry_run_state(path) == state


# ── end-to-end: 10 consecutive ticks simulating the production bug ──────


def test_simulated_10_ticks_pending_delta_fires_alerts_from_tick_3(tmp_path):
    """Replays the observed production state: 10 ticks with delta=1
    pending. State file persists across each tick. Asserts the
    expected alert-fire pattern.
    """
    path = tmp_path / "state.json"
    timestamps = [f"2026-05-18T{h:02d}:00:00Z" for h in range(10, 20)]

    alerts = []
    for ts in timestamps:
        prev = load_dry_run_state(path)
        next_ = update_dry_run_state(prev, current_delta=1, now_ts_iso=ts)
        if should_emit_dry_run_alert(next_):
            alerts.append((next_.count, next_.since))
        save_dry_run_state(path, next_)

    # Ticks 1 + 2: silent. Ticks 3..10: alert each, count rises monotonically.
    assert len(alerts) == 8
    assert alerts[0] == (3, timestamps[0])
    assert alerts[-1] == (10, timestamps[0])  # since preserved across the streak


def test_simulated_streak_then_drop_resets_alert(tmp_path):
    """After 5 alerted ticks, delta drops to 0 (legit work done).
    Next pending-delta tick should start a fresh streak from 1, NOT
    inherit the prior 5."""
    path = tmp_path / "state.json"
    # 5 ticks of delta=1
    for i in range(5):
        prev = load_dry_run_state(path)
        next_ = update_dry_run_state(prev, 1, f"2026-05-18T1{i}:00:00Z")
        save_dry_run_state(path, next_)
    # delta -> 0 (cleared)
    prev = load_dry_run_state(path)
    next_ = update_dry_run_state(prev, 0, "2026-05-18T15:00:00Z")
    save_dry_run_state(path, next_)
    # delta -> 1 again (new pending work)
    prev = load_dry_run_state(path)
    next_ = update_dry_run_state(prev, 1, "2026-05-18T15:30:00Z")
    assert next_.count == 1
    assert next_.since == "2026-05-18T15:30:00Z"
    assert not should_emit_dry_run_alert(next_)  # fresh streak, silent
