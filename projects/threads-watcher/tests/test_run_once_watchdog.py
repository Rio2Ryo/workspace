"""Tests for the per-iteration SIGALRM watchdog.

run_once drives Chromium via Playwright. A wedged call (Chromium
launch deadlock, a socket read with no timeout) hangs run_once — and
therefore the whole watch loop — indefinitely. Observed 2026-05-22:
PID 32781 alive 3m44s, zero checks written.

run_once_with_watchdog arms a SIGALRM for RUN_ONCE_TIMEOUT_S; if
run_once does not return in time the alarm raises WatchIterationTimeout
— an Exception run_watch_tick catches, logs, and moves past. These
tests use a tiny timeout and a sleeping stub so they finish fast.
"""

from __future__ import annotations

import signal
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402


@pytest.fixture(autouse=True)
def restore_sigalrm():
    """Guarantee no watchdog state leaks between tests."""
    original = signal.getsignal(signal.SIGALRM)
    yield
    signal.alarm(0)
    signal.signal(signal.SIGALRM, original)


def test_fast_run_once_completes_without_firing(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: calls.append(h))
    watcher.run_once_with_watchdog("@a", timeout_s=5)
    assert calls == ["@a"]


def test_hanging_run_once_is_cut_off_by_the_watchdog(monkeypatch):
    # A run_once that would block far longer than the budget must be
    # interrupted with WatchIterationTimeout, not hang the test.
    def hanging(h, **kw):
        time.sleep(30)

    monkeypatch.setattr(watcher, "run_once", hanging)
    start = time.monotonic()
    with pytest.raises(watcher.WatchIterationTimeout):
        watcher.run_once_with_watchdog("@a", timeout_s=1)
    elapsed = time.monotonic() - start
    assert elapsed < 5, f"watchdog did not fire promptly (took {elapsed:.1f}s)"


def test_timeout_message_names_the_handle(monkeypatch):
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: time.sleep(30))
    with pytest.raises(watcher.WatchIterationTimeout, match="@hal.lifedesign"):
        watcher.run_once_with_watchdog("@hal.lifedesign", timeout_s=1)


def test_watchdog_clears_the_alarm_after_a_fast_run(monkeypatch):
    # After a fast completion no alarm must remain pending — otherwise
    # it would fire spuriously during the next handle.
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: None)
    watcher.run_once_with_watchdog("@a", timeout_s=10)
    remaining = signal.alarm(0)  # returns seconds left on any pending alarm
    assert remaining == 0


def test_watchdog_restores_the_previous_sigalrm_handler(monkeypatch):
    sentinel = signal.getsignal(signal.SIGALRM)
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: None)
    watcher.run_once_with_watchdog("@a", timeout_s=10)
    assert signal.getsignal(signal.SIGALRM) is sentinel


def test_run_watch_tick_logs_a_timed_out_handle_and_continues(monkeypatch, capsys):
    # End-to-end: @a hangs (watchdog fires), @b must still run.
    calls: list[str] = []

    def run_once(h, **kw):
        calls.append(h)
        if h == "@a":
            time.sleep(30)

    monkeypatch.setattr(watcher, "run_once", run_once)
    monkeypatch.setattr(watcher, "RUN_ONCE_TIMEOUT_S", 1)
    watcher.run_watch_tick(["@a", "@b"])
    assert calls == ["@a", "@b"]
    err = capsys.readouterr().err
    assert "iteration failed for @a" in err
    assert "exceeded" in err


def test_passes_baseline_lookback_days_through(monkeypatch):
    seen: list = []
    monkeypatch.setattr(
        watcher, "run_once",
        lambda h, *, baseline_lookback_days=None: seen.append(baseline_lookback_days),
    )
    watcher.run_once_with_watchdog("@a", timeout_s=5, baseline_lookback_days=14)
    assert seen == [14]
