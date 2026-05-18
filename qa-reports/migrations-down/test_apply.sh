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
