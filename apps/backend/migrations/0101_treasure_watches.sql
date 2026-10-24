-- A treasure announced without its own event page (like Trove of Terror) is followed on Liquipedia for 6 hours after
-- Valve's announcement (owner, 22.10.2026): its sets, drop rates and opening bonuses appear there in the first hours,
-- and its price comes from Valve by the item id the page names. What is new against what already went out waits
-- until the page has been quiet for 30 minutes, then becomes one follow-up post; at most two follow-ups per event.
-- Expand-only: one new table.
CREATE TABLE treasure_watches (
  external_id TEXT PRIMARY KEY CHECK (length(external_id) BETWEEN 1 AND 100),
  source_key TEXT NOT NULL DEFAULT 'steam_news' CHECK (source_key = 'steam_news'),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL CHECK (ends_at > started_at),
  -- The Liquipedia page once found, its last seen revision and when it last changed.
  page_title TEXT CHECK (page_title IS NULL OR length(page_title) BETWEEN 1 AND 300),
  last_revision INTEGER,
  last_change_at INTEGER,
  checked_at INTEGER,
  -- Facts by kind (sets, drop_rates, bonuses, price): what already went out, and what is new and waits.
  published_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(published_json)),
  pending_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(pending_json)),
  posts INTEGER NOT NULL DEFAULT 0 CHECK (posts BETWEEN 0 AND 2),
  status TEXT NOT NULL DEFAULT 'watching' CHECK (status IN ('watching', 'done')),
  FOREIGN KEY (source_key, external_id) REFERENCES dota_update_items (source_key, external_id)
);
CREATE INDEX treasure_watches_active_idx ON treasure_watches (status, checked_at) WHERE status = 'watching';
