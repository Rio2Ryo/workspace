"""Operator-facing CLI: render current threads-watcher status as
text, mirroring what Discord post + dashboard show.

Why this exists
---------------
Three surfaces currently render state.json:
  - Discord webhook embed (discord_payload.py → discord_post.py)
  - Dashboard #status-summary (threads-watcher-status/index.html)
  - mttr.py (recovered incidents only — partial view)

Operator on an SSH-only server (no browser, no Discord client)
had no equivalent way to ask "what's the current state?" — they
had to `cat state.json | jq` and manually scan for severity +
counts. This is the CLI third leg of the cross-surface trio:
same 1-line summary (mirrored from _build_description), plus
the full open-incidents + mttr-summary breakdown for triage.

Reuses the existing builders from discord_payload to GUARANTEE
the CLI surface matches the Discord embed for the same state.

Usage
-----
    python status.py                 # default state.json
    python status.py path/to/state.json
    python status.py --json          # machine-readable
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
from discord_payload import (  # noqa: E402
    _build_description, _classify_severity, _emoji_for, _fmt_elapsed,
)


DEFAULT_STATE_PATH = Path("threads-watcher-status/state.json")


def _render_text(state: dict, *, now_ts: int) -> str:
    """Render state.json as multi-line operator text. First line
    matches the Discord embed `description` byte-for-byte for the
    same input — pinned by tests/test_status_cli.py."""
    open_incs = list(state.get("open_incidents") or [])
    mttr = list(state.get("mttr_summary") or [])
    color = _classify_severity(open_incs, mttr, now_ts)
    header = _build_description(open_incs, mttr, color)
    lines = [header]

    snap = state.get("snapshot_generated_at")
    if snap:
        lines.append(f"  snapshot: {snap}")

    if open_incs:
        lines.append("")
        lines.append(f"Open incidents ({len(open_incs)}):")
        for inc in open_incs:
            handle = inc.get("handle", "?")
            warn_ts = int(inc.get("warn_ts", 0))
            elapsed = _fmt_elapsed(now_ts - warn_ts)
            bucket = inc.get("current_bucket")
            bucket_s = (
                f"{int(float(bucket) * 100)}%"
                if isinstance(bucket, (int, float)) else "?"
            )
            lines.append(f"  {handle} — open {elapsed} @ {bucket_s}")

    if mttr:
        lines.append("")
        lines.append(f"Recent recoveries ({len(mttr)}):")
        for row in mttr:
            handle = row.get("handle", "?")
            count = int(row.get("incidents", 0))
            mean = _fmt_elapsed(int(row.get("mean_s", 0)))
            max_s = _fmt_elapsed(int(row.get("max_s", 0)))
            lines.append(f"  {handle} — {count} incidents · mean {mean} · max {max_s}")

    return "\n".join(lines)


def _render_json(state: dict, *, now_ts: int) -> dict:
    """JSON form: structured for jq pipelines + cron monitoring.
    `description` field is byte-identical to text mode's first line
    AND to the Discord embed description (same _build_description
    call) — pinned via tests/test_status_cli.py."""
    open_incs = list(state.get("open_incidents") or [])
    mttr = list(state.get("mttr_summary") or [])
    color = _classify_severity(open_incs, mttr, now_ts)
    return {
        "description": _build_description(open_incs, mttr, color),
        "emoji": _emoji_for(color),
        "color": color,
        "open_incidents_count": len(open_incs),
        "mttr_summary_count": len(mttr),
        "snapshot_generated_at": state.get("snapshot_generated_at"),
    }


def _cli_main(argv: list[str] | None = None) -> int:
    """CLI entry. Matches the shared conventions pinned by
    qa-reports/agent-guard/test_cli_conventions.py:
      0  success
      1  state file not found
      2  bad CLI args (argparse default)
    """
    import argparse

    p = argparse.ArgumentParser(
        prog="status.py",
        description=(
            "Render threads-watcher status as text or JSON. Mirrors "
            "the Discord embed description + dashboard #status-summary "
            "for the same state.json. Operator SSH surface."
        ),
    )
    p.add_argument(
        "state_path",
        nargs="?",
        type=Path,
        default=DEFAULT_STATE_PATH,
        help=f"Path to state.json (default: {DEFAULT_STATE_PATH}).",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help="Emit structured JSON instead of human-readable text.",
    )
    args = p.parse_args(argv)

    if not args.state_path.is_file():
        sys.stderr.write(f"ERROR: state file not found: {args.state_path}\n")
        return 1

    try:
        state = json.loads(args.state_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.stderr.write(f"ERROR: failed to parse {args.state_path}: {e}\n")
        return 1

    now_ts = int(time.time())
    if args.json:
        sys.stdout.write(json.dumps(_render_json(state, now_ts=now_ts), indent=2) + "\n")
    else:
        sys.stdout.write(_render_text(state, now_ts=now_ts) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(_cli_main())
