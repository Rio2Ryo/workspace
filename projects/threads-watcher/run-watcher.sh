#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source venv/bin/activate
export THREADS_WATCHER_NOTIFY_CHANNEL="${THREADS_WATCHER_NOTIFY_CHANNEL:-discord}"
export THREADS_WATCHER_NOTIFY_TARGET="${THREADS_WATCHER_NOTIFY_TARGET:-channel:1505544095274238192}"
export THREADS_WATCHER_NOTIFY_HANDLES="${THREADS_WATCHER_NOTIFY_HANDLES:-@bmw_intokyo}"
# PYTHONUNBUFFERED: launchd/nohup redirect stdout to logs/watcher.log,
# a non-TTY, so Python block-buffers stdout. When the watcher is killed
# hard (SIGKILL — OOM, or restart-watcher.sh's escalation), the buffer
# is lost: the `[watch]` startup line and any error never reach the
# log. That made a 29-restart/day crash loop undiagnosable. Unbuffered
# output is flushed line-by-line, so the next crash leaves a trail.
export PYTHONUNBUFFERED=1

# Baseline-lookback dial. The watcher's `partial_error` heuristic
# compares this run's found_count against MAX(found_count) WHERE
# status='ok' for the handle. The all-time MAX is sticky: a one-off
# historical peak (e.g. @hal.lifedesign returned 16 on 2026-05-29,
# then permanently settled at 15) causes every subsequent check to
# trip partial_error. Default 7 days so the rolling baseline
# reflects the current steady state; override with
# THREADS_WATCHER_BASELINE_LOOKBACK_DAYS=0 to restore all-time
# behaviour. health.py:110-141 documents the rationale.
export THREADS_WATCHER_BASELINE_LOOKBACK_DAYS="${THREADS_WATCHER_BASELINE_LOOKBACK_DAYS:-7}"
BASELINE_LOOKBACK_ARGS=()
if [ -n "${THREADS_WATCHER_BASELINE_LOOKBACK_DAYS:-}" ]; then
  BASELINE_LOOKBACK_ARGS=(--baseline-lookback-days "${THREADS_WATCHER_BASELINE_LOOKBACK_DAYS}")
fi

# `${arr[@]+"${arr[@]}"}` form: expand only if the array is defined.
# Plain `"${arr[@]}"` would crash under `set -u` when the array is
# empty (Bash treats unset element expansion as unbound) — caught
# by test_default_does_not_pass_baseline_lookback_arg below.
exec python -u watcher.py --watch --interval "${THREADS_WATCHER_INTERVAL:-60}" ${BASELINE_LOOKBACK_ARGS[@]+"${BASELINE_LOOKBACK_ARGS[@]}"}
