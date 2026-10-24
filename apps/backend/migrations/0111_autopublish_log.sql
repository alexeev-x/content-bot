-- What the automatic publishing did (owner, 24.10.2026: «на фронте» the owner sees what went out without him and what
-- was held, and why — so far only the bot's notes said it). One row per outcome: published, or held with its reason.
-- Kept a week: each insert deletes older rows in the same batch.
-- Expand-only: one new table and its index.
CREATE TABLE autopublish_log (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  at INTEGER NOT NULL CHECK (at >= 0),
  source TEXT NOT NULL CHECK (source IN ('event', 'game_files', 'steam', 'series')),
  title TEXT NOT NULL CHECK (length(title) <= 300),
  outcome TEXT NOT NULL CHECK (outcome IN ('published', 'held')),
  reason TEXT CHECK (reason IS NULL OR length(reason) BETWEEN 1 AND 20),
  post_id TEXT CHECK (post_id IS NULL OR length(post_id) = 36)
);
CREATE INDEX autopublish_log_at_idx ON autopublish_log (at);
