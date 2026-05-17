-- DOWN migration for second-brain 0054_discord_watch_sources.sql
--
-- Reverses:
--   CREATE TABLE discord_watch_sources(...)
--   CREATE INDEX idx_discord_watch_sources_channel
--   CREATE INDEX idx_discord_watch_sources_parent
--   CREATE INDEX idx_discord_watch_sources_status
--
-- DATA LOSS WARNING:
--   This drops the table outright. Any rows in discord_watch_sources
--   are lost. Export them first if rollback must be reversible:
--     sqlite3 <db> ".dump discord_watch_sources" > discord_watch_sources.dump.sql
--
-- FK NOTES:
--   This table has FK owner_agent_id -> agent_profiles(agent_id).
--   With PRAGMA foreign_keys=ON, DROP TABLE on the *child* side is
--   always safe (the parent agent_profiles row is untouched).
--   No other table references discord_watch_sources, so this is a
--   leaf drop — no cascading concerns.

-- Best-effort: drop indexes explicitly so an aborted run leaves no
-- orphaned index entries. SQLite DROP TABLE also removes them, but
-- being explicit avoids reliance on that for partial failure recovery.
DROP INDEX IF EXISTS idx_discord_watch_sources_status;
DROP INDEX IF EXISTS idx_discord_watch_sources_parent;
DROP INDEX IF EXISTS idx_discord_watch_sources_channel;

DROP TABLE IF EXISTS discord_watch_sources;
