"""POST the discord_payload output to a Discord webhook.

Why this exists
---------------
discord_payload.py (commit cedc586) builds the embed dict but
deliberately has no network I/O — the Yakon-pending step is
"provide a webhook URL." This module is the thin sender on the
other side of that gap:

  - With `--dry-run` (or no URL set): prints the payload + the
    equivalent `curl -d @- $URL` command to stdout, exits 0.
    The dry-run path makes the tool useful TODAY for ad-hoc
    operator one-shots, without needing the URL provisioned.
  - With URL set + no --dry-run: POSTs the payload, prints the
    HTTP status line + Discord's response body summary, exits 0
    if the webhook accepted it (Discord returns 204).

stdlib-only (`urllib.request`) — no `requests` dep, deliberately
matching discord_payload.py's "no extra deps" pin (caught by the
test_no_network_io meta-test there). The poster IS allowed
network I/O; only the builder isn't.

Env vars
--------
  THREADS_WATCHER_DISCORD_WEBHOOK_URL
    Where to POST. If unset, --dry-run is implied — the operator
    sees the payload + curl command rather than a hard failure.
    Keeps the tool useful in two modes:
      operator-developing: no URL set → see what would go out
      operator-production: URL set in launchd plist → fire-and-forget
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# Re-use the pure builder so the embed format is single-sourced.
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
from discord_payload import (  # noqa: E402
    COLOR_GREEN, COLOR_RED, COLOR_YELLOW,
    build_payload_from_state,
)


# Severity ladder for --min-severity filtering. Maps embed color
# (decimal) → severity label, with an ordering for "at-or-above"
# comparisons. Operators set `--min-severity warn` to suppress GREEN
# notifications (the bulk of hourly cron noise) while still receiving
# any YELLOW or RED. The bidirectional map lets us name severities
# in CLI flags (operator-readable) while the underlying payload
# carries colors (machine-format).
SEVERITY_NONE = "none"      # green / all-healthy — always lowest
SEVERITY_WARN = "warn"      # yellow / 1h+ regime
SEVERITY_ERR = "err"        # red / 24h+ chronic
SEVERITY_ORDER = (SEVERITY_NONE, SEVERITY_WARN, SEVERITY_ERR)
_COLOR_TO_SEVERITY = {
    COLOR_GREEN: SEVERITY_NONE,
    COLOR_YELLOW: SEVERITY_WARN,
    COLOR_RED: SEVERITY_ERR,
}


def severity_of_payload(payload: dict) -> str:
    """Return the severity label matching the embed's color. Unknown
    colors degrade to SEVERITY_NONE — defensive: a future palette
    drift shouldn't accidentally suppress (operator missing alerts is
    worse than operator getting one extra)."""
    color = payload.get("embeds", [{}])[0].get("color")
    return _COLOR_TO_SEVERITY.get(color, SEVERITY_NONE)


def severity_at_or_above(observed: str, threshold: str) -> bool:
    """True iff `observed` is at least as severe as `threshold` on the
    SEVERITY_ORDER ladder. Both args must be in SEVERITY_ORDER —
    callers should validate via argparse choices."""
    return SEVERITY_ORDER.index(observed) >= SEVERITY_ORDER.index(threshold)


ENV_WEBHOOK_URL = "THREADS_WATCHER_DISCORD_WEBHOOK_URL"

# Discord's documented success status for incoming webhook POSTs.
# 200 also accepted defensively in case Discord changes the response
# for backward compatibility.
DISCORD_OK_STATUS = (200, 204)

# ── cooldown / sticky-regime dedup ────────────────────────────────────
#
# Once $THREADS_WATCHER_DISCORD_WEBHOOK_URL is provisioned and the
# hourly cron fires, a sticky YELLOW (e.g., handle warning for 24h+)
# would generate 24 identical embeds — operator channel becomes
# noise. The --min-severity filter doesn't help when the severity
# itself is what's stuck.
#
# Cooldown: if the SAME severity was posted within --cooldown seconds,
# skip this post. Severity TRANSITIONS (warn → err escalation, err →
# warn recovery) ALWAYS post regardless of cooldown — those are the
# operator-actionable signals the channel exists for.
#
# Default 0 = disabled (backward-compat). Operator sets the threshold
# explicitly via CLI flag or, more commonly, via the launchd plist
# `<ProgramArguments>` block.

DEFAULT_COOLDOWN_STATE_PATH = "threads-watcher-status/discord-post-state.json"


def _load_cooldown_state(path: Path) -> dict | None:
    """Read persisted last-post state. Returns None if the file is
    missing OR malformed — both cases treated as "no prior post",
    so the next call POSTs and recreates the file."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return None
        return data
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _save_cooldown_state(path: Path, severity: str, posted_at: int) -> None:
    """Persist the just-posted state. Best-effort: a failed write is
    logged to stderr but doesn't propagate — the POST itself
    succeeded, and a missing state file just means the next call
    might double-post (re-creates the file). Far less bad than a
    crash that hides the successful POST from the operator."""
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps({"last_severity": severity, "last_posted_at": posted_at}),
            encoding="utf-8",
        )
    except OSError as e:
        sys.stderr.write(f"WARN: failed to save cooldown state to {path}: {e}\n")


def should_skip_for_cooldown(
    current_severity: str,
    cooldown_state: dict | None,
    *,
    cooldown_sec: int,
    now_ts: int,
) -> bool:
    """Decide whether the cooldown rule says to skip THIS post.

    Returns True only when ALL of:
      - cooldown_sec > 0 (feature enabled)
      - prior state exists
      - prior severity == current severity (no transition to surface)
      - elapsed since last post < cooldown window
    """
    if cooldown_sec <= 0:
        return False
    if cooldown_state is None:
        return False
    last_severity = cooldown_state.get("last_severity")
    last_posted_at = cooldown_state.get("last_posted_at")
    if last_severity != current_severity:
        # 🔒 Severity TRANSITION (warn↔err, err→warn recovery, etc.)
        # ALWAYS posts — that's exactly the signal worth not muting.
        return False
    if not isinstance(last_posted_at, (int, float)):
        return False
    elapsed = now_ts - int(last_posted_at)
    return elapsed < cooldown_sec

# 10s is generous for a single HTTP POST to Discord; their median
# latency is sub-300ms. A hung connect that runs past 10s is a real
# problem we want surfaced as a timeout, not silently swallowed.
DEFAULT_TIMEOUT_S = 10

# Discord rate-limit handling. Discord webhooks return 429 with a
# `Retry-After` header (seconds, integer or fractional string per
# Discord docs). Default behaviour: no retry (raise to operator).
# Operator who runs the poster in a tight loop during incident
# debug, or whose cron + manual invocation collide, opts in via
# --max-retries N. The retry sleeps for the server-declared
# Retry-After plus a small jitter floor so coordinated retries
# from N parallel posters don't all wake at the exact same ms.
RETRY_AFTER_DEFAULT_S = 1.0    # used when Discord omits the header
RETRY_AFTER_CAP_S = 30.0       # hard cap; operator unlikely to wait > 30s


def _parse_retry_after(headers, default: float = RETRY_AFTER_DEFAULT_S) -> float:
    """Extract `Retry-After` from an HTTPError headers-like object.
    Returns the parsed seconds, clamped to [0, RETRY_AFTER_CAP_S].
    Falls back to `default` if header is absent or malformed (e.g.,
    Discord-style fractional seconds the server quirkily refused to
    parse via int())."""
    raw = headers.get("Retry-After") if headers else None
    if not raw:
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    if value < 0:
        return default
    return min(value, RETRY_AFTER_CAP_S)


def build_request(url: str, payload: dict[str, Any]) -> urllib.request.Request:
    """Build a urllib Request ready to POST. Pure: no network I/O.
    Extracted so the test suite can assert on body / headers without
    spinning up an http server."""
    body = json.dumps(payload).encode("utf-8")
    return urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            # Discord rejects requests with no User-Agent or with the
            # default urllib one (which it treats as a generic bot
            # without identification). Identify ourselves so an
            # operator triaging webhook reject lines on Discord's
            # side can grep for our tag.
            "User-Agent": "threads-watcher/1.0 (+https://github.com/threads-watcher)",
        },
    )


def post_payload(
    url: str,
    payload: dict[str, Any],
    *,
    timeout: float = DEFAULT_TIMEOUT_S,
    max_retries: int = 0,
    sleep_fn=None,
) -> tuple[int, str]:
    """POST `payload` to Discord webhook `url`. Returns (status, body)
    where body is the raw response (Discord returns empty body on
    success, an error JSON on rejection).

    Raises urllib.error.URLError on connection / timeout failure.
    Does NOT raise on non-2xx — caller decides how to surface that
    (so the CLI can print a useful 4xx body instead of stack-tracing).

    Rate-limit retry
    ----------------
    With max_retries > 0, a 429 response triggers up to N retries,
    each preceded by sleep(Retry-After-header-value). Non-429 errors
    return immediately. sleep_fn override exists for tests so they
    don't actually block (default: time.sleep).
    """
    import time
    sleep = sleep_fn if sleep_fn is not None else time.sleep
    req = build_request(url, payload)
    attempt = 0
    while True:
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.status, resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < max_retries:
                retry_after = _parse_retry_after(e.headers)
                sleep(retry_after)
                attempt += 1
                continue
            # Discord 4xx (e.g., 401 for revoked webhook) — read body
            # so the operator sees the actual error description, not
            # just the status number. Body always returned for 429
            # too once retries exhausted.
            return e.code, e.read().decode("utf-8", errors="replace")


def _emit_dry_run_text(payload: dict[str, Any], url_hint: str | None) -> None:
    """Print the payload + the curl command the operator would run
    manually. url_hint is shown as `$WEBHOOK_URL` placeholder when
    none is set, or the actual URL when one is configured."""
    placeholder = url_hint or "$WEBHOOK_URL  # set THREADS_WATCHER_DISCORD_WEBHOOK_URL"
    print("DRY RUN — would POST the following payload:")
    print(json.dumps(payload, indent=2))
    print()
    print("Equivalent curl command:")
    print(
        f"curl -X POST -H 'Content-Type: application/json' "
        f"-d '{json.dumps(payload)}' '{placeholder}'"
    )


def _emit_dry_run_json(payload: dict[str, Any], url_hint: str | None) -> None:
    """JSON form of dry-run output — matches the --json convention
    pinned by the cross-tool meta-test (test_cli_conventions.py).
    Structured so a downstream consumer can `jq '.payload'` to extract
    the embed dict without re-rendering the text shape."""
    out = {
        "dry_run": True,
        "url_set": url_hint is not None,
        "payload": payload,
    }
    print(json.dumps(out, indent=2))


def _cli_main(argv: list[str] | None = None) -> int:
    """CLI entry. Matches the shared conventions pinned by
    qa-reports/agent-guard/test_cli_conventions.py:
      0  success (payload posted, or dry-run completed)
      1  state file not found, OR network/webhook error in non-dry mode
      2  bad CLI args (argparse default)
    """
    import argparse

    p = argparse.ArgumentParser(
        prog="discord_post.py",
        description=(
            "POST the threads-watcher state.json as a Discord webhook "
            "embed. Without a URL in $THREADS_WATCHER_DISCORD_WEBHOOK_URL, "
            "dry-runs (shows the payload + curl command). With URL set + "
            "no --dry-run, actually POSTs."
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
        "--dry-run",
        action="store_true",
        help="Force dry-run even when $THREADS_WATCHER_DISCORD_WEBHOOK_URL is set.",
    )
    p.add_argument(
        "--json",
        action="store_true",
        help=(
            "Emit machine-readable JSON. In dry-run mode the JSON wraps "
            "the payload + url-set flag; in post mode it wraps the HTTP "
            "status + response body. Always valid JSON for jq piping."
        ),
    )
    p.add_argument(
        "--min-severity",
        choices=list(SEVERITY_ORDER),
        default=SEVERITY_NONE,
        help=(
            "Skip the POST when the embed's color/severity is BELOW "
            "this threshold. `none` (default) posts everything; `warn` "
            "skips green (all-healthy) noise but still surfaces any "
            "1h+ regime; `err` only fires on 24h+ chronic state. "
            "Dry-run + skipped both exit 0 — filter is for production "
            "spam reduction once $THREADS_WATCHER_DISCORD_WEBHOOK_URL "
            "is provisioned."
        ),
    )
    p.add_argument(
        "--cooldown",
        type=int,
        default=0,
        help=(
            "Suppress repeat-posts of the same severity within N "
            "seconds. 0 (default) = disabled, backward-compat. "
            "Typical operator value with hourly cron: 21600 (6h) — "
            "sticky YELLOW gets 1 post per 6h instead of 24/day. "
            "Severity TRANSITIONS (warn↔err) ALWAYS post regardless "
            "of cooldown — those are the signals worth not muting."
        ),
    )
    p.add_argument(
        "--cooldown-state",
        type=Path,
        default=Path(DEFAULT_COOLDOWN_STATE_PATH),
        help=(
            f"Persistent JSON file for cooldown bookkeeping. Default "
            f"{DEFAULT_COOLDOWN_STATE_PATH}. Override for tests or "
            f"per-channel partitioning if a future operator runs "
            f"multiple posters."
        ),
    )
    p.add_argument(
        "--max-retries",
        type=int,
        default=0,
        help=(
            "On Discord 429 rate-limit, retry up to N times. Each "
            "retry sleeps for the Retry-After header value (capped "
            "at 30s). 0 (default) = no retry — surfaces the 429 as "
            "the existing error path. Operator running multiple "
            "posters against the same webhook (or in a debug loop) "
            "should set 1-2."
        ),
    )
    args = p.parse_args(argv)

    if not args.state_path.is_file():
        sys.stderr.write(f"ERROR: state file not found: {args.state_path}\n")
        return 1
    payload = build_payload_from_state(args.state_path)

    # Severity filter — check BEFORE the URL gating so dry-run also
    # reports what the filter would do (operator can verify their
    # threshold choice without provisioning the URL).
    observed_severity = severity_of_payload(payload)
    if not severity_at_or_above(observed_severity, args.min_severity):
        if args.json:
            print(json.dumps({
                "skipped": True,
                "reason": "min_severity_filter",
                "observed_severity": observed_severity,
                "min_severity": args.min_severity,
            }))
        else:
            print(
                f"SKIPPED: severity={observed_severity} is below "
                f"--min-severity={args.min_severity}; not posting."
            )
        return 0

    # Cooldown check — same severity within window → skip. Runs
    # AFTER the severity filter so a green snapshot doesn't bump
    # cooldown state for a green that wouldn't have been posted
    # anyway. Filter and cooldown compose cleanly.
    import time
    now_ts = int(time.time())
    cooldown_state = _load_cooldown_state(args.cooldown_state)
    if should_skip_for_cooldown(
        observed_severity,
        cooldown_state,
        cooldown_sec=args.cooldown,
        now_ts=now_ts,
    ):
        last_at = int(cooldown_state["last_posted_at"])  # safe: gated above
        remaining = args.cooldown - (now_ts - last_at)
        if args.json:
            print(json.dumps({
                "skipped": True,
                "reason": "cooldown_active",
                "observed_severity": observed_severity,
                "cooldown_sec": args.cooldown,
                "remaining_sec": remaining,
                "last_posted_at": last_at,
            }))
        else:
            print(
                f"SKIPPED: cooldown active — same severity "
                f"({observed_severity}) posted {now_ts - last_at}s ago, "
                f"cooldown {args.cooldown}s, "
                f"{remaining}s remaining. Severity transition or "
                f"cooldown expiry will reopen posting."
            )
        return 0

    # `not url` (not `url is None`) so an env var EXPORTED-BUT-EMPTY
    # ("THREADS_WATCHER_DISCORD_WEBHOOK_URL=") falls through to
    # dry-run instead of trying to POST to ''. urllib.request.Request
    # raises ValueError on empty URL, which would surface as an
    # operator-confusing traceback instead of the intended dry-run.
    url = os.environ.get(ENV_WEBHOOK_URL) or None
    is_dry_run = args.dry_run or url is None

    if is_dry_run:
        if args.json:
            _emit_dry_run_json(payload, url)
        else:
            _emit_dry_run_text(payload, url)
        return 0

    # Real POST path. url is guaranteed truthy here (is_dry_run gate).
    assert url
    try:
        status, body = post_payload(url, payload, max_retries=args.max_retries)
    except urllib.error.URLError as e:
        sys.stderr.write(
            f"ERROR: failed to POST to Discord webhook: {e}\n"
            f"  url={_redact_url(url)}\n"
        )
        return 1

    if status in DISCORD_OK_STATUS:
        # Persist cooldown bookkeeping only when feature enabled —
        # avoids creating state file unnecessarily for operators who
        # never opted in to cooldown. Best-effort: failure logs but
        # doesn't fail the POST (the post itself succeeded).
        if args.cooldown > 0:
            _save_cooldown_state(args.cooldown_state, observed_severity, now_ts)
        if args.json:
            print(json.dumps({"posted": True, "status": status, "body": body}))
        else:
            print(f"OK status={status} (Discord accepted the webhook)")
        return 0
    # Non-2xx: print body so operator sees Discord's error reason.
    sys.stderr.write(
        f"ERROR: Discord rejected webhook (status={status}). "
        f"Body: {body[:500]}\n"
    )
    return 1


def _redact_url(url: str) -> str:
    """Webhook URLs end with /<id>/<token> — the token is the secret
    bearer. Redact it from any error message so the failure log
    doesn't leak credentials into ops dashboards / Slack pastes."""
    parts = url.rsplit("/", 1)
    if len(parts) == 2 and len(parts[1]) > 8:
        return f"{parts[0]}/<redacted-{len(parts[1])}-char-token>"
    return "<redacted>"


if __name__ == "__main__":
    sys.exit(_cli_main())
