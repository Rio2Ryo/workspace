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
from discord_payload import build_payload_from_state  # noqa: E402


ENV_WEBHOOK_URL = "THREADS_WATCHER_DISCORD_WEBHOOK_URL"

# Discord's documented success status for incoming webhook POSTs.
# 200 also accepted defensively in case Discord changes the response
# for backward compatibility.
DISCORD_OK_STATUS = (200, 204)

# 10s is generous for a single HTTP POST to Discord; their median
# latency is sub-300ms. A hung connect that runs past 10s is a real
# problem we want surfaced as a timeout, not silently swallowed.
DEFAULT_TIMEOUT_S = 10


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
) -> tuple[int, str]:
    """POST `payload` to Discord webhook `url`. Returns (status, body)
    where body is the raw response (Discord returns empty body on
    success, an error JSON on rejection).

    Raises urllib.error.URLError on connection / timeout failure.
    Does NOT raise on non-2xx — caller decides how to surface that
    (so the CLI can print a useful 4xx body instead of stack-tracing).
    """
    req = build_request(url, payload)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        # Discord 4xx (e.g., 401 for revoked webhook) — read body so
        # the operator sees the actual error description, not just
        # the status number.
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
    args = p.parse_args(argv)

    if not args.state_path.is_file():
        sys.stderr.write(f"ERROR: state file not found: {args.state_path}\n")
        return 1
    payload = build_payload_from_state(args.state_path)

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
        status, body = post_payload(url, payload)
    except urllib.error.URLError as e:
        sys.stderr.write(
            f"ERROR: failed to POST to Discord webhook: {e}\n"
            f"  url={_redact_url(url)}\n"
        )
        return 1

    if status in DISCORD_OK_STATUS:
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
