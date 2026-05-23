#!/usr/bin/env bash
# Integration tests for apply.sh — covers both --mode sqlite (regression)
# and --mode wrangler-{local,remote} (new). The wrangler tests use a
# fake `wrangler` binary on PATH that just records its args, so we can
# verify apply.sh's CLI construction without needing a real D1 dev
# state (which only exists after `wrangler dev` has been run with the
# D1 binding).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APPLY="$SCRIPT_DIR/apply.sh"
PASS=0
FAIL=0

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }

assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: $name"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name"
    red   "    expected: $expected"
    red   "    actual:   $actual"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local name="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF -- "$needle"; then
    green "  PASS: $name (contains '$needle')"
    PASS=$((PASS + 1))
  else
    red   "  FAIL: $name (missing '$needle')"
    red   "    haystack: $haystack"
    FAIL=$((FAIL + 1))
  fi
}

# Set up a temp dir for: fake wrangler binary + fake wrangler-cwd + arg log
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST" /tmp/rb_compat_test_*.db' EXIT

# ── Fake wrangler that records its argv ─────────────────────────────────
FAKE_WRANGLER_BIN="$TMPDIR_TEST/bin"
mkdir -p "$FAKE_WRANGLER_BIN"
WRANGLER_LOG="$TMPDIR_TEST/wrangler.log"
cat >"$FAKE_WRANGLER_BIN/wrangler" <<EOF
#!/usr/bin/env bash
echo "WRANGLER_CALL: cwd=\$(pwd) args=\$*" >> "$WRANGLER_LOG"
# Mimic the layout apply.sh's query_one() parser expects for SELECT 1:
# pretty-printed table with │ delimiters and a numeric row.
case "\$*" in
  *"SELECT 1 FROM sqlite_master"*)
    echo "│ 1 │"
    ;;
  *"SELECT COUNT"*)
    echo "│ 7 │"
    ;;
  *--file*)
    echo "applied (fake)"
    ;;
esac
exit 0
EOF
chmod +x "$FAKE_WRANGLER_BIN/wrangler"

# ── Fake wrangler-cwd with a wrangler.toml stub ─────────────────────────
FAKE_WRANGLER_CWD="$TMPDIR_TEST/api"
mkdir -p "$FAKE_WRANGLER_CWD"
cat >"$FAKE_WRANGLER_CWD/wrangler.toml" <<'TOML'
name = "fake"
TOML

run_apply() {
  PATH="$FAKE_WRANGLER_BIN:$PATH" "$APPLY" "$@"
}

# ── Test 1: sqlite regression — no wrangler call should ever be recorded ──
echo "[1] sqlite mode regression (no wrangler invocation)"
DB1="/tmp/rb_compat_test_1.db"
rm -f "$DB1"; sqlite3 "$DB1" "CREATE TABLE automation_fire_log(x INT); INSERT INTO automation_fire_log VALUES (1);"
: >"$WRANGLER_LOG"
out=$(run_apply --db "$DB1" --migration 0056_automation_fire_log_DOWN.sql --confirm 2>&1 || true)
assert_contains "sqlite confirm runs the drop" "automation_fire_log: dropped" "$out"
assert_eq      "sqlite mode does NOT touch wrangler" "" "$(cat "$WRANGLER_LOG" 2>/dev/null || true)"

# ── Test 2: wrangler-local --print-only — no real exec, no wrangler call ──
echo "[2] wrangler-local --print-only never calls wrangler for migration apply"
: >"$WRANGLER_LOG"
out=$(run_apply --mode wrangler-local \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql --print-only 2>&1 || true)
assert_contains "print-only shows SQL" "DROP TABLE IF EXISTS automation_fire_log" "$out"
# print-only DOES call wrangler for pre-count queries; just assert no
# --file invocation happened (the migration itself wasn't applied).
file_calls=$(grep -c -- '--file' "$WRANGLER_LOG" 2>/dev/null || true)
assert_eq "print-only does NOT invoke wrangler with --file" "0" "$file_calls"

# ── Test 3: wrangler-local --confirm passes right args to wrangler ──────
echo "[3] wrangler-local --confirm constructs the right wrangler invocation"
: >"$WRANGLER_LOG"
out=$(run_apply --mode wrangler-local \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql --confirm 2>&1 || true)
# Must call wrangler with: d1 execute second_brain --local --file <abs>
log_content=$(cat "$WRANGLER_LOG")
assert_contains "wrangler called with d1 execute" "d1 execute second_brain" "$log_content"
assert_contains "wrangler called with --local flag" "--local" "$log_content"
assert_contains "wrangler called with --file flag" "--file" "$log_content"
assert_contains "wrangler ran from --wrangler-cwd" "cwd=$FAKE_WRANGLER_CWD" "$log_content"

# ── Test 4: wrangler-remote requires --allow-prod ──────────────────────
echo "[4] wrangler-remote refuses without --allow-prod (exit=1)"
: >"$WRANGLER_LOG"
set +e
out=$(run_apply --mode wrangler-remote \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql --confirm 2>&1)
rc=$?
set -e
assert_eq "wrangler-remote exit code without --allow-prod" "1" "$rc"
assert_contains "wrangler-remote refusal message" "requires --allow-prod" "$out"
assert_eq "wrangler-remote did not call wrangler at all" "" "$(cat "$WRANGLER_LOG" 2>/dev/null || true)"

# ── Test 5: wrangler-remote with --allow-prod uses --remote flag ───────
echo "[5] wrangler-remote --allow-prod --confirm uses --remote flag"
: >"$WRANGLER_LOG"
out=$(run_apply --mode wrangler-remote \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql --confirm --allow-prod 2>&1 || true)
log_content=$(cat "$WRANGLER_LOG")
assert_contains "wrangler-remote uses --remote flag" "--remote" "$log_content"
# And does NOT mix in --local accidentally.
local_in_remote=$(grep -c -- '--local' "$WRANGLER_LOG" 2>/dev/null || true)
assert_eq "wrangler-remote does NOT pass --local" "0" "$local_in_remote"

# ── Test 6: wrangler-local missing wrangler.toml is rejected ───────────
echo "[6] wrangler-local rejects --wrangler-cwd without wrangler.toml"
BAD_CWD="$TMPDIR_TEST/no-toml"
mkdir -p "$BAD_CWD"
set +e
out=$(run_apply --mode wrangler-local \
  --wrangler-cwd "$BAD_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql --print-only 2>&1)
rc=$?
set -e
assert_eq "exit code on missing wrangler.toml" "1" "$rc"
assert_contains "missing wrangler.toml error msg" "wrangler.toml not found" "$out"

# ── Test 7: unknown --mode rejected ────────────────────────────────────
echo "[7] unknown --mode value rejected"
set +e
out=$(run_apply --mode martian --db /tmp/x --migration 0056_automation_fire_log_DOWN.sql 2>&1)
rc=$?
set -e
assert_eq "exit code on unknown --mode" "2" "$rc"
assert_contains "unknown --mode error msg" "unknown --mode" "$out"

# ── --wrap-in-transaction (commit a18eacc + 09ed88f atomicity proof) ──
#
# Operator opts in via --wrap-in-transaction; apply.sh prepends
# BEGIN; + appends COMMIT; to the migration SQL via a tempfile,
# then invokes sqlite3/wrangler against the wrapped tempfile.
# Catches mid-script failure on non-idempotent down scripts.

# ── Test 8: sqlite + --wrap-in-transaction → still drops table ────────
echo "[8] sqlite + --wrap-in-transaction (happy path)"
DB_WRAP="$TMPDIR_TEST/wrap-happy.db"
sqlite3 "$DB_WRAP" "CREATE TABLE automation_fire_log (id INTEGER PRIMARY KEY);"
out=$(run_apply --mode sqlite --db "$DB_WRAP" \
  --migration 0056_automation_fire_log_DOWN.sql \
  --confirm --wrap-in-transaction 2>&1)
assert_contains "sqlite wrap happy: drops the table" "automation_fire_log: dropped" "$out"
remaining=$(sqlite3 "$DB_WRAP" "SELECT name FROM sqlite_master WHERE type='table' AND name='automation_fire_log';")
assert_eq "sqlite wrap happy: actually removed" "" "$remaining"

# ── Test 9: wrangler-local + --wrap-in-transaction → wrapped tempfile ─
echo "[9] wrangler-local + --wrap-in-transaction passes wrapped tempfile"
: >"$WRANGLER_LOG"
run_apply --mode wrangler-local \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql \
  --confirm --wrap-in-transaction >/dev/null 2>&1 || true
log_content=$(cat "$WRANGLER_LOG" 2>/dev/null || true)
# 🔒 The wrangler --file path should reference a wrapped-* tempfile
# (not the original migration path). Pin the prefix so a future
# refactor that bypasses build_sql_payload trips here.
assert_contains "wrangler-local wrap: --file points at wrapped-* tempfile" "wrapped-" "$log_content"

# ── Test 10: wrangler-local WITHOUT --wrap-in-transaction → original ──
# Regression guard: no false-positive wrapped-* path on non-wrap path.
echo "[10] wrangler-local without --wrap-in-transaction passes raw migration"
: >"$WRANGLER_LOG"
run_apply --mode wrangler-local \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0056_automation_fire_log_DOWN.sql \
  --confirm >/dev/null 2>&1 || true
log_content=$(cat "$WRANGLER_LOG" 2>/dev/null || true)
# Without --wrap-in-transaction, --file should be the original path,
# NOT a wrapped tempfile.
wrapped_in_log=$(echo "$log_content" | grep -c "wrapped-" || true)
assert_eq "wrangler-local no-wrap: no wrapped-* in log" "0" "$wrapped_in_log"

# ── Test 11: --wrap-in-transaction tempfile auto-cleanup ──────────────
# build_sql_payload uses mktemp + RETURN trap cleanup. Verify no
# leftover wrapped-* files in $TMPDIR_TEST after run completes.
echo "[11] --wrap-in-transaction tempfile auto-cleanup"
run_apply --mode sqlite --db "$DB_WRAP" \
  --migration 0056_automation_fire_log_DOWN.sql \
  --print-only --wrap-in-transaction >/dev/null 2>&1 || true
# Glob $TMPDIR (system temp dir where mktemp lands) for leftover wrap
# tempfiles. Tolerant check: any wrapped-0056* should be 0.
leftover=$(find /tmp -maxdepth 1 -name "wrapped-0056*" 2>/dev/null | wc -l | tr -d ' ')
assert_eq "no wrapped-* tempfiles leaked after apply.sh exit" "0" "$leftover"

# ── DROP COLUMN-only migration regression (0048 / 0052 atomic-wrap path) ─
#
# Before the 2026-05-23 `|| true` fix on the TABLES= line, apply.sh
# ran with `set -euo pipefail` would silently exit 1 with NO banner
# output when grep found no `DROP TABLE IF EXISTS` matches in the
# migration file. The 0054–0056 cases above ALL contain DROP TABLE,
# so they never triggered the bug. 0048 (3× ALTER TABLE DROP COLUMN)
# and 0052 (recreate-dance — DROP TABLE is there but on the _old
# intermediates, which the grep regex doesn't match because the
# rename happens before any operator-meaningful "table in scope"
# disappears) exposed it. These tests pin the fix.

# ── Test 12: sqlite + DROP COLUMN-only (0048) → banner output + exit 0 ──
echo "[12] sqlite + 0048 (DROP COLUMN only) — banner output, no silent exit"
DB48_PO="$TMPDIR_TEST/dropcol-printonly.db"
sqlite3 "$DB48_PO" "CREATE TABLE agent_states (id INTEGER PRIMARY KEY, name TEXT, status TEXT, current_task TEXT, last_updated TEXT, role TEXT DEFAULT '', project TEXT DEFAULT '', device TEXT DEFAULT '');"
set +e
out=$(run_apply --mode sqlite --db "$DB48_PO" \
  --migration 0048_agent_states_team_columns_DOWN.sql --print-only 2>&1)
rc=$?
set -e
assert_eq      "0048 print-only exit code is 0 (was silent exit=1 before fix)" "0" "$rc"
assert_contains "0048 print-only emits the mode banner"      "=== mode:      sqlite ===" "$out"
assert_contains "0048 print-only emits the migration banner" "=== migration: 0048_agent_states_team_columns_DOWN.sql ===" "$out"
assert_contains "0048 print-only emits the empty tables-in-scope line" "tables in scope:" "$out"
assert_contains "0048 print-only shows the actual SQL"       "ALTER TABLE agent_states DROP COLUMN device" "$out"

# ── Test 13: sqlite + 0048 + --wrap-in-transaction (runbook command) ──
echo "[13] sqlite + 0048 + --wrap-in-transaction (runbook-documented path)"
DB48_W="$TMPDIR_TEST/dropcol-wrap.db"
sqlite3 "$DB48_W" "CREATE TABLE agent_states (id INTEGER PRIMARY KEY, name TEXT, status TEXT, current_task TEXT, last_updated TEXT, role TEXT DEFAULT '', project TEXT DEFAULT '', device TEXT DEFAULT '');"
sqlite3 "$DB48_W" "INSERT INTO agent_states (id, name, status, role, project, device) VALUES (1, 'a', 'ready', 'pm', 'sb', 'dx');"
out=$(run_apply --mode sqlite --db "$DB48_W" \
  --migration 0048_agent_states_team_columns_DOWN.sql \
  --confirm --wrap-in-transaction 2>&1)
# Wrap path doesn't emit a "table dropped" line (no DROP TABLE in
# 0048). Verify the 3 columns are actually gone post-run.
cols=$(sqlite3 "$DB48_W" "PRAGMA table_info(agent_states);" | awk -F'|' '{print $2}' | sort | tr '\n' ',')
# Expected post-drop column set: id,last_updated,name,status,current_task
# (alphabetically sorted: current_task,id,last_updated,name,status,)
assert_contains "0048 wrap: role column gone"   ""    "$(echo "$cols" | grep -c '^role$' || true)"
assert_eq       "0048 wrap: role/project/device all removed" \
  "current_task,id,last_updated,name,status," "$cols"
# Row itself survives (non-dropped columns).
row_count=$(sqlite3 "$DB48_W" "SELECT COUNT(*) FROM agent_states;")
assert_eq "0048 wrap: agent_states row survives DROP COLUMN" "1" "$row_count"

# ── Test 14: wrangler-local + 0048 + --wrap-in-transaction (runbook) ──
# This is the EXACT command MIGRATION_ROLLBACK.md tells operators to
# run for non-idempotent rollback. Before 2026-05-23 the file didn't
# exist; now it does AND the wrap path passes a wrapped-* tempfile.
echo "[14] wrangler-local + 0048 + --wrap-in-transaction (runbook command shape)"
: >"$WRANGLER_LOG"
run_apply --mode wrangler-local \
  --wrangler-cwd "$FAKE_WRANGLER_CWD" --wrangler-db second_brain \
  --migration 0048_agent_states_team_columns_DOWN.sql \
  --confirm --wrap-in-transaction >/dev/null 2>&1 || true
log_content=$(cat "$WRANGLER_LOG" 2>/dev/null || true)
assert_contains "0048 wrangler-local wrap: --file points at wrapped-* tempfile" "wrapped-" "$log_content"
# And the wrapped file is targeted via --file (not --command).
assert_contains "0048 wrangler-local wrap: uses --file (not --command)" "--file" "$log_content"

# ── Test 15: 0052 (recreate-dance) print-only is consumable ────────────
# Full execution requires fixturing 5 tables with FK constraints — out
# of scope here; the runtime contract is exercised in
# test_down_idempotency_runtime.py::TestDown0052AtomicWrappingProof
# against real sqlite3. Here we just verify the file is consumable via
# apply.sh's --print-only path.
echo "[15] sqlite + 0052 (recreate-dance) --print-only consumable"
DB52_PO="$TMPDIR_TEST/dance-printonly.db"
sqlite3 "$DB52_PO" "CREATE TABLE dummy (x INT);"
set +e
out=$(run_apply --mode sqlite --db "$DB52_PO" \
  --migration 0052_fk_constraints_DOWN.sql --print-only 2>&1)
rc=$?
set -e
assert_eq      "0052 print-only exit code is 0" "0" "$rc"
assert_contains "0052 print-only emits the migration banner" "=== migration: 0052_fk_constraints_DOWN.sql ===" "$out"
assert_contains "0052 print-only shows the PRAGMA bookend"   "PRAGMA foreign_keys = OFF" "$out"
assert_contains "0052 print-only shows the recreate dance"   "RENAME TO task_time_logs" "$out"

# ── Summary ────────────────────────────────────────────────────────────
echo
echo "=================================="
if [ "$FAIL" = 0 ]; then
  green "ALL TESTS PASSED ($PASS/$PASS)"
  exit 0
else
  red "TESTS FAILED ($PASS pass, $FAIL fail)"
  exit 1
fi
