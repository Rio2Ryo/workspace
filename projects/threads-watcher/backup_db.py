"""Hot-safe snapshot + retention for threads_watcher.db.

Why not the AUTO_SYNC_DESIGN.md sketch (`cp threads_watcher.db ...`)
--------------------------------------------------------------------
db.py opens with `PRAGMA journal_mode=WAL`. A naive `cp` against a
WAL-mode DB while watcher.py is mid-write captures the main file
without the in-flight WAL pages, producing a backup that is
silently inconsistent — sqlite3.OperationalError on restore, or
worse, a half-applied transaction that opens cleanly but lies about
its state. `sqlite3.Connection.backup()` (the SQLITE_BACKUP API) is
the only correct primitive: it locks pages briefly, copies in
batches, and reads the WAL coherently.

Why Python, not bash
--------------------
Same reasoning as sync.py replacing sync.sh.example: a Python
script is unit-testable via pytest without needing bats or shell
fixture trickery. The launchd plist invokes
`venv/bin/python3 backup_db.py [--keep N]` exactly the way it
invokes sync.py.

CLI
---
  python backup_db.py                              # backup, integrity-check, prune to keep=7
  python backup_db.py --keep 14                    # custom retention
  python backup_db.py --dir backups-test           # custom output dir
  python backup_db.py --dry-run                    # log only, do not write
  python backup_db.py --db /custom/path.db         # custom source

Exit codes
----------
  0  backup written, integrity OK, retention applied
  1  backup failed OR integrity check failed (a partial file is
     removed before exit so the next run doesn't trip retention on it)
  2  invocation error (bad flag, missing source DB)
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_FILE = PROJECT_ROOT / "threads_watcher.db"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "backups"
DEFAULT_KEEP = 7
BACKUP_PREFIX = "threads_watcher-"
BACKUP_SUFFIX = ".db"


@dataclass(frozen=True)
class BackupResult:
    backup_path: Path
    bytes_written: int
    pruned: list[Path]
    dry_run: bool


def backup_filename(now: datetime) -> str:
    """Format: `threads_watcher-YYYYMMDDTHHMMSSZ.db` (UTC, second precision).

    Second precision rather than day precision so multiple runs per
    day (e.g., manual + cron) don't silently overwrite. UTC because
    launchd may run in JST or UTC depending on host config.
    """
    ts = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{BACKUP_PREFIX}{ts}{BACKUP_SUFFIX}"


def list_existing_backups(backup_dir: Path) -> list[Path]:
    """Backups sorted newest-first by filename (the format sorts
    lexicographically by time)."""
    if not backup_dir.exists():
        return []
    return sorted(
        backup_dir.glob(f"{BACKUP_PREFIX}*{BACKUP_SUFFIX}"),
        reverse=True,
    )


def _snapshot(src_path: Path, dst_path: Path) -> int:
    """Use the SQLite backup API to safely snapshot an in-flight DB.

    Returns the byte size of the resulting file. Raises sqlite3.Error
    on backup failure — the caller is responsible for cleanup.
    """
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            # pages=-1 means "copy everything in one go". For a 27MB DB
            # this is fast enough not to need progress chunking.
            src.backup(dst, pages=-1)
        finally:
            dst.close()
    finally:
        src.close()
    return dst_path.stat().st_size


def _integrity_check(path: Path) -> bool:
    """`PRAGMA integrity_check` returns 'ok' on a healthy DB."""
    conn = sqlite3.connect(path)
    try:
        row = conn.execute("PRAGMA integrity_check").fetchone()
    finally:
        conn.close()
    return row is not None and row[0] == "ok"


def run_backup(
    *,
    db_path: Path,
    backup_dir: Path,
    keep: int,
    dry_run: bool = False,
    now: datetime | None = None,
) -> BackupResult:
    if not db_path.exists():
        raise FileNotFoundError(f"source DB does not exist: {db_path}")
    if keep < 1:
        raise ValueError(f"--keep must be >= 1 (got {keep})")

    now = now or datetime.now(tz=timezone.utc)
    filename = backup_filename(now)
    dst = backup_dir / filename

    if dry_run:
        # Compute what WOULD be pruned without writing anything. The
        # dry-run also exists post-write so a separate +1 candidate
        # is included in the simulated count.
        existing = list_existing_backups(backup_dir)
        simulated = [dst] + existing  # the new backup would be index 0
        pruned = simulated[keep:]
        return BackupResult(backup_path=dst, bytes_written=0, pruned=pruned, dry_run=True)

    backup_dir.mkdir(parents=True, exist_ok=True)
    try:
        size = _snapshot(db_path, dst)
    except sqlite3.Error:
        # Half-written file would persist and confuse retention. Wipe
        # it before re-raising so the caller's exit-1 path leaves the
        # directory in a clean state.
        if dst.exists():
            dst.unlink()
        raise

    if not _integrity_check(dst):
        dst.unlink()
        raise sqlite3.DatabaseError(
            f"integrity_check failed on freshly-written backup {dst.name} — backup discarded"
        )

    # Retention. list_existing_backups now includes the new backup
    # since it lives in backup_dir.
    existing = list_existing_backups(backup_dir)
    pruned: list[Path] = []
    for old in existing[keep:]:
        old.unlink()
        pruned.append(old)

    return BackupResult(backup_path=dst, bytes_written=size, pruned=pruned, dry_run=False)


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Hot-safe snapshot + retention for threads_watcher.db.",
    )
    p.add_argument("--db", default=str(DEFAULT_DB_FILE), help=f"source DB (default: {DEFAULT_DB_FILE})")
    p.add_argument("--dir", default=str(DEFAULT_BACKUP_DIR), help=f"backup output directory (default: {DEFAULT_BACKUP_DIR})")
    p.add_argument("--keep", type=int, default=DEFAULT_KEEP, help=f"retention count (default: {DEFAULT_KEEP})")
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="log what would happen; do not write or prune any files",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        result = run_backup(
            db_path=Path(args.db),
            backup_dir=Path(args.dir),
            keep=args.keep,
            dry_run=args.dry_run,
        )
    except FileNotFoundError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 2
    except ValueError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 2
    except sqlite3.Error as e:
        sys.stderr.write(f"ERROR: backup or integrity check failed: {e}\n")
        return 1

    prefix = "[dry-run] " if result.dry_run else ""
    sys.stdout.write(f"{prefix}backup={result.backup_path}\n")
    if not result.dry_run:
        sys.stdout.write(f"{prefix}bytes={result.bytes_written}\n")
    sys.stdout.write(f"{prefix}pruned={len(result.pruned)}\n")
    for p in result.pruned:
        sys.stdout.write(f"{prefix}  - {p.name}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
