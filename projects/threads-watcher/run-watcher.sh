#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source venv/bin/activate
export THREADS_WATCHER_NOTIFY_CHANNEL="${THREADS_WATCHER_NOTIFY_CHANNEL:-discord}"
export THREADS_WATCHER_NOTIFY_TARGET="${THREADS_WATCHER_NOTIFY_TARGET:-channel:1505544095274238192}"
export THREADS_WATCHER_NOTIFY_HANDLES="${THREADS_WATCHER_NOTIFY_HANDLES:-@bmw_intokyo,@hal.lifedesign}"
# PYTHONUNBUFFERED: launchd/nohup redirect stdout to logs/watcher.log,
# a non-TTY, so Python block-buffers stdout. When the watcher is killed
# hard (SIGKILL — OOM, or restart-watcher.sh's escalation), the buffer
# is lost: the `[watch]` startup line and any error never reach the
# log. That made a 29-restart/day crash loop undiagnosable. Unbuffered
# output is flushed line-by-line, so the next crash leaves a trail.
export PYTHONUNBUFFERED=1
exec python -u watcher.py --watch --interval "${THREADS_WATCHER_INTERVAL:-60}"
