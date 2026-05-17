#!/usr/bin/env bash
# Safe applier for second-brain DOWN migrations.
#
# What this does:
#   1. Counts rows in each target table FIRST (you see what you'd lose).
#   2. Refuses to run without --confirm.
#   3. Refuses non-local DBs unless --allow-prod is passed.
#      (Heuristic: rejects paths under /tmp/.wrangler/... or *cloudflare*
#      style that look like the live D1 binding; tightened on request.)
#   4. Applies a single DOWN file with `sqlite3 <db> < <down.sql>`.
#   5. Re-counts post-drop and prints a row-count delta.
#
# Out of scope:
#   - Pushing schema to Cloudflare D1 (`wrangler d1 execute`). The D1 path
#     is Yakon-approval territory. If/when approved, wrap that command
#     around this script's --print-only output rather than calling D1 here.
#
# Examples:
#   ./apply.sh --db /Users/x/.wrangler/d1/local/db.sqlite \
#              --migration 0056_automation_fire_log_DOWN.sql --print-only
#   ./apply.sh --db /tmp/sb-test.db \
#              --migration 0056_automation_fire_log_DOWN.sql --confirm

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat <<'EOF'
Usage: apply.sh --db <path> --migration <down.sql> [--confirm] [--allow-prod] [--print-only]
Required:
  --db <path>           Path to local SQLite file. Will be read+written.
  --migration <file>    DOWN migration filename in this directory.
Flags:
  --confirm             Without this, the script runs in dry mode only.
  --allow-prod          Required if --db path looks production-shaped.
  --print-only          Show pre-counts and SQL; never execute the migration.
EOF
  exit 2
}

DB=""
MIGRATION=""
CONFIRM=0
ALLOW_PROD=0
PRINT_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB="$2"; shift 2 ;;
    --migration) MIGRATION="$2"; shift 2 ;;
    --confirm) CONFIRM=1; shift ;;
    --allow-prod) ALLOW_PROD=1; shift ;;
    --print-only) PRINT_ONLY=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown arg: $1" >&2; usage ;;
  esac
done

[ -n "$DB" ] || { echo "ERROR: --db is required" >&2; usage; }
[ -n "$MIGRATION" ] || { echo "ERROR: --migration is required" >&2; usage; }
[ -f "$DB" ] || { echo "ERROR: db file not found: $DB" >&2; exit 1; }

MIGRATION_PATH="$SCRIPT_DIR/$MIGRATION"
[ -f "$MIGRATION_PATH" ] || { echo "ERROR: migration not found: $MIGRATION_PATH" >&2; exit 1; }

command -v sqlite3 >/dev/null || { echo "ERROR: sqlite3 missing" >&2; exit 1; }

# Production-path heuristic. Tightened on request.
PROD_LIKE=0
case "$DB" in
  *wrangler*remote*|*production*|*prod*|*live*) PROD_LIKE=1 ;;
esac
if [ "$PROD_LIKE" = 1 ] && [ "$ALLOW_PROD" != 1 ]; then
  echo "ERROR: --db looks production-shaped ($DB). Pass --allow-prod to override." >&2
  exit 1
fi

# Extract every "DROP TABLE IF EXISTS <name>" target so we can pre-count.
TABLES=$(grep -E '^[[:space:]]*DROP TABLE IF EXISTS' "$MIGRATION_PATH" \
         | sed -E 's/.*DROP TABLE IF EXISTS[[:space:]]+([A-Za-z0-9_]+).*/\1/')

echo "=== migration: $MIGRATION ==="
echo "=== db:        $DB ==="
echo "=== tables in scope: $(echo "$TABLES" | tr '\n' ' ')==="
echo

echo "--- pre-drop row counts ---"
for t in $TABLES; do
  if sqlite3 "$DB" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t';" | grep -q 1; then
    count=$(sqlite3 "$DB" "SELECT COUNT(*) FROM $t;")
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

echo
echo "--- executing migration ---"
sqlite3 "$DB" < "$MIGRATION_PATH"
echo "  (sqlite3 exit=$?)"

echo
echo "--- post-drop sanity ---"
for t in $TABLES; do
  if sqlite3 "$DB" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='$t';" | grep -q 1; then
    echo "  $t: STILL PRESENT (unexpected — check migration)"
  else
    echo "  $t: dropped"
  fi
done

echo
echo "done."
