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

# Inspect a commit's --raw output to split staged paths into submodule
# (gitlink mode 160000) vs non-submodule. Returns two newline-separated
# lists via stdout, with submodules first, then a delimiter line `---`,
# then non-submodules. Callers use awk/sed to split.
submodule_mixin_split() {
  local sha="$1"
  local submodules="" others=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Format: :<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\t<path>
    local src_mode dst_mode path
    src_mode=$(printf '%s' "$line" | awk '{print $1}' | sed 's/^://')
    dst_mode=$(printf '%s' "$line" | awk '{print $2}')
    path=$(printf '%s' "$line" | awk -F'\t' '{print $2}')
    [ -z "$path" ] && continue
    if [ "$src_mode" = "160000" ] || [ "$dst_mode" = "160000" ]; then
      submodules+="$path"$'\n'
    else
      others+="$path"$'\n'
    fi
  done < <(git -C "$REPO" show "$sha" --raw --format='' | sed '/^$/d')
  printf '%s---\n%s' "$submodules" "$others"
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
      # `if` instead of `&&` so a non-prod last-file iteration doesn't
      # leave the while loop exit code at 1 (which, under pipefail +
      # set -e inside an if-body, would silently abort the script
      # mid-FLAG-output — caught on 2026-05-18 when 497aad5 had 96
      # non-prod files ending with `second-brain` submodule).
      if is_prod_file "$f"; then echo "        $f"; fi
    done
    echo "      → review with: git -C $REPO show $sha"
    echo "      → if collaborator-WIP-mixup, revert with:"
    echo "        git -C $REPO revert --no-edit $sha"
    echo
  fi
done

# ── Sweep 2: submodule-mixin pattern ─────────────────────────────────
# Any commit whose diff contains BOTH a submodule pointer change AND
# non-submodule file changes. Caught the 497aad5 incident (workspace
# bundling 96 top3-favorites files into "chore(submodule): bump
# second-brain"). The pre-commit-hook submodule-mixin gate now blocks
# this prospectively; this sweep is the retroactive companion.
#
# We don't require a specific subject prefix because submission of bad
# commits can use any subject. Structure is the discriminator.
echo
echo "=== Sweep 2: submodule + non-submodule mix in same commit ==="
echo

git -C "$REPO" log -"$LAST" --format='%H%x09%s' | while IFS=$'\t' read -r sha subject; do
  split=$(submodule_mixin_split "$sha")
  subs=$(printf '%s' "$split" | awk '/^---$/ {exit} {print}')
  others=$(printf '%s' "$split" | awk 'p {print} /^---$/ {p=1}')
  [ -z "$subs" ] && continue
  [ -z "$others" ] && continue
  other_count=$(printf '%s' "$others" | grep -c '^' || true)
  echo "FLAG  $sha  (submodule pointer + $other_count non-submodule file(s))"
  echo "      subject: $subject"
  echo "      submodule(s):"
  echo "$subs" | sed 's/^/        /'
  echo "      non-submodule file(s) (likely sibling-agent WIP):"
  echo "$others" | head -10 | sed 's/^/        /'
  [ "$other_count" -gt 10 ] && echo "        ... ($((other_count - 10)) more)"
  echo "      → review: git -C $REPO show $sha --stat"
  echo "      → if WIP-mixup AND nothing depends on the bundled files yet:"
  echo "        git -C $REPO revert --no-edit $sha"
  echo "      → if those files are legitimate work, leave the commit and"
  echo "        treat as forward-only — future bumps will be blocked by"
  echo "        the pre-commit submodule-mixin gate."
  echo
done

# Re-derive the combined count for the summary.
# Use `if ...; then ...; fi` instead of `&&`-chains so the while body
# always exits 0 — otherwise pipefail propagates the test's exit=1
# out through the pipeline, set -e fires inside the command
# substitution's subshell, and the final summary echo never runs.
flagged=$({
  git -C "$REPO" log -"$LAST" --format='%H%x09%s' | while IFS=$'\t' read -r sha subject; do
    if echo "$subject" | grep -qE "$SMALL_PREFIXES_REGEX"; then
      n=$(prod_line_count "$sha")
      if [ "$n" -gt "$MAX_LINES" ]; then echo flag; fi
    fi
  done
  git -C "$REPO" log -"$LAST" --format='%H' | while read -r sha; do
    split=$(submodule_mixin_split "$sha")
    subs=$(printf '%s' "$split" | awk '/^---$/ {exit} {print}')
    others=$(printf '%s' "$split" | awk 'p {print} /^---$/ {p=1}')
    if [ -n "$subs" ] && [ -n "$others" ]; then echo flag; fi
  done
} | wc -l | tr -d ' ')

echo "=== $flagged flagged commit(s) across both sweeps ==="
[ "$flagged" -eq 0 ] && exit 0 || exit 1
