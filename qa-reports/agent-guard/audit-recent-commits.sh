#!/usr/bin/env bash
# Retroactive auditor: scan recent commits for a "small-prefix subject
# with prod-code heavy diff" pattern — the typical shape of an agent
# `git add <file>` accidentally bundling a collaborator's unstaged WIP
# under a misleadingly-small subject like "test: pin X".
#
# Discriminator (refined after the v1 had high false-positive on
# legitimate large test-file additions): a commit prefixed `test:`,
# `chore:`, `docs:`, etc. is ALLOWED to add hundreds of lines as long
# as the additions are confined to test files. The smell is when the
# commit ALSO modifies non-test production source files significantly.
#
# Usage:
#   ./audit-recent-commits.sh --repo <path> [--last <N>] [--max-prod-lines <N>]
#
# Defaults: last=10 commits, max-prod-lines=100 in prod files under
# a small-prefix subject.

set -euo pipefail

REPO=""
LAST=10
MAX_LINES=100

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --last) LAST="$2"; shift 2 ;;
    --max-prod-lines|--max-changed-lines) MAX_LINES="$2"; shift 2 ;;
    -h|--help) sed -n '2,16p' "$0" >&2; exit 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -n "$REPO" ] || { echo "ERROR: --repo required" >&2; exit 2; }
[ -d "$REPO/.git" ] || [ -f "$REPO/.git" ] || {
  echo "ERROR: $REPO is not a git working tree" >&2
  exit 2
}

# Conventional-commits regex: `^test:`, `^test(api):`, `^chore(api):`, ...
SMALL_PREFIXES_REGEX='^(test|chore|docs|style|refactor)(\([^)]+\))?:'

# Production source patterns vs test-file patterns. Tests can legitimately
# add lots of lines under a `test:` subject; prod files cannot.
is_prod_file() {
  case "$1" in
    *.test.ts|*.test.tsx|*.test.js|*.spec.ts|*.spec.js) return 1 ;;
    */tests/*|*/__tests__/*|*/test/*) return 1 ;;
    *.ts|*.tsx|*.js|*.mjs|*.sql|*.py) return 0 ;;
    *) return 1 ;;
  esac
}

# Sum +/- content lines across the prod files in a single commit.
prod_line_count() {
  local sha="$1"
  local total=0 f n
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    is_prod_file "$f" || continue
    n=$(git -C "$REPO" show "$sha" -- "$f" | (grep -cE '^[+-][^+-]' || true) | tr -d ' ')
    total=$((total + n))
  done < <(git -C "$REPO" show "$sha" --name-only --format='' | sed '/^$/d')
  echo "$total"
}

echo "=== Auditing last $LAST commits in $REPO ==="
echo "=== Flagging when subject matches $SMALL_PREFIXES_REGEX AND prod-file diff > $MAX_LINES lines ==="
echo

# Sweep 1: emit per-commit findings.
git -C "$REPO" log -"$LAST" --format='%H%x09%s' | while IFS=$'\t' read -r sha subject; do
  echo "$subject" | grep -qE "$SMALL_PREFIXES_REGEX" || continue
  prod=$(prod_line_count "$sha")
  if [ "$prod" -gt "$MAX_LINES" ]; then
    echo "FLAG  $sha  (${prod} prod-code lines under a small-prefix subject)"
    echo "      subject: $subject"
    echo "      prod files modified:"
    git -C "$REPO" show "$sha" --name-only --format='' | sed '/^$/d' | while IFS= read -r f; do
      is_prod_file "$f" && echo "        $f"
    done
    echo "      → review with: git -C $REPO show $sha"
    echo "      → if collaborator-WIP-mixup, revert with:"
    echo "        git -C $REPO revert --no-edit $sha"
    echo
  fi
done

# Sweep 2: re-derive the count for the summary (sweep 1 ran in a subshell
# so its variables don't escape).
flagged=$(git -C "$REPO" log -"$LAST" --format='%H%x09%s' | while IFS=$'\t' read -r sha subject; do
  if echo "$subject" | grep -qE "$SMALL_PREFIXES_REGEX"; then
    n=$(prod_line_count "$sha")
    [ "$n" -gt "$MAX_LINES" ] && echo flag
  fi
done | wc -l | tr -d ' ')

echo "=== $flagged flagged commit(s) ==="
[ "$flagged" -eq 0 ] && exit 0 || exit 1
