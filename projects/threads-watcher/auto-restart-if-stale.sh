#!/usr/bin/env bash
# Self-heal wrapper: run --health-check, restart the watcher if the
# staleness signal fires.
#
# Why this exists:
#   commit d8b1e65 added a process-staleness detector to
#   --health-check. commit 91036a5 added restart-watcher.sh. Both
#   require an operator to run them. This wrapper closes the loop so
#   cron / launchd / a tmux-side babysitter can keep the live watcher
#   on fresh code without manual intervention.
#
#   Targets the silent 13-hour breakage observed on 2026-05-18 where
#   the partial_error code shipped but the live process never
#   reloaded.
#
# Behaviour:
#   1. Pre-check: if pgrep finds NO `watcher.py --watch` process,
#      treat as dead-process and invoke restart-watcher.sh (subject
#      to cooldown). Added 2026-05-18 after the live PID 83222
#      silently died and this script — which only checked staleness —
#      reported "healthy — no action" while there was no watcher at
#      all. --health-check itself returns "staleness not applicable"
#      for the no-process case, so the staleness grep below would
#      miss it.
#   2. Run `python watcher.py --health-check`.
#   3. If output contains the staleness reason
#      ("source file(s) have been edited since"), and we're outside
#      the cooldown window, invoke restart-watcher.sh.
#   4. Cooldown: touch a marker file after each restart. Don't
#      restart again within ${COOLDOWN_SECONDS:-300} (5 min) — avoids
#      tight loops on transient mtime/race conditions.
#
# Exit codes:
#   0   health-check passed OR restart fired successfully
#   1   health-check signalled staleness but cooldown blocked restart
#       (operator can decide to force; not a crash)
#   2   restart-watcher.sh itself failed
#
# Suggested cron:
#   */5 * * * * cd ~/.openclaw/workspace/projects/threads-watcher \
#               && ./auto-restart-if-stale.sh >> logs/auto-restart.log 2>&1

set -uo pipefail

cd "$(dirname "$0")"
LOG_PREFIX="auto-restart-if-stale"
COOLDOWN_SECONDS="${COOLDOWN_SECONDS:-300}"
MARKER=".last-auto-restart"
HEALTH_LOG=$(mktemp -t aristale.XXXXXX)
trap 'rm -f "$HEALTH_LOG"' EXIT

now_ts=$(date +%s)

# ── rotate auto-restart.out.log if oversized ─────────────────────────
# launchd captures this script's stdout (ts_log via printf) into
# logs/auto-restart.out.log. Without rotation the file accumulates
# forever (~12 KB/day observed). Rotation runs at the TOP of each
# launchd cycle — when the rename fires, the current launchd-held fd
# keeps writing to the renamed .1 file for the remainder of this
# tick, and the NEXT tick opens a fresh logs/auto-restart.out.log.
# Net: each rotated file holds complete tick output, log family
# bounded by max-bytes × backup-count.
# Defaults: 1 MB × 5 = 5 MB. Tunable via env vars.
AUTO_RESTART_LOG="logs/auto-restart.out.log"
AUTO_RESTART_LOG_MAX_BYTES="${AUTO_RESTART_LOG_MAX_BYTES:-1048576}"
AUTO_RESTART_LOG_BACKUP_COUNT="${AUTO_RESTART_LOG_BACKUP_COUNT:-5}"
if [ -x venv/bin/python ]; then
  _PY=venv/bin/python
else
  _PY=python3
fi
"$_PY" log_rotation.py "$AUTO_RESTART_LOG" \
  --max-bytes "$AUTO_RESTART_LOG_MAX_BYTES" \
  --backup-count "$AUTO_RESTART_LOG_BACKUP_COUNT" \
  2>/dev/null || true  # rotation failure must never block the health check

ts_log() {
  printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$LOG_PREFIX:" "$*"
}

# ── helpers ─────────────────────────────────────────────────────────────

# Check cooldown; return 0 (clear) or 1 (still cooling) without restarting.
# Logs the cooldown decision so operators can see why a needed restart
# was deferred.
check_cooldown() {
  if [ -f "$MARKER" ]; then
    local last_ts elapsed
    last_ts=$(stat -f %m "$MARKER" 2>/dev/null || stat -c %Y "$MARKER" 2>/dev/null || echo 0)
    elapsed=$((now_ts - last_ts))
    if [ "$elapsed" -lt "$COOLDOWN_SECONDS" ]; then
      ts_log "cooldown active: last restart was ${elapsed}s ago, threshold ${COOLDOWN_SECONDS}s — SKIP"
      ts_log "(operator may force: rm $MARKER && ./auto-restart-if-stale.sh)"
      return 1
    fi
  fi
  return 0
}

# Invoke restart-watcher.sh, touch the cooldown marker on success.
# Returns the script's exit (0 on success, non-zero on failure).
do_restart() {
  local reason="$1"
  ts_log "invoking ./restart-watcher.sh (reason: $reason)"
  if ./restart-watcher.sh; then
    touch "$MARKER"
    ts_log "restart succeeded; cooldown marker set"
    return 0
  else
    local rc=$?
    ts_log "ERROR: restart-watcher.sh failed (exit $rc)"
    return 2
  fi
}

# ── dead-process gate (pre-staleness) ──────────────────────────────────
# Why first: --health-check's process-staleness sub-check returns
# "not applicable" when there's no live watcher, which would silently
# pass the staleness grep below and leave the dead process unrevived.
# pgrep is the cheapest way to detect absence.
if ! pgrep -f "watcher.py --watch" >/dev/null 2>&1; then
  ts_log "no live watcher process detected (pgrep returned nothing)"
  if check_cooldown; then
    do_restart "dead-process"
    exit $?
  fi
  exit 1
fi

# ── run health-check ────────────────────────────────────────────────────
# Activate venv inline so cron env doesn't need PATH magic.
if [ ! -f venv/bin/activate ]; then
  ts_log "ERROR: venv/bin/activate missing — can't run --health-check"
  exit 2
fi
# shellcheck disable=SC1091
source venv/bin/activate

python watcher.py --health-check >"$HEALTH_LOG" 2>&1
health_exit=$?
ts_log "health-check exit=$health_exit"

# ── decide if a reload-fixable signal is the reason ────────────────────
# restart_decision.py classifies the --health-check output: it triggers
# a restart for STALE CODE (process behind on-disk source) and for a
# HUNG LOOP (heartbeat stale — loop stopped writing checks while the
# PID lingers). It does NOT trigger for DOM regression / recent errors,
# which need operator attention, not a reload.
#
# The earlier inline grep matched only the stale-code phrase, so a hung
# loop with a live PID was never auto-revived — that gap is why this
# went through a classifier.
if restart_reason=$(python restart_decision.py <"$HEALTH_LOG"); then
  ts_log "restart-triggering signal detected (${restart_reason})"
else
  if [ "$health_exit" != 0 ]; then
    ts_log "health-check unhealthy but NOT reload-fixable — leaving for operator"
    grep -E "^reason=" "$HEALTH_LOG" | head -5 | sed "s/^/  /" | while read -r l; do ts_log "  $l"; done
  else
    ts_log "watcher is healthy — no action"
  fi
  exit 0
fi

# ── cooldown gate + restart ────────────────────────────────────────────
if check_cooldown; then
  do_restart "$restart_reason"
  exit $?
fi
exit 1
