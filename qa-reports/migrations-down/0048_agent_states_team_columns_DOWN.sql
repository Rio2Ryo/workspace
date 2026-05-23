-- DOWN migration for second-brain 0048_agent_states_team_columns.sql
--
-- Reverses:
--   ALTER TABLE agent_states ADD COLUMN role
--   ALTER TABLE agent_states ADD COLUMN project
--   ALTER TABLE agent_states ADD COLUMN device
--
-- DATA LOSS WARNING:
--   The three column values on every agent_states row are dropped.
--   They are NOT reconstructable from any other table. Re-applying
--   0048 re-adds the columns with their empty-string DEFAULT, so any
--   prior role / project / device assignments are gone. The rows
--   themselves and all other columns (name, status, current_task,
--   last_updated) survive untouched.
--
-- NON-IDEMPOTENT (apply.sh --wrap-in-transaction recommended):
--   ALTER TABLE DROP COLUMN has no IF EXISTS form in SQLite, so a
--   mid-script failure (between DROP 1 and DROP 3) leaves the DB in a
--   half-applied state requiring manual cleanup. The apply.sh
--   --wrap-in-transaction flag wraps these 3 statements in BEGIN /
--   COMMIT; on mid-script failure the partial drops auto-rollback.
--   Sqlite3-layer evidence:
--     qa-reports/migrations-down/test_down_idempotency_runtime.py
--       ::TestDown0048AtomicWrappingProof
--   See MIGRATION_ROLLBACK.md §"Atomic rollback option for
--   non-idempotent migrations" for the operator command.
--
-- FK NOTES:
--   None of the dropped columns participate in any foreign key, so
--   PRAGMA foreign_keys=ON state does not affect this rollback.
--
-- D1 SUPPORT:
--   D1 runs SQLite >= 3.35 which supports DROP COLUMN directly. The
--   migration-roundtrip worker-pool test asserts the columns vanish
--   on down and reappear on up against real D1, proving the form
--   works in the one environment that runs it.

ALTER TABLE agent_states DROP COLUMN device;
ALTER TABLE agent_states DROP COLUMN project;
ALTER TABLE agent_states DROP COLUMN role;
