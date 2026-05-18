#!/usr/bin/env bash
# Periodic ops monitor: runs audit-recent-commits.sh against the
# workspace + second-brain submodule, summarises findings, and emits a
# concise log line. Optionally posts to Discord when DISCORD_WEBHOOK_URL
# is set in the launchd environment.
#
# Why this exists
# ---------------
# The pre-commit submodule-mixin gate (79f5896) prevents the 2f8861b /
# 497aad5 class prospectively. audit-recent-commits.sh catches them
# retroactively. Both are useful only if SOMEONE runs them. Periodic
# ops monitoring closes the loop so a bad commit pushed by a sibling
# agent surfaces within the cron interval instead of next time someone
# happens to look.
#
# Behaviour
# ---------
# - Runs audit in each repo. exit 1 = at least one FLAG, exit 0 = clean.
# - Writes a summary line to logs/ops-monitor.log (created if missing).
# - Compares this run's flag set against the previous run's marker. If
#   there are NEW flags (not seen before), prints "NEW ALERT" to stderr
#   so launchd captures it in the .err log + optionally posts to
#   Discord. Previously-seen flags are just rolled forward.
# - Marker file: .ops-monitor.last-flags (one SHA per line, sorted).
#
# Exit codes
# ----------
#   0   no flags OR all flags previously seen
#   1   at least one NEW flag this run (operator should investigate)
#   2   tooling failure (audit script missing, etc.)
#
# Suggested launchd: 1-hour StartInterval. See
# com.shiro.agent-guard-ops-monitor.plist alongside this file.

set -uo pipefail

cd "$(dirname "$0")/../.."   # repo root (workspace)

# MARKER_FILE and LOG_FILE accept env override so tests (and any future
# multi-tenant runner) can isolate state. Defaults match the launchd
# plist's expectations.
LOG_FILE="${LOG_FILE:-qa-reports/agent-guard/logs/ops-monitor.log}"
MARKER_FILE="${MARKER_FILE:-qa-reports/agent-guard/.ops-monitor.last-flags}"
AUDIT="qa-reports/agent-guard/audit-recent-commits.sh"
NOW=$(date -u +%FT%TZ)

mkdir -p "$(dirname "$LOG_FILE")"
[ -f "$LOG_FILE" ] || : > "$LOG_FILE"

ts_log() {
  printf '%s %s\n' "$NOW" "$*" | tee -a "$LOG_FILE"
}

if [ ! -x "$AUDIT" ]; then
  ts_log "ERROR: $AUDIT not found or not executable"
  exit 2
fi

# Collect FLAG lines (SHA only) from one repo. Audit script's exit
# code is non-zero when it flags; we capture stdout regardless.
collect_flags() {
  local repo="$1"
  local label="$2"
  if [ ! -d "$repo/.git" ] && [ ! -f "$repo/.git" ]; then
    ts_log "skip:$label (not a git repo)"
    return 0
  fi
  bash "$AUDIT" --repo "$repo" --last 20 2>&1 \
    | awk -v label="$label" '/^FLAG  /{print label":"$2}'
}

new_flags=""
all_flags=""
for spec in "workspace:."  "second-brain:second-brain"; do
  label="${spec%%:*}"
  repo="${spec#*:}"
  flags=$(collect_flags "$repo" "$label")
  if [ -n "$flags" ]; then
    all_flags+="$flags"$'\n'
  fi
done

all_flags=$(printf '%s' "$all_flags" | sort -u)

# Diff against marker.
prev_flags=""
[ -f "$MARKER_FILE" ] && prev_flags=$(sort -u "$MARKER_FILE")

if [ -z "$all_flags" ]; then
  ts_log "ok: no flags across workspace + second-brain"
  : > "$MARKER_FILE"
  exit 0
fi

# Compute new = current - prev
new_flags=$(comm -23 <(printf '%s\n' "$all_flags" | sort -u) <(printf '%s\n' "$prev_flags" | sort -u))

ts_log "audit summary: $(printf '%s' "$all_flags" | grep -c '^') total flag(s)"
printf '%s\n' "$all_flags" | sed 's/^/         /' | tee -a "$LOG_FILE"

if [ -z "$new_flags" ]; then
  ts_log "no new flags since previous run; nothing to escalate"
  # Roll marker forward to current snapshot.
  printf '%s\n' "$all_flags" > "$MARKER_FILE"
  exit 0
fi

# We have NEW flags. Escalate.
new_count=$(printf '%s' "$new_flags" | grep -c '^')
{
  echo "NEW ALERT: $new_count new audit flag(s) since $(date -u +%FT%TZ)"
  printf '%s\n' "$new_flags" | sed 's/^/  - /'
  echo "(full audit in $LOG_FILE; investigate with: bash $AUDIT --repo <repo>)"
} | tee -a "$LOG_FILE" >&2

# Optional Discord webhook. Body kept under Discord's 2000-char limit.
if [ -n "${DISCORD_WEBHOOK_URL:-}" ]; then
  body=$(jq -n --arg content "$(printf 'agent-guard ops-monitor: %s NEW flag(s)\n%s\n%s' \
    "$new_count" "$(printf '%s' "$new_flags" | head -10)" \
    "(see $LOG_FILE)" | head -c 1900)" '{content:$content}')
  curl -fsS -X POST -H 'Content-Type: application/json' \
    -d "$body" "$DISCORD_WEBHOOK_URL" > /dev/null 2>&1 \
    && ts_log "discord: posted $new_count alert(s)" \
    || ts_log "discord: post FAILED (webhook unreachable or rate-limited)"
fi

# Roll marker forward so the next run only escalates strictly newer flags.
printf '%s\n' "$all_flags" > "$MARKER_FILE"

exit 1
