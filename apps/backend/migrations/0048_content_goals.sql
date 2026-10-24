-- Follower goals per platform for content analytics (docs/API_CONTRACTS.md § Content analytics). Expand-only:
-- one new table, no change to existing data. The pace and the forecast are computed from
-- content_audience_days on read, so only the target is stored.
CREATE TABLE IF NOT EXISTS content_goals (
  platform TEXT PRIMARY KEY CHECK (platform IN ('telegram', 'youtube', 'tiktok')),
  target INTEGER NOT NULL CHECK (target BETWEEN 1 AND 100000000),
  set_at INTEGER NOT NULL
) WITHOUT ROWID;
