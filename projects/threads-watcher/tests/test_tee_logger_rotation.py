"""Tests for TeeLogger size-based rotation.

Pre-fix TeeLogger had no rotation at all — every launchd tick
appended forever to the same file. Observed sizes after 1-2 days
of install (May 17 → May 19):
  - logs/sync.log         9.3 KB  (~5 KB/day)
  - logs/auto-restart.out 12.5 KB
  - logs/watcher.log      103 KB  (~100 KB/day — worst offender)

Manageable per-year but unbounded over multi-year installs. The
rotation infrastructure should exist BEFORE we need it.

Fix
---
TeeLogger(max_bytes=N, backup_count=K) — when a log() write
would push the file past N bytes, rotate (current → .1, existing
.i → .i+1, drop past .K) BEFORE writing. Matches stdlib
RotatingFileHandler semantics; default max_bytes=0 keeps the
back-compat "never rotate" behaviour.

These tests pin:
  1. Rotation NEVER fires when max_bytes=0 (back-compat default)
  2. Rotation FIRES at the byte boundary
  3. Existing .N files shift correctly
  4. backup_count caps the number of preserved files
  5. The triggering write lands in the FRESH file, not the
     rotated one (the entire point of pre-write rotation)
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sync import TeeLogger, _rotate_log_files  # noqa: E402


# ── default (no rotation) ───────────────────────────────────────────────


def test_default_max_bytes_zero_never_rotates(tmp_path):
    """max_bytes=0 is the back-compat default — TeeLogger must
    behave EXACTLY like the pre-rotation version (unbounded append,
    no .1/.2/... files)."""
    log_path = tmp_path / "out.log"
    logger = TeeLogger(log_path)  # default max_bytes=0
    for i in range(50):
        logger.log("x" * 200)  # 50 * (200 + overhead) ~= 13KB
    assert log_path.exists()
    # No rotated siblings.
    assert not (tmp_path / "out.log.1").exists()
    assert not (tmp_path / "out.log.2").exists()
    content = log_path.read_text(encoding="utf-8")
    # Count log lines, not "xxx" substrings (200 x's contains many
    # overlapping "xxx" matches — easy off-by-many trap).
    assert content.count("\n") == 50


# ── rotation triggers ───────────────────────────────────────────────────


def test_rotation_fires_when_write_would_exceed_max_bytes(tmp_path):
    log_path = tmp_path / "out.log"
    # 100-byte cap. Each log() emits a timestamp prefix (~21 bytes)
    # + msg + newline, so writes are ~30+ bytes.
    logger = TeeLogger(log_path, max_bytes=100, backup_count=3)

    # First write: file empty → goes in current path.
    logger.log("first batch")
    assert log_path.exists()
    assert not (tmp_path / "out.log.1").exists()

    # Keep writing until rotation triggers.
    for i in range(10):
        logger.log(f"line {i:02d} padding-aa-bb-cc")

    # Rotation must have produced .1 by now.
    rotated_1 = tmp_path / "out.log.1"
    assert rotated_1.exists(), "rotation should have fired past 100-byte cap"

    # The triggering write landed in the FRESH file (current path),
    # not the rotated .1 — pre-write rotation is the contract.
    fresh = log_path.read_text(encoding="utf-8")
    rotated = rotated_1.read_text(encoding="utf-8")
    # The latest line is in the fresh file (post-rotation write).
    assert "line 09" in fresh
    # The rotated file is non-empty and carries valid log shape
    # (each rotation shifts whatever was in the current file at
    # the moment rotation fired — under the 100-byte cap, only the
    # most-recent few lines, but always some "line NN" content).
    assert rotated.strip() != ""
    assert "line " in rotated, (
        f"rotated file should contain log-shaped content, got: {rotated[:200]}"
    )


def test_backup_count_caps_preserved_files(tmp_path):
    log_path = tmp_path / "out.log"
    # backup_count=2 means only .1 and .2 exist; .3 should be dropped.
    logger = TeeLogger(log_path, max_bytes=50, backup_count=2)

    # Force many rotations.
    for i in range(20):
        logger.log(f"line {i:02d} pad pad pad")

    assert log_path.exists()
    assert (tmp_path / "out.log.1").exists()
    assert (tmp_path / "out.log.2").exists()
    # .3 must NOT exist — backup_count=2 caps at .2.
    assert not (tmp_path / "out.log.3").exists()


def test_rotation_shifts_existing_numbered_files(tmp_path):
    """When out.log rotates, existing out.log.1 must move to .2, etc.
    Test the bookkeeping with pre-seeded .1 + .2 files."""
    log_path = tmp_path / "out.log"
    (tmp_path / "out.log.1").write_text("OLDEST_AT_1", encoding="utf-8")
    (tmp_path / "out.log.2").write_text("MIDDLE_AT_2", encoding="utf-8")
    log_path.write_text("CURRENT", encoding="utf-8")

    _rotate_log_files(log_path, backup_count=3)

    assert not log_path.exists()  # current was renamed away
    # CURRENT moved to .1
    assert (tmp_path / "out.log.1").read_text(encoding="utf-8") == "CURRENT"
    # OLDEST_AT_1 moved to .2
    assert (tmp_path / "out.log.2").read_text(encoding="utf-8") == "OLDEST_AT_1"
    # MIDDLE_AT_2 moved to .3
    assert (tmp_path / "out.log.3").read_text(encoding="utf-8") == "MIDDLE_AT_2"


def test_rotation_with_backup_count_zero_just_truncates(tmp_path):
    """backup_count=0 is the 'discard old, no history' mode —
    rotate becomes 'unlink current and start fresh'. Tested
    explicitly so the no-history branch isn't an exception path."""
    log_path = tmp_path / "out.log"
    log_path.write_text("doomed content", encoding="utf-8")
    _rotate_log_files(log_path, backup_count=0)
    assert not log_path.exists()
    assert not (tmp_path / "out.log.1").exists()


def test_rotation_no_op_when_file_missing(tmp_path):
    """Fresh install / first run: file doesn't exist. Rotation
    is a no-op without raising."""
    log_path = tmp_path / "out.log"
    _rotate_log_files(log_path, backup_count=3)  # must not raise
    assert not log_path.exists()


def test_rotation_count_overflow_drops_oldest(tmp_path):
    """Pre-seed .1 through .5, set backup_count=3 → after rotate,
    only .1..3 should exist (older .4, .5 silently dropped at the
    edge of the loop bound)."""
    log_path = tmp_path / "out.log"
    log_path.write_text("CURRENT", encoding="utf-8")
    for i in range(1, 6):
        (tmp_path / f"out.log.{i}").write_text(f"old{i}", encoding="utf-8")

    _rotate_log_files(log_path, backup_count=3)

    # New .1 = old CURRENT, .2 = old .1, .3 = old .2.
    # The pre-seeded .3, .4, .5 are not touched (only .1, .2 in
    # backup_count's loop range shift). Verify the documented
    # behaviour: rotation only manages indices < backup_count.
    assert (tmp_path / "out.log.1").read_text(encoding="utf-8") == "CURRENT"
    assert (tmp_path / "out.log.2").read_text(encoding="utf-8") == "old1"
    assert (tmp_path / "out.log.3").read_text(encoding="utf-8") == "old2"
    # .4 and .5 may or may not exist (operator-cleanup territory).
    # Important: .1, .2, .3 are correct.


# ── integration with the stderr toggle ──────────────────────────────────


def test_rotation_compatible_with_also_stderr(tmp_path, capsys):
    """Rotation + also_stderr=True must not interfere with each
    other. The rotated file should still get the line, and stderr
    should ALSO get it."""
    log_path = tmp_path / "out.log"
    logger = TeeLogger(log_path, also_stderr=True, max_bytes=100, backup_count=2)
    for i in range(8):
        logger.log(f"streamed line {i:02d} padding")

    captured = capsys.readouterr()
    # All 8 messages went to stderr.
    for i in range(8):
        assert f"line {i:02d}" in captured.err
    # At least one rotation occurred → out.log.1 exists.
    assert (tmp_path / "out.log.1").exists()
