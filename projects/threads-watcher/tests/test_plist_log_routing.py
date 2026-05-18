"""Regression guard: launchd plist log-routing assumptions.

Pre-fix `com.shiro.threads-watcher-sync.plist` declared
StandardOutPath → logs/sync.out.log, but sync.py writes nothing to
stdout (all logging flows through TeeLogger to stderr + the --log
file). Result: sync.out.log sat at 0 bytes for the whole install
lifetime — pure operational noise that misled grep/tail attempts.

This test pins two invariants so a future agent re-adding the dead
key surfaces immediately:

  1. com.shiro.threads-watcher-sync.plist MUST NOT carry
     StandardOutPath. If a real stdout consumer ever lands in
     sync.py, this test should be updated alongside the code change
     (intentional, not silent).

  2. com.shiro.threads-watcher-auto-restart.plist MUST keep
     StandardOutPath set to logs/auto-restart.out.log — that
     script's ts_log() helper writes via printf to stdout, and the
     ~11KB on-disk log proves operators rely on the capture.
     Asymmetric on purpose.

  3. Both plists MUST keep StandardErrorPath (catches uncaught
     Python tracebacks / shell errors that bypass the in-script
     loggers). Don't generalise either edit.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SYNC_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-sync.plist"
AUTO_RESTART_PLIST = PROJECT_ROOT / "com.shiro.threads-watcher-auto-restart.plist"

# Apple's plutil tolerates `--` inside XML comments (the existing
# plists contain `<!-- ... --confirm ... -->` patterns); Python's
# strict expat parser does not. Use the platform plutil to convert
# to JSON exactly as launchd reads it.
_PLUTIL = shutil.which("plutil")
pytestmark = pytest.mark.skipif(
    _PLUTIL is None,
    reason="plutil unavailable — Linux CI / non-macOS dev box. plist invariants only checked on macOS.",
)


def _load(path: Path) -> dict:
    res = subprocess.run(
        [_PLUTIL, "-convert", "json", "-o", "-", "--", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(res.stdout)


def test_sync_plist_does_not_declare_stdout_path():
    plist = _load(SYNC_PLIST)
    assert "StandardOutPath" not in plist, (
        "sync.py writes nothing to stdout — re-adding StandardOutPath "
        "creates a permanently-empty logs/sync.out.log. If you have a "
        "real stdout consumer, update this test alongside the code."
    )


def test_sync_plist_keeps_stderr_path_for_python_tracebacks():
    plist = _load(SYNC_PLIST)
    err_path = plist.get("StandardErrorPath", "")
    assert err_path.endswith("/logs/sync.err.log"), (
        "Uncaught Python tracebacks / import failures bypass TeeLogger "
        "entirely (they fire before main() runs). Removing this key "
        "loses crash visibility. Post-TeeLogger-double-write-fix the "
        "stream is now mostly empty in healthy operation — that's "
        "expected and intentional."
    )


def test_auto_restart_plist_keeps_stdout_path():
    # Mirror image: auto-restart-if-stale.sh's ts_log() writes via
    # printf to stdout. Dropping StandardOutPath here would silently
    # discard ~11KB/install of operational logs.
    plist = _load(AUTO_RESTART_PLIST)
    out_path = plist.get("StandardOutPath", "")
    assert out_path.endswith("/logs/auto-restart.out.log")


def test_both_plists_validate_as_well_formed_xml():
    # plistlib.load itself raises on malformed XML, so passing the
    # _load() calls above is most of the check. This test makes the
    # invariant explicit so a regression is easy to spot in the
    # test report.
    _load(SYNC_PLIST)  # raises if malformed
    _load(AUTO_RESTART_PLIST)  # raises if malformed


def test_sync_plist_program_arguments_invoke_sync_py():
    # Pin the basic invocation shape so a refactor that drops the
    # sync.py argument (or accidentally swaps to watcher.py) fails
    # immediately rather than at the next launchd tick.
    plist = _load(SYNC_PLIST)
    args = plist.get("ProgramArguments", [])
    assert any(a.endswith("sync.py") for a in args), (
        f"sync plist must invoke sync.py; got args={args}"
    )


def test_sync_plist_dry_run_default_no_confirm_no_push():
    # The plist defaults to DRY-RUN (no --confirm, no --enable-push)
    # per its header comment. Pin so a future agent doesn't silently
    # promote to live by forgetting to comment the strings back out.
    plist = _load(SYNC_PLIST)
    args = plist.get("ProgramArguments", [])
    # XML comments are stripped by plistlib — uncommented strings
    # would show up as bare elements in the array.
    assert "--confirm" not in args, (
        "Sync plist defaulted to LIVE mode (--confirm present in "
        "ProgramArguments). Promote with intent; update this test "
        "alongside the plist."
    )
    assert "--enable-push" not in args


def test_sync_plist_activates_log_rotation():
    # Rotation code shipped in sync.py (9a0f888) with default
    # max_bytes=0 (= no rotation, back-compat). The plist must
    # ACTIVATE it by passing --max-log-bytes — otherwise the
    # well-tested rotation primitive sits dormant forever.
    plist = _load(SYNC_PLIST)
    args = plist.get("ProgramArguments", [])
    assert "--max-log-bytes" in args, (
        "Sync plist must enable log rotation. The TeeLogger default "
        "is max_bytes=0 (no rotation); the plist is the only place "
        "we actively bound the on-disk growth."
    )
    # Following the --max-log-bytes flag, expect a sensible positive
    # integer (catches `0` or accidental string typos).
    idx = args.index("--max-log-bytes")
    assert idx + 1 < len(args)
    value = int(args[idx + 1])
    assert value > 0
    # Sanity ceiling: 100 MB is way past any reasonable single-file
    # log size. A value above that almost certainly indicates a
    # missed unit conversion (e.g., 1048576 vs 1073741824).
    assert value <= 100 * 1024 * 1024
