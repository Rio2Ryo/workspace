#!/usr/bin/env bash
# Deploy threads-watcher-status to Vercel + verify the new build
# actually contains the local edits.
#
# Why this exists
# ---------------
# Vercel deployment for this project doesn't auto-fire on git push —
# it requires an explicit `vercel --prod`. On 2026-05-18 the public
# UI had been 2 days stale (last deploy 2026-05-16) while several
# rounds of UI improvements (sync_state card, 24h recent_stats card,
# ?window= URL param) sat in git unseen by operators. Without this
# script, an operator visiting the URL would still see the old
# layout even after pulling and rebuilding.
#
# What it does
# ------------
# 1. Sanity: assert local state.json exists and has the expected
#    fields we just added. Refuse to deploy a stripped-down payload
#    that would silently regress the UI.
# 2. Run `vercel --prod`. Capture the new deployment URL.
# 3. Verify the new URL's state.json contains the expected fields,
#    using `vercel curl` (so the auth-gated team deployment is
#    readable).
# 4. Report old → new snapshot_generated_at so operators see the
#    refresh.
#
# Exit codes
# ----------
#   0  deploy + verify succeeded
#   1  local state.json fails the pre-flight schema / privacy check
#   2  vercel --prod itself failed
#   3  post-deploy verification failed (deploy went through but the
#      payload is missing fields or leaks a private one)
#
# Usage
# -----
#   cd projects/threads-watcher/threads-watcher-status
#   ./deploy.sh
#
# Requires Vercel CLI authenticated to the
# `commongiftedtokyo/threads-watcher-status` project.

set -uo pipefail

cd "$(dirname "$0")"

STATE_JSON="state.json"

ts_log() { printf '%s deploy.sh: %s\n' "$(date -u +%FT%TZ)" "$*"; }

# ── 1. Pre-flight: local state.json has expected new fields ────────────
if [ ! -f "$STATE_JSON" ]; then
  ts_log "ERROR: $STATE_JSON not found in $(pwd)"
  ts_log "  (the watcher writes this file at every check — confirm watcher is running)"
  exit 1
fi

# Use python's json so we don't depend on jq. Required-field list mirrors
# the latest_snapshot/watcher payload contract — keep aligned with
# db.latest_snapshot if that grows.
REQUIRED_FIELDS_CSV="handle,last_check,saved_count,recent_stats,recent_stats_by_window,sync_state,snapshot_generated_at"
# Private fields that must NEVER reach the public page: raw screenshot
# bytes (privacy + payload size) and local filesystem paths (info
# disclosure). Mirrors sync_guards.FORBIDDEN_POST_KEYS — sync.py's
# snapshot_sanity_check enforces the same set, but deploy.sh is
# independently runnable AND the watcher may rewrite state.json between
# sync.py's check and this deploy, so this public-facing gate must
# re-verify rather than trust the upstream check.
FORBIDDEN_KEYS_CSV="screenshot_png,local_path"
# Classify the local payload: PARSE_ERROR (corrupt JSON), NOT_OBJECT
# (valid JSON but not a dict), MISSING:<fields>, LEAKED:<key>@<path>
# (a forbidden private field present anywhere in the tree), or OK.
# Mirrors the post-deploy REMOTE_VERIFY block below so a corrupt
# state.json gets a clear message instead of a Python traceback
# misreported as "missing required fields" — the old `2>&1` folded
# stderr into the field list.
PREFLIGHT=$(REQ="$REQUIRED_FIELDS_CSV" FORBIDDEN="$FORBIDDEN_KEYS_CSV" STATE="$STATE_JSON" python3 -c "
import json, os, sys
try:
    with open(os.environ['STATE']) as f:
        data = json.load(f)
except json.JSONDecodeError as e:
    print(f'PARSE_ERROR:{e}'); sys.exit(0)
if not isinstance(data, dict):
    print('NOT_OBJECT:' + type(data).__name__); sys.exit(0)
required = os.environ['REQ'].split(',')
missing = [k for k in required if k not in data]
if missing:
    print('MISSING:' + ','.join(missing)); sys.exit(0)
forbidden = set(os.environ['FORBIDDEN'].split(','))
def find_forbidden(node, trail):
    if isinstance(node, dict):
        for k, v in node.items():
            here = (trail + '.' + k) if trail else k
            if k in forbidden:
                return k, here
            hit = find_forbidden(v, here)
            if hit:
                return hit
    elif isinstance(node, list):
        for i, item in enumerate(node):
            hit = find_forbidden(item, trail + '[' + str(i) + ']')
            if hit:
                return hit
    return None
leak = find_forbidden(data, '')
print(('LEAKED:' + leak[0] + '@' + leak[1]) if leak else 'OK')
" 2>&1)
case "$PREFLIGHT" in
  OK) ;;
  MISSING:*)
    ts_log "ERROR: local $STATE_JSON missing required fields: ${PREFLIGHT#MISSING:}"
    ts_log "  (deploying this would regress the UI to an older shape)"
    exit 1 ;;
  LEAKED:*)
    ts_log "ERROR: local $STATE_JSON exposes a forbidden private field: ${PREFLIGHT#LEAKED:}"
    ts_log "  (raw screenshot bytes / local filesystem paths must never reach the public page)"
    exit 1 ;;
  PARSE_ERROR:*)
    ts_log "ERROR: local $STATE_JSON is not valid JSON: ${PREFLIGHT#PARSE_ERROR:}"
    exit 1 ;;
  NOT_OBJECT:*)
    ts_log "ERROR: local $STATE_JSON is not a JSON object (got ${PREFLIGHT#NOT_OBJECT:})"
    exit 1 ;;
  *)
    ts_log "ERROR: pre-flight check produced unexpected output: $PREFLIGHT"
    exit 1 ;;
esac

old_ts=$(python3 -c "import json; print(json.load(open('$STATE_JSON'))['snapshot_generated_at'])" 2>/dev/null || echo "?")
ts_log "pre-flight OK: local snapshot_generated_at=$old_ts"

# ── 2. Deploy ──────────────────────────────────────────────────────────
ts_log "running: vercel --prod"
DEPLOY_OUT=$(vercel --prod 2>&1)
DEPLOY_RC=$?
if [ $DEPLOY_RC -ne 0 ]; then
  ts_log "ERROR: vercel --prod exited $DEPLOY_RC"
  echo "$DEPLOY_OUT" | sed 's/^/  /'
  exit 2
fi

# Vercel prints the deployment URL as the last URL-shaped line in stdout.
NEW_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[a-z0-9-]+\.vercel\.app' | tail -1)
if [ -z "$NEW_URL" ]; then
  ts_log "ERROR: vercel didn't print a deployment URL"
  echo "$DEPLOY_OUT" | tail -10 | sed 's/^/  /'
  exit 2
fi
ts_log "deploy succeeded: $NEW_URL"

# ── 3. Verify the deployed state.json has the expected fields ──────────
# vercel curl uses CLI auth, so it can read team-restricted deployments.
ts_log "verifying deployed state.json shape..."
# vercel curl wants either a relative path against the linked project's
# CURRENT production deployment (which $NEW_URL just became) OR
# --deployment <id|url> + relative path. Use the latter so we verify
# THIS specific deployment, not whichever production happens to be live.
#
# `vercel curl` prints "Retrieving project…" + curl's progress meter to
# stdout(!) before the body. Strip everything before the first '{' so
# the JSON parser gets a clean payload. Send stderr to /dev/null.
RAW=$(vercel curl --deployment "$NEW_URL" /state.json 2>/dev/null)
REMOTE=$(printf '%s' "$RAW" | sed -n '/^{/,$p')
REMOTE_VERIFY=$(REQ="$REQUIRED_FIELDS_CSV" FORBIDDEN="$FORBIDDEN_KEYS_CSV" REMOTE="$REMOTE" python3 -c "
import json, os, sys
try:
  data = json.loads(os.environ['REMOTE'])
except json.JSONDecodeError as e:
  print(f'PARSE_ERROR:{e}')
  sys.exit(0)
required = os.environ['REQ'].split(',')
missing = [k for k in required if k not in data]
if missing:
  print('MISSING:' + ','.join(missing))
  sys.exit(0)
forbidden = set(os.environ['FORBIDDEN'].split(','))
def find_forbidden(node, trail):
    if isinstance(node, dict):
        for k, v in node.items():
            here = (trail + '.' + k) if trail else k
            if k in forbidden:
                return k, here
            hit = find_forbidden(v, here)
            if hit:
                return hit
    elif isinstance(node, list):
        for i, item in enumerate(node):
            hit = find_forbidden(item, trail + '[' + str(i) + ']')
            if hit:
                return hit
    return None
leak = find_forbidden(data, '')
if leak:
  print('LEAKED:' + leak[0] + '@' + leak[1])
else:
  print('OK:' + data.get('snapshot_generated_at', '?'))
" 2>&1)
case "$REMOTE_VERIFY" in
  OK:*)
    new_ts="${REMOTE_VERIFY#OK:}"
    ts_log "post-deploy OK: remote snapshot_generated_at=$new_ts"
    ts_log "old → new: $old_ts → $new_ts"
    exit 0
    ;;
  MISSING:*)
    ts_log "ERROR: deployed state.json missing fields: ${REMOTE_VERIFY#MISSING:}"
    ts_log "  (deploy went through but the payload doesn't match local — investigate)"
    exit 3
    ;;
  LEAKED:*)
    ts_log "ERROR: deployed state.json exposes a forbidden private field: ${REMOTE_VERIFY#LEAKED:}"
    ts_log "  (raw screenshot bytes / local filesystem paths are public on this deployment — investigate)"
    exit 3
    ;;
  PARSE_ERROR:*)
    ts_log "ERROR: deployed state.json didn't parse: ${REMOTE_VERIFY#PARSE_ERROR:}"
    ts_log "  raw body (first 200 chars):"
    echo "$REMOTE" | head -c 200 | sed 's/^/  /'
    exit 3
    ;;
  *)
    ts_log "ERROR: verify script produced unexpected output: $REMOTE_VERIFY"
    exit 3
    ;;
esac
