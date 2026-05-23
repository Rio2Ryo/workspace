"""Operator CLI for the partial_error_rate MTTR helpers.

Consumes a sync.py log file (default: logs/sync.log) and prints
either a human-readable per-handle summary or a JSON dump suitable
for piping to jq / Discord webhooks / dashboards.

Usage
-----
    python mttr.py [log_path]                 # default: logs/sync.log, text
    python mttr.py --json [log_path]          # JSON output
    python mttr.py --records [log_path]       # per-incident records, not just summary
    python mttr.py --warn-type X [log_path]   # filter to a different warn type

Exit codes
----------
    0  success (even when there are zero recovered incidents)
    1  log file not found / not readable
    2  bad CLI arguments

Why this exists
---------------
Commit a7f0400 added compute_mttr_from_log + summarise_mttr as pure
Python helpers. Operators wanting an ad-hoc MTTR report had to
write a 3-line script every time. This wraps them with stable CLI
semantics so `python mttr.py` is enough.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Module-level import keeps `python -m mttr --help` cheap. The
# helpers themselves are dependency-free (stdlib only).
from sync_guards import compute_mttr_from_log, summarise_mttr


DEFAULT_LOG = Path(__file__).resolve().parent / "logs" / "sync.log"


def _format_text_summary(summary: list[dict]) -> str:
    """Human-readable per-handle table. Aligned columns for easy
    grep + visual scan during an incident review."""
    if not summary:
        return "no recovered incidents found in the log window"
    header = f"{'handle':30} {'incidents':>10} {'total_s':>10} {'mean_s':>10} {'median_s':>10} {'max_s':>10}"
    sep = "-" * len(header)
    rows = [header, sep]
    for row in summary:
        rows.append(
            f"{row['handle']:30} {row['incidents']:>10} "
            f"{row['total_s']:>10} {row['mean_s']:>10} "
            f"{row['median_s']:>10} {row['max_s']:>10}"
        )
    return "\n".join(rows)


def _format_text_records(records: dict[str, list[dict]]) -> str:
    """Per-incident detail (warn_ts, recovered_ts, duration, prev_bucket).
    Useful when the summary's mean is misleading and the operator
    wants to see whether durations are uniform or bimodal."""
    if not records:
        return "no recovered incidents found in the log window"
    rows = []
    for handle in sorted(records):
        rows.append(f"== {handle} ==")
        for r in records[handle]:
            rows.append(
                f"  warn={r['warn_ts']} recovered={r['recovered_ts']} "
                f"duration_s={r['duration_s']} prev_bucket={r['prev_bucket']}"
            )
    return "\n".join(rows)


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="mttr.py",
        description="Compute MTTR for sync_event warn/recovered pairs in a sync.log.",
    )
    p.add_argument(
        "log_path",
        nargs="?",
        type=Path,
        default=DEFAULT_LOG,
        help=f"Path to sync.log (default: {DEFAULT_LOG}).",
    )
    p.add_argument(
        "--warn-type",
        default="partial_error_rate",
        help=(
            "Filter to a specific warn type. Default 'partial_error_rate' "
            "(the only type today). Pass a future type to drill into it."
        ),
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of the human-readable table.",
    )
    p.add_argument(
        "--records",
        action="store_true",
        help=(
            "Emit per-incident records (warn/recovered timestamps + "
            "duration) instead of the aggregated summary. Combine with "
            "--json for machine-readable per-incident output."
        ),
    )
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    if not args.log_path.is_file():
        sys.stderr.write(
            f"ERROR: log file not found: {args.log_path}\n"
            "  Pass a path as the first positional arg, or run from the "
            "project root so the default logs/sync.log resolves.\n"
        )
        return 1

    try:
        with args.log_path.open("r", encoding="utf-8") as f:
            records = compute_mttr_from_log(f, warn_type=args.warn_type)
    except OSError as e:
        sys.stderr.write(f"ERROR: failed to read {args.log_path}: {e}\n")
        return 1

    summary = summarise_mttr(records)

    if args.json:
        # Per-flag dispatch on what's the more useful machine surface.
        # --records: full per-incident detail. Default: aggregated summary.
        payload: object = records if args.records else summary
        sys.stdout.write(json.dumps(payload, indent=2))
        sys.stdout.write("\n")
    elif args.records:
        sys.stdout.write(_format_text_records(records))
        sys.stdout.write("\n")
    else:
        sys.stdout.write(_format_text_summary(summary))
        sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
