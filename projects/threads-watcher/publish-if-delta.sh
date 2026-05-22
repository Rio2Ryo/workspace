#!/usr/bin/env bash
# Commit/push/deploy public threads-watcher status when the SQLite DB has
# posts that are not yet published. Intended for launchd.

set -uo pipefail

cd "$(dirname "$0")"

LOG="logs/publish.log"
mkdir -p logs

# Routine progress lines go to the log file + stdout. Errors go to
# ts_err (log file + stderr). Previously every line was teed to stderr,
# so launchd's StandardErrorPath (logs/publish.err.log) filled with a
# routine "skip: no unpublished delta" line every tick — burying real
# errors and growing the err log unbounded.
ts_log() { printf '%s publish-if-delta.sh: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }
ts_err() { printf '%s publish-if-delta.sh: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

read_state() {
  venv/bin/python - <<'PY'
from pathlib import Path
import sqlite3

db = Path('threads_watcher.db')
cursor_path = Path('.sync_cursor')

def read_cursor():
    try:
        return max(0, int(cursor_path.read_text().strip()))
    except Exception:
        return 0

conn = sqlite3.connect(db)
max_id = conn.execute('select coalesce(max(id), 0) from posts').fetchone()[0]
cursor = read_cursor()
print(max_id, cursor, max_id - cursor)
PY
}

state_before=$(read_state) || { ts_err "ERROR: failed to read DB/cursor state"; exit 1; }
read -r db_max_before cursor_before delta_before <<< "$state_before"

if [ "${delta_before:-0}" -le 0 ]; then
  ts_log "skip: no unpublished delta (db_max=$db_max_before cursor=$cursor_before)"
  exit 0
fi

ts_log "delta detected: db_max=$db_max_before cursor=$cursor_before delta=$delta_before"

# --window 0 intentionally ignores transient partial_error checks. Those
# partials mean the live Threads page returned fewer visible cards than usual;
# already-saved DB posts remain valid, and blocking publication here makes the
# public page stale even though monitoring is working.
#
# Capture sync.py's output (it mirrors every log line to stderr via
# --tee-stderr) so a guard SKIP reason can be surfaced precisely below,
# then re-emit it so launchd's StandardErrorPath still receives it.
sync_out=$(venv/bin/python sync.py \
  --confirm \
  --enable-push \
  --min-gap-sec 0 \
  --window 0 \
  --max-log-bytes 1048576 \
  --log-backup-count 5 \
  --tee-stderr 2>&1)
sync_rc=$?
[ -n "$sync_out" ] && printf '%s\n' "$sync_out" >&2
if [ "$sync_rc" -ne 0 ]; then
  ts_err "ERROR: sync.py failed (exit=$sync_rc) — see logs/sync.log"
  exit 1
fi

state_after=$(read_state) || { ts_err "ERROR: failed to read DB/cursor after sync"; exit 1; }
read -r db_max_after cursor_after delta_after <<< "$state_after"

if [ "$cursor_after" -lt "$db_max_before" ]; then
  # sync.py exited 0 but the cursor did not advance. Under these flags
  # (--min-gap-sec 0 --window 0) the only exit-0 non-advance path is a
  # guard skip — in practice snapshot_sanity_check refusing to publish a
  # corrupt or field-leaking state.json. The old message blamed the
  # "cursor", sending operators to the DB/cursor logic when the real
  # cause is whatever the guard reported. Surface the guard's own SKIP
  # reason (logged by sync.py as `guard: SKIP | <reason>`) instead.
  skip_reason=$(printf '%s\n' "$sync_out" | grep -E 'guard: SKIP' | tail -1 | sed 's/.*guard: SKIP | //')
  ts_err "ERROR: snapshot guard blocked the sync — public page not updated: ${skip_reason:-<no guard reason captured; see logs/sync.log> (db=$db_max_before cursor=$cursor_after)}"
  exit 1
fi

ts_log "sync complete: db_max=$db_max_after cursor=$cursor_after delta=$delta_after; deploying"

if ! ./threads-watcher-status/deploy.sh 2>&1 | tee -a "$LOG"; then
  ts_err "ERROR: deploy failed"
  exit 1
fi

ts_log "publish complete"
