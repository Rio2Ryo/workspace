-- DOWN migration for second-brain 0055_task_source_links.sql
--
-- Reverses:
--   CREATE TABLE task_source_links(... FK task_id -> tasks(id) ON DELETE CASCADE, UNIQUE(source, source_id))
--   CREATE INDEX idx_task_source_links_task_id
--   CREATE INDEX idx_task_source_links_tmux_session
--   CREATE INDEX idx_task_source_links_discord_thread_id
--
-- DATA LOSS WARNING:
--   - Drops all task->external-surface link rows.
--   - Source data on the OTHER side (tasks, discord threads, tmux
--     sessions) is untouched — only the link metadata is lost.
--   - Re-running 0055 (forward) leaves an empty table; links must
--     be reconstructed by whatever code was populating them.
--
-- FK NOTES:
--   FK task_id -> tasks(id) is on the child side. Dropping THIS
--   table doesn't touch parent tasks. The ON DELETE CASCADE clause
--   was about deleting *this* row when the parent goes away — not
--   relevant here. Safe to drop.
--
--   UNIQUE(source, source_id) is removed along with the table.

DROP INDEX IF EXISTS idx_task_source_links_discord_thread_id;
DROP INDEX IF EXISTS idx_task_source_links_tmux_session;
DROP INDEX IF EXISTS idx_task_source_links_task_id;

DROP TABLE IF EXISTS task_source_links;
