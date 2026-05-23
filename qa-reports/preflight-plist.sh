#!/usr/bin/env bash
# Operator preflight for launchd plist install.
#
# Why this exists
# ---------------
# test_plist_log_routing.py + test_plist_xml_strict.py catch plist
# issues at COMMIT time. But operator workflow is:
#
#   cp projects/threads-watcher/com.shiro.foo.plist.example \
#      ~/Library/LaunchAgents/com.shiro.foo.plist
#   <edit-in-place to replace __SET_BY_OPERATOR__ with real value>
#   launchctl load -w ~/Library/LaunchAgents/com.shiro.foo.plist
#
# Between cp + launchctl load, operator can:
#   - forget to edit the placeholder → plist loads with literal
#     `__SET_BY_OPERATOR__` string as the value → discord_post.py
#     fails every cron tick with a URL parse error
#   - typo the URL → 404 / DNS error chain on every tick
#   - hit a path-shape mismatch (script moved between cp and load)
#
# This script runs the SAME invariants the CI tests check, but
# against the operator's about-to-install file, BEFORE launchctl
# load. No write access needed — pure read + validate.
#
# Usage
# -----
#   preflight-plist.sh <path-to-plist>            validate + print
#                                                 the launchctl cmd
#   preflight-plist.sh --check-only <path>        validate only
#
# Exit codes (matches the CLI conventions pinned by
# qa-reports/agent-guard/test_cli_conventions.py):
#   0  ready to install
#   1  invariant failed (offending check named in stderr)
#   2  invocation error (missing arg, bad path shape)

set -u  # error on unbound vars; intentionally NOT `set -e` so we
        # can report all invariant failures in one pass

usage() {
  printf 'Usage: %s [--check-only] <path-to-plist>\n' "$(basename "$0")" >&2
  printf '\n' >&2
  printf '  <path-to-plist>  Path to the plist to validate (either repo\n' >&2
  printf '                   template, copy in LaunchAgents, etc.)\n' >&2
  printf '  --check-only     Skip the launchctl-command output; just validate.\n' >&2
}

# --- Arg parsing -----------------------------------------------------

CHECK_ONLY=0
PLIST_PATH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      printf 'ERROR: unknown flag: %s\n' "$1" >&2
      usage
      exit 2
      ;;
    *)
      if [ -n "$PLIST_PATH" ]; then
        printf 'ERROR: only one plist path accepted\n' >&2
        usage
        exit 2
      fi
      PLIST_PATH="$1"
      shift
      ;;
  esac
done

if [ -z "$PLIST_PATH" ]; then
  usage
  exit 2
fi

if [ ! -f "$PLIST_PATH" ]; then
  printf 'ERROR: plist file not found: %s\n' "$PLIST_PATH" >&2
  exit 1
fi

# --- Invariant checks ------------------------------------------------

FAILED=0
fail() {
  printf 'FAIL: %s\n' "$1" >&2
  FAILED=1
}
pass() {
  printf 'OK:   %s\n' "$1"
}

# 1. XML validity (plutil — same parser launchd uses).
if command -v plutil >/dev/null 2>&1; then
  if plutil -lint "$PLIST_PATH" >/dev/null 2>&1; then
    pass "plist XML is well-formed (plutil -lint)"
  else
    LINT_ERR=$(plutil -lint "$PLIST_PATH" 2>&1 || true)
    fail "plist XML is malformed. plutil says: $LINT_ERR"
  fi
else
  # Linux dev box / CI without plutil — degrade to xmllint or skip.
  if command -v xmllint >/dev/null 2>&1; then
    if xmllint --noout "$PLIST_PATH" 2>/dev/null; then
      pass "plist XML is well-formed (xmllint fallback)"
    else
      fail "plist XML is malformed. xmllint reports a parse error."
    fi
  else
    printf 'WARN: neither plutil nor xmllint found; skipping XML lint\n' >&2
  fi
fi

# 2. Operator placeholders MUST be replaced. The template ships with
#    __SET_BY_OPERATOR__ as the unmistakable sentinel; loading a plist
#    that still contains it would silently fail at runtime.
if grep -qF "__SET_BY_OPERATOR__" "$PLIST_PATH"; then
  fail "plist still contains __SET_BY_OPERATOR__ placeholder — operator must replace it with the real value (e.g., Discord webhook URL) BEFORE launchctl load"
else
  pass "no __SET_BY_OPERATOR__ placeholder remaining"
fi

# 2b. Discord webhook URL shape validation. If the plist declares the
#     env var THREADS_WATCHER_DISCORD_WEBHOOK_URL, the value MUST be
#     either empty (dry-run mode) or a properly-shaped Discord webhook
#     URL. Catches operator-paste typos (https://discrd.com/...,
#     truncation, wrong path) at install time vs first cron tick.
#
#     Extract the value: lines like
#       <key>THREADS_WATCHER_DISCORD_WEBHOOK_URL</key>
#       <string>https://discord.com/api/webhooks/123/abc</string>
#     awk: when we see the key line, capture the NEXT <string> body.
WEBHOOK_VAL=$(awk '
  /<key>THREADS_WATCHER_DISCORD_WEBHOOK_URL<\/key>/ {found=1; next}
  found && /<string>/ {
    gsub(/.*<string>/, "")
    gsub(/<\/string>.*/, "")
    print
    exit
  }
' "$PLIST_PATH")

if [ -n "$WEBHOOK_VAL" ] && [ "$WEBHOOK_VAL" != "__SET_BY_OPERATOR__" ]; then
  # Valid Discord webhook shape: https://discord.com/api/webhooks/<id>/<token>
  # where id is digits and token is base64-url-safe (alphanumeric, _, -).
  # Older bash on macOS lacks =~; use grep -E for portability.
  if printf '%s' "$WEBHOOK_VAL" \
      | grep -qE '^https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'; then
    # Don't log the actual URL (token is secret); confirm shape only.
    pass "THREADS_WATCHER_DISCORD_WEBHOOK_URL shape valid (Discord webhook URL)"
  else
    # 🔒 Operator-paste typo. Common shapes that fail this check:
    #   - https://discrd.com/api/...   (domain typo)
    #   - https://discord.com/webhooks/...   (wrong path: missing /api/)
    #   - https://discord.com/api/webhooks/123   (missing token segment)
    #   - my-webhook-url   (forgot to paste actual URL)
    fail "THREADS_WATCHER_DISCORD_WEBHOOK_URL value doesn't match Discord webhook shape (https://discord.com/api/webhooks/<id>/<token>). Likely a paste typo or truncation — fix BEFORE launchctl load. (Value redacted to avoid exposing the token in logs.)"
  fi
fi

# 2c. discord_post.py CLI flag value validation. If the plist's
#     ProgramArguments uses --min-severity or --max-retries, validate
#     the value matches what discord_post.py argparse accepts. Catches
#     operator typos in the plist that would fail first cron tick
#     with exit 2 (argparse "invalid choice") — same install-time-vs-
#     incident-time feedback gap the URL shape check (case 2b) closes.
ARG_LINES=$(awk '
  /<key>ProgramArguments<\/key>/ {capturing=1; next}
  capturing && /<\/array>/ {capturing=0}
  capturing && /<string>/ {
    gsub(/.*<string>/, "")
    gsub(/<\/string>.*/, "")
    print
  }
' "$PLIST_PATH")

# --min-severity must be one of: none, warn, err (per discord_post.py
# SEVERITY_ORDER in commit ce5ca04).
SEVERITY_VAL=""
prev_was_severity_flag=0
while IFS= read -r ARG; do
  [ -z "$ARG" ] && continue
  if [ "$prev_was_severity_flag" = 1 ]; then
    SEVERITY_VAL="$ARG"
    prev_was_severity_flag=0
  elif [ "$ARG" = "--min-severity" ]; then
    prev_was_severity_flag=1
  fi
done <<<"$ARG_LINES"
if [ -n "$SEVERITY_VAL" ]; then
  case "$SEVERITY_VAL" in
    none|warn|err)
      pass "--min-severity value valid: $SEVERITY_VAL"
      ;;
    *)
      fail "--min-severity=$SEVERITY_VAL is not a valid choice (must be one of: none, warn, err). discord_post.py would exit 2 every cron tick. Fix BEFORE launchctl load."
      ;;
  esac
fi

# --max-retries must be a non-negative integer (per discord_post.py
# argparse type=int in commit 334c6cb; range [0, ...]).
RETRIES_VAL=""
prev_was_retries_flag=0
while IFS= read -r ARG; do
  [ -z "$ARG" ] && continue
  if [ "$prev_was_retries_flag" = 1 ]; then
    RETRIES_VAL="$ARG"
    prev_was_retries_flag=0
  elif [ "$ARG" = "--max-retries" ]; then
    prev_was_retries_flag=1
  fi
done <<<"$ARG_LINES"
if [ -n "$RETRIES_VAL" ]; then
  # awk-based numeric + non-negative check (same pattern as
  # restart-watcher.sh's THREADS_WATCHER_RESTART_*_WAIT_SEC validation
  # in commit 9bfcfc7).
  if awk -v v="$RETRIES_VAL" 'BEGIN{exit !(v ~ /^[0-9]+$/)}'; then
    pass "--max-retries value valid: $RETRIES_VAL"
  else
    fail "--max-retries=$RETRIES_VAL must be a non-negative integer. discord_post.py argparse would exit 2 every cron tick. Fix BEFORE launchctl load."
  fi
fi

# --cooldown must be a non-negative integer seconds (per discord_post.py
# argparse type=int in commit 23ef7fc; range [0, ...] with 0 = disabled).
# Common operator typo: writing "6h" or "21600s" instead of plain int.
COOLDOWN_VAL=""
prev_was_cooldown_flag=0
while IFS= read -r ARG; do
  [ -z "$ARG" ] && continue
  if [ "$prev_was_cooldown_flag" = 1 ]; then
    COOLDOWN_VAL="$ARG"
    prev_was_cooldown_flag=0
  elif [ "$ARG" = "--cooldown" ]; then
    prev_was_cooldown_flag=1
  fi
done <<<"$ARG_LINES"
if [ -n "$COOLDOWN_VAL" ]; then
  if awk -v v="$COOLDOWN_VAL" 'BEGIN{exit !(v ~ /^[0-9]+$/)}'; then
    pass "--cooldown value valid: $COOLDOWN_VAL"
  else
    # Likely operator slips: "6h", "21600s", "1hour", spelled words.
    fail "--cooldown=$COOLDOWN_VAL must be a non-negative integer seconds (e.g., 21600 for 6h, NOT '6h' or '21600s'). discord_post.py argparse would exit 2 every cron tick. Fix BEFORE launchctl load."
  fi
fi

# 3. ProgramArguments paths must resolve. Extract every <string>
#    inside <key>ProgramArguments</key>'s <array> via plutil if
#    available, fall back to grep heuristic.
PROGRAM_TARGETS=""
if command -v plutil >/dev/null 2>&1; then
  # Convert plist to JSON, then jq to extract ProgramArguments.
  # jq not always available; fall back to grep-based extraction.
  if command -v jq >/dev/null 2>&1; then
    PROGRAM_TARGETS=$(plutil -convert json -o - -- "$PLIST_PATH" 2>/dev/null \
      | jq -r '.ProgramArguments[]?' 2>/dev/null || true)
  fi
fi

if [ -z "$PROGRAM_TARGETS" ]; then
  # Heuristic fallback: <string>/abs/path/...</string> lines between
  # ProgramArguments and the next </array>. Good enough for the
  # plists this repo ships.
  PROGRAM_TARGETS=$(awk '
    /<key>ProgramArguments<\/key>/ {capturing=1; next}
    capturing && /<\/array>/ {capturing=0}
    capturing && /<string>/ {
      gsub(/.*<string>/, "")
      gsub(/<\/string>.*/, "")
      print
    }
  ' "$PLIST_PATH")
fi

if [ -z "$PROGRAM_TARGETS" ]; then
  fail "could not extract ProgramArguments — plist may be malformed in a way the XML lint didn't catch"
else
  # First arg is the interpreter or script. If it starts with /, must
  # exist as a real file. Subsequent args may be flags (-x), not paths.
  FIRST_ARG=$(printf '%s\n' "$PROGRAM_TARGETS" | head -1)
  if [ -n "$FIRST_ARG" ] && [ "${FIRST_ARG:0:1}" = "/" ]; then
    if [ -f "$FIRST_ARG" ]; then
      pass "ProgramArguments[0] exists: $FIRST_ARG"
    else
      fail "ProgramArguments[0] does NOT exist: $FIRST_ARG (launchd would fail every tick with 'no such file')"
    fi
  fi
  # Walk subsequent args; any that look like absolute paths (start
  # with /) must exist as a file.
  while IFS= read -r ARG; do
    [ -z "$ARG" ] && continue
    [ "$ARG" = "$FIRST_ARG" ] && continue
    case "$ARG" in
      /*)
        if [ -f "$ARG" ]; then
          pass "ProgramArguments path exists: $ARG"
        else
          fail "ProgramArguments path does NOT exist: $ARG"
        fi
        ;;
    esac
  done <<<"$PROGRAM_TARGETS"
fi

# 4. WorkingDirectory must exist (else state.json relative paths
#    inside scripts won't resolve).
WD=$(awk '
  /<key>WorkingDirectory<\/key>/ {found=1; next}
  found && /<string>/ {
    gsub(/.*<string>/, "")
    gsub(/<\/string>.*/, "")
    print
    exit
  }
' "$PLIST_PATH")
if [ -n "$WD" ]; then
  if [ -d "$WD" ]; then
    pass "WorkingDirectory exists: $WD"
  else
    fail "WorkingDirectory does NOT exist: $WD"
  fi
fi

# 5. Label must be present (launchctl identifies the job by Label).
LABEL=$(awk '
  /<key>Label<\/key>/ {found=1; next}
  found && /<string>/ {
    gsub(/.*<string>/, "")
    gsub(/<\/string>.*/, "")
    print
    exit
  }
' "$PLIST_PATH")
if [ -n "$LABEL" ]; then
  pass "Label present: $LABEL"
else
  fail "no <key>Label</key> found — launchctl cannot identify the job"
fi

# 6. If a target already exists in ~/Library/LaunchAgents, warn but
#    don't fail (operator might be reinstalling).
# $LAUNCHAGENTS_DIR override (default: $HOME/Library/LaunchAgents) for
# tests; operator always wants the system path.
LAUNCHAGENTS_DIR="${LAUNCHAGENTS_DIR:-$HOME/Library/LaunchAgents}"
if [ -n "$LABEL" ]; then
  TARGET="$LAUNCHAGENTS_DIR/${LABEL}.plist"
  if [ -f "$TARGET" ]; then
    printf 'NOTE: %s/%s.plist already exists.\n' "$LAUNCHAGENTS_DIR" "$LABEL"
    printf '      If installing a new version, unload first:\n'
    printf '        launchctl unload -w %s\n' "$TARGET"
  fi
fi

# 7. Mutex-group install-time conflict detection.
#
# Some plists are documented as mutually exclusive (e.g.,
# sticky-regime-alert vs sticky-alert-discord both run the same
# diagnose-on-cron; enabling both double-fires every transition,
# bidirectional docstring lint enforces that the warning exists in
# both — commit 5c921fa). The docstring is operator-FACING; this
# check is operator-PROACTIVE: warn at install time if a conflicting
# plist is already in $LAUNCHAGENTS_DIR.
#
# Pinned mutex groups (each group = labels that can't coexist):
#   sticky-regime-alert ⇄ sticky-alert-discord
#
# Hardcoded list is fine — adding a new mutex group requires
# deliberate code change. Auto-detection from docstrings would over-
# trigger; explicit list keeps the operator-facing warning
# trustworthy.
declare_mutex_group() {
  # Echo the OTHER mutex member(s) for a given Label, one per line.
  case "$1" in
    com.shiro.threads-watcher-sticky-regime-alert)
      echo com.shiro.threads-watcher-sticky-alert-discord
      ;;
    com.shiro.threads-watcher-sticky-alert-discord)
      echo com.shiro.threads-watcher-sticky-regime-alert
      ;;
  esac
}
if [ -n "$LABEL" ]; then
  CONFLICTS=$(declare_mutex_group "$LABEL")
  if [ -n "$CONFLICTS" ]; then
    while IFS= read -r OTHER; do
      [ -z "$OTHER" ] && continue
      OTHER_TARGET="$LAUNCHAGENTS_DIR/${OTHER}.plist"
      if [ -f "$OTHER_TARGET" ]; then
        # WARN (not fail) — operator may have deliberate reason to
        # have both during a brief migration window.
        printf 'WARN: mutex conflict with already-installed %s.plist\n' "$OTHER" >&2
        printf '       Both run sticky_regime_diagnosis hourly; enabling\n' >&2
        printf '       both will double-fire on every transition.\n' >&2
        printf '       Either unload the other plist before loading this one:\n' >&2
        printf '         launchctl unload -w %s\n' "$OTHER_TARGET" >&2
        printf '         rm %s\n' "$OTHER_TARGET" >&2
        printf '       OR override deliberately if you know what you are doing.\n' >&2
      fi
    done <<<"$CONFLICTS"
  fi
fi

if [ "$FAILED" -ne 0 ]; then
  printf '\n' >&2
  printf 'One or more invariants failed. Do NOT launchctl load this plist —\n' >&2
  printf 'every cron tick would fail silently. Fix the offenders first.\n' >&2
  exit 1
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  printf '\nall invariants pass (check-only mode, no commands emitted)\n'
  exit 0
fi

# --- Emit the install commands --------------------------------------

if [ -n "$LABEL" ]; then
  TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"
  cat <<EOF

all invariants pass — paste these commands to install:

# 1. Copy the validated plist into the LaunchAgents directory
#    (only needed if you validated the repo template; skip if you
#    already cp'd and validated the copy):
cp "$PLIST_PATH" "$TARGET"

# 2. Load + enable (the -w flag persists across reboots):
launchctl load -w "$TARGET"

# 3. Verify the job is registered:
launchctl list | grep $LABEL

# Uninstall (rollback) if needed:
#   launchctl unload -w "$TARGET"
#   rm "$TARGET"
EOF
fi
