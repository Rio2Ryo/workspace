"""Tests for the watcher's SIGTERM handling.

restart-watcher.sh stops the watcher with SIGTERM. By default Python
SIGTERM abruptly terminates the process — no log line, and the
Playwright driver / Chromium children are orphaned (no clean close).

run_watch installs a handler that turns SIGTERM into a logged
KeyboardInterrupt, so the watch loop unwinds through run_once's
`finally: browser.close()` and the `with sync_playwright()` exit. The
log line also makes a death diagnosable: a crash WITH a
`received signal ... SIGTERM` line was an expected restart-watcher
stop; a crash WITHOUT one was a SIGKILL (OOM / kill -9).
"""

from __future__ import annotations

import signal
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import watcher  # noqa: E402


@pytest.fixture
def restore_sigterm():
    """Snapshot and restore the process SIGTERM disposition so the
    test doesn't leak a handler into the rest of the suite."""
    original = signal.getsignal(signal.SIGTERM)
    yield
    signal.signal(signal.SIGTERM, original)


def test_install_registers_a_sigterm_handler(restore_sigterm):
    watcher.install_watch_signal_handler()
    handler = signal.getsignal(signal.SIGTERM)
    assert handler is watcher._sigterm_to_keyboard_interrupt


def test_handler_raises_keyboard_interrupt():
    # The watch loop already unwinds cleanly on KeyboardInterrupt
    # (run_watch_tick re-raises it, run_watch returns); routing SIGTERM
    # to the same exception gives a graceful, Chromium-closing shutdown.
    with pytest.raises(KeyboardInterrupt):
        watcher._sigterm_to_keyboard_interrupt(signal.SIGTERM, None)


def test_handler_logs_the_signal_to_stderr(capsys):
    with pytest.raises(KeyboardInterrupt):
        watcher._sigterm_to_keyboard_interrupt(signal.SIGTERM, None)
    err = capsys.readouterr().err
    # The line a post-mortem greps for to tell SIGTERM (expected
    # restart) apart from SIGKILL (OOM / kill -9).
    assert "received signal" in err
    assert "SIGTERM" in err
    assert "shutting down" in err


def test_handler_log_carries_a_timestamp(capsys):
    with pytest.raises(KeyboardInterrupt):
        watcher._sigterm_to_keyboard_interrupt(signal.SIGTERM, None)
    err = capsys.readouterr().err
    # _now_iso() shape: YYYY-MM-DDTHH:MM:SSZ
    import re
    assert re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", err)
