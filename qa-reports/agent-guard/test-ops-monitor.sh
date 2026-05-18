#!/usr/bin/env bash
# Scenario-based functional test for ops-monitor.sh.
#
# Uses MARKER_FILE + LOG_FILE env overrides to isolate from real ops
# state. Audit script output is REAL (it scans the actual git history
# of workspace + second-brain), so these tests pin the marker-diff
# logic, not the audit logic itself (which is tested separately by
# its own --repo runs).
#
# Why this exists
# ---------------
# Before this script, ops-monitor.sh's "NEW alert only on previously
# unseen flag" behaviour was only verified by:
#   - 1 manual run with no marker (got NEW alerts as expected)
#   - 1 manual run with the marker rolled forward (got silence)
# Missing: the partial-marker case (marker has SOME of the current
# flags), the stale-marker case (marker has flags that no longer
# match any current commit), and the empty-flag-set case (audit
# returns no flags at all).
#
# Usage:
#   ./test-ops-monitor.sh           # run all scenarios
#   ./test-ops-monitor.sh -v        # verbose (show ops-monitor output)
#
# Exit codes:
#   0  all scenarios pass
#   1  at least one scenario failed (count printed)

set -uo pipefail

cd "$(dirname "$0")/../.."   # repo root

VERBOSE=0
[ "${1:-}" = "-v" ] && VERBOSE=1

OPS=./qa-reports/agent-guard/ops-monitor.sh

# Known historical flags at HEAD time of writing. The audit script
# returns exactly these for `--repo .` (workspace) and `--repo
# second-brain` against the current branches:
#   workspace:497aad59d7115b74ba615dee0a799e7b3b4bd45c
#   second-brain:2f8861b2d62d7f3441d434d844c47dd5ea389b3f
#
# If a future commit adds or revokes a flag, these test scenarios will
# need an update. That's expected — the point is to LOCK the diff
# semantics, not pretend the inputs are immutable.
WS_FLAG="workspace:497aad59d7115b74ba615dee0a799e7b3b4bd45c"
SB_FLAG="second-brain:2f8861b2d62d7f3441d434d844c47dd5ea389b3f"

pass=0
fail=0

run_scenario() {
  local name="$1"
  local marker_setup="$2"   # eval'd to populate marker; "" means rm
  local want_exit="$3"
  local want_in_log_regex="$4"   # regex that must appear in LOG output

  local tmpmarker tmplog
  tmpmarker=$(mktemp -t ops-marker.XXXXXX)
  tmplog=$(mktemp -t ops-log.XXXXXX)
  # Apply marker setup (eval against tmpmarker via $M placeholder).
  if [ -n "$marker_setup" ]; then
    M="$tmpmarker" eval "$marker_setup"
  else
    rm -f "$tmpmarker"
  fi

  local actual_exit
  if [ "$VERBOSE" = 1 ]; then
    printf '\n--- scenario: %s ---\n' "$name" >&2
    MARKER_FILE="$tmpmarker" LOG_FILE="$tmplog" bash "$OPS" >&2
    actual_exit=$?
    echo "--- log: ---" >&2
    cat "$tmplog" >&2
    echo "--- end ---" >&2
  else
    MARKER_FILE="$tmpmarker" LOG_FILE="$tmplog" bash "$OPS" >/dev/null 2>&1
    actual_exit=$?
  fi

  local result="PASS"
  if [ "$actual_exit" != "$want_exit" ]; then
    result="FAIL: exit=$actual_exit (want $want_exit)"
  elif [ -n "$want_in_log_regex" ] && ! grep -qE "$want_in_log_regex" "$tmplog"; then
    result="FAIL: log missing /$want_in_log_regex/"
  fi

  if [ "$result" = "PASS" ]; then
    printf '  ✓ %s\n' "$name"
    pass=$((pass + 1))
  else
    printf '  ✗ %s — %s\n' "$name" "$result"
    fail=$((fail + 1))
    if [ "$VERBOSE" != 1 ]; then
      # Print log on failure so operator can diagnose.
      printf '    log:\n'
      sed 's/^/      /' "$tmplog"
    fi
  fi

  rm -f "$tmpmarker" "$tmplog"
}

echo "ops-monitor.sh scenario tests:"

# 1. No marker file at all → all current flags are NEW → exit 1.
run_scenario \
  "no_marker: cold start treats every current flag as NEW" \
  "" \
  1 \
  "NEW ALERT: 2 new audit flag\(s\)"

# 2. Marker has only the second-brain flag → workspace flag is NEW → exit 1.
run_scenario \
  "partial_marker: only one previously-seen flag → other is NEW" \
  'printf "%s\n" "'"$SB_FLAG"'" > "$M"' \
  1 \
  "NEW ALERT: 1 new audit flag\(s\)"

# 3. Marker has BOTH current flags → no NEW → exit 0, silent.
run_scenario \
  "full_marker: all seen → no escalation" \
  'printf "%s\n%s\n" "'"$WS_FLAG"'" "'"$SB_FLAG"'" > "$M"' \
  0 \
  "no new flags since previous run"

# 4. Marker has a stale flag (no longer in current audit) → no NEW → exit 0.
#    The stale entry gets rolled out on the next-marker write; not re-alerted.
run_scenario \
  "stale_marker: entries that no longer match any current flag are silently dropped" \
  'printf "%s\n%s\n%s\n" "'"$WS_FLAG"'" "'"$SB_FLAG"'" "workspace:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef" > "$M"' \
  0 \
  "no new flags since previous run"

# 5. Marker has only stale flags → all current flags are NEW → exit 1.
run_scenario \
  "irrelevant_marker: previous flags don't match current → all current are NEW" \
  'printf "%s\n" "workspace:cafebabecafebabecafebabecafebabecafebabe" > "$M"' \
  1 \
  "NEW ALERT: 2 new audit flag\(s\)"

# Summary.
printf '\nops-monitor tests: %d pass / %d fail\n' "$pass" "$fail"
[ "$fail" -eq 0 ] && exit 0 || exit 1
