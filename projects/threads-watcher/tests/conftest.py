"""Test environment shim for the threads-watcher test suite.

Why this exists
---------------
10 of the test files (test_atomic_write.py, test_cli_args.py, …)
import `watcher`, which transitively imports `playwright.sync_api`.
The active runtime venv (`venv/`, used by run-watcher.sh) has
playwright installed; the lightweight test venv (`.venv/`, used for
ad-hoc pytest runs by operators + agents) DOES NOT — pytest
collection across all test files therefore fails with
`ImportError: No module named 'playwright'` on those 10 files,
even though the OTHER 37+ files (pure-Python helpers like
sync_guards / db / health) work fine.

Before this shim:
  $ .venv/bin/python -m pytest --collect-only -q
  ...
  797 tests collected, 10 errors

Targeted runs (`pytest tests/test_sync_guards.py`) work because
they don't touch the playwright-importing files. So agents/operators
were silently running a SUBSET of the suite, missing any regressions
in the watcher.py-importing 10. That's a real coverage gap — for
example, a refactor that breaks `test_cli_args.py` would only
surface in production after the `run-watcher.sh` launchd restart
hit the same code path.

The Shim
--------
pytest's `collect_ignore_glob` lets a conftest hide files from
collection. We only hide the watcher-importing tests WHEN playwright
is missing (so the `venv/` workflow still collects everything and
the targeted ones still run elsewhere).

This means:
  $ .venv/bin/python -m pytest          # collects 37+ files, 0 errors
  $ venv/bin/python -m pytest           # collects 47+ files, 0 errors

Both venvs produce a clean test run. Agents/operators don't have to
remember which venv to use to avoid the collection blowup; the
suite adapts.

For belt-and-braces visibility: a single skipped-collection summary
is printed to stderr at session start so the operator knows
*something* was hidden (and how to fix it: `pip install playwright`).
"""

from __future__ import annotations

import sys
from pathlib import Path

# Files that import watcher.py (which imports playwright). Maintained
# in sync with the actual import graph — adding a new test file that
# imports watcher requires adding it here OR fixing the import.
_WATCHER_IMPORTING_TESTS = [
    "test_atomic_write.py",
    "test_cli_args.py",
    "test_combined_snapshot.py",
    "test_handle_normalization.py",
    "test_heartbeat_alert_cooldown.py",
    "test_notify_new_post.py",
    "test_run_health_check_heartbeat.py",
    "test_run_once_watchdog.py",
    "test_run_watch_tick.py",
    "test_watch_sigterm_handler.py",
]


def _playwright_available() -> bool:
    try:
        import playwright.sync_api  # noqa: F401
        return True
    except ImportError:
        return False


# pytest invokes the module-level `collect_ignore_glob` automatically.
# We compute it once at import time — the playwright check is cheap
# (~0.1ms when present, slightly more when missing because of the
# import-error walk).
if _playwright_available():
    collect_ignore_glob: list[str] = []
else:
    collect_ignore_glob = list(_WATCHER_IMPORTING_TESTS)
    # Surface the skip so an operator running the suite knows WHY
    # the test count is lower than they may expect. Stderr keeps
    # this out of the test-output stream that CI tooling parses.
    sys.stderr.write(
        f"\n[conftest] playwright not installed in this venv — "
        f"hiding {len(collect_ignore_glob)} watcher-importing test "
        f"file(s) from collection.\n"
        f"[conftest] Run `pip install playwright==1.49.1` in this venv "
        f"to enable them.\n\n"
    )
