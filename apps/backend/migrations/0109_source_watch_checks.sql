-- The last check of each watch that is not a Dota feed (owner, 24.10.2026: «во фронте не вижу источников новых»): the
-- game files on GitHub and Steam's product info. One row per watch, written at the end of every run, so «Состояние
-- лент» shows when it last read its source and whether that read failed. `error_code` is a stable code, never a payload.
-- Expand-only: one new table.
CREATE TABLE source_watch_checks (
  watch_key TEXT PRIMARY KEY CHECK (length(watch_key) BETWEEN 1 AND 40),
  last_attempt_at INTEGER NOT NULL CHECK (last_attempt_at >= 0),
  last_success_at INTEGER CHECK (last_success_at IS NULL OR last_success_at >= 0),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 60),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0)
);
