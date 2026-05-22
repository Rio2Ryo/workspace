"""Regression guard for run-watcher.sh's output buffering.

launchd / nohup redirect the watcher's stdout to logs/watcher.log — a
non-TTY — so Python block-buffers stdout. When the watcher is killed
hard (SIGKILL: OOM, or restart-watcher.sh's SIGTERM→SIGKILL escalation)
the buffer is discarded: the `[watch]` startup line and any error
message never reach the log.

That is exactly what made a 29-restarts-in-one-day crash loop
undiagnosable on 2026-05-22 — watcher.log held only the downstream
Playwright Node-driver EPIPE, with zero `[watch]` lines and zero Python
tracebacks despite every launch dying.

run-watcher.sh must run Python unbuffered so each line is flushed
immediately and survives a hard kill. These tests pin that.
"""

from __future__ import annotations

import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RUN_WATCHER = PROJECT_ROOT / "run-watcher.sh"


def _script() -> str:
    return RUN_WATCHER.read_text(encoding="utf-8")


def test_run_watcher_exists_and_is_executable():
    import os
    assert RUN_WATCHER.is_file()
    assert os.access(RUN_WATCHER, os.X_OK), "run-watcher.sh must be executable (launchd execs it via restart-watcher.sh)"


def test_python_is_invoked_unbuffered():
    # Either `python -u` or `PYTHONUNBUFFERED=1` (or both) — without one
    # of them a hard kill loses every buffered stdout line.
    script = _script()
    has_u_flag = re.search(r"\bpython\b[^\n]*\s-u\b", script) is not None
    has_env = "PYTHONUNBUFFERED=1" in script
    assert has_u_flag or has_env, (
        "run-watcher.sh must run Python unbuffered (`python -u` or "
        "PYTHONUNBUFFERED=1) so watcher output survives a hard kill"
    )


def test_still_execs_the_watch_loop():
    # Pin the invocation shape so a refactor can't drop --watch.
    script = _script()
    assert re.search(r"exec\s+python[^\n]*watcher\.py[^\n]*--watch", script), (
        "run-watcher.sh must exec `python ... watcher.py --watch`"
    )


def test_interval_is_env_overridable_with_a_default():
    # THREADS_WATCHER_INTERVAL drives the loop cadence; keep the
    # ${VAR:-60} default so a plist without the env var still works.
    assert "THREADS_WATCHER_INTERVAL:-60" in _script()
