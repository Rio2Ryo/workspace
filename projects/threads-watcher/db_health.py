"""DB size / growth monitoring for threads_watcher.db.

Background
----------
The DB is the source of truth (db.py). Every post stores its PNG inline
as `posts.screenshot_png BLOB`; on 2026-05-19 the live DB is 13.5 MB with
36 posts (~360 KB / post). The `checks` audit table is row-only and
small (~1500 rows, no BLOB), but it grows monotonically — every
watcher loop iteration appends a row regardless of outcome.

AUTO_SYNC_DESIGN.md §6 lists "DB record-count monitor (size alert)" as
one of the four pre-approval items the operator can prepare locally
(`承認なしで dry-run 可能`). This script is that monitor.

Why a separate script, not a flag on watcher.py
-----------------------------------------------
The watcher runs every 60s. A size check belongs on a different cadence
(once per hour at most), needs its own exit code for cron alerting, and
must NOT contend with the watcher's write lock. Keeping it out-of-process
lets `launchd` or a manual cron schedule it independently.

CLI contract
------------
  python db_health.py                              # text report → stdout, exit 0
  python db_health.py --json                       # JSON line → stdout, exit 0
  python db_health.py --threshold-mb 100           # exit 2 if file >= 100 MB
  python db_health.py --threshold-checks 50000     # exit 2 if checks count >= 50000
  python db_health.py --db /custom/path.db         # override DB path

Exit codes
  0  healthy (under all thresholds; report emitted)
  1  invocation error (bad flag, missing file, etc.)
  2  threshold tripped (report emitted, operator should take action)

The 2 vs 1 split lets a cron-wrapping shell loop distinguish "script
broken" from "DB legitimately too big": only the latter should page.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_FILE = PROJECT_ROOT / "threads_watcher.db"
DEFAULT_BACKUP_DIR = PROJECT_ROOT / "backups"
# Matches backup_db.py's threads_watcher-YYYYMMDDTHHMMSSZ.db convention.
BACKUP_GLOB = "threads_watcher-*.db"


@dataclass(frozen=True)
class HandleStats:
    handle: str
    posts: int
    blob_bytes: int


@dataclass(frozen=True)
class DbHealthReport:
    db_path: str
    file_bytes: int
    posts_count: int
    checks_count: int
    blob_bytes_total: int
    handles: list[HandleStats]
    # Page-level metrics — answer "would VACUUM help?" without the
    # operator having to drop into sqlite3 manually. SQLite never
    # auto-VACUUMs by default, so a slow stream of DELETEs (e.g.,
    # checks pruning) leaves freelist pages that count toward file
    # size but hold no data.
    page_size: int
    page_count: int
    freelist_count: int
    thresholds_tripped: list[str]
    # Backup observability — pairs with backup_db.py to close the
    # "did backups stop happening?" gap. All three are None when
    # --backup-dir was not passed (caller opted out of the check).
    # Defaulted so existing call sites and tests constructing
    # DbHealthReport directly don't have to pass them.
    backup_dir: str | None = None
    latest_backup: str | None = None
    backup_age_hours: float | None = None

    @property
    def free_ratio(self) -> float:
        """Fraction of pages on the freelist (0.0–1.0). Returns 0.0 for
        empty DBs to avoid ZeroDivisionError in callers."""
        return self.freelist_count / self.page_count if self.page_count > 0 else 0.0

    def to_text(self) -> str:
        mb = self.file_bytes / (1024 * 1024)
        used_pages = self.page_count - self.freelist_count
        used_mb = (used_pages * self.page_size) / (1024 * 1024)
        free_mb = (self.freelist_count * self.page_size) / (1024 * 1024)
        lines = [
            f"db_path={self.db_path}",
            f"file_size={self.file_bytes} bytes ({mb:.2f} MB)",
            f"posts={self.posts_count} checks={self.checks_count}",
            f"blob_bytes_total={self.blob_bytes_total}",
            f"pages page_size={self.page_size} page_count={self.page_count} "
            f"freelist={self.freelist_count} ({self.free_ratio:.1%}) "
            f"used={used_mb:.2f}MB free={free_mb:.2f}MB",
        ]
        for h in self.handles:
            hmb = h.blob_bytes / (1024 * 1024)
            lines.append(f"  - {h.handle}: posts={h.posts} blob={h.blob_bytes} bytes ({hmb:.2f} MB)")
        if self.backup_dir is not None:
            if self.latest_backup is None:
                lines.append(f"backup_dir={self.backup_dir} latest=NONE (no backups found)")
            else:
                lines.append(
                    f"backup_dir={self.backup_dir} latest={self.latest_backup} "
                    f"age={self.backup_age_hours:.1f}h"
                )
        if self.thresholds_tripped:
            lines.append("TRIPPED: " + ", ".join(self.thresholds_tripped))
        return "\n".join(lines)

    def to_json(self) -> str:
        # asdict() converts the dataclass tree to plain dicts; json.dumps
        # then handles HandleStats via the same recursion. Single-line
        # output so cron log scrapers (awk / jq -c) can grep cleanly.
        return json.dumps(asdict(self), separators=(",", ":"))


def find_latest_backup(backup_dir: Path) -> Path | None:
    """Return the most-recently-modified backup file, or None if the
    directory is missing/empty. mtime (not filename) is intentional:
    catches manual `cp` backups and rsync-style copies that don't
    follow the timestamp filename convention."""
    if not backup_dir.exists():
        return None
    candidates = list(backup_dir.glob(BACKUP_GLOB))
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def collect_report(
    db_path: Path,
    *,
    threshold_mb: float | None = None,
    threshold_checks: int | None = None,
    threshold_free_ratio: float | None = None,
    backup_dir: Path | None = None,
    threshold_backup_age_hours: float | None = None,
    now: datetime | None = None,
) -> DbHealthReport:
    # File-level metric BEFORE opening the connection: sqlite3.connect()
    # creates the file if missing, which would silently turn a "DB gone"
    # situation into "DB empty" (file_bytes=0). Stat first → fail loud.
    if not db_path.exists():
        raise FileNotFoundError(f"DB file does not exist: {db_path}")
    file_bytes = db_path.stat().st_size

    conn = sqlite3.connect(db_path)
    try:
        conn.row_factory = sqlite3.Row
        posts_count = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
        checks_count = conn.execute("SELECT COUNT(*) FROM checks").fetchone()[0]
        # COALESCE: SUM() over zero rows returns NULL in SQLite, not 0.
        blob_bytes_total = conn.execute(
            "SELECT COALESCE(SUM(screenshot_size_bytes), 0) FROM posts"
        ).fetchone()[0]
        handle_rows = conn.execute(
            """
            SELECT handle,
                   COUNT(*) AS c,
                   COALESCE(SUM(screenshot_size_bytes), 0) AS b
            FROM posts
            GROUP BY handle
            ORDER BY handle
            """
        ).fetchall()
        handles = [HandleStats(handle=r["handle"], posts=r["c"], blob_bytes=r["b"]) for r in handle_rows]
        # PRAGMA returns a single row; .fetchone()[0] is the value.
        # These three together let us reconstruct "would VACUUM help":
        # high freelist_count = reclaimable; high page_count with low
        # freelist = real data growth.
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
        page_count = conn.execute("PRAGMA page_count").fetchone()[0]
        freelist_count = conn.execute("PRAGMA freelist_count").fetchone()[0]
    finally:
        conn.close()

    tripped: list[str] = []
    if threshold_mb is not None:
        # Compare in bytes (no float drift); cast threshold to bytes once.
        # `>=` is intentional: exactly-at-threshold means we've reached the
        # ceiling, which the operator wanted to know about.
        threshold_bytes = int(threshold_mb * 1024 * 1024)
        if file_bytes >= threshold_bytes:
            tripped.append(f"file_size>={threshold_mb}MB ({file_bytes} bytes)")
    if threshold_checks is not None and checks_count >= threshold_checks:
        tripped.append(f"checks_count>={threshold_checks} ({checks_count})")
    # Compute free_ratio inline rather than using the property: the
    # report doesn't exist yet at this point. Empty DB → ratio 0.0 so
    # a positive threshold never trips on a fresh file.
    if threshold_free_ratio is not None and page_count > 0:
        ratio = freelist_count / page_count
        if ratio >= threshold_free_ratio:
            tripped.append(
                f"free_ratio>={threshold_free_ratio:.2f} "
                f"({ratio:.2%}, {freelist_count}/{page_count} pages reclaimable via VACUUM)"
            )

    # Backup-age check. None for backup_dir means "operator didn't ask"
    # — skip silently. Empty/missing backup dir AND a threshold means
    # the check IS asked-for but no backups exist → trip with a
    # distinct message.
    latest_backup_str: str | None = None
    backup_age_hours: float | None = None
    backup_dir_str: str | None = None
    if backup_dir is not None:
        backup_dir_str = str(backup_dir)
        latest = find_latest_backup(backup_dir)
        ref_time = (now or datetime.now(tz=timezone.utc))
        if latest is not None:
            latest_backup_str = latest.name
            mtime = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
            # Clock skew can put the backup mtime in the future; clamp
            # to 0 so a negative "age" never trips a positive threshold.
            backup_age_hours = max(0.0, (ref_time - mtime).total_seconds() / 3600.0)
        if threshold_backup_age_hours is not None:
            if latest is None:
                tripped.append(
                    f"backup_age: no backups in {backup_dir} (threshold >= {threshold_backup_age_hours}h)"
                )
            elif backup_age_hours is not None and backup_age_hours >= threshold_backup_age_hours:
                tripped.append(
                    f"backup_age>={threshold_backup_age_hours}h "
                    f"(latest={latest_backup_str} age={backup_age_hours:.1f}h)"
                )

    return DbHealthReport(
        db_path=str(db_path),
        file_bytes=file_bytes,
        posts_count=posts_count,
        checks_count=checks_count,
        blob_bytes_total=blob_bytes_total,
        handles=handles,
        page_size=page_size,
        page_count=page_count,
        freelist_count=freelist_count,
        backup_dir=backup_dir_str,
        latest_backup=latest_backup_str,
        backup_age_hours=backup_age_hours,
        thresholds_tripped=tripped,
    )


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Report row counts, BLOB usage, and file size for threads_watcher.db.",
    )
    p.add_argument(
        "--db",
        default=str(DEFAULT_DB_FILE),
        help=f"DB file path (default: {DEFAULT_DB_FILE})",
    )
    p.add_argument(
        "--threshold-mb",
        type=float,
        default=None,
        help="Exit code 2 if file_bytes >= this many megabytes. Off by default.",
    )
    p.add_argument(
        "--threshold-checks",
        type=int,
        default=None,
        help="Exit code 2 if checks row count >= this many rows. Off by default.",
    )
    p.add_argument(
        "--threshold-free-ratio",
        type=float,
        default=None,
        help=(
            "Exit code 2 if freelist_count / page_count >= this fraction (0.0-1.0). "
            "Suggests VACUUM would reclaim space. Off by default."
        ),
    )
    p.add_argument(
        "--backup-dir",
        default=None,
        help=(
            f"Backup directory to inspect for latest-backup age (default off; "
            f"pass {DEFAULT_BACKUP_DIR} to match backup_db.py)."
        ),
    )
    p.add_argument(
        "--threshold-backup-age-hours",
        type=float,
        default=None,
        help=(
            "Exit code 2 if the most recent backup in --backup-dir is older "
            "than this many hours, OR if --backup-dir is empty. Requires "
            "--backup-dir to be set. Off by default."
        ),
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit single-line JSON instead of the text report.",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        # --threshold-backup-age-hours without --backup-dir is an
        # invocation error; the threshold has nowhere to look.
        if args.threshold_backup_age_hours is not None and args.backup_dir is None:
            sys.stderr.write(
                "ERROR: --threshold-backup-age-hours requires --backup-dir\n"
            )
            return 1
        report = collect_report(
            Path(args.db),
            threshold_mb=args.threshold_mb,
            threshold_checks=args.threshold_checks,
            threshold_free_ratio=args.threshold_free_ratio,
            backup_dir=Path(args.backup_dir) if args.backup_dir else None,
            threshold_backup_age_hours=args.threshold_backup_age_hours,
        )
    except FileNotFoundError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        return 1
    except sqlite3.DatabaseError as e:
        # Corrupt DB / wrong format / schema mismatch — treat as
        # invocation error (operator must repair), not as a threshold
        # trip (no actionable size info to report).
        sys.stderr.write(f"ERROR: failed to read DB ({args.db}): {e}\n")
        return 1

    output = report.to_json() if args.json else report.to_text()
    sys.stdout.write(output + "\n")
    return 2 if report.thresholds_tripped else 0


if __name__ == "__main__":
    sys.exit(main())
