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
