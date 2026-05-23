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
if [ -n "$LABEL" ]; then
  TARGET="$HOME/Library/LaunchAgents/${LABEL}.plist"
  if [ -f "$TARGET" ]; then
    printf 'NOTE: ~/Library/LaunchAgents/%s.plist already exists.\n' "$LABEL"
    printf '      If installing a new version, unload first:\n'
    printf '        launchctl unload -w %s\n' "$TARGET"
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
