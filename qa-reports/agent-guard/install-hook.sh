#!/usr/bin/env bash
# Install pre-commit-hook.sh into a target git repo (or submodule).
#
# Backs up any existing .git/hooks/pre-commit to .pre-commit.bak.<ts>
# so the install is reversible.
#
# Usage:
#   ./install-hook.sh --repo <path> [--force]
#
# --force: overwrite existing hook without backup prompt
#
# Submodule note: submodules use .git as a file (not a directory) that
# points to the real gitdir. The script handles both layouts.

set -euo pipefail

REPO=""
FORCE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help)
      sed -n '2,14p' "$0" >&2
      exit 2
      ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$REPO" ] || { echo "ERROR: --repo required" >&2; exit 2; }
[ -d "$REPO" ] || { echo "ERROR: $REPO is not a directory" >&2; exit 2; }

# Resolve the real gitdir (handles both regular and submodule layouts).
GITDIR=$(git -C "$REPO" rev-parse --git-dir)
case "$GITDIR" in
  /*) HOOKDIR="$GITDIR/hooks" ;;
  *)  HOOKDIR="$REPO/$GITDIR/hooks" ;;
esac

mkdir -p "$HOOKDIR"
TARGET="$HOOKDIR/pre-commit"

SOURCE_HOOK="$(cd "$(dirname "$0")" && pwd)/pre-commit-hook.sh"
[ -f "$SOURCE_HOOK" ] || { echo "ERROR: pre-commit-hook.sh missing next to installer" >&2; exit 1; }

if [ -f "$TARGET" ] && [ "$FORCE" != 1 ]; then
  BACKUP="$TARGET.bak.$(date +%Y%m%d_%H%M%S)"
  cp "$TARGET" "$BACKUP"
  echo "backed up existing hook → $BACKUP"
fi

cp "$SOURCE_HOOK" "$TARGET"
chmod +x "$TARGET"
echo "installed pre-commit hook → $TARGET"
echo
echo "To verify, try a commit; the hook will print"
echo "  stage-budget: ... all staged files within budget."
echo "or refuse with an ABORT message and exit=1."
echo
echo "To declare per-file budgets, either:"
echo "  AGENT_STAGE_BUDGET=\"path:N,...\" git commit ..."
echo "or create $REPO/.agent-stage-budget with 'path:N' per line."
