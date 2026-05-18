#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source venv/bin/activate
exec python watcher.py --watch --interval "${THREADS_WATCHER_INTERVAL:-60}"
