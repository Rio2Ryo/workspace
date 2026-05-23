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

# ── Per-project pytest/vitest pre-flight gates ────────────────────────
#
# Mirrors the Second Brain pattern (second-brain/qa-reports/agent-guard/
# pre-commit-hook.sh) but for the workspace's own projects:
#
#   projects/threads-watcher/  → pytest  (685 tests / ~41s)
#
# Each gate fires only when the staged files include source from that
# project — operators editing unrelated trees (docs / scripts / other
# projects) pay zero cost. Failed test aborts; `git commit --no-verify`
# remains the documented bypass for true emergencies.
#
# Caught by the 2026-05-23 incident: `pnpm vitest run` failures slipped
# past `tsc --noEmit`-only commits 14 times before surfacing in a manual
# sweep. The threads-watcher equivalent would slip past the SAME way —
# pure Python suite has no compiler, so without this gate a refactor
# to sync_guards / publish-if-delta / mttr can land broken silently.

run_pytest_for() {
  local pattern="$1"
  local pkg_dir="$2"
  local label="$3"
  local staged
  staged=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "$pattern" || true)
  [ -z "$staged" ] && return 0

  local abs_dir="$REPO_ROOT/$pkg_dir"
  if [ ! -d "$abs_dir" ]; then
    return 0
  fi
  # Prefer the .venv that conftest.py shims to be usable without
  # playwright; fall back to system python3 with PYTHONPATH if no
  # venv exists (CI environment).
  local py
  if [ -x "$abs_dir/.venv/bin/python" ]; then
    py="$abs_dir/.venv/bin/python"
  elif [ -x "$abs_dir/venv/bin/python" ]; then
    py="$abs_dir/venv/bin/python"
  else
    py="python3"
  fi

  echo "pytest pre-flight: running $label suite via $py..."
  local out rc
  out=$(cd "$abs_dir" && "$py" -m pytest 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    {
      echo
      echo "ABORT: pre-commit pytest pre-flight failed for $label."
      echo
      # Show the failure tail (last 25 lines) — the assertion + exit
      # summary land here, not the per-test progress dots.
      echo "$out" | tail -25
      echo
      echo "Choices:"
      echo "  - Fix the failing test(s) and re-commit"
      echo "  - If the failing test IS the work being fixed (or is"
      echo "    pre-existing breakage being audited), bypass with:"
      echo "      git commit --no-verify"
      echo "  - To see full output: cd $pkg_dir && $(basename "$py") -m pytest"
    } >&2
    exit 1
  fi
  # Brief success summary so the operator knows the check actually ran.
  echo "$out" | grep -E "^=*( passed| failed| skipped)" | tail -1
}

# threads-watcher source-of-truth files. Tests live under tests/, and
# any change to the top-level *.py / *.sh that the tests cover should
# trip the gate. We include the tests/ tree itself so a test file edit
# also fires (a test edit is the most common gate-firing case, and the
# test suite is what proves it still works).
run_pytest_for '^projects/threads-watcher/(tests/|[^/]+\.py$|publish-if-delta\.sh$|run-watcher\.sh$|auto-restart-if-stale\.sh$)' \
  'projects/threads-watcher' 'threads-watcher'


# ── Single-file pytest gates (not pkg-dir-bound) ──────────────────────
#
# Some tests cross project boundaries (e.g., qa-reports/migrations-down
# reads SQL from the second-brain submodule). They aren't a "project"
# in their own right, so the pkg-based run_pytest_for doesn't fit —
# there's no .venv to find, and we don't want to over-collect by
# running pytest at qa-reports root.
#
# This helper runs ONE test file via the threads-watcher .venv (the
# only Python venv in this repo with pytest installed) when the
# trigger pattern matches.

run_pytest_file() {
  local pattern="$1"
  local test_file="$2"
  local label="$3"
  local staged
  staged=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "$pattern" || true)
  [ -z "$staged" ] && return 0

  local py="$REPO_ROOT/projects/threads-watcher/.venv/bin/python"
  if [ ! -x "$py" ]; then
    py="python3"
  fi
  local abs_test="$REPO_ROOT/$test_file"
  if [ ! -f "$abs_test" ]; then
    {
      echo
      echo "WARN: $label gate fired but test file missing: $abs_test"
      echo "      skipping — gate may need updating"
    } >&2
    return 0
  fi

  echo "pytest pre-flight: $label via $py..."
  local out rc
  out=$(cd "$REPO_ROOT" && "$py" -m pytest "$test_file" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    {
      echo
      echo "ABORT: pre-commit pytest pre-flight failed for $label."
      echo
      echo "$out" | tail -25
      echo
      echo "Choices:"
      echo "  - Fix the failing test(s) and re-commit"
      echo "  - Bypass (NOT recommended): git commit --no-verify"
      echo "  - Full output: cd $REPO_ROOT && $(basename "$py") -m pytest $test_file"
    } >&2
    exit 1
  fi
  echo "$out" | grep -E "^=*( passed| failed| skipped)" | tail -1
}

# Migrations-down runtime idempotency proof — fires on test file edit
# OR any submodule bump (cheap ~30ms, so over-trigger on submodule
# bumps is acceptable; under-trigger would miss a down-script
# regression that the runtime test exists to catch). qa-reports/
# migrations-down/*.sql + apply.sh edits also trip the gate.
run_pytest_file '^(qa-reports/migrations-down/.*|second-brain)$' \
  'qa-reports/migrations-down/test_down_idempotency_runtime.py' \
  'migrations-down-runtime'

# Apply.sh ↔ submodule SQL parity (commit d12b237) — same trigger
# pattern: a submodule bump or apply.sh-side *_DOWN.sql edit could
# silently diverge the executable SQL between the two operator
# paths (apply.sh → sqlite/miniflare/remote vs wrangler d1 execute
# --file). 5ms test, cheap to fire on every matching commit.
run_pytest_file '^(qa-reports/migrations-down/.*|second-brain)$' \
  'qa-reports/migrations-down/test_apply_vs_submodule_sql_parity.py' \
  'migrations-down-parity'

# threads-watcher plist edits — the existing threads-watcher gate
# pattern matches tests/ + top-level *.py + specific *.sh, but NOT
# *.plist or *.plist.example. Pre-this-gate, an operator editing a
# plist (e.g., accidentally committing a real Discord URL, breaking
# the XML, or moving a script path) slipped past pre-commit even
# though test_plist_log_routing.py + test_plist_xml_strict.py would
# catch the issue on a deliberate pytest run.
#
# Two paired gates (same trigger, distinct test files) — twin
# pattern of migrations-down-runtime + migrations-down-parity.
# Trigger pattern duplicated literally (not via $VAR) so the
# test_pre_commit_hook.py parser can extract both gates' patterns
# for the cross-gate-invariant check; the parser regex looks for
# single-quoted literals.
run_pytest_file '^projects/threads-watcher/.*\.plist(\.example)?$' \
  'projects/threads-watcher/tests/test_plist_log_routing.py' \
  'plist-log-routing'

run_pytest_file '^projects/threads-watcher/.*\.plist(\.example)?$' \
  'projects/threads-watcher/tests/test_plist_xml_strict.py' \
  'plist-xml-strict'

exit 0
