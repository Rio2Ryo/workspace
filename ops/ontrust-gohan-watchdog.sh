#!/usr/bin/env bash
set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

LOG_DIR="${HOME}/.openclaw/logs"
LOG_FILE="${LOG_DIR}/ontrust-gohan-watchdog.log"
mkdir -p "$LOG_DIR"

log() {
  printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >>"$LOG_FILE"
}

ensure_local_forward() {
  if curl -fsS --max-time 5 http://127.0.0.1:3036/health >/dev/null 2>&1; then
    return 0
  fi

  tmux kill-session -t gohanai-feed-forward >/dev/null 2>&1 || true
  tmux new-session -d -s gohanai-feed-forward \
    'ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -L 127.0.0.1:3036:127.0.0.1:3036 gohanai'
  sleep 2

  if curl -fsS --max-time 5 http://127.0.0.1:3036/health >/dev/null 2>&1; then
    log "local forward restored"
  else
    log "local forward still unhealthy"
  fi
}

ensure_remote() {
  ssh -o BatchMode=yes -o ConnectTimeout=8 gohanai 'bash -s' <<'REMOTE'
set -u

if ! systemctl --user is-active --quiet openclaw-gateway.service; then
  systemctl --user restart openclaw-gateway.service
fi

if ! curl -fsS --max-time 5 http://127.0.0.1:3036/health >/dev/null 2>&1; then
  tmux kill-session -t tmux-feed >/dev/null 2>&1 || true
  tmux new-session -d -s tmux-feed 'cd ~/.openclaw/tmux-feed && TMUX_FEED_PORT=3036 TMUX_FEED_TOKEN= node server.mjs'
fi
REMOTE
}

main() {
  if ensure_remote >>"$LOG_FILE" 2>&1; then
    log "remote check ok"
  else
    log "remote check failed"
    exit 1
  fi

  ensure_local_forward

  if curl -fsS --max-time 8 https://however-onto-spin-arrow.trycloudflare.com/sessions >/dev/null 2>&1; then
    log "public feed ok"
  else
    log "public feed failed"
    exit 1
  fi
}

main "$@"
