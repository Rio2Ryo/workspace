#!/usr/bin/env bash
# Safe applier for second-brain DOWN migrations.
#
# Two execution modes:
#
#   --mode sqlite          (default; backward compatible)
#     Operates on a local SQLite file via the sqlite3 CLI. Pass --db.
#     Use this for scratch DBs, manually-snapshotted prod backups, etc.
#
#   --mode wrangler-local
#     Operates on the wrangler miniflare D1 dev state via
#     `wrangler d1 execute <name> --local`. Pass --wrangler-cwd
#     (the dir containing wrangler.toml, e.g. apps/api) and
#     --wrangler-db (the D1 database_name in wrangler.toml).
#     Use this once `wrangler dev` has created the local D1 state.
#
#   --mode wrangler-remote
#     Operates on the live remote D1 via `wrangler d1 execute <name> --remote`.
#     REQUIRES --allow-prod. Yakon-approval territory.
#
# Safety rails (same for every mode):
#   1. Pre-flight row counts so the operator sees what they'd lose.
#   2. --confirm gate. Without it, dry mode — no writes.
#   3. --print-only: show SQL, never execute.
#   4. Production-path heuristic on --db; require --allow-prod to override.
#   5. wrangler-remote always requires --allow-prod regardless of path.
#
# Examples:
#   # sqlite (default):
#   ./apply.sh --db /tmp/sb-test.db \
#              --migration 0056_automation_fire_log_DOWN.sql --confirm
#
#   # wrangler local D1 dev state:
#   ./apply.sh --mode wrangler-local \
#              --wrangler-cwd ../../second-brain/apps/api \
#              --wrangler-db second_brain \
#              --migration 0056_automation_fire_log_DOWN.sql --confirm
#
#   # wrangler remote (Yakon approval required):
#   ./apply.sh --mode wrangler-remote \
#              --wrangler-cwd ../../second-brain/apps/api \
#              --wrangler-db second_brain \
#              --migration 0056_automation_fire_log_DOWN.sql \
#              --confirm --allow-prod

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage: apply.sh [--mode sqlite|wrangler-local|wrangler-remote] --migration <down.sql>
                [--db <path>] [--wrangler-cwd <path>] [--wrangler-db <name>]
                [--confirm] [--allow-prod] [--print-only]
Modes:
  --mode sqlite            (default) operate on local sqlite file (--db required)
  --mode wrangler-local    operate on miniflare D1 dev state
                           (--wrangler-cwd + --wrangler-db required)
  --mode wrangler-remote   operate on live remote D1
                           (--wrangler-cwd + --wrangler-db + --allow-prod required)
Common:
  --migration <file>       DOWN migration filename in this directory
  --confirm                Without this, dry mode only
  --allow-prod             Required for prod-shaped --db OR --mode wrangler-remote
  --print-only             Show pre-counts and SQL; never execute
EOF
  exit 2
}

MODE="sqlite"
DB=""
WRANGLER_CWD=""
WRANGLER_DB=""
MIGRATION=""
CONFIRM=0
ALLOW_PROD=0
PRINT_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --db) DB="$2"; shift 2 ;;
    --wrangler-cwd) WRANGLER_CWD="$2"; shift 2 ;;
    --wrangler-db) WRANGLER_DB="$2"; shift 2 ;;
    --migration) MIGRATION="$2"; shift 2 ;;
    --confirm) CONFIRM=1; shift ;;
    --allow-prod) ALLOW_PROD=1; shift ;;
    --print-only) PRINT_ONLY=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

# ── arg validation per mode ─────────────────────────────────────────────

case "$MODE" in
  sqlite)
    [ -n "$DB" ] || { echo "ERROR: --db is required for --mode sqlite" >&2; usage; }
    [ -f "$DB" ] || { echo "ERROR: db file not found: $DB" >&2; exit 1; }
    command -v sqlite3 >/dev/null || { echo "ERROR: sqlite3 missing" >&2; exit 1; }
    ;;
  wrangler-local|wrangler-remote)
    [ -n "$WRANGLER_CWD" ] || { echo "ERROR: --wrangler-cwd is required for --mode $MODE" >&2; usage; }
    [ -n "$WRANGLER_DB" ] || { echo "ERROR: --wrangler-db is required for --mode $MODE" >&2; usage; }
    [ -d "$WRANGLER_CWD" ] || { echo "ERROR: --wrangler-cwd is not a directory: $WRANGLER_CWD" >&2; exit 1; }
    [ -f "$WRANGLER_CWD/wrangler.toml" ] || {
      echo "ERROR: wrangler.toml not found under --wrangler-cwd: $WRANGLER_CWD" >&2
      exit 1
    }
    command -v wrangler >/dev/null || command -v npx >/dev/null || {
      echo "ERROR: wrangler missing (and no npx fallback)" >&2
      exit 1
    }
    if [ "$MODE" = "wrangler-remote" ] && [ "$ALLOW_PROD" != 1 ]; then
      echo "ERROR: --mode wrangler-remote requires --allow-prod (Yakon approval territory)." >&2
      exit 1
    fi
    ;;
  *)
    echo "ERROR: unknown --mode: $MODE (use sqlite|wrangler-local|wrangler-remote)" >&2
    usage
    ;;
esac

[ -n "$MIGRATION" ] || { echo "ERROR: --migration is required" >&2; usage; }
MIGRATION_PATH="$SCRIPT_DIR/$MIGRATION"
[ -f "$MIGRATION_PATH" ] || { echo "ERROR: migration not found: $MIGRATION_PATH" >&2; exit 1; }

# Production-path heuristic (sqlite mode). Tightened on request.
if [ "$MODE" = "sqlite" ]; then
  PROD_LIKE=0
  case "$DB" in
    *wrangler*remote*|*production*|*prod*|*live*) PROD_LIKE=1 ;;
  esac
  if [ "$PROD_LIKE" = 1 ] && [ "$ALLOW_PROD" != 1 ]; then
    echo "ERROR: --db looks production-shaped ($DB). Pass --allow-prod to override." >&2
    exit 1
  fi
fi

# ── mode-aware query helpers ────────────────────────────────────────────

# Pick the wrangler invoker. Prefer the locally-installed binary; fall
# back to `npx -y wrangler` so CI without a global install still works.
WRANGLER_CMD=""
if [ "$MODE" != "sqlite" ]; then
  if command -v wrangler >/dev/null; then
    WRANGLER_CMD="wrangler"
  else
    WRANGLER_CMD="npx -y wrangler"
  fi
fi

# Run a single SELECT and emit one line. For wrangler, --json output is
# more parseable but adds dependency on jq; instead we just look for the
# count value in the human output.
query_one() {
  local sql="$1"
  case "$MODE" in
    sqlite)
      sqlite3 "$DB" "$sql"
      ;;
    wrangler-local)
      # `wrangler d1 execute --command` returns a results table. Strip
      # everything except numeric / single-token answers via tail+awk.
      ( cd "$WRANGLER_CWD" && $WRANGLER_CMD d1 execute "$WRANGLER_DB" --local --command "$sql" 2>/dev/null ) \
        | awk '/^│[[:space:]]*[0-9A-Za-z_-]/ { gsub(/[│ ]/, "", $0); print $0 }' \
        | tail -1
      ;;
    wrangler-remote)
      ( cd "$WRANGLER_CWD" && $WRANGLER_CMD d1 execute "$WRANGLER_DB" --remote --command "$sql" 2>/dev/null ) \
        | awk '/^│[[:space:]]*[0-9A-Za-z_-]/ { gsub(/[│ ]/, "", $0); print $0 }' \
        | tail -1
      ;;
  esac
}

# Execute the down migration SQL.
apply_migration() {
  case "$MODE" in
    sqlite)
      sqlite3 "$DB" < "$MIGRATION_PATH"
      ;;
    wrangler-local)
      ( cd "$WRANGLER_CWD" && $WRANGLER_CMD d1 execute "$WRANGLER_DB" --local --file "$MIGRATION_PATH" )
      ;;
    wrangler-remote)
      ( cd "$WRANGLER_CWD" && $WRANGLER_CMD d1 execute "$WRANGLER_DB" --remote --file "$MIGRATION_PATH" )
      ;;
  esac
}

# ── pre-flight: list tables affected + row counts ───────────────────────

TABLES=$(grep -E '^[[:space:]]*DROP TABLE IF EXISTS' "$MIGRATION_PATH" \
         | sed -E 's/.*DROP TABLE IF EXISTS[[:space:]]+([A-Za-z0-9_]+).*/\1/')

echo "=== mode:      $MODE ==="
echo "=== migration: $MIGRATION ==="
if [ "$MODE" = "sqlite" ]; then
  echo "=== db:        $DB ==="
else
  echo "=== wrangler:  $WRANGLER_DB @ $WRANGLER_CWD ==="
fi
echo "=== tables in scope: $(echo "$TABLES" | tr '\n' ' ')==="
echo

echo "--- pre-drop row counts ---"
for t in $TABLES; do
  present=$(query_one "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t';" || echo "")
  if echo "$present" | grep -q 1; then
    count=$(query_one "SELECT COUNT(*) FROM $t;" || echo "?")
    echo "  $t: $count row(s)"
  else
    echo "  $t: (table not present — DROP IF EXISTS will be a no-op)"
  fi
done

if [ "$PRINT_ONLY" = 1 ]; then
  echo
  echo "--- SQL to be executed (--print-only set; not running) ---"
  cat "$MIGRATION_PATH"
  exit 0
fi

if [ "$CONFIRM" != 1 ]; then
  echo
  echo "DRY MODE: pass --confirm to actually run the DROP. No changes made." >&2
  exit 0
fi

# ── execute ─────────────────────────────────────────────────────────────

echo
echo "--- executing migration ---"
apply_migration
echo "  (exit=$?)"

echo
echo "--- post-drop sanity ---"
for t in $TABLES; do
  present=$(query_one "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t';" || echo "")
  if echo "$present" | grep -q 1; then
    echo "  $t: STILL PRESENT (unexpected — check migration)"
  else
    echo "  $t: dropped"
  fi
done

echo
echo "done."
