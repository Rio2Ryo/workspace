"""Standalone log rotation — usable both as a Python import (sync.py's
TeeLogger reuses it) and as a bash-friendly CLI (restart-watcher.sh
invokes it to rotate logs/watcher.log at restart time).

Why both surfaces
-----------------
- watcher.py runs continuously between restarts and writes to
  logs/watcher.log via a bash `>>` redirection inherited from
  restart-watcher.sh:97. Python-internal rotation can't reach that
  file descriptor. Rotation must happen at restart time, outside
  the watcher process.
- sync.py is a per-tick Python process, so its own TeeLogger can
  handle rotation on each log() call.

This module centralises the rotation contract so the two paths
(Python-internal + bash-invoked) share the same dance + the same
back-compat semantics.

CLI usage (added 2026-05-19 to give restart-watcher.sh bounded
log size for the worst offender, logs/watcher.log at ~100 KB/day):

    python log_rotation.py <path> [--max-bytes N] [--backup-count K]

Exit codes:
    0  rotation performed OR no-op (file under cap / missing)
    1  bad CLI arguments
    2  rotation attempted but failed (one or more renames raised)
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def rotate_log_files(path: Path, backup_count: int) -> None:
    """Rotate `path` to `path.1`, shifting existing `.N` → `.N+1`,
    dropping anything beyond `backup_count`. Mirrors stdlib's
    RotatingFileHandler.doRollover() without subclassing.

    Best-effort: silently ignores rename failures (rare on local
    disk; callers can retry). Never raises.
    """
    if backup_count <= 0:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return

    for i in range(backup_count - 1, 0, -1):
        src = path.with_suffix(path.suffix + f".{i}")
        dst = path.with_suffix(path.suffix + f".{i + 1}")
        if src.exists():
            try:
                if dst.exists():
                    dst.unlink()
                src.rename(dst)
            except OSError:
                pass
    if path.exists():
        try:
            dst = path.with_suffix(path.suffix + ".1")
            if dst.exists():
                dst.unlink()
            path.rename(dst)
        except OSError:
            pass


def maybe_rotate(path: Path, max_bytes: int, backup_count: int) -> bool:
    """Check size, rotate if over the threshold. Returns True iff
    rotation actually fired.

    No-ops: missing file, max_bytes <= 0, file under cap. Designed
    to be safe to call before every write OR at restart time.
    """
    if max_bytes <= 0:
        return False
    if not path.exists():
        return False
    if path.stat().st_size <= max_bytes:
        return False
    rotate_log_files(path, backup_count)
    return True


def _parse_cli(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Rotate a log file in place when oversized.",
    )
    p.add_argument("path", type=Path, help="Log file to rotate.")
    p.add_argument(
        "--max-bytes",
        type=int,
        default=1_048_576,
        help="Rotation threshold in bytes. Default 1 MB (1048576).",
    )
    p.add_argument(
        "--backup-count",
        type=int,
        default=5,
        help="Number of .1 .. .N backups to keep. Default 5.",
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_cli(argv)
    if args.max_bytes < 0 or args.backup_count < 0:
        sys.stderr.write("max-bytes and backup-count must be >= 0\n")
        return 1
    try:
        rotated = maybe_rotate(args.path, args.max_bytes, args.backup_count)
    except Exception as e:  # noqa: BLE001 — CLI surface, swallow + report
        sys.stderr.write(f"rotation failed: {e}\n")
        return 2
    if rotated:
        sys.stdout.write(f"rotated: {args.path}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
