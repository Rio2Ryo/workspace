-- DOWN migration for second-brain 0056_automation_fire_log.sql
--
-- Reverses:
--   CREATE TABLE automation_fire_log(PRIMARY KEY(rule_id, task_id, fired_date), ...)
--   CREATE INDEX idx_automation_fire_log_date
--
-- DATA LOSS WARNING:
--   This table is the *idempotency gate* for deadline_approaching
--   automation. Dropping it BEFORE re-creating it (or removing the
--   cron-side gate code) will reintroduce the original duplicate-fire
--   bug — a task due in 3 days would again receive 72 notifications.
--   Roll back the application code at the same time, OR keep the
--   table in place even when reverting other 0056-era changes.
--
-- FK NOTES:
--   No foreign keys. No other tables reference it. Pure leaf drop.

DROP INDEX IF EXISTS idx_automation_fire_log_date;

DROP TABLE IF EXISTS automation_fire_log;
