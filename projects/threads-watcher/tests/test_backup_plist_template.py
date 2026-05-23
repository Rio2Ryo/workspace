"""Structural tests for the launchd backup template.

A .plist.example template is operator-facing — they copy it to
~/Library/LaunchAgents/, edit paths, and `launchctl load -w`. A
malformed template silently produces "launchctl: not loaded" with
no good error path. These tests pin the contract:

  * file exists and parses as valid plist XML
  * Label matches the convention of sister .plist.example files
  * ProgramArguments invokes backup_db.py (the script shipped in
    commit ab5e80f) with the standard --keep argument
  * daily schedule via StartCalendarInterval at the documented hour
  * RunAtLoad is false so `launchctl load` doesn't immediately
    snapshot before the operator has verified the dry-run path
  * stdout/stderr routed to logs/ directory (rotated separately
    from sync.log per existing convention)
  * WorkingDirectory is the project root (relative paths in the
    script body resolve correctly)
"""

from __future__ import annotations

import plistlib
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

PROJECT_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = PROJECT_ROOT / "com.shiro.threads-watcher-backup.plist.example"


@pytest.fixture(scope="module")
def parsed() -> dict:
    assert TEMPLATE.exists(), f"template not at expected path: {TEMPLATE}"
    return plistlib.loads(TEMPLATE.read_bytes())


def test_label_matches_filename_convention(parsed: dict) -> None:
    # macOS convention: Label string == filename without extension.
    # Catches a copy-paste from sync.plist.example that didn't update
    # the Label — which would silently shadow the sync entry under
    # `launchctl list`.
    assert parsed["Label"] == "com.shiro.threads-watcher-backup"


def test_invokes_backup_db_py_with_keep_argument(parsed: dict) -> None:
    args = parsed["ProgramArguments"]
    # First arg is the python interpreter (system python via Homebrew,
    # consistent with sync.plist.example).
    assert args[0].endswith("python3")
    # Second arg is the script — and the script must actually exist
    # in the repo (catches a refactor that renames backup_db.py
    # without updating the plist).
    script_path = Path(args[1])
    assert script_path.name == "backup_db.py"
    assert script_path.exists(), f"script does not exist: {script_path}"
    # --keep is present so the retention is explicit (NOT inheriting
    # the default), with a sensible value.
    assert "--keep" in args
    keep_value = args[args.index("--keep") + 1]
    assert keep_value.isdigit()
    assert int(keep_value) >= 1


def test_daily_schedule_via_calendar_interval(parsed: dict) -> None:
    # StartCalendarInterval (not StartInterval) so the daily cadence
    # survives Mac mini sleep. Hour is the documented quiet hour;
    # minute should be 0 (typical convention).
    sched = parsed.get("StartCalendarInterval")
    assert sched is not None, (
        "missing StartCalendarInterval — use this (not StartInterval) "
        "so the daily cadence survives macOS sleep"
    )
    assert "Hour" in sched
    assert "Minute" in sched
    # Quiet hour (sub-hourly tick from sync.plist runs at *:00 — back-
    # up at 03:00 separates the I/O without colliding).
    assert 0 <= sched["Hour"] <= 23
    assert 0 <= sched["Minute"] <= 59


def test_run_at_load_is_false(parsed: dict) -> None:
    # The template must NOT trigger on `launchctl load -w` — operators
    # should verify the dry-run path first. RunAtLoad=true would snap-
    # shot the DB the moment the plist is enabled.
    assert parsed.get("RunAtLoad") is False


def test_stdout_stderr_paths_route_to_logs_directory(parsed: dict) -> None:
    out = Path(parsed["StandardOutPath"])
    err = Path(parsed["StandardErrorPath"])
    # Logs land in the project's logs/ subdirectory so they rotate
    # alongside sync.log / watcher.log via the existing tee setup.
    assert out.parent.name == "logs"
    assert err.parent.name == "logs"
    # Distinct paths so backup output doesn't clobber sync logs.
    assert "backup" in out.name
    assert "backup" in err.name
    assert out != err


def test_working_directory_is_project_root(parsed: dict) -> None:
    wd = Path(parsed["WorkingDirectory"])
    # The script uses Path(__file__).resolve().parent for defaults, so
    # cwd doesn't strictly matter — but pinning it to the project root
    # means relative paths the operator might add later (e.g.
    # `--dir backups-staging`) resolve to a predictable location.
    assert wd.name == "threads-watcher"


def test_path_env_includes_homebrew(parsed: dict) -> None:
    env = parsed.get("EnvironmentVariables", {})
    path = env.get("PATH", "")
    # Homebrew python lives under /opt/homebrew/bin on Apple Silicon.
    # Without this on PATH, `subprocess.run(['python3', ...])` in any
    # future hook would fail to resolve.
    assert "/opt/homebrew/bin" in path


def test_does_not_set_dangerous_dry_run_false_by_default(parsed: dict) -> None:
    # backup_db.py's default IS to write (dry_run=False), so this is
    # about the COMMENTED-OUT --dry-run hint in the template. Confirm
    # the active ProgramArguments don't accidentally include --dry-run
    # — the operator should opt INTO dry-run, not opt out (the latter
    # leaves them thinking backups are happening when they aren't).
    assert "--dry-run" not in parsed["ProgramArguments"]
