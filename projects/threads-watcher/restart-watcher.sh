#!/usr/bin/env bash
# Restart the threads-watcher --watch loop so it picks up code changes.
#
# Why this exists:
#   watcher.py is invoked via `run-watcher.sh` in a long-running shell.
#   Python loads imports once at startup and never reloads, so any
#   commit to watcher.py / watcher_pure.py / health.py / db.py made
#   after the process started runs in the new code only if the process
#   is restarted.
#
#   Observed in production on 2026-05-18: PID 16762 started 2026-05-17
#   20:00, the partial_error heuristic landed in commit e0eac37 at
#   23:16, and for ~13 hours the running watcher silently never wrote
#   `status='partial_error'` even though `found_count` had dropped from
#   the 15-post historical max to 4 (clear DOM regression). The pure
#   helpers worked when called directly; the live process never saw
#   them.
#
# What it does:
#   1. Find the existing `watcher.py --watch` PID via pgrep (no
#      reliance on a pidfile — the original launcher doesn't write one).
#   2. Send SIGTERM, wait up to 10s for graceful exit. If still alive,
#      SIGKILL.
#   3. Re-launch via the existing `run-watcher.sh` so log routing and
#      env vars stay identical.
#
# Designed to be safe to run idempotently — if there's no existing
# watcher process, it just launches a fresh one.

set -euo pipefail

cd "$(dirname "$0")"
LOG_FILE="logs/watcher.log"
mkdir -p logs

# ── mutex against concurrent restart-watcher.sh invocations ────────────
# Without this, two near-simultaneous invocations (e.g., the
# auto-restart-if-stale launchd cycle + an operator manual run, or two
# overlapping auto-restart cycles when the dead-process gate fires)
# both run pgrep → see existing PIDs → SIGTERM → wait → launch fresh.
# Result: TWO new watchers spawn because the nohup launch at the bottom
# isn't gated against the OTHER concurrent invocation's launch.
#
# macOS doesn't ship with `flock(1)`, and brew's `flock` cask is
# different (not a CLI). Use `mkdir` as a portable atomic primitive —
# mkdir of an existing directory fails atomically, and the trap on
# EXIT cleans it up so a crashed invocation doesn't permanently
# wedge the lock.
LOCKDIR=".restart-watcher.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "another restart-watcher.sh is in progress — skipping (lock dir $LOCKDIR exists)" >&2
  echo "  (operator force: rm -rf $LOCKDIR && ./restart-watcher.sh)" >&2
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null || true' EXIT

# ── find existing watcher process(es) ──────────────────────────────────
# `pgrep -f` matches anywhere in the cmdline; scope to "watcher.py --watch"
# so we don't catch unrelated python processes.
PIDS=$(pgrep -f 'watcher\.py --watch' 2>/dev/null || true)

if [ -n "$PIDS" ]; then
  echo "stopping existing watcher PID(s): $PIDS"
  # SIGTERM first
  for pid in $PIDS; do
    kill "$pid" 2>/dev/null || true
  done
  # wait up to 10s for graceful exit
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 1
    still=$(pgrep -f 'watcher\.py --watch' 2>/dev/null || true)
    [ -z "$still" ] && break
  done
  # escalate to SIGKILL if any survive
  still=$(pgrep -f 'watcher\.py --watch' 2>/dev/null || true)
  if [ -n "$still" ]; then
    echo "  graceful exit timed out; SIGKILLing $still"
    for pid in $still; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 1
  fi
else
  echo "no existing watcher process; launching fresh"
fi

# Sanity: confirm no zombie
remain=$(pgrep -f 'watcher\.py --watch' 2>/dev/null || true)
if [ -n "$remain" ]; then
  echo "ERROR: could not stop existing watcher: $remain" >&2
  exit 1
fi

# ── launch fresh ──────────────────────────────────────────────────────
echo "launching fresh watcher (will run-watcher.sh in background, logging to $LOG_FILE)"
echo "--- restart marker: $(date -u +%FT%TZ) ---" >> "$LOG_FILE"
nohup ./run-watcher.sh >> "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "new watcher PID: $NEW_PID"

# Give it ~3s to actually start, then sanity-check it's still alive.
sleep 3
if ! kill -0 "$NEW_PID" 2>/dev/null; then
  echo "ERROR: new watcher exited within 3s of launch; tail of log:" >&2
  tail -20 "$LOG_FILE" >&2
  exit 1
fi
echo "watcher is alive at PID $NEW_PID"
echo "tail with: tail -f $LOG_FILE"
