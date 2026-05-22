"""Tests for judge_heartbeat_alert — the pure gate that decides whether
a stale watcher heartbeat should trigger a Discord anomaly report.

Background
----------
The watcher writes one `checks` row per loop iteration (default 60s).
The freshness of the newest `checks.checked_at` IS the heartbeat. The
DOM-regression / recent-errors health checks only inspect rows that
exist — they are blind to the failure mode where the loop simply STOPS
and no rows get written at all. judge_heartbeat_alert closes that gap.

The contract these tests pin: a Discord anomaly report fires ONLY when
the heartbeat is genuinely stale — never on a fresh heartbeat, never on
cold start, never on an unparseable timestamp, never on clock skew.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from health import (  # noqa: E402
    DEFAULT_HEARTBEAT_STALE_SECONDS,
    HeartbeatAlert,
    judge_heartbeat_alert,
)


# ── Fresh heartbeat: never alerts ─────────────────────────────────────


def test_fresh_heartbeat_does_not_alert():
    """Newest check 60s old, well under the 300s threshold → quiet."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:59:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert isinstance(r, HeartbeatAlert)
    assert r.is_stale is False
    assert r.should_alert is False
    assert r.age_seconds == 60.0
    assert "fresh" in r.reason


def test_zero_age_heartbeat_does_not_alert():
    """Check written exactly 'now' → age 0 → fresh."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T10:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.should_alert is False
    assert r.age_seconds == 0.0


def test_just_under_threshold_does_not_alert():
    """299s old with a 300s threshold → still fresh (boundary, low side)."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:55:01Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.age_seconds == 299.0
    assert r.is_stale is False
    assert r.should_alert is False


# ── Stale heartbeat: alerts ───────────────────────────────────────────


def test_exactly_at_threshold_alerts():
    """Age == threshold → stale. `>=` boundary, mirrors
    should_emit_dry_run_alert's 'at least' convention."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:55:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.age_seconds == float(DEFAULT_HEARTBEAT_STALE_SECONDS)
    assert r.is_stale is True
    assert r.should_alert is True
    assert "stale" in r.reason


def test_well_past_threshold_alerts():
    """Heartbeat 1 hour old → unambiguously stale."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.is_stale is True
    assert r.should_alert is True
    assert r.age_seconds == 3600.0


def test_alert_reason_mentions_age_and_threshold():
    """Operator-facing reason must carry the numbers needed to triage
    without re-querying — age and the threshold it crossed."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert "3600" in r.reason
    assert str(DEFAULT_HEARTBEAT_STALE_SECONDS) in r.reason


# ── Cold start: no heartbeat established → never alerts ───────────────


def test_no_checks_recorded_does_not_alert():
    """checks table empty → heartbeat never started. NOT a staleness
    signal (that's a 'watcher down' concern, deliberately not
    conflated here — mirrors check_process_staleness's split)."""
    r = judge_heartbeat_alert(
        last_check_iso=None,
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.is_stale is False
    assert r.should_alert is False
    assert r.age_seconds is None
    assert "cold start" in r.reason


# ── Clock skew: future heartbeat → never alerts ───────────────────────


def test_future_heartbeat_does_not_alert():
    """last_check is AFTER now (clock skew between hosts / NTP jump).
    A heartbeat in the future is by definition not stale."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T10:05:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.is_stale is False
    assert r.should_alert is False
    assert r.age_seconds == -300.0
    assert "skew" in r.reason or "future" in r.reason


# ── Corrupt timestamps: cannot judge → never alerts ───────────────────


def test_unparseable_last_check_does_not_alert():
    """A garbage checked_at is data corruption, not staleness — a
    separate concern we don't fold into the heartbeat alert."""
    r = judge_heartbeat_alert(
        last_check_iso="not-a-timestamp",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.should_alert is False
    assert r.age_seconds is None
    assert "unparseable" in r.reason
    assert "last_check_iso" in r.reason


def test_unparseable_now_does_not_alert():
    """Defensive: if the caller feeds a bad `now`, fail closed (quiet)
    rather than alert on a miscomputed age."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T10:00:00Z",
        now_iso="garbage",
    )
    assert r.should_alert is False
    assert r.age_seconds is None
    assert "now_iso" in r.reason


def test_empty_string_last_check_does_not_alert():
    """Empty string is unparseable, not None — must not be confused
    with the cold-start path."""
    r = judge_heartbeat_alert(
        last_check_iso="",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.should_alert is False
    assert "unparseable" in r.reason


# ── Threshold is configurable ─────────────────────────────────────────


def test_custom_threshold_lower_makes_alert_fire_sooner():
    """A 60s threshold flips a 90s-old heartbeat from fresh → stale."""
    args = dict(
        last_check_iso="2026-05-22T09:58:30Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert judge_heartbeat_alert(**args).should_alert is False  # default 300s
    assert judge_heartbeat_alert(**args, stale_after_seconds=60).should_alert is True


def test_custom_threshold_higher_suppresses_alert():
    """A 2h threshold keeps a 1h-old heartbeat classified fresh."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
        stale_after_seconds=7200,
    )
    assert r.is_stale is False
    assert r.should_alert is False


# ── Timestamp-format tolerance ────────────────────────────────────────


def test_accepts_offset_form_timestamps():
    """fromisoformat-style `+00:00` offset is accepted alongside the
    watcher's canonical trailing-Z form."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:00:00+00:00",
        now_iso="2026-05-22T10:00:00+00:00",
    )
    assert r.is_stale is True
    assert r.age_seconds == 3600.0


def test_naive_timestamp_treated_as_utc():
    """A checked_at without tz info is read as UTC (the watcher only
    ever writes UTC) — must not raise on naive/aware subtraction."""
    r = judge_heartbeat_alert(
        last_check_iso="2026-05-22T09:00:00",
        now_iso="2026-05-22T10:00:00Z",
    )
    assert r.age_seconds == 3600.0
    assert r.should_alert is True


# ── is_stale / should_alert coupling ──────────────────────────────────


def test_should_alert_implies_is_stale_for_every_outcome():
    """Today the two bits are equal; pin that so a future de-dupe layer
    that sets should_alert=False on a still-stale heartbeat does so
    deliberately (and updates this test) rather than by accident."""
    cases = [
        ("2026-05-22T09:59:00Z", "2026-05-22T10:00:00Z"),   # fresh
        ("2026-05-22T09:00:00Z", "2026-05-22T10:00:00Z"),   # stale
        (None, "2026-05-22T10:00:00Z"),                     # cold start
        ("bad", "2026-05-22T10:00:00Z"),                    # corrupt
        ("2026-05-22T10:05:00Z", "2026-05-22T10:00:00Z"),   # skew
    ]
    for last, now in cases:
        r = judge_heartbeat_alert(last_check_iso=last, now_iso=now)
        assert r.should_alert == r.is_stale, f"decoupled for ({last}, {now})"
