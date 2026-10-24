-- A Dota event with its own dota2.com page becomes a planned series of posts (owner, 21.10.2026). Expand-only: two
-- new tables and one nullable column; nothing existing changes.
-- source_series: one plan per request (its id is the request's job id); notified_at claims the owner's one notice
--   when the last post is written.
-- source_series_posts: one planned post each, written by the AI writer from its own task; media_json lists the
--   page's images and videos chosen for it (Valve's CDN only); post_id is set when the owner approves it.
CREATE TABLE source_series (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  source_key TEXT NOT NULL CHECK (source_key = 'steam_news'),
  external_id TEXT NOT NULL CHECK (length(external_id) BETWEEN 1 AND 100),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  page_url TEXT NOT NULL CHECK (length(page_url) BETWEEN 1 AND 300),
  posts_total INTEGER NOT NULL CHECK (posts_total BETWEEN 1 AND 6),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  notified_at INTEGER CHECK (notified_at IS NULL OR notified_at >= created_at),
  FOREIGN KEY (source_key, external_id) REFERENCES dota_update_items (source_key, external_id)
);
CREATE INDEX source_series_event_idx ON source_series (source_key, external_id, created_at DESC);

CREATE TABLE source_series_posts (
  id TEXT PRIMARY KEY CHECK (length(id) = 36),
  series_id TEXT NOT NULL REFERENCES source_series (id),
  position INTEGER NOT NULL CHECK (position BETWEEN 1 AND 6),
  topic TEXT NOT NULL CHECK (length(topic) BETWEEN 1 AND 120),
  task TEXT NOT NULL CHECK (length(task) BETWEEN 1 AND 4000),
  media_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media_json)),
  status TEXT NOT NULL DEFAULT 'writing' CHECK (status IN ('writing', 'ready', 'failed')),
  generation_id TEXT CHECK (generation_id IS NULL OR length(generation_id) = 36),
  post_id TEXT CHECK (post_id IS NULL OR length(post_id) = 36),
  created_at INTEGER NOT NULL CHECK (created_at >= 0),
  UNIQUE (series_id, position)
);

-- The event's latest series; the studio shows it in the event's side panel.
ALTER TABLE dota_update_items ADD COLUMN ai_series_id TEXT CHECK (ai_series_id IS NULL OR length(ai_series_id) = 36);
