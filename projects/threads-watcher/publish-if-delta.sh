#!/usr/bin/env bash
# Commit/push/deploy public threads-watcher status when the SQLite DB has
# posts that are not yet published. Intended for launchd.

set -uo pipefail

cd "$(dirname "$0")"

LOG="logs/publish.log"
mkdir -p logs

ts_log() { printf '%s publish-if-delta.sh: %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG" >&2; }

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

state_before=$(read_state) || { ts_log "ERROR: failed to read DB/cursor state"; exit 1; }
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
if ! venv/bin/python sync.py \
  --confirm \
  --enable-push \
  --min-gap-sec 0 \
  --window 0 \
  --max-log-bytes 1048576 \
  --log-backup-count 5 \
  --tee-stderr; then
  ts_log "ERROR: sync.py failed or guards blocked"
  exit 1
fi

state_after=$(read_state) || { ts_log "ERROR: failed to read DB/cursor after sync"; exit 1; }
read -r db_max_after cursor_after delta_after <<< "$state_after"

if [ "$cursor_after" -lt "$db_max_before" ]; then
  ts_log "ERROR: sync did not advance cursor enough (before_db=$db_max_before after_cursor=$cursor_after after_db=$db_max_after)"
  exit 1
fi

ts_log "sync complete: db_max=$db_max_after cursor=$cursor_after delta=$delta_after; deploying"

if ! ./threads-watcher-status/deploy.sh 2>&1 | tee -a "$LOG" >&2; then
  ts_log "ERROR: deploy failed"
  exit 1
fi

ts_log "publish complete"
