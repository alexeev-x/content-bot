-- Steam's product info of Dota's apps (owner, 24.10.2026: «как люди делают» — the early signal of an update): Dota 2
-- (570) with its public branch's build, Dota 2 Staging (2305270), Valve's test app, with its change number only (its
-- info needs a token). A run reads them anonymously and compares with this row; the first sighting is the baseline.
-- `change_number` only grows: the conditional update on it is the one claim of a change's post. `posted_at` is when the
-- app's last post went out: a Staging post is at most one in 12 hours.
-- Expand-only: one new table.
CREATE TABLE steam_app_watch (
  app_id INTEGER PRIMARY KEY CHECK (app_id > 0),
  change_number INTEGER NOT NULL CHECK (change_number >= 0),
  build_id TEXT CHECK (build_id IS NULL OR length(build_id) BETWEEN 1 AND 40),
  time_updated INTEGER CHECK (time_updated IS NULL OR time_updated >= 0),
  checked_at INTEGER NOT NULL CHECK (checked_at >= 0),
  posted_at INTEGER CHECK (posted_at IS NULL OR posted_at >= 0)
);
