"""Tests for the TeeLogger stderr-mirror toggle (sync.py).

Pre-fix: TeeLogger.log() unconditionally wrote to BOTH the on-disk
log file AND sys.stderr. launchd then captured stderr into
StandardErrorPath = logs/sync.err.log — so every tick wrote each
line twice (sync.log = TeeLogger file; sync.err.log = launchd
capture of TeeLogger's stderr mirror). Two copies of identical
data, 2x disk I/O, 2x storage.

Fix: TeeLogger(also_stderr=False) is the new default. main()
auto-enables it only when sys.stderr.isatty() (operator on a TTY
wants live output). The CLI --tee-stderr is the explicit
override for non-TTY interactive cases (e.g., piping into another
tool).

These tests pin the contract without invoking launchd: assert that
the file always gets the line, and stderr gets it ONLY when the
toggle is on.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import TeeLogger  # noqa: E402


def test_default_writes_to_file_only_not_stderr(tmp_path, capsys):
    log_path = tmp_path / "out.log"
    logger = TeeLogger(log_path)
    logger.log("first line")
    logger.log("second line")

    on_disk = log_path.read_text(encoding="utf-8")
    assert "first line" in on_disk
    assert "second line" in on_disk

    captured = capsys.readouterr()
    assert captured.err == "", (
        "TeeLogger default should NOT write to stderr (pre-fix it "
        "unconditionally did, causing the sync.log/sync.err.log "
        "double-write under launchd)."
    )
    assert captured.out == ""


def test_also_stderr_true_mirrors_to_stderr(tmp_path, capsys):
    log_path = tmp_path / "out.log"
    logger = TeeLogger(log_path, also_stderr=True)
    logger.log("mirrored line")

    on_disk = log_path.read_text(encoding="utf-8")
    assert "mirrored line" in on_disk

    captured = capsys.readouterr()
    assert "mirrored line" in captured.err, (
        "also_stderr=True must mirror to stderr — used by interactive "
        "TTY runs and the --tee-stderr CLI override."
    )


def test_lines_have_iso_timestamp_prefix(tmp_path):
    log_path = tmp_path / "out.log"
    logger = TeeLogger(log_path)
    logger.log("payload")
    line = log_path.read_text(encoding="utf-8").strip()
    # Pin the `YYYY-MM-DDTHH:MM:SSZ ` prefix shape — operators
    # build log greps assuming it.
    assert line.startswith("20") and "T" in line[:11] and line.endswith("Z payload")


def test_parent_directory_auto_created(tmp_path):
    nested = tmp_path / "nested" / "deeper" / "out.log"
    assert not nested.parent.exists()
    logger = TeeLogger(nested)
    logger.log("hi")
    assert nested.exists()
    assert "hi" in nested.read_text(encoding="utf-8")


def test_append_mode_preserves_existing_lines(tmp_path):
    log_path = tmp_path / "out.log"
    log_path.write_text("pre-existing line\n", encoding="utf-8")
    logger = TeeLogger(log_path)
    logger.log("new line")
    content = log_path.read_text(encoding="utf-8")
    assert "pre-existing line" in content
    assert "new line" in content


def test_two_instances_on_same_file_both_append(tmp_path):
    """Mirrors the launchd reality where each tick spawns a fresh
    Python process — a brand-new TeeLogger appends to the prior
    tick's file rather than truncating."""
    log_path = tmp_path / "out.log"
    TeeLogger(log_path).log("tick 1")
    TeeLogger(log_path).log("tick 2")
    content = log_path.read_text(encoding="utf-8")
    assert "tick 1" in content
    assert "tick 2" in content
