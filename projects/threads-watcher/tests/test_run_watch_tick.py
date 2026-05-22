"""Tests for run_watch's resilience contract.

run_watch is a `while True` loop, so its per-handle failure isolation
and its interval clamp were never unit-tested. The body is now
extracted into run_watch_tick / clamp_watch_interval — pure enough to
pin here without an infinite loop.

The contract: a failure on one handle is logged and MUST NOT abort the
others or the loop (a transient error on @a must not starve @b of
monitoring); KeyboardInterrupt is the one exception that propagates so
Ctrl-C / SIGINT still stops the watcher.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402


# ── clamp_watch_interval ──────────────────────────────────────────────


def test_interval_below_60_is_clamped_to_60():
    assert watcher.clamp_watch_interval(1) == 60
    assert watcher.clamp_watch_interval(59) == 60


def test_interval_at_or_above_60_is_unchanged():
    assert watcher.clamp_watch_interval(60) == 60
    assert watcher.clamp_watch_interval(120) == 120
    assert watcher.clamp_watch_interval(3600) == 3600


# ── run_watch_tick — per-handle failure isolation ─────────────────────


def test_tick_runs_every_handle(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: calls.append(h))
    watcher.run_watch_tick(["@a", "@b", "@c"])
    assert calls == ["@a", "@b", "@c"]


def test_tick_passes_baseline_lookback_days_through(monkeypatch):
    seen: list = []
    monkeypatch.setattr(
        watcher, "run_once",
        lambda h, *, baseline_lookback_days=None: seen.append((h, baseline_lookback_days)),
    )
    watcher.run_watch_tick(["@a"], baseline_lookback_days=7)
    assert seen == [("@a", 7)]


def test_tick_failure_on_one_handle_does_not_starve_the_others(monkeypatch):
    # The headline resilience contract: @a raising must NOT stop @b/@c.
    calls: list[str] = []

    def fake_run_once(h, **kw):
        calls.append(h)
        if h == "@a":
            raise RuntimeError("network blip on @a")

    monkeypatch.setattr(watcher, "run_once", fake_run_once)
    # Must not raise — the error is logged, the loop continues.
    watcher.run_watch_tick(["@a", "@b", "@c"])
    assert calls == ["@a", "@b", "@c"]


def test_tick_logs_the_failing_handle(monkeypatch, capsys):
    def fake_run_once(h, **kw):
        raise ValueError("boom")

    monkeypatch.setattr(watcher, "run_once", fake_run_once)
    watcher.run_watch_tick(["@hal.lifedesign"])
    err = capsys.readouterr().err
    assert "iteration failed for @hal.lifedesign" in err


def test_tick_propagates_keyboard_interrupt(monkeypatch):
    # Ctrl-C / SIGINT must stop the watcher — KeyboardInterrupt is the
    # one exception run_watch_tick does NOT swallow.
    def fake_run_once(h, **kw):
        raise KeyboardInterrupt

    monkeypatch.setattr(watcher, "run_once", fake_run_once)
    with pytest.raises(KeyboardInterrupt):
        watcher.run_watch_tick(["@a"])


def test_tick_with_no_handles_is_a_noop(monkeypatch):
    calls: list[str] = []
    monkeypatch.setattr(watcher, "run_once", lambda h, **kw: calls.append(h))
    watcher.run_watch_tick([])
    assert calls == []
