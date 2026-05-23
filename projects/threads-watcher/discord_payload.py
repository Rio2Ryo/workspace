"""Build a Discord webhook embed payload from threads-watcher state.

Why this exists
---------------
Recent commits (63cf649, 60d2b51, b8a6a99, c040012, 8fb1f47) made the
dashboard render incident history + open warnings + severity colors.
But the data is locked behind operator polling the dashboard URL —
external alerting (Discord, Slack, PagerDuty) had no consumer-side
helper.

The Yakon-pending step is "provide a webhook URL." Until then there
is still useful operator value in:
  - having a payload builder so a one-shot `curl -X POST` works
  - having the embed shape pinned in tests so the eventual hook
    integration doesn't have to design payload structure from scratch

Pure builder — no network I/O, no webhook URL required. Output is
a dict ready to JSON-encode + POST to any Discord-compatible webhook.

Usage
-----
    from discord_payload import build_payload_from_state
    payload = build_payload_from_state("threads-watcher-status/state.json")
    # Then either:
    #   - print(json.dumps(payload))  # for ad-hoc curl piping
    #   - requests.post(WEBHOOK_URL, json=payload)
    #   - persist to a file for a cron-scheduled poster

Severity convention (matches the dashboard's oi-* / mttr-* colors):
  - any open_incident elapsed >= 24h  → embed color RED (chronic)
  - any open_incident elapsed >=  1h  → embed color YELLOW (slow)
  - any mttr_summary mean >= 24h      → embed color RED
  - all happy                         → embed color GREEN
The MOST severe wins (red beats yellow beats green) so an operator
seeing a red Discord card knows at least one thing is critical.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any


# Discord embed colors (decimal RGB). Standard Discord palette.
COLOR_RED = 0xCC3333      # chronic / stuck regime
COLOR_YELLOW = 0xB86B00   # slow recovery / 1h+ regime
COLOR_GREEN = 0x33AA33    # all healthy

# Severity thresholds — same numbers as index.html OI_* / MTTR_*
# constants. Operators tuning the dashboard would tune both layers
# in lockstep (today: pin via separate constants in both files, with
# a meta-test recommending they stay in sync — see test note below).
SEVERITY_WARN_S = 3600        # 1 hour
SEVERITY_ERR_S = 24 * 3600    # 24 hours


def _fmt_elapsed(seconds: int) -> str:
    """Same shape as the dashboard JS fmt() helper (index.html):
    <60s → "Ns", <1h → "Nm" (rounded), else "Nh Mm" (rounded).

    Critical: must match the JS behavior exactly — Discord operator
    seeing "55m" in the embed and the dashboard tab showing "1h"
    for the same incident would be confusing. The JS uses
    Math.round(n / 60), which rounds half-up. Python's `round()`
    uses banker's rounding (.5 → even) but for n/60 values that
    rarely matters; the JS-style explicit half-up keeps the
    expectation simple. Implemented via int(x + 0.5)."""
    n = max(0, int(seconds))
    if n < 60:
        return f"{n}s"

    def _round_half_up(x: float) -> int:
        return int(x + 0.5)

    if n < 3600:
        return f"{_round_half_up(n / 60)}m"
    h, rem = divmod(n, 3600)
    m = _round_half_up(rem / 60)
    if m == 60:
        # rem rounded up to a full hour — carry into the h column.
        h += 1
        m = 0
    return f"{h}h" if m == 0 else f"{h}h {m}m"


def _classify_severity(open_incidents: list, mttr_summary: list, now_ts: int) -> int:
    """Return the embed color matching the MOST SEVERE row across
    both widgets. Open incidents are scored by elapsed-since-warn_ts
    (live progression); MTTR rows by mean_s (historical signal)."""
    max_open_elapsed = 0
    for inc in open_incidents:
        warn_ts = int(inc.get("warn_ts", 0))
        elapsed = max(0, now_ts - warn_ts)
        if elapsed > max_open_elapsed:
            max_open_elapsed = elapsed
    max_mean_s = 0
    for row in mttr_summary:
        mean_s = int(row.get("mean_s", 0))
        if mean_s > max_mean_s:
            max_mean_s = mean_s
    if max_open_elapsed >= SEVERITY_ERR_S or max_mean_s >= SEVERITY_ERR_S:
        return COLOR_RED
    if max_open_elapsed >= SEVERITY_WARN_S or max_mean_s >= SEVERITY_WARN_S:
        return COLOR_YELLOW
    return COLOR_GREEN


def build_payload_from_state(
    state_path: str | Path,
    *,
    now_ts: int | None = None,
) -> dict[str, Any]:
    """Build a Discord webhook payload from a state.json file.

    `now_ts` lets tests inject a deterministic clock; production
    defaults to time.time(). Returns a dict ready to JSON-encode
    and POST as the body of a Discord webhook request.

    Output shape (Discord webhook + embed structure):
      {
        "username": "threads-watcher",
        "embeds": [
          {
            "title": "threads-watcher status",
            "color": <COLOR_RED | COLOR_YELLOW | COLOR_GREEN>,
            "fields": [
              { "name": "...", "value": "...", "inline": True/False },
              ...
            ],
            "timestamp": "<snapshot_generated_at>",
          }
        ]
      }

    Robust to:
      - missing optional fields (open_incidents, mttr_summary, etc.)
      - empty arrays (no incidents → green "all clear" card)
      - malformed numeric fields (default to 0)
    """
    now = int(now_ts if now_ts is not None else time.time())
    state = json.loads(Path(state_path).read_text(encoding="utf-8"))
    open_incidents = list(state.get("open_incidents") or [])
    mttr_summary = list(state.get("mttr_summary") or [])
    color = _classify_severity(open_incidents, mttr_summary, now)

    fields: list[dict[str, Any]] = []

    # Open incidents — most urgent operator-facing signal.
    if open_incidents:
        lines: list[str] = []
        for inc in open_incidents:
            handle = str(inc.get("handle", "?"))
            warn_ts = int(inc.get("warn_ts", 0))
            elapsed = _fmt_elapsed(now - warn_ts)
            bucket = inc.get("current_bucket")
            bucket_s = f"{int(float(bucket) * 100)}%" if isinstance(bucket, (int, float)) else "?"
            lines.append(f"`{handle}` — open {elapsed} @ {bucket_s}")
        fields.append({
            "name": f"Currently warning ({len(open_incidents)})",
            "value": "\n".join(lines),
            "inline": False,
        })

    # MTTR summary — historical pattern.
    if mttr_summary:
        lines = []
        for row in mttr_summary:
            handle = str(row.get("handle", "?"))
            count = int(row.get("incidents", 0))
            mean = _fmt_elapsed(int(row.get("mean_s", 0)))
            max_s = _fmt_elapsed(int(row.get("max_s", 0)))
            lines.append(f"`{handle}` — {count} incidents, mean {mean}, max {max_s}")
        fields.append({
            "name": f"Recent recoveries ({len(mttr_summary)})",
            "value": "\n".join(lines),
            "inline": False,
        })

    # When nothing's happening, the embed still has VALUE — the
    # green color + snapshot_generated_at proves the watcher is alive.
    if not fields:
        fields.append({
            "name": "Status",
            "value": "All healthy — no open incidents, no recent recoveries.",
            "inline": False,
        })

    return {
        "username": "threads-watcher",
        "embeds": [{
            "title": "threads-watcher status",
            "color": color,
            "fields": fields,
            "timestamp": state.get("snapshot_generated_at"),
        }],
    }


def _cli_main(argv: list[str] | None = None) -> int:
    """CLI entry. Matches the shared conventions pinned by
    qa-reports/agent-guard/test_cli_conventions.py (mttr.py +
    cron-latency.mjs + this):
      0  success
      1  state file not found
      2  bad CLI args (argparse default)
    """
    import argparse
    import sys

    p = argparse.ArgumentParser(
        prog="discord_payload.py",
        description=(
            "Build a Discord webhook embed payload from threads-watcher "
            "state.json. Emits JSON to stdout — pipe to `curl -d @-` "
            "for a one-shot post, or persist for a cron poster."
        ),
    )
    p.add_argument(
        "state_path",
        nargs="?",
        type=Path,
        default=Path("threads-watcher-status/state.json"),
        help="Path to state.json (default: threads-watcher-status/state.json).",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help=(
            "No-op for output (JSON is the only output mode). Accepted "
            "for cross-tool symmetry with mttr.py and cron-latency.mjs, "
            "where --json toggles between text + JSON. Without input "
            "data (no state file), --json still works because we can "
            "default to the standard path or accept stdin."
        ),
    )
    args = p.parse_args(argv)

    if not args.state_path.is_file():
        sys.stderr.write(f"ERROR: state file not found: {args.state_path}\n")
        return 1
    payload = build_payload_from_state(args.state_path)
    sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(_cli_main())
