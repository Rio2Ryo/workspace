"""Integration tests for the heartbeat wiring inside watcher.run_health_check.

test_heartbeat_alert.py covers the pure judge_heartbeat_alert decision.
This file covers the glue: _latest_check_iso reading the real `checks`
table, _heartbeat_health_report adapting the alert into a HealthReport,
and _notify_stale_heartbeat being gated correctly so a Discord message
is sent ONLY for a genuinely stale heartbeat.
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402
from db import connect, init_db, record_check  # noqa: E402
from health import HealthReport  # noqa: E402


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.fixture
def conn(tmp_path: Path):
    c = connect(tmp_path / "hb.db")
    init_db(c)
    yield c
    c.close()


# ── _latest_check_iso ─────────────────────────────────────────────────


def test_latest_check_iso_none_when_no_checks(conn) -> None:
    assert watcher._latest_check_iso(conn, "@h") is None


def test_latest_check_iso_returns_newest(conn) -> None:
    record_check(conn, handle="@h", checked_at="2026-05-22T09:00:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    record_check(conn, handle="@h", checked_at="2026-05-22T09:05:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    record_check(conn, handle="@h", checked_at="2026-05-22T09:02:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    assert watcher._latest_check_iso(conn, "@h") == "2026-05-22T09:05:00Z"


def test_latest_check_iso_is_per_handle(conn) -> None:
    record_check(conn, handle="@a", checked_at="2026-05-22T09:00:00Z",
                 found_count=0, new_count=0, status="ok", error=None)
    record_check(conn, handle="@b", checked_at="2026-05-22T09:30:00Z",
                 found_count=0, new_count=0, status="ok", error=None)
    assert watcher._latest_check_iso(conn, "@a") == "2026-05-22T09:00:00Z"
    assert watcher._latest_check_iso(conn, "@b") == "2026-05-22T09:30:00Z"


# ── _heartbeat_health_report ──────────────────────────────────────────


def test_report_cold_start_healthy_no_alert(conn) -> None:
    """Empty checks table → cold start. Healthy, no Discord alert."""
    report, should_alert = watcher._heartbeat_health_report(conn, "@h")
    assert isinstance(report, HealthReport)
    assert report.is_healthy is True
    assert should_alert is False
    assert "cold start" in report.reason


def test_report_fresh_heartbeat_healthy_no_alert(conn) -> None:
    """A check written ~10s ago → heartbeat fresh, no alert."""
    recent = datetime.now(timezone.utc) - timedelta(seconds=10)
    record_check(conn, handle="@h", checked_at=_iso(recent),
                 found_count=1, new_count=0, status="ok", error=None)
    report, should_alert = watcher._heartbeat_health_report(conn, "@h")
    assert report.is_healthy is True
    assert should_alert is False
    assert "fresh" in report.reason


def test_report_stale_heartbeat_unhealthy_and_alerts(conn, monkeypatch) -> None:
    """A check from well in the past → stale heartbeat, Discord alert.
    The process-start probe is stubbed to None (no live --watch
    process) so the restart grace period does not apply — this test
    pins the genuinely-hung verdict, not the just-restarted case."""
    monkeypatch.setattr(watcher, "_find_watcher_process_start_iso", lambda: None)
    record_check(conn, handle="@h", checked_at="2020-01-01T00:00:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    report, should_alert = watcher._heartbeat_health_report(conn, "@h")
    assert report.is_healthy is False
    assert should_alert is True
    assert "stale" in report.reason


def test_report_stale_heartbeat_but_young_process_is_grace_period(conn, monkeypatch) -> None:
    """A stale check but the --watch process started seconds ago →
    grace period, NOT flagged hung. This is the regression guard for
    the self-perpetuating restart loop: a freshly-restarted watcher
    must not be classified hung before it can write its first check."""
    recent_start = datetime.now(timezone.utc) - timedelta(seconds=20)
    monkeypatch.setattr(watcher, "_find_watcher_process_start_iso", lambda: _iso(recent_start))
    record_check(conn, handle="@h", checked_at="2020-01-01T00:00:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    report, should_alert = watcher._heartbeat_health_report(conn, "@h")
    assert report.is_healthy is True
    assert should_alert is False
    assert "grace period" in report.reason


# ── _notify_stale_heartbeat gating ────────────────────────────────────


def test_notify_no_op_without_target_env(monkeypatch) -> None:
    """No THREADS_WATCHER_NOTIFY_TARGET → never shells out. Keeps a
    normal local --health-check fully side-effect-free."""
    monkeypatch.delenv("THREADS_WATCHER_NOTIFY_TARGET", raising=False)
    calls = []
    monkeypatch.setattr(watcher.subprocess, "run", lambda *a, **k: calls.append(a))
    watcher._notify_stale_heartbeat("@h", "heartbeat stale: ...")
    assert calls == []


def test_notify_shells_out_when_target_set(monkeypatch) -> None:
    """With the opt-in env var set, the openclaw send command is invoked
    with the stale-heartbeat reason in the message body."""
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "thread_123")
    captured = {}

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        return None

    monkeypatch.setattr(watcher.subprocess, "run", fake_run)
    watcher._notify_stale_heartbeat("@h", "heartbeat stale: newest check is 9999s old")

    cmd = captured["cmd"]
    assert cmd[0:3] == ["openclaw", "message", "send"]
    assert "thread_123" in cmd
    msg = cmd[cmd.index("--message") + 1]
    assert "@h" in msg
    assert "heartbeat stale" in msg
    assert "restart-watcher.sh" in msg


def test_notify_swallows_subprocess_failure(monkeypatch) -> None:
    """A failed send must not crash the health check — best-effort."""
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "thread_123")

    def boom(*a, **k):
        raise OSError("openclaw not found")

    monkeypatch.setattr(watcher.subprocess, "run", boom)
    # Must not raise.
    watcher._notify_stale_heartbeat("@h", "reason")


# ── run_health_check end-to-end ───────────────────────────────────────


def test_run_health_check_fires_discord_only_when_stale(monkeypatch, tmp_path) -> None:
    """The headline contract: run_health_check sends a Discord report
    when (and only when) the heartbeat is stale."""
    db_file = tmp_path / "rhc.db"
    monkeypatch.setattr(watcher, "DB_FILE", db_file)
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "thread_x")
    # Redirect the cooldown state file into tmp — otherwise run_health_check
    # reads/writes the real logs/heartbeat-alert-state.json, so a prior
    # --health-check run (or another test) leaves a recent last_alert_iso
    # that the cooldown gate then uses to suppress this test's expected
    # send. Hermetic state file = order-independent test.
    monkeypatch.setattr(watcher, "HEARTBEAT_ALERT_STATE_FILE", tmp_path / "hb-state.json")
    # Neutralise the unrelated process-staleness probe so it can't flip
    # exit_code independently of the heartbeat path under test.
    monkeypatch.setattr(watcher, "_find_watcher_process_start_iso", lambda: None)
    monkeypatch.setattr(watcher, "_collect_source_mtimes", lambda: [])

    sends: list[tuple] = []
    monkeypatch.setattr(watcher.subprocess, "run", lambda *a, **k: sends.append(a))

    # Stale: one check from 2020.
    c = connect(db_file)
    init_db(c)
    record_check(c, handle="@h", checked_at="2020-01-01T00:00:00Z",
                 found_count=1, new_count=0, status="ok", error=None)
    c.close()

    exit_code = watcher.run_health_check("@h")
    assert exit_code == 1  # stale heartbeat → unhealthy
    assert len(sends) == 1  # exactly one Discord send


def test_run_health_check_silent_when_fresh(monkeypatch, tmp_path) -> None:
    """Mirror: a fresh heartbeat → no Discord send, exit 0."""
    db_file = tmp_path / "rhc2.db"
    monkeypatch.setattr(watcher, "DB_FILE", db_file)
    monkeypatch.setenv("THREADS_WATCHER_NOTIFY_TARGET", "thread_x")
    # Hermetic cooldown state file — see the sibling test for why.
    monkeypatch.setattr(watcher, "HEARTBEAT_ALERT_STATE_FILE", tmp_path / "hb-state.json")
    monkeypatch.setattr(watcher, "_find_watcher_process_start_iso", lambda: None)
    monkeypatch.setattr(watcher, "_collect_source_mtimes", lambda: [])

    sends: list[tuple] = []
    monkeypatch.setattr(watcher.subprocess, "run", lambda *a, **k: sends.append(a))

    recent = datetime.now(timezone.utc) - timedelta(seconds=5)
    c = connect(db_file)
    init_db(c)
    record_check(c, handle="@h", checked_at=_iso(recent),
                 found_count=1, new_count=0, status="ok", error=None)
    c.close()

    exit_code = watcher.run_health_check("@h")
    assert exit_code == 0
    assert sends == []
