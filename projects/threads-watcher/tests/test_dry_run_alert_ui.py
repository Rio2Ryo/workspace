"""Tests for surfacing the dry-run ALERT to threads-watcher-status/state.json.

Adds:
  - get_active_dry_run_alert(state_path) — returns dict payload when
    the persisted streak has reached threshold, else None
  - watcher._write_web_snapshot_from_db now reads it and injects
    `dry_run_alert` into the public state.json so the web UI can
    render a banner

Pre-fix the alert was log-only (`grep ALERT logs/sync.log`). The
HTML banner contract is asserted indirectly via the populated
state.json field — the JS just reads `data.dry_run_alert`.
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
    get_active_dry_run_alert,
    save_dry_run_state,
)


# ── get_active_dry_run_alert ────────────────────────────────────────────


def test_returns_none_when_state_file_missing(tmp_path):
    assert get_active_dry_run_alert(tmp_path / "never.json") is None


def test_returns_none_when_streak_under_threshold(tmp_path):
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=1, count=DRY_RUN_ALERT_THRESHOLD - 1, since="2026-05-18T10:00:00Z"),
    )
    assert get_active_dry_run_alert(path) is None


def test_returns_payload_at_exactly_threshold(tmp_path):
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=1, count=DRY_RUN_ALERT_THRESHOLD, since="2026-05-18T10:00:00Z"),
    )
    payload = get_active_dry_run_alert(path)
    assert payload == {
        "pending_ticks": DRY_RUN_ALERT_THRESHOLD,
        "since": "2026-05-18T10:00:00Z",
        "delta": 1,
    }


def test_returns_payload_well_past_threshold_with_full_streak_info(tmp_path):
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=4, count=11, since="2026-05-18T10:00:00Z"),
    )
    payload = get_active_dry_run_alert(path)
    assert payload is not None
    assert payload["pending_ticks"] == 11
    assert payload["delta"] == 4
    assert payload["since"] == "2026-05-18T10:00:00Z"


def test_returns_none_when_delta_zero_even_with_high_count(tmp_path):
    # Defensive: should_emit gate catches this, but pin it at the
    # surface so a future refactor that drops the delta>0 check
    # doesn't accidentally start surfacing "0 pending" banners.
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=0, count=99, since="2026-05-18T10:00:00Z"),
    )
    assert get_active_dry_run_alert(path) is None


def test_returns_none_when_state_file_corrupt(tmp_path):
    path = tmp_path / "state.json"
    path.write_text("{not json", encoding="utf-8")
    assert get_active_dry_run_alert(path) is None


def test_returns_payload_is_json_serializable(tmp_path):
    """The dict must round-trip through json.dumps without TypeError
    so watcher._write_web_snapshot_from_db can inline it into the
    public state.json file."""
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=2, count=5, since="2026-05-18T10:00:00Z"),
    )
    payload = get_active_dry_run_alert(path)
    # Should not raise.
    serialized = json.dumps(payload)
    assert "pending_ticks" in serialized
    assert "since" in serialized


# ── threshold override flow ─────────────────────────────────────────────


def test_threshold_override_lowers_alert_bar(tmp_path):
    """An ops alternative (e.g., dashboard surface that wants to
    catch the streak EARLIER than the in-log ALERT) can pass a
    smaller threshold and still get a payload."""
    path = tmp_path / "state.json"
    save_dry_run_state(
        path,
        DryRunState(delta=1, count=2, since="2026-05-18T10:00:00Z"),
    )
    assert get_active_dry_run_alert(path, threshold=DRY_RUN_ALERT_THRESHOLD) is None
    assert get_active_dry_run_alert(path, threshold=2) == {
        "pending_ticks": 2,
        "since": "2026-05-18T10:00:00Z",
        "delta": 1,
    }


# ── build_web_snapshot_payload — pure builder contract ──────────────────
#
# Lives in watcher_pure.py so it tests without importing watcher.py
# (which pulls in playwright). End-to-end pin for the state.json
# field-presence contract that the HTML banner JS reads.

from watcher_pure import build_web_snapshot_payload  # noqa: E402


SEED_SNAPSHOT = {
    "handle": "@example",
    "last_check": {"status": "ok", "checked_at": "2026-05-18T12:00:00Z"},
    "saved_count": 21,
    "posts": [{"post_id": "p1"}],
    "recent_stats": {"window_hours": 24, "total": 48},
    "recent_stats_by_window": {"24": {"total": 48}},
    "sync_state": {"db_max": 44, "cursor": 43, "delta": 1},
}


def test_builder_passes_through_dry_run_alert_payload_unchanged():
    alert = {"pending_ticks": 7, "since": "2026-05-18T10:00:00Z", "delta": 1}
    out = build_web_snapshot_payload(SEED_SNAPSHOT, dry_run_alert=alert, generated_at="now")
    assert out["dry_run_alert"] == alert


def test_builder_sets_dry_run_alert_to_null_when_None():
    out = build_web_snapshot_payload(SEED_SNAPSHOT, dry_run_alert=None, generated_at="now")
    # MUST be the JSON literal null (Python None), not omitted — the JS
    # reads `data.dry_run_alert` and only renders the banner when the
    # field is truthy. Omitting would still work but explicit null is
    # the documented contract.
    assert out["dry_run_alert"] is None
    assert "dry_run_alert" in out


def test_builder_preserves_all_other_required_fields():
    out = build_web_snapshot_payload(SEED_SNAPSHOT, dry_run_alert=None, generated_at="now")
    # Pin the public contract — adding a new field is fine, but
    # silently DROPPING one (e.g., a sloppy refactor) regresses the
    # UI.
    for required in (
        "handle",
        "last_check",
        "saved_count",
        "posts",
        "recent_stats",
        "recent_stats_by_window",
        "sync_state",
        "dry_run_alert",
        "snapshot_generated_at",
    ):
        assert required in out, f"missing required field: {required}"


def test_builder_full_payload_is_json_serializable():
    alert = {"pending_ticks": 3, "since": "2026-05-18T10:00:00Z", "delta": 2}
    out = build_web_snapshot_payload(SEED_SNAPSHOT, dry_run_alert=alert, generated_at="2026-05-18T13:00:00Z")
    serialized = json.dumps(out, ensure_ascii=False)
    # Round-trip preserves nesting.
    parsed = json.loads(serialized)
    assert parsed["dry_run_alert"]["pending_ticks"] == 3
    assert parsed["sync_state"]["delta"] == 1


# ── HTML banner contract pin ────────────────────────────────────────────


def test_index_html_has_dry_run_alert_banner_wired_to_payload_field():
    """The HTML must contain the banner element + JS that reads
    `data.dry_run_alert`. Catches a refactor that removes the
    banner element while leaving the state.json field populated
    (or vice-versa)."""
    html = (Path(__file__).resolve().parent.parent / "threads-watcher-status" / "index.html").read_text()
    # Banner element exists with expected id + child id targets.
    assert 'id="dry-run-alert"' in html
    assert 'id="dra-ticks"' in html
    assert 'id="dra-since"' in html
    assert 'id="dra-delta"' in html
    # JS reads the same field name the builder writes.
    assert 'data.dry_run_alert' in html
    # Default hidden — relies on .alert-banner display:none, then JS
    # toggles to block.
    assert 'display: none' in html or 'display:none' in html
