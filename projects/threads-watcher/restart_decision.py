"""Restart-trigger classifier for auto-restart-if-stale.sh.

The self-heal wrapper restarts the watcher for failure modes that a
fresh `watcher.py --watch` process actually fixes:

  - STALE CODE  — the running --watch process started before a source
                  file was edited. Python imports once, so the live
                  code is behind what is on disk until a restart.
                  health.check_process_staleness reports this as
                  "... source file(s) have been edited since ...".

  - HUNG LOOP   — the heartbeat (newest `checks` row) has gone stale.
                  The loop has stopped writing checks: a deadlocked
                  Playwright call, a wedged network read, a crashed
                  inner task while the process lingers. The PID may
                  still exist, so a pgrep gate does NOT catch this.
                  health.judge_heartbeat_alert (via run_health_check)
                  reports it as "heartbeat stale: ...".

It must NOT restart for failure modes a reload does not fix — a
restart would only mask them and burn the cooldown:

  - DOM REGRESSION — the scraper selectors broke. Needs a code fix.
  - RECENT ERRORS  — network / anti-bot. Needs operator eyes.

Before this module auto-restart-if-stale.sh grep'd only for the
stale-code phrase, so a hung loop with a live PID was never revived
automatically — the exact gap this classifier closes.

CLI: reads `watcher.py --health-check` output on stdin.
  exit 0  -> a restart is warranted (stale code or hung loop)
  exit 1  -> no restart (healthy, or an operator-only failure)
"""

from __future__ import annotations

import sys

# Substrings that identify the two reload-fixable failure modes. Kept
# as literal fragments of the health.py reason strings — short enough
# to be stable across reason-message wording tweaks, specific enough
# not to collide with the DOM-regression / recent-errors reasons.
STALE_CODE_MARKER = "file(s) have been edited since"
HUNG_LOOP_MARKER = "heartbeat stale:"


def is_restart_triggering(health_output: str) -> bool:
    """True when --health-check output indicates a stale-code or
    hung-loop condition — the cases auto-restart-if-stale.sh should
    act on. False for healthy output and for operator-only failures
    (DOM regression, recent errors)."""
    return STALE_CODE_MARKER in health_output or HUNG_LOOP_MARKER in health_output


def restart_reason(health_output: str) -> str | None:
    """The specific trigger, for logging. None when not restart-worthy.
    Stale code is reported first when both are present — a process
    behind on code is the more fundamental fault to name."""
    if STALE_CODE_MARKER in health_output:
        return "stale-code"
    if HUNG_LOOP_MARKER in health_output:
        return "hung-loop"
    return None


def main(argv: list[str] | None = None) -> int:
    _ = argv  # no flags; stdin is the whole interface
    health_output = sys.stdin.read()
    reason = restart_reason(health_output)
    if reason is not None:
        sys.stdout.write(f"{reason}\n")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
