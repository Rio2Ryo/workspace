"""Tests for log_rotation.py CLI + bash integration.

The bash side: restart-watcher.sh invokes
  python log_rotation.py logs/watcher.log --max-bytes N --backup-count K
between SIGKILL-of-old-watcher and launch-of-new. This is the only
moment when no process has watcher.log open, so it's the safe
rotation window.

These tests pin:
  - The CLI exit-code contract (0 success/noop, 1 bad args, 2 IO fail)
  - The exact behaviour bash relies on (rotation runs at threshold;
    no rotation under threshold; missing file is a no-op)
  - The end-to-end bash invocation via subprocess (catches a typo
    in restart-watcher.sh's --max-bytes / --backup-count flag names)
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from log_rotation import main, maybe_rotate, rotate_log_files  # noqa: E402


PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_ROTATION_SCRIPT = PROJECT_ROOT / "log_rotation.py"
RESTART_WATCHER_SH = PROJECT_ROOT / "restart-watcher.sh"
AUTO_RESTART_SH = PROJECT_ROOT / "auto-restart-if-stale.sh"


# ── maybe_rotate (size-aware wrapper) ───────────────────────────────────


def test_maybe_rotate_returns_false_when_file_under_cap(tmp_path):
    p = tmp_path / "log"
    p.write_text("under cap content", encoding="utf-8")
    assert maybe_rotate(p, max_bytes=10_000, backup_count=3) is False
    # Original file untouched.
    assert p.read_text(encoding="utf-8") == "under cap content"
    assert not (tmp_path / "log.1").exists()


def test_maybe_rotate_returns_true_and_rotates_at_threshold(tmp_path):
    p = tmp_path / "log"
    p.write_text("x" * 500, encoding="utf-8")
    assert maybe_rotate(p, max_bytes=100, backup_count=3) is True
    # Original moved to .1.
    assert not p.exists()
    assert (tmp_path / "log.1").exists()


def test_maybe_rotate_noop_when_max_bytes_zero(tmp_path):
    p = tmp_path / "log"
    p.write_text("x" * 10_000, encoding="utf-8")
    assert maybe_rotate(p, max_bytes=0, backup_count=3) is False
    assert p.exists()


def test_maybe_rotate_noop_when_file_missing(tmp_path):
    assert maybe_rotate(tmp_path / "never", max_bytes=100, backup_count=3) is False


# ── CLI exit codes ──────────────────────────────────────────────────────


def test_cli_exit_zero_on_successful_rotation(tmp_path):
    p = tmp_path / "log"
    p.write_text("x" * 200, encoding="utf-8")
    code = main([str(p), "--max-bytes", "100", "--backup-count", "3"])
    assert code == 0
    assert (tmp_path / "log.1").exists()


def test_cli_exit_zero_on_noop(tmp_path):
    p = tmp_path / "log"
    p.write_text("small", encoding="utf-8")
    code = main([str(p), "--max-bytes", "10000", "--backup-count", "3"])
    assert code == 0
    assert p.exists()
    assert not (tmp_path / "log.1").exists()


def test_cli_exit_one_on_negative_args(tmp_path):
    p = tmp_path / "log"
    p.touch()
    code = main([str(p), "--max-bytes", "-1", "--backup-count", "3"])
    assert code == 1


# ── subprocess end-to-end (catches flag-name typos in bash) ─────────────


def test_cli_via_subprocess_rotates_real_file(tmp_path):
    p = tmp_path / "watcher.log"
    p.write_text("x" * 5000, encoding="utf-8")
    res = subprocess.run(
        [
            sys.executable,
            str(LOG_ROTATION_SCRIPT),
            str(p),
            "--max-bytes",
            "1000",
            "--backup-count",
            "5",
        ],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"stderr: {res.stderr}"
    assert (tmp_path / "watcher.log.1").exists()
    # Stdout reports the action so operators can grep for it.
    assert "rotated" in res.stdout


def test_cli_via_subprocess_handles_missing_file_silently(tmp_path):
    res = subprocess.run(
        [
            sys.executable,
            str(LOG_ROTATION_SCRIPT),
            str(tmp_path / "missing.log"),
            "--max-bytes",
            "1000",
        ],
        capture_output=True,
        text=True,
    )
    # Missing-file is a no-op, not an error — so restart-watcher.sh
    # on a fresh install (no logs/watcher.log yet) doesn't fail.
    assert res.returncode == 0
    assert "rotated" not in res.stdout


# ── bash wiring contract pin ────────────────────────────────────────────


def test_restart_watcher_sh_invokes_log_rotation_with_expected_flags():
    """Pre-launch rotation block in restart-watcher.sh must call
    log_rotation.py with the documented flag shape. A typo
    (--max_bytes instead of --max-bytes, or --backup_count instead
    of --backup-count) would silently let the file grow forever
    while the launchd cycle keeps "succeeding"."""
    sh = RESTART_WATCHER_SH.read_text(encoding="utf-8")
    assert "log_rotation.py" in sh, (
        "restart-watcher.sh must invoke log_rotation.py at restart "
        "time — that's the only moment no process has watcher.log open."
    )
    assert "--max-bytes" in sh
    assert "--backup-count" in sh
    # Env-var overrides documented in the script header.
    assert "WATCHER_LOG_MAX_BYTES" in sh
    assert "WATCHER_LOG_BACKUP_COUNT" in sh


def test_auto_restart_sh_invokes_log_rotation_with_expected_flags():
    """auto-restart-if-stale.sh runs at every launchd tick and
    rotates logs/auto-restart.out.log so its log family stays
    bounded. Same wiring contract as restart-watcher.sh — typo'd
    flag names would silently let the file grow forever."""
    sh = AUTO_RESTART_SH.read_text(encoding="utf-8")
    assert "log_rotation.py" in sh
    assert "--max-bytes" in sh
    assert "--backup-count" in sh
    # Env-var overrides specific to this rotation site.
    assert "AUTO_RESTART_LOG_MAX_BYTES" in sh
    assert "AUTO_RESTART_LOG_BACKUP_COUNT" in sh
    # The target log file (NOT watcher.log).
    assert "logs/auto-restart.out.log" in sh
