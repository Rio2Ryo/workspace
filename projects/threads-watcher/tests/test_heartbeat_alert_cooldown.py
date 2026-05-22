"""Tests for the heartbeat-alert de-dup cooldown.

judge_heartbeat_alert says should_alert=True on EVERY tick a heartbeat
stays stale. should_resend_heartbeat_alert is the second gate: it
suppresses re-sends within a cooldown window so a watcher that stays
dead across many cron ticks pages hourly, not per tick.

Covers the pure decision (should_resend_heartbeat_alert) and the
watcher.py state-file I/O + run_health_check de-dup wiring.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402
from db import connect, init_db, record_check  # noqa: E402
from health import (  # noqa: E402
    DEFAULT_HEARTBEAT_ALERT_COOLDOWN_SECONDS,
    should_resend_heartbeat_alert,
)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── should_resend_heartbeat_alert — pure decision ─────────────────────


def test_not_stale_never_resends():
    assert should_resend_heartbeat_alert(
        is_stale=False, last_alert_iso=None, now_iso="2026-05-22T10:00:00Z"
    ) is False


def test_not_stale_never_resends_even_with_old_alert():
    # A previously-sent alert is irrelevant once the heartbeat recovers.
    assert should_resend_heartbeat_alert(
        is_stale=False,
        last_alert_iso="2020-01-01T00:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    ) is False


def test_stale_with_no_prior_alert_sends():
    """First alert of a fresh outage — nothing recorded yet."""
    assert should_resend_heartbeat_alert(
        is_stale=True, last_alert_iso=None, now_iso="2026-05-22T10:00:00Z"
    ) is True


def test_stale_within_cooldown_is_suppressed():
    """Last alert 10 min ago, default cooldown 1h → suppress."""
    assert should_resend_heartbeat_alert(
        is_stale=True,
        last_alert_iso="2026-05-22T09:50:00Z",
        now_iso="2026-05-22T10:00:00Z",
    ) is False


def test_stale_exactly_at_cooldown_resends():
    """elapsed == cooldown → resend (>= boundary, mirrors
    judge_heartbeat_alert's staleness boundary)."""
    assert should_resend_heartbeat_alert(
        is_stale=True,
        last_alert_iso="2026-05-22T09:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    ) is True


def test_stale_past_cooldown_resends():
    assert should_resend_heartbeat_alert(
        is_stale=True,
        last_alert_iso="2026-05-22T07:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    ) is True


def test_custom_cooldown_changes_the_boundary():
    args = dict(
        is_stale=True,
        last_alert_iso="2026-05-22T09:50:00Z",
        now_iso="2026-05-22T10:00:00Z",
    )
    # 10 min elapsed: suppressed at 1h cooldown, resent at 5 min cooldown.
    assert should_resend_heartbeat_alert(**args) is False
    assert should_resend_heartbeat_alert(**args, cooldown_seconds=300) is True


def test_corrupt_last_alert_fails_open():
    """Unparseable stored timestamp → resend (better a duplicate than
    going silent on an outage because the de-dup state is broken)."""
    assert should_resend_heartbeat_alert(
        is_stale=True, last_alert_iso="garbage", now_iso="2026-05-22T10:00:00Z"
    ) is True


def test_corrupt_now_fails_open():
    assert should_resend_heartbeat_alert(
        is_stale=True, last_alert_iso="2026-05-22T09:55:00Z", now_iso="not-a-time"
    ) is True


def test_future_last_alert_fails_open():
    """State file timestamp in the future (clock skew) → resend."""
    assert should_resend_heartbeat_alert(
        is_stale=True,
        last_alert_iso="2026-05-22T11:00:00Z",
        now_iso="2026-05-22T10:00:00Z",
    ) is True


def test_default_cooldown_is_one_hour():
    assert DEFAULT_HEARTBEAT_ALERT_COOLDOWN_SECONDS == 3600


# ── watcher state-file I/O ────────────────────────────────────────────


@pytest.fixture
def state_file(tmp_path, monkeypatch):
    """Redirect HEARTBEAT_ALERT_STATE_FILE into a tmp dir."""
    path = tmp_path / "logs" / "heartbeat-alert-state.json"
    monkeypatch.setattr(watcher, "HEARTBEAT_ALERT_STATE_FILE", path)
    return path


def test_load_returns_none_when_file_missing(state_file):
    assert watcher._load_heartbeat_alert_iso() is None


def test_save_then_load_round_trips(state_file):
    watcher._save_heartbeat_alert_iso("2026-05-22T10:00:00Z")
    assert watcher._load_heartbeat_alert_iso() == "2026-05-22T10:00:00Z"
    # File really is JSON with the documented key.
    assert json.loads(state_file.read_text())["last_alert_iso"] == "2026-05-22T10:00:00Z"


def test_load_returns_none_on_corrupt_json(state_file):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text("{not json", encoding="utf-8")
    assert watcher._load_heartbeat_alert_iso() is None


def test_load_returns_none_when_key_absent(state_file):
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text('{"other":"x"}', encoding="utf-8")
    assert watcher._load_heartbeat_alert_iso() is None


def test_clear_removes_the_file(state_file):
    watcher._save_heartbeat_alert_iso("2026-05-22T10:00:00Z")
    assert state_file.exists()
    watcher._clear_heartbeat_alert_state()
    assert not state_file.exists()


def test_clear_is_safe_when_file_absent(state_file):
    # Must not raise when there's nothing to remove.
    watcher._clear_heartbeat_alert_state()


# ── run_health_check de-dup wiring ────────────────────────────────────


@pytest.fixture
def health_env(tmp_path, monkeypatch):
    """A stale-heartbeat DB + redirected state file + stubbed process
    probes + a capturing fake for the Discord subprocess."""
    db_file = tmp_path / "hb.db"
    monkeypatch.setattr(watcher, "DB_FILE", db_file)
    monkeypatch.setattr(
        watcher, "HEARTBEAT_ALERT_STATE_FILE", tmp_path / "logs" / "hb-state.json"
    )
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "thread_x")
    monkeypatch.setattr(watcher, "_find_watcher_process_start_iso", lambda: None)
    monkeypatch.setattr(watcher, "_collect_source_mtimes", lambda: [])

    sends: list = []
    monkeypatch.setattr(watcher.subprocess, "run", lambda *a, **k: sends.append(a))
    return {"db_file": db_file, "sends": sends}


def _seed_check(db_file, checked_at: str):
    c = connect(db_file)
    init_db(c)
    record_check(c, handle="@h", checked_at=checked_at,
                 found_count=1, new_count=0, status="ok", error=None)
    c.close()


def test_first_stale_tick_sends_and_records(health_env):
    """A stale heartbeat with no prior alert → one Discord send, state
    file written."""
    _seed_check(health_env["db_file"], "2020-01-01T00:00:00Z")
    exit_code = watcher.run_health_check("@h")
    assert exit_code == 1
    assert len(health_env["sends"]) == 1
    assert watcher._load_heartbeat_alert_iso() is not None


def test_second_stale_tick_within_cooldown_is_suppressed(health_env):
    """Two run_health_check calls back-to-back on the same dead watcher
    → only the FIRST sends. This is the headline de-dup contract."""
    _seed_check(health_env["db_file"], "2020-01-01T00:00:00Z")
    watcher.run_health_check("@h")
    watcher.run_health_check("@h")
    assert len(health_env["sends"]) == 1  # not 2


def test_stale_tick_resends_once_cooldown_elapsed(health_env):
    """After the cooldown window, the next stale tick re-pages."""
    _seed_check(health_env["db_file"], "2020-01-01T00:00:00Z")
    watcher.run_health_check("@h")
    assert len(health_env["sends"]) == 1
    # Backdate the recorded alert to just over the cooldown ago.
    stale_ago = datetime.now(timezone.utc) - timedelta(
        seconds=DEFAULT_HEARTBEAT_ALERT_COOLDOWN_SECONDS + 60
    )
    watcher._save_heartbeat_alert_iso(_iso(stale_ago))
    watcher.run_health_check("@h")
    assert len(health_env["sends"]) == 2


def test_fresh_heartbeat_clears_state_so_next_outage_alerts_immediately(health_env):
    """A recovery tick wipes the de-dup state — the de-dup window must
    not bleed across separate outages."""
    # Outage 1: stale → sends, records state.
    _seed_check(health_env["db_file"], "2020-01-01T00:00:00Z")
    watcher.run_health_check("@h")
    assert len(health_env["sends"]) == 1
    assert watcher._load_heartbeat_alert_iso() is not None

    # Recovery: a fresh check → run_health_check clears the state file.
    recent = datetime.now(timezone.utc) - timedelta(seconds=5)
    _seed_check(health_env["db_file"], _iso(recent))
    watcher.run_health_check("@h")
    assert watcher._load_heartbeat_alert_iso() is None
    assert len(health_env["sends"]) == 1  # no send on a healthy tick
