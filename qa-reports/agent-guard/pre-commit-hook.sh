#!/usr/bin/env bash
# git pre-commit hook: stage budget enforcement.
#
# Refuses the commit if any staged file's +lines exceeds the declared
# budget. Two ways to declare:
#
#   1. Env var (per-invocation):
#      AGENT_STAGE_BUDGET="apps/api/src/routes/foo.ts:30,apps/web/page.tsx:50" \
#        git commit -m "test: pin X"
#
#   2. Per-repo file `.agent-stage-budget` at repo root:
#      apps/api/src/routes/foo.ts:30
#      apps/web/page.tsx:50
#
# Env var entries override file entries for the same path.
#
# Files not in either source fall back to DEFAULT_BUDGET (env var
# AGENT_STAGE_BUDGET_DEFAULT, falling back to 200). The default is
# generous on purpose — the goal is to catch 100+-line collaborator-WIP
# bundle-ins like submodule commit 2f8861b, not nag at every test file.
#
# macOS-portable: uses plain string parsing instead of `declare -A`
# (bash 3.2 doesn't support associative arrays).
#
# Exit codes:
#   0  every staged file is within its budget; commit proceeds
#   1  at least one over-budget; commit aborted with diff stat printed

set -uo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)
BUDGET_FILE="$REPO_ROOT/.agent-stage-budget"
DEFAULT_BUDGET="${AGENT_STAGE_BUDGET_DEFAULT:-200}"

# Build a newline-separated "path<TAB>budget" lookup table from the
# env var first (wins on collision), then the budget file.
BUDGET_TABLE=""
if [ -n "${AGENT_STAGE_BUDGET:-}" ]; then
  # Split on comma into entries
  IFS=',' read -r -a entries <<< "$AGENT_STAGE_BUDGET"
  for entry in "${entries[@]}"; do
    path="${entry%%:*}"
    n="${entry##*:}"
    if [ -n "$path" ] && [ -n "$n" ]; then
      BUDGET_TABLE+="$path	$n"$'\n'
    fi
  done
fi
if [ -f "$BUDGET_FILE" ]; then
  while IFS=':' read -r path n; do
    [ -z "$path" ] && continue
    case "$path" in \#*) continue ;; esac  # comments
    # Skip if env already declared this path
    if ! printf '%s' "$BUDGET_TABLE" | grep -qF "$path	"; then
      BUDGET_TABLE+="$path	$n"$'\n'
    fi
  done <"$BUDGET_FILE"
fi

# Look up budget for a path; echo to stdout.
lookup_budget() {
  local q="$1"
  local match
  # `^q<TAB>` exact-prefix match
  match=$(printf '%s' "$BUDGET_TABLE" | awk -F'\t' -v p="$q" '$1 == p { print $2; exit }')
  if [ -n "$match" ]; then
    echo "$match"
  else
    echo "$DEFAULT_BUDGET"
  fi
}

violations=0
OVERS=""

# Iterate staged paths.
while IFS= read -r f; do
  [ -z "$f" ] && continue
  added=$(git diff --cached -- "$f" | (grep -cE '^\+[^+]' || true) | tr -d ' ')
  budget=$(lookup_budget "$f")
  if [ "$added" -gt "$budget" ]; then
    OVERS+="  - $f: +${added} (budget +${budget})"$'\n'
    violations=$((violations + 1))
  fi
done < <(git diff --cached --name-only)

# ── submodule-mixin gate ─────────────────────────────────────────────
# Detect the workspace-side recurrence of the 2f8861b pattern: a
# "chore(submodule): bump X to <SHA>" commit that accidentally swept in
# a sibling agent's staged WIP. The per-file budget loop above can't
# catch it because each swept file is individually small.
#
# Rule: if any submodule (gitlink, mode 160000) is staged, only
# submodule entries may be staged. A submodule-bump commit must touch
# exactly the submodule pointer(s) and nothing else.
#
# Override (rare legitimate cases like "bump + 1 ops doc"):
#   ALLOW_MIXED_SUBMODULE_COMMIT=1 git commit ...
#
# Caught on 2026-05-18 when commit 497aad5 (workspace) bundled 96
# hermes-jp top3-favorites files into a "chore(submodule): bump
# second-brain" commit.
if [ "${ALLOW_MIXED_SUBMODULE_COMMIT:-0}" != "1" ]; then
  # git diff --cached --raw: 6th field is the path, src/dst modes are
  # fields 1-2 (prefixed with `:`). Mode 160000 = gitlink (submodule).
  staged_submodules=""
  staged_non_submodules=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # Format: :<src_mode> <dst_mode> <src_sha> <dst_sha> <status>\t<path>
    src_mode=$(printf '%s' "$line" | awk '{print $1}' | sed 's/^://')
    dst_mode=$(printf '%s' "$line" | awk '{print $2}')
    path=$(printf '%s' "$line" | awk -F'\t' '{print $2}')
    [ -z "$path" ] && continue
    if [ "$src_mode" = "160000" ] || [ "$dst_mode" = "160000" ]; then
      staged_submodules+="  - $path"$'\n'
    else
      staged_non_submodules+="  - $path"$'\n'
    fi
  done < <(git diff --cached --raw)

  if [ -n "$staged_submodules" ] && [ -n "$staged_non_submodules" ]; then
    {
      echo
      echo "ABORT: submodule-mixin pre-commit hook refused this commit."
      echo
      echo "Submodule pointer change staged:"
      printf '%s' "$staged_submodules"
      echo
      echo "But these non-submodule files are ALSO staged (likely sibling-agent WIP):"
      printf '%s' "$staged_non_submodules" | head -20
      total_non=$(printf '%s' "$staged_non_submodules" | grep -c '^' || true)
      if [ "$total_non" -gt 20 ]; then
        echo "  ... ($((total_non - 20)) more)"
      fi
      cat <<'EOF'

Submodule pointer bumps must be ONE-FILE commits. The non-submodule
files above were probably staged by a sibling agent before your
session and got swept in by `git add <submodule>` + `git commit`.

Fix:
  - Reset the index to only the submodule:
      git reset HEAD                     # un-stage everything
      git add <submodule-path>           # re-stage only the bump
      git commit -m "chore(submodule): bump ..."
  - The sibling agent's WIP stays in the working tree, where they can
    commit it themselves under their own message.

Override (rare legitimate "bump + ops doc" cases):
  ALLOW_MIXED_SUBMODULE_COMMIT=1 git commit ...

This rule was added after commit 497aad5 (workspace) bundled 96
top3-favorites files into a "chore(submodule): bump second-brain"
commit on 2026-05-18.
EOF
    } >&2
    exit 1
  fi
fi

if [ "$violations" -gt 0 ]; then
  {
    echo
    echo "ABORT: stage-budget pre-commit hook refused $violations file(s):"
    printf '%s' "$OVERS"
    cat <<EOF

This is usually a collaborator's unstaged WIP that got swept into your
'git add' along with your intended edit. Pattern caught in submodule
commit 2f8861b (1.5x oversize on agent-command.ts).

Choices:
  - If the diff really is yours, raise the budget for this commit:
      AGENT_STAGE_BUDGET="<path>:<N>,..." git commit ...
    Or per-repo via .agent-stage-budget (one 'path:N' per line).
  - If it's collaborator WIP, stash it out before your edit:
      git stash push -m "ao-wip-temp" -- <path>
      # ...redo your edit, git add, git commit...
      git stash pop
  - Bypass entirely (NOT recommended): git commit --no-verify

Default budget per file: ${DEFAULT_BUDGET} lines (env
AGENT_STAGE_BUDGET_DEFAULT to change).
EOF
  } >&2
  exit 1
fi

# Pass: report what was checked so the agent has a record.
budget_count=$(printf '%s' "$BUDGET_TABLE" | grep -c $'\t' || true)
echo "stage-budget: ${budget_count} explicit budget(s), default ${DEFAULT_BUDGET}, all staged files within budget."
exit 0
