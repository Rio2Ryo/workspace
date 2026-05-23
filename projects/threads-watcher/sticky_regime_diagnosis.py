"""Operator-facing diagnostic: would `--allow-sticky-partial-error-regime`
actually change the current sync outcome?

Why this exists
---------------
The `--allow-sticky-partial-error-regime` CLI flag has been Yakon-
pending for multiple turns. The judgment burden is "is the current
regime stable enough to publish through it, or would enabling the
flag risk publishing a half-broken state?"

The watcher logic (sync_guards.recent_failures_guard) already
encodes the semantics: enable only when EVERY check in the window
is `partial_error` AND shares the IDENTICAL error reason. But
operator can't tell from the dashboard alone whether the live DB
satisfies that predicate RIGHT NOW.

This script runs the same guard against threads_watcher.db with
allow=False AND allow=True, compares outcomes, and surfaces the
empirical verdict:

  - "SAFE TO ENABLE" — flag would unblock publish; regime is the
    documented sticky shape (all partial_error, same reason)
  - "NO-OP" — flag wouldn't change behavior right now (e.g.,
    mixed statuses, or no error at all)
  - "INSUFFICIENT DATA" — fewer than `window` checks recorded yet

Reduces Yakon's judgment burden: empirical, current, machine-
checkable evidence vs read-the-source mental model.

Usage
-----
    python sticky_regime_diagnosis.py
    python sticky_regime_diagnosis.py --window 5 --json
    python sticky_regime_diagnosis.py --db /path/to/scratch.db
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
from sync_guards import (  # noqa: E402
    DEFAULT_RECENT_CHECKS_WINDOW, recent_failures_guard,
)


DEFAULT_DB = PROJECT_ROOT / "threads_watcher.db"


def diagnose(conn: sqlite3.Connection, *, window: int) -> dict:
    """Compare guard outcomes with allow=False vs allow=True.
    Returns a structured verdict the CLI dispatcher renders.

    Pure function on the connection so tests can supply scratch
    databases with synthetic check histories.
    """
    rows = conn.execute(
        "SELECT status, error FROM checks ORDER BY id DESC LIMIT ?",
        (window,),
    ).fetchall()
    statuses = [str(r[0]) for r in rows]
    errors = [r[1] if r[1] is not None else "" for r in rows]

    strict = recent_failures_guard(
        conn, window=window, allow_sticky_partial_error_regime=False,
    )
    permissive = recent_failures_guard(
        conn, window=window, allow_sticky_partial_error_regime=True,
    )

    if len(rows) < window:
        verdict = "INSUFFICIENT_DATA"
        reason = (
            f"only {len(rows)} check(s) recorded; need {window} for "
            f"a sticky-regime evaluation (use --window N to lower)."
        )
    elif strict.proceed == permissive.proceed:
        if strict.proceed:
            verdict = "NO_OP"
            reason = "guard already permits publish — flag has no effect"
        else:
            verdict = "NO_OP"
            reason = (
                f"strict blocks AND permissive blocks — regime isn't "
                f"the pure sticky shape (all partial_error + same "
                f"reason). Statuses: {statuses!r}"
            )
    else:
        # strict.proceed=False, permissive.proceed=True → flag WOULD help
        verdict = "SAFE_TO_ENABLE"
        reason = (
            f"strict blocks but permissive permits — current regime "
            f"matches the documented sticky shape. Enabling the flag "
            f"on this DB right now would unblock publish."
        )

    # Distribution summary for operator context.
    from collections import Counter
    status_dist = dict(Counter(statuses))
    unique_errors = sorted(set(e for e in errors if e))

    return {
        "verdict": verdict,
        "reason": reason,
        "window": window,
        "checks_seen": len(rows),
        "status_distribution": status_dist,
        "unique_error_reasons_count": len(unique_errors),
        "unique_error_reasons": unique_errors,
        "strict_proceed": strict.proceed,
        "strict_reason": strict.reason,
        "permissive_proceed": permissive.proceed,
        "permissive_reason": permissive.reason,
    }


def _render_text(result: dict) -> str:
    lines = []
    emoji = {
        "SAFE_TO_ENABLE": "🟢",
        "NO_OP": "🟡",
        "INSUFFICIENT_DATA": "❔",
    }.get(result["verdict"], "❓")
    lines.append(f"{emoji} {result['verdict']}")
    lines.append(f"   {result['reason']}")
    lines.append("")
    lines.append(f"window           : last {result['window']} checks "
                 f"(seen {result['checks_seen']})")
    lines.append(f"status distribution: {result['status_distribution']}")
    lines.append(f"unique error reasons: {result['unique_error_reasons_count']}")
    if result["unique_error_reasons"]:
        for err in result["unique_error_reasons"][:3]:
            lines.append(f"  - {err}")
    lines.append("")
    lines.append(f"strict (default)  : "
                 f"{'PROCEED' if result['strict_proceed'] else 'BLOCK'} "
                 f"— {result['strict_reason']}")
    lines.append(f"permissive (flag) : "
                 f"{'PROCEED' if result['permissive_proceed'] else 'BLOCK'} "
                 f"— {result['permissive_reason']}")
    return "\n".join(lines)


def _cli_main(argv: list[str] | None = None) -> int:
    import argparse
    p = argparse.ArgumentParser(
        prog="sticky_regime_diagnosis.py",
        description=(
            "Decide whether enabling --allow-sticky-partial-error-regime "
            "would change current sync behaviour. Reduces operator "
            "judgment burden by running the guard against the live DB "
            "and reporting the empirical verdict."
        ),
    )
    p.add_argument(
        "--db", type=Path, default=DEFAULT_DB,
        help=f"SQLite path (default: {DEFAULT_DB}).",
    )
    p.add_argument(
        "--window", type=int, default=DEFAULT_RECENT_CHECKS_WINDOW,
        help=f"Number of recent checks to evaluate (default: {DEFAULT_RECENT_CHECKS_WINDOW}).",
    )
    p.add_argument(
        "--json", action="store_true",
        help="Emit machine-readable JSON instead of text.",
    )
    args = p.parse_args(argv)

    if args.window <= 0:
        sys.stderr.write(f"ERROR: --window must be > 0, got {args.window}\n")
        return 2

    if not args.db.is_file():
        sys.stderr.write(f"ERROR: DB file not found: {args.db}\n")
        return 1

    conn = sqlite3.connect(str(args.db))
    try:
        result = diagnose(conn, window=args.window)
    finally:
        conn.close()

    if args.json:
        sys.stdout.write(json.dumps(result, indent=2) + "\n")
    else:
        sys.stdout.write(_render_text(result) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(_cli_main())
