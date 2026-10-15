-- Content analytics (docs/API_CONTRACTS.md § Content analytics): the owner's own Telegram, YouTube and
-- TikTok counters, collected by Cron. Expand-only: three new tables, no change to existing data.

-- One row per platform: the collection claim and its last outcome. Cron claims a source with a
-- conditional UPDATE on `next_run_at`, so overlapping ticks never collect the same source twice; the
-- owner's manual refresh claims on `claimed_at`, at most once in 5 minutes even after a failure.
CREATE TABLE IF NOT EXISTS content_sources (
  platform TEXT PRIMARY KEY CHECK (platform IN ('telegram', 'youtube', 'tiktok')),
  next_run_at INTEGER NOT NULL DEFAULT 0,
  claimed_at INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER,
  last_error_at INTEGER,
  last_error_code TEXT
) WITHOUT ROWID;

-- Latest counters per post or video; `id` is `<platform>:<external id>`.
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'youtube', 'tiktok')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at INTEGER NOT NULL,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  observed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS content_items_published_idx ON content_items (published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS content_items_platform_published_idx
  ON content_items (platform, published_at DESC, id DESC);

-- The growth curve: hourly while an item is younger than 72 hours, then at most daily.
-- Bounded because only the latest items of each source are collected.
CREATE TABLE IF NOT EXISTS content_item_snapshots (
  item_id TEXT NOT NULL REFERENCES content_items (id) ON DELETE CASCADE,
  observed_at INTEGER NOT NULL,
  views INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  PRIMARY KEY (item_id, observed_at)
) WITHOUT ROWID;

-- One follower count per platform per UTC day (the last one seen that day).
CREATE TABLE IF NOT EXISTS content_audience_days (
  platform TEXT NOT NULL CHECK (platform IN ('telegram', 'youtube', 'tiktok')),
  day TEXT NOT NULL,
  followers INTEGER NOT NULL CHECK (followers >= 0),
  observed_at INTEGER NOT NULL,
  PRIMARY KEY (platform, day)
) WITHOUT ROWID;

INSERT OR IGNORE INTO content_sources (platform) VALUES ('telegram'), ('youtube'), ('tiktok');
