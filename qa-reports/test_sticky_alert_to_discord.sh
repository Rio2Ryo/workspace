#!/usr/bin/env bash
# Integration tests for sticky-alert-to-discord.sh — chain wrapper
# that connects sticky_regime_diagnosis.py --alert-on-transition →
# discord_post.py.
#
# Strategy: pre-seed the sticky-regime state file + a state.json
# fixture, run the wrapper, assert behaviour per scenario. discord_post
# always runs in --dry-run mode here (set via wrapper's --dry-run pass-
# through), so no network I/O.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRAPPER="$SCRIPT_DIR/sticky-alert-to-discord.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WATCHER_DIR="$REPO_ROOT/projects/threads-watcher"
ALERT_STATE_PATH="$WATCHER_DIR/threads-watcher-status/sticky-regime-last-recommendation.json"

PASS=0
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

assert_exit() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: $name (exit=$actual)"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name (expected exit=$expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    green "  PASS: $name (contains '$needle')"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name (missing '$needle')"
    red   "    haystack head: $(printf '%s' "$haystack" | head -c 300)"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    red   "  FAIL: $name (unexpectedly contains '$needle')"
    FAIL=$((FAIL + 1))
  else
    green "  PASS: $name (correctly absent '$needle')"
    PASS=$((PASS + 1))
  fi
}

# Backup the operator's state file so tests can pre-seed without
# permanently corrupting the operator's actual alerter state.
ORIGINAL_STATE_BACKUP=""
if [ -f "$ALERT_STATE_PATH" ]; then
  ORIGINAL_STATE_BACKUP=$(mktemp)
  cp "$ALERT_STATE_PATH" "$ORIGINAL_STATE_BACKUP"
fi
restore_state() {
  if [ -n "$ORIGINAL_STATE_BACKUP" ]; then
    mv "$ORIGINAL_STATE_BACKUP" "$ALERT_STATE_PATH"
  else
    rm -f "$ALERT_STATE_PATH"
  fi
}
trap restore_state EXIT

# ── case 1: bad invocation ─────────────────────────────────────────────

printf '\n=== bad invocation ===\n'

"$WRAPPER" --unknown-flag 2>/dev/null
assert_exit "unknown flag exits 2" 2 $?

"$WRAPPER" --help >/dev/null 2>&1
assert_exit "--help exits 0" 0 $?

# ── case 2: no transition → silent + exit 0 ────────────────────────────

printf '\n=== no-transition silent path ===\n'

# Pre-seed state to match what production DB will currently recommend.
# Trick: run --alert-on-transition once with --json to capture current
# recommendation, then re-run wrapper — second run sees "same" → silent.
CURRENT=$(cd "$WATCHER_DIR" && .venv/bin/python sticky_regime_diagnosis.py \
  --recommendation --json 2>/dev/null \
  | .venv/bin/python -c 'import json,sys;print(json.load(sys.stdin)["recommendation"])')

printf '{"recommendation": "%s"}' "$CURRENT" > "$ALERT_STATE_PATH"

OUTPUT=$("$WRAPPER" --dry-run 2>&1)
RC=$?
assert_exit "no-transition wrapper exits 0" 0 $RC
assert_not_contains "no-transition silent (no TRANSITION line)" "TRANSITION" "$OUTPUT"
assert_not_contains "no-transition silent (no DRY RUN block)" "DRY RUN" "$OUTPUT"

# ── case 3: transition → emit TRANSITION line + invoke discord_post ───

printf '\n=== transition fires discord_post ===\n'

# Force a transition: pre-seed state to something different from
# whatever production recommends. Use "WAIT" if current is not WAIT,
# else "STRONG_ENABLE".
if [ "$CURRENT" = "WAIT" ]; then
  printf '{"recommendation": "STRONG_ENABLE"}' > "$ALERT_STATE_PATH"
  EXPECTED_LAST="STRONG_ENABLE"
else
  printf '{"recommendation": "WAIT"}' > "$ALERT_STATE_PATH"
  EXPECTED_LAST="WAIT"
fi

OUTPUT=$("$WRAPPER" --dry-run 2>&1)
RC=$?
assert_exit "transition wrapper exits 0" 0 $RC
assert_contains "transition emits TRANSITION line" "TRANSITION:" "$OUTPUT"
assert_contains "transition names the previous recommendation" "$EXPECTED_LAST" "$OUTPUT"
assert_contains "transition names the current recommendation" "$CURRENT" "$OUTPUT"
# 🔒 The chain succeeded: discord_post --dry-run printed the embed
# payload (would-have-been-posted content).
assert_contains "transition invokes discord_post.py (dry-run shows payload)" "DRY RUN" "$OUTPUT"
# State file updated for next tick.
NEW_STATE=$(cat "$ALERT_STATE_PATH" 2>/dev/null)
assert_contains "state file updated to current recommendation" "$CURRENT" "$NEW_STATE"

# ── case 4: re-run immediately after transition → no longer fires ─────

printf '\n=== post-transition no-op (state.json updated) ===\n'

OUTPUT=$("$WRAPPER" --dry-run 2>&1)
RC=$?
assert_exit "second run after transition exits 0" 0 $RC
assert_not_contains "second run is silent (no re-fire)" "TRANSITION" "$OUTPUT"

# ── summary ────────────────────────────────────────────────────────────

printf '\n=== summary ===\n'
printf 'PASS: %d  FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then
  red 'TESTS FAILED'
  exit 1
fi
green 'ALL TESTS PASSED'
exit 0
