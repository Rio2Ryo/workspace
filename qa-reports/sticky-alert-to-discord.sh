#!/usr/bin/env bash
# Chain wrapper: sticky_regime_diagnosis.py --alert-on-transition
# → (on transition) → discord_post.py
#
# Why this exists
# ---------------
# Two pieces shipped previously:
#   - sticky_regime_diagnosis.py --alert-on-transition (commit de9369a)
#     → cron-friendly silent-on-no-change transition detector
#   - discord_post.py (commit 785a75d + ce5ca04 + 23ef7fc + 334c6cb)
#     → Discord webhook poster with severity filter / cooldown / retry
#
# But chaining them required operator-written shell or two separate
# launchd entries with no coordination. This wrapper makes the
# "transition → notify" path a single command operator can invoke
# from a single launchd plist.
#
# Behaviour:
#   - On NO transition → silent exit 0 (operator's Discord channel
#                                        gets no spam)
#   - On transition    → prints the transition line to stdout +
#                        invokes discord_post.py to post current
#                        threads-watcher status to Discord (the
#                        transition timing is the signal; the
#                        standard embed gives operator immediate
#                        context on what state the system is in
#                        when the transition happened)
#
# Usage
# -----
#   sticky-alert-to-discord.sh
#   sticky-alert-to-discord.sh --dry-run        # never POSTs, just shows
#
# Exit codes
# ----------
#   0  success (either no-transition silent OR transition + post OK)
#   1  diagnose / post failure
#   2  bad CLI args
#
# Composes with launchd: see operator runbook in README.md.

set -u

usage() {
  printf 'Usage: %s [--dry-run]\n' "$(basename "$0")" >&2
  printf '\n' >&2
  printf '  --dry-run    Force dry-run on the discord_post invocation\n' >&2
  printf '               (no actual POST). Diagnose always reads DB only.\n' >&2
}

DRY_RUN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN="--dry-run"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'ERROR: unknown flag: %s\n' "$1" >&2
      usage
      exit 2
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCHER_DIR="$REPO_ROOT/projects/threads-watcher"
PY="$WATCHER_DIR/.venv/bin/python"

if [ ! -x "$PY" ]; then
  printf 'ERROR: threads-watcher .venv Python not executable: %s\n' "$PY" >&2
  printf 'Run `python3 -m venv .venv` in projects/threads-watcher/ first.\n' >&2
  exit 1
fi

# 1. Run alerter in --json mode. Always exits 0; we read .transitioned.
ALERT_JSON=$(cd "$WATCHER_DIR" && "$PY" sticky_regime_diagnosis.py --alert-on-transition --json 2>&1)
ALERT_RC=$?
if [ "$ALERT_RC" -ne 0 ]; then
  printf 'ERROR: sticky_regime_diagnosis.py --alert-on-transition exited %d\n' "$ALERT_RC" >&2
  printf '%s\n' "$ALERT_JSON" >&2
  exit 1
fi

# 2. Parse transitioned via Python (avoids jq dependency).
TRANSITIONED=$("$PY" -c "
import json, sys
try:
    d = json.loads('''$ALERT_JSON''')
    print('yes' if d.get('transitioned') else 'no')
except (json.JSONDecodeError, KeyError):
    print('no')
" 2>/dev/null)

if [ "$TRANSITIONED" != "yes" ]; then
  # Silent on no-change — cron-friendly contract.
  exit 0
fi

# 3. Transition happened — surface to stdout (for log capture) +
#    post current threads-watcher status to Discord.
printf '%s\n' "$ALERT_JSON" | "$PY" -c "
import json, sys
d = json.loads(sys.stdin.read())
print(f\"TRANSITION: {d.get('last_recommendation')} → {d.get('current_recommendation')}\")
print(f\"  rationale: {d.get('rationale', '')}\")
"

# 4. Invoke discord_post.py with the same flags the discord-post.plist
#    template uses (so behaviour matches what operator would see from
#    the regular hourly cron):
#      --min-severity warn  → no GREEN spam
#      --max-retries 1      → 429 retry
#    Skip --cooldown on this invocation: transitions are by definition
#    low-frequency events worth posting immediately, not deduped.
#    --dry-run passes through if operator set it on this wrapper.
cd "$WATCHER_DIR" && "$PY" discord_post.py \
  --min-severity warn \
  --max-retries 1 \
  $DRY_RUN
DISCORD_RC=$?
if [ "$DISCORD_RC" -ne 0 ]; then
  printf 'ERROR: discord_post.py exited %d after transition detected\n' "$DISCORD_RC" >&2
  exit 1
fi
exit 0
