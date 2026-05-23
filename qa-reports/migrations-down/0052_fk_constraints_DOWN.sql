-- DOWN migration for second-brain 0052_fk_constraints.sql
--
-- Reverses:
--   Removes the FOREIGN KEY constraints added to 5 tables by 0052:
--     task_time_logs, saved_views, inbox_items,
--     automation_rules, notification_preferences
--   The tables themselves are preserved with all rows intact — only
--   the inline FK definitions are stripped via the recreate-dance:
--   CREATE _old (without REFERENCES) → INSERT SELECT * → DROP →
--   RENAME _old → original.
--
-- DATA LOSS WARNING:
--   NONE for rows. But constraint loss is real — after this, a
--   DELETE on workspaces / tasks no longer cascades to the 5 tables,
--   so orphan rows can accumulate during the rolled-back window.
--   Re-applying 0052 will succeed only if no orphans exist; run the
--   check SQL first (see check-pre-reapply-0052.sql in the submodule
--   migrations-down/ dir).
--
-- NON-IDEMPOTENT (apply.sh --wrap-in-transaction recommended):
--   5 recreate dances with PRAGMA foreign_keys bookends. Mid-script
--   failure (e.g., between table 2 and table 3) leaves stray _old
--   tables; second-run errors on "already exists" requiring manual
--   DROP. The apply.sh --wrap-in-transaction flag wraps the full
--   PRAGMA + recreate-dance in BEGIN / COMMIT; mid-script failure
--   auto-rollbacks the partial dances. Sqlite3-layer evidence:
--     qa-reports/migrations-down/test_down_idempotency_runtime.py
--       ::TestDown0052AtomicWrappingProof (PRAGMA-inside-transaction
--       quirk verified harmless — foreign_keys silently ignored
--       inside a transaction, FK enforcement state at the END of
--       the transaction is what matters)
--   See MIGRATION_ROLLBACK.md §"Atomic rollback option for
--   non-idempotent migrations" for the operator command.
--
-- IDEMPOTENT BEHAVIOUR NOTE:
--   Static shape is non-idempotent (no IF NOT EXISTS on CREATE) but
--   the empirical second-run behaviour is subtle:
--     * mid-run-died: second run errors at the first
--       "CREATE TABLE task_time_logs_old" — operator must manually
--       DROP the stray _old then retry.
--     * happy-path: second run silently COMPLETES — each dance
--       round-trips through a fresh _old. Net schema + row state
--       unchanged.
--   Verified empirically by test_down_idempotency_runtime.py against
--   stdlib sqlite3 >= 3.35.
--
-- FK NOTES:
--   PRAGMA foreign_keys = OFF for the INSERT SELECT step — required
--   so the recreate dance doesn't trip on cascading constraints
--   mid-rename. Restored to ON at end.

PRAGMA foreign_keys = OFF;

-- ========== 1. task_time_logs (drop FKs) ==========
CREATE TABLE task_time_logs_old (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  stopped_at TEXT,
  duration_sec INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO task_time_logs_old SELECT * FROM task_time_logs;
DROP TABLE task_time_logs;
ALTER TABLE task_time_logs_old RENAME TO task_time_logs;
CREATE INDEX IF NOT EXISTS idx_task_time_logs_task ON task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_user ON task_time_logs(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_date ON task_time_logs(started_at);

-- ========== 2. saved_views (drop FK) ==========
CREATE TABLE saved_views_old (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  filter_json TEXT NOT NULL DEFAULT '{}',
  sort_json TEXT NOT NULL DEFAULT '{}',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO saved_views_old SELECT * FROM saved_views;
DROP TABLE saved_views;
ALTER TABLE saved_views_old RENAME TO saved_views;
CREATE INDEX IF NOT EXISTS idx_saved_views_user ON saved_views(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_pinned ON saved_views(user_id, is_pinned);

-- ========== 3. inbox_items (drop FK) ==========
CREATE TABLE inbox_items_old (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  promoted_to_id TEXT,
  promoted_to_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO inbox_items_old SELECT * FROM inbox_items;
DROP TABLE inbox_items;
ALTER TABLE inbox_items_old RENAME TO inbox_items;
CREATE INDEX IF NOT EXISTS idx_inbox_items_workspace ON inbox_items(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_inbox_items_created ON inbox_items(created_at DESC);

-- ========== 4. automation_rules (drop FK) ==========
CREATE TABLE automation_rules_old (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL DEFAULT 'ws_default',
  name          TEXT NOT NULL,
  enabled       INTEGER NOT NULL DEFAULT 1,
  trigger_type  TEXT NOT NULL,
  condition     TEXT NOT NULL DEFAULT '{}',
  action_type   TEXT NOT NULL,
  action_config TEXT NOT NULL DEFAULT '{}',
  run_count     INTEGER NOT NULL DEFAULT 0,
  last_run_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO automation_rules_old SELECT * FROM automation_rules;
DROP TABLE automation_rules;
ALTER TABLE automation_rules_old RENAME TO automation_rules;
CREATE INDEX IF NOT EXISTS idx_automation_rules_ws ON automation_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger ON automation_rules(trigger_type, enabled);

-- ========== 5. notification_preferences (drop FK) ==========
CREATE TABLE notification_preferences_old (
  user_name TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  mention INTEGER NOT NULL DEFAULT 1,
  task_update INTEGER NOT NULL DEFAULT 1,
  comment INTEGER NOT NULL DEFAULT 1,
  automation INTEGER NOT NULL DEFAULT 1,
  weekly_digest INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_name, workspace_id)
);
INSERT INTO notification_preferences_old SELECT * FROM notification_preferences;
DROP TABLE notification_preferences;
ALTER TABLE notification_preferences_old RENAME TO notification_preferences;

PRAGMA foreign_keys = ON;
