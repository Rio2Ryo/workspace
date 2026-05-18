#!/usr/bin/env bash
# Pre-`git add` budget guard for agent sessions touching repos with
# unstaged WIP from collaborators (typical case: second-brain submodule
# with Ao's in-flight changes).
#
# Problem this solves:
#   `git add <file>` stages EVERY unstaged hunk in that file. When the
#   agent edits a file that already had Ao's WIP unstaged, all of
#   Ao's WIP rides into the agent's commit — under the agent's commit
#   message, with no awareness or audit trail. This actually happened
#   on commit 2f8861b (likePattern export bundled ~120 lines of Ao's
#   MemoryQueryResult WIP).
#
# Mechanic:
#   For each (file, --max-added budget) pair, compare the working-tree
#   diff line count (`+` lines from `git diff <file>`) against the
#   budget. Anything significantly larger than expected is the
#   collaborator's WIP, not the agent's intended edit. Refuse, and
#   point the operator at `git diff <file>` to confirm.
#
# Intended use (in the agent's pre-commit ritual for submodule edits):
#   ./stage-guard.sh --repo <path> \
#                    --file <relpath1> --max-added 30 \
#                    --file <relpath2> --max-added 20
#   git -C <path> add <relpath1> <relpath2>
#   git -C <path> diff --cached --stat   # one more eyeball check
#   git -C <path> commit -m "..."
#
# Exit codes:
#   0  every file is within its budget
#   1  at least one file exceeded budget (commit ritual aborted)
#   2  bad CLI args

set -euo pipefail

usage() {
  cat >&2 <<EOF
Usage: stage-guard.sh --repo <path> --file <relpath> --max-added <N> [...repeat]
       stage-guard.sh --help

Repeat --file + --max-added pairs for each file you intend to stage.
Optional --max-removed <M> after a --file applies to that file only
(default: same as --max-added).

Exit 0 if every file fits its budget; exit 1 with diff stat otherwise.
EOF
  exit 2
}

REPO=""
declare -a FILES=()
declare -a MAX_ADDED=()
declare -a MAX_REMOVED=()

current_file_idx=-1

while [ $# -gt 0 ]; do
  case "$1" in
    --repo) REPO="$2"; shift 2 ;;
    --file)
      FILES+=("$2")
      MAX_ADDED+=("0")     # placeholder; --max-added populates
      MAX_REMOVED+=("-1")   # -1 sentinel: mirror max_added unless set
      current_file_idx=$(( ${#FILES[@]} - 1 ))
      shift 2
      ;;
    --max-added)
      [ "$current_file_idx" -ge 0 ] || { echo "ERROR: --max-added before any --file" >&2; usage; }
      MAX_ADDED[$current_file_idx]="$2"
      shift 2
      ;;
    --max-removed)
      [ "$current_file_idx" -ge 0 ] || { echo "ERROR: --max-removed before any --file" >&2; usage; }
      MAX_REMOVED[$current_file_idx]="$2"
      shift 2
      ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -n "$REPO" ] || { echo "ERROR: --repo required" >&2; usage; }
[ -d "$REPO/.git" ] || [ -f "$REPO/.git" ] || {
  echo "ERROR: $REPO is not a git working tree" >&2
  exit 2
}
[ "${#FILES[@]}" -gt 0 ] || { echo "ERROR: at least one --file required" >&2; usage; }

violations=0
for i in "${!FILES[@]}"; do
  f="${FILES[$i]}"
  budget_add="${MAX_ADDED[$i]}"
  budget_rem="${MAX_REMOVED[$i]}"
  [ "$budget_rem" = "-1" ] && budget_rem="$budget_add"

  if ! git -C "$REPO" ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
    # Untracked (??) file — no pre-existing WIP can be lurking inside.
    # Stage as much as you want.
    echo "  OK   $f  (untracked, no WIP risk)"
    continue
  fi

  # Count diff lines in the working tree against HEAD. We only count
  # additions/removals on actual content lines (no headers/hunks).
  # `|| true` on the grep so a zero-match (file with only additions or
  # only deletions) doesn't trip `set -e` + `pipefail`.
  added=$(git -C "$REPO" diff -- "$f" | (grep -cE '^\+[^+]' || true) | tr -d ' ')
  removed=$(git -C "$REPO" diff -- "$f" | (grep -cE '^-[^-]' || true) | tr -d ' ')

  if [ "$added" -gt "$budget_add" ] || [ "$removed" -gt "$budget_rem" ]; then
    echo "  OVER $f  (+${added}/-${removed}, budget +${budget_add}/-${budget_rem})" >&2
    violations=$((violations + 1))
  else
    echo "  OK   $f  (+${added}/-${removed}, budget +${budget_add}/-${budget_rem})"
  fi
done

if [ "$violations" -gt 0 ]; then
  cat >&2 <<EOF

ABORT: $violations file(s) exceed the staging budget.
This usually means a collaborator's unstaged WIP is sitting in the
file alongside the agent's intended edit. Run \`git diff <file>\` to
confirm; either:
  - re-run stage-guard.sh with a larger --max-added if the diff is
    actually all yours, OR
  - use \`git stash push -m "ao-wip-temp" -- <file>\`, redo your edit,
    \`git add\`, commit, then \`git stash pop\` to restore the WIP.
EOF
  exit 1
fi

echo
echo "All files within budget. Safe to git add + commit."
exit 0
