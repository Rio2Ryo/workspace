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
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_DB_FILE = PROJECT_ROOT / "threads_watcher.db"


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
    thresholds_tripped: list[str]

    def to_text(self) -> str:
        mb = self.file_bytes / (1024 * 1024)
        lines = [
            f"db_path={self.db_path}",
            f"file_size={self.file_bytes} bytes ({mb:.2f} MB)",
            f"posts={self.posts_count} checks={self.checks_count}",
            f"blob_bytes_total={self.blob_bytes_total}",
        ]
        for h in self.handles:
            hmb = h.blob_bytes / (1024 * 1024)
            lines.append(f"  - {h.handle}: posts={h.posts} blob={h.blob_bytes} bytes ({hmb:.2f} MB)")
        if self.thresholds_tripped:
            lines.append("TRIPPED: " + ", ".join(self.thresholds_tripped))
        return "\n".join(lines)

    def to_json(self) -> str:
        # asdict() converts the dataclass tree to plain dicts; json.dumps
        # then handles HandleStats via the same recursion. Single-line
        # output so cron log scrapers (awk / jq -c) can grep cleanly.
        return json.dumps(asdict(self), separators=(",", ":"))


def collect_report(
    db_path: Path,
    *,
    threshold_mb: float | None = None,
    threshold_checks: int | None = None,
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

    return DbHealthReport(
        db_path=str(db_path),
        file_bytes=file_bytes,
        posts_count=posts_count,
        checks_count=checks_count,
        blob_bytes_total=blob_bytes_total,
        handles=handles,
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
        "--json",
        action="store_true",
        help="Emit single-line JSON instead of the text report.",
    )
    return p


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        report = collect_report(
            Path(args.db),
            threshold_mb=args.threshold_mb,
            threshold_checks=args.threshold_checks,
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
