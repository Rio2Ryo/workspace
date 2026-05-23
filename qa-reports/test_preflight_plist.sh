#!/usr/bin/env bash
# Integration tests for preflight-plist.sh — operator-time guard
# against installing a half-edited plist.
#
# Strategy: drive the script against synthesized plists in tmp +
# the real repo plists, assert exit codes + stderr content.

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREFLIGHT="$SCRIPT_DIR/preflight-plist.sh"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PASS=0
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

assert_exit() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: $name (exit=$actual)"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name (expected exit=$expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    green "  PASS: $name (contains '$needle')"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name (missing '$needle')"
    red   "    haystack: ${haystack:0:300}"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local name="$1" needle="$2" haystack="$3"
  if printf '%s' "$haystack" | grep -qF -- "$needle"; then
    red   "  FAIL: $name (unexpectedly contains '$needle')"
    FAIL=$((FAIL + 1))
  else
    green "  PASS: $name (correctly absent '$needle')"
    PASS=$((PASS + 1))
  fi
}

TMP=$(mktemp -d)
trap "rm -rf '$TMP'" EXIT

# ── case 1: bad invocation ─────────────────────────────────────────────

printf '\n=== bad invocation ===\n'

"$PREFLIGHT" 2>/dev/null
assert_exit "no args exits 2" 2 $?

"$PREFLIGHT" --unknown-flag 2>/dev/null
assert_exit "unknown flag exits 2" 2 $?

"$PREFLIGHT" /nonexistent/path 2>/dev/null
assert_exit "missing file exits 1" 1 $?

# Help is treated as a valid invocation per CLI conventions (exit 0).
"$PREFLIGHT" --help >/dev/null 2>&1
assert_exit "--help exits 0" 0 $?

# ── case 2: live plists in the repo (should all pass preflight) ────────

printf '\n=== live plists from repo ===\n'

"$PREFLIGHT" --check-only "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-sync.plist" >/dev/null 2>&1
assert_exit "sync.plist passes preflight" 0 $?

"$PREFLIGHT" --check-only "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-auto-restart.plist" >/dev/null 2>&1
assert_exit "auto-restart.plist passes preflight" 0 $?

# ── case 3: template with unfilled placeholder MUST fail ───────────────

printf '\n=== template with __SET_BY_OPERATOR__ ===\n'

"$PREFLIGHT" --check-only "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-discord-post.plist.example" >/dev/null 2>&1
assert_exit "discord-post template with placeholder fails" 1 $?

# Verify the failure mode is specifically the placeholder check.
OUTPUT=$("$PREFLIGHT" --check-only "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-discord-post.plist.example" 2>&1 || true)
assert_contains "placeholder failure surfaces in stderr" "__SET_BY_OPERATOR__" "$OUTPUT"

# ── case 4: synthesized plist with placeholder REMOVED ─────────────────

printf '\n=== template after operator edits out placeholder ===\n'

# Simulate the operator's edit by sed-replacing the placeholder
# with a real URL shape.
sed 's/__SET_BY_OPERATOR__/https:\/\/discord.com\/api\/webhooks\/123\/abc/' \
  "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-discord-post.plist.example" \
  > "$TMP/operator-edited.plist"

"$PREFLIGHT" --check-only "$TMP/operator-edited.plist" >/dev/null 2>&1
assert_exit "operator-edited plist passes" 0 $?

# Verify no FAIL lines emitted.
OUTPUT=$("$PREFLIGHT" --check-only "$TMP/operator-edited.plist" 2>&1)
assert_not_contains "no FAIL lines for valid edited plist" "FAIL:" "$OUTPUT"

# ── case 5: synthesized plist with bogus script path ──────────────────

printf '\n=== plist pointing at nonexistent script ===\n'

cat > "$TMP/bad-script.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.shiro.test-bad-script</string>
  <key>ProgramArguments</key>
  <array>
    <string>/nonexistent/path/to/script.sh</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/tmp</string>
</dict>
</plist>
EOF

"$PREFLIGHT" --check-only "$TMP/bad-script.plist" >/dev/null 2>&1
assert_exit "plist with missing script fails" 1 $?

OUTPUT=$("$PREFLIGHT" --check-only "$TMP/bad-script.plist" 2>&1 || true)
assert_contains "missing script error surfaces" "does NOT exist" "$OUTPUT"

# ── case 6: synthesized plist with bogus WorkingDirectory ─────────────

printf '\n=== plist with bogus WorkingDirectory ===\n'

cat > "$TMP/bad-wd.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.shiro.test-bad-wd</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/echo</string>
  </array>
  <key>WorkingDirectory</key>
  <string>/nonexistent/working/dir</string>
</dict>
</plist>
EOF

"$PREFLIGHT" --check-only "$TMP/bad-wd.plist" >/dev/null 2>&1
assert_exit "plist with missing WorkingDirectory fails" 1 $?

# ── case 7: install-command emission only without --check-only ────────

printf '\n=== install command emission ===\n'

OUTPUT=$("$PREFLIGHT" --check-only "$TMP/operator-edited.plist" 2>&1)
assert_not_contains "--check-only mode emits no launchctl command" "launchctl load" "$OUTPUT"

OUTPUT=$("$PREFLIGHT" "$TMP/operator-edited.plist" 2>&1)
assert_contains "default mode prints launchctl load command" "launchctl load -w" "$OUTPUT"
assert_contains "command names the actual Label" "com.shiro.threads-watcher-discord-post" "$OUTPUT"

# ── case 8: Discord webhook URL shape validation (paste-typo catch) ────

printf '\n=== Discord webhook URL shape validation ===\n'

_make_plist_with_webhook() {
  local url="$1" target="$2"
  sed "s|__SET_BY_OPERATOR__|$(printf '%s' "$url" | sed 's:[\\&/]:\\&:g')|" \
    "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-discord-post.plist.example" \
    > "$target"
}

# Valid Discord URL → preflight passes.
_make_plist_with_webhook 'https://discord.com/api/webhooks/1234567890/abcXYZ_-tok' \
  "$TMP/valid-url.plist"
"$PREFLIGHT" --check-only "$TMP/valid-url.plist" >/dev/null 2>&1
assert_exit "valid Discord webhook URL passes" 0 $?

OUTPUT=$("$PREFLIGHT" --check-only "$TMP/valid-url.plist" 2>&1)
assert_contains "valid URL emits shape-valid pass line" "shape valid" "$OUTPUT"
# 🔒 Defense-in-depth: token MUST NOT leak into preflight output
# (logs end up in pasteable runbooks; redact at the source).
assert_not_contains "valid URL token NOT logged (secret)" "abcXYZ_-tok" "$OUTPUT"

# 🔒 Domain typo: discrd.com (missing 'o') → fail.
_make_plist_with_webhook 'https://discrd.com/api/webhooks/123/tok' \
  "$TMP/typo-domain.plist"
"$PREFLIGHT" --check-only "$TMP/typo-domain.plist" >/dev/null 2>&1
assert_exit "domain-typo URL fails" 1 $?

# 🔒 Wrong path: missing /api/ segment → fail.
_make_plist_with_webhook 'https://discord.com/webhooks/123/tok' \
  "$TMP/wrong-path.plist"
"$PREFLIGHT" --check-only "$TMP/wrong-path.plist" >/dev/null 2>&1
assert_exit "wrong-path URL (missing /api/) fails" 1 $?

# 🔒 Missing token segment.
_make_plist_with_webhook 'https://discord.com/api/webhooks/123' \
  "$TMP/no-token.plist"
"$PREFLIGHT" --check-only "$TMP/no-token.plist" >/dev/null 2>&1
assert_exit "URL missing token segment fails" 1 $?

# 🔒 Operator forgot to actually paste the URL.
_make_plist_with_webhook 'my-webhook-url' \
  "$TMP/forgot-paste.plist"
"$PREFLIGHT" --check-only "$TMP/forgot-paste.plist" >/dev/null 2>&1
assert_exit "non-URL value (operator forgot to paste) fails" 1 $?

# 🔒 Error message names the env var so operator knows what to fix.
OUTPUT=$("$PREFLIGHT" --check-only "$TMP/typo-domain.plist" 2>&1 || true)
assert_contains "typo error names the env var" "THREADS_WATCHER_DISCORD_WEBHOOK_URL" "$OUTPUT"
# 🔒 Error message MUST NOT leak the (possibly partial) URL — operator
# might be triaging via a log pipe to channel / Slack, and even the
# typo'd URL could be sensitive.
assert_not_contains "typo error does NOT leak URL value" "discrd.com" "$OUTPUT"

# Plists WITHOUT the webhook URL key are unaffected (sync plist
# doesn't use Discord). Regression guard: don't accidentally extend
# the check to non-Discord plists.
"$PREFLIGHT" --check-only "$REPO_ROOT/projects/threads-watcher/com.shiro.threads-watcher-sync.plist" >/dev/null 2>&1
assert_exit "non-Discord plist still passes (no false positive)" 0 $?

# ── summary ────────────────────────────────────────────────────────────

printf '\n=== summary ===\n'
printf 'PASS: %d  FAIL: %d\n' "$PASS" "$FAIL"
if [ "$FAIL" -ne 0 ]; then
  red 'TESTS FAILED'
  exit 1
fi
green 'ALL TESTS PASSED'
exit 0
